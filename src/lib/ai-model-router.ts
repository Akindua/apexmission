/**
 * AI Model Router — chooses model based on entitlements and credits.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { createClient } from "@supabase/supabase-js";

export interface ModelConfig {
  model: string;
  maxOutputTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs: number;
}

export interface EntitlementInfo {
  plan: "standard" | "lifetime" | "astra_elite" | "company_core";
  status: "active" | "canceled" | "past_due";
  astraCreditsBalance: number;
  creditsResetAt: string | null;
  isPersonal: boolean;
  ownerId: string; // user_id or company_id
}

/**
 * Fetches the entitlement for the given actor (personal or company).
 * Returns null if no entitlement row exists (defaults to standard).
 */
export async function fetchEntitlement(actor: { userId: string; token: string }): Promise<EntitlementInfo | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[Entitlement] Missing Supabase env vars");
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // First try personal entitlement
  const { data: personalEnt, error: personalError } = await supabase
    .from("entitlements")
    .select("plan, status, astra_credits_balance, credits_reset_at, user_id, company_id")
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (personalError) {
    console.error("[Entitlement] Personal fetch error:", personalError);
  }

  if (personalEnt) {
    return {
      plan: personalEnt.plan,
      status: personalEnt.status,
      astraCreditsBalance: personalEnt.astra_credits_balance ?? 0,
      creditsResetAt: personalEnt.credits_reset_at,
      isPersonal: true,
      ownerId: personalEnt.user_id,
    };
  }

  // Try company entitlement via profiles join
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", actor.userId)
    .maybeSingle();

  if (profileError || !profile?.company_id) {
    return null; // No company entitlement possible
  }

  const { data: companyEnt, error: companyError } = await supabase
    .from("entitlements")
    .select("plan, status, astra_credits_balance, credits_reset_at, user_id, company_id")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (companyError) {
    console.error("[Entitlement] Company fetch error:", companyError);
  }

  if (companyEnt) {
    return {
      plan: companyEnt.plan,
      status: companyEnt.status,
      astraCreditsBalance: companyEnt.astra_credits_balance ?? 0,
      creditsResetAt: companyEnt.credits_reset_at,
      isPersonal: false,
      ownerId: companyEnt.company_id,
    };
  }

  return null; // No entitlement row = standard plan
}

/**
 * Determines if the entitlement allows Astra model usage.
 * - astra_elite (personal) or company_core (company) plans can use Astra IF credits remain
 * - lifetime and standard never get Astra
 * - Canceled/past_due statuses block Astra
 */
export function canUseAstra(ent: EntitlementInfo | null): boolean {
  if (!ent || ent.status !== "active") return false;

  if (ent.isPersonal) {
    return ent.plan === "astra_elite" && ent.astraCreditsBalance > 0;
  } else {
    return ent.plan === "company_core" && ent.astraCreditsBalance > 0;
  }
}

/**
 * Returns the model configuration to use for the given actor.
 * Baseline model is the default. Astra model only when permitted and credits available.
 * Fails closed: if any required env var is missing or invalid, returns null to signal
 * the caller should use the local plan only. Never silently falls back to a more expensive model.
 */
export async function chooseModel(actor: { userId: string; token: string }): Promise<ModelConfig | null> {
  // Required env vars - fail closed if missing
  const baselineModel = process.env["AI_BASELINE_MODEL"];
  const astraModel = process.env["AI_ASTRA_MODEL"];
  const baselineMaxTokensStr = process.env["AI_BASELINE_MAX_TOKENS"];
  const astraMaxTokensStr = process.env["AI_ASTRA_MAX_TOKENS"];
  const astraReasoningEffortStr = process.env["AI_ASTRA_REASONING_EFFORT"];
  const baselineTimeoutMsStr = process.env["AI_BASELINE_TIMEOUT_MS"];
  const astraTimeoutMsStr = process.env["AI_ASTRA_TIMEOUT_MS"];

  if (!baselineModel || !astraModel || !baselineMaxTokensStr || !astraMaxTokensStr ||
      !astraReasoningEffortStr || !baselineTimeoutMsStr || !astraTimeoutMsStr) {
    console.error("[ModelRouter] Missing required AI env vars - failing closed to local plan");
    return null;
  }

  const baselineMaxTokens = parseInt(baselineMaxTokensStr, 10);
  const astraMaxTokens = parseInt(astraMaxTokensStr, 10);
  const baselineTimeoutMs = parseInt(baselineTimeoutMsStr, 10);
  const astraTimeoutMs = parseInt(astraTimeoutMsStr, 10);

  if (!Number.isFinite(baselineMaxTokens) || !Number.isFinite(astraMaxTokens) ||
      !Number.isFinite(baselineTimeoutMs) || !Number.isFinite(astraTimeoutMs)) {
    console.error("[ModelRouter] Invalid numeric AI env vars - failing closed to local plan");
    return null;
  }

  const astraReasoningEffort = astraReasoningEffortStr as "low" | "medium" | "high";
  if (!["low", "medium", "high"].includes(astraReasoningEffort)) {
    console.error("[ModelRouter] Invalid AI_ASTRA_REASONING_EFFORT - failing closed to local plan");
    return null;
  }

  const ent = await fetchEntitlement(actor);
  const useAstra = canUseAstra(ent);

  if (useAstra) {
    // Only apply reasoningEffort for o1-* models; ignore for gpt-* models
    const isO1Model = astraModel.startsWith("o1-");
    const config: ModelConfig = {
      model: astraModel,
      maxOutputTokens: astraMaxTokens,
      timeoutMs: astraTimeoutMs,
    };
    if (isO1Model) config.reasoningEffort = astraReasoningEffort;
    return config;
  }

  return {
    model: baselineModel,
    maxOutputTokens: baselineMaxTokens,
    timeoutMs: baselineTimeoutMs,
  };
}

/**
 * Atomically decrements Astra credits for the given owner (user_id or company_id).
 * Returns the new balance, or null if not allowed/insufficient credits.
 * Only decrements when plan allows Astra and credits > 0.
 */
export async function decrementAstraCredits(
  ownerId: string,
  isPersonal: boolean,
  amount: number = 1
): Promise<number | null> {
  if (amount <= 0) return null;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[AstraCredits] Missing Supabase env vars");
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const column = isPersonal ? "user_id" : "company_id";

  // Atomic decrement with check
  const { data, error } = await supabase.rpc("decrement_astra_credits", {
    p_owner_id: ownerId,
    p_is_personal: isPersonal,
    p_amount: amount,
  });

  if (error) {
    console.error("[AstraCredits] Decrement error:", error);
    return null;
  }

  return data as number;
}

/**
 * Gets current Astra credits balance without modifying.
 */
export async function getAstraCreditsBalance(
  ownerId: string,
  isPersonal: boolean
): Promise<number | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) return null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const column = isPersonal ? "user_id" : "company_id";
  const { data, error } = await supabase
    .from("entitlements")
    .select("astra_credits_balance")
    .eq(column, ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return data.astra_credits_balance ?? 0;
}