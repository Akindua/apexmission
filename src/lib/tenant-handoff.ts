/**
 * Cross-subdomain session handoff via single-use server-issued codes.
 *
 * Flow:
 *   1. Source origin calls POST /api/handoff/issue with targetSlug
 *   2. Server generates 128-bit random code, stores SHA-256 hash bound to user+targetSlug, returns plaintext code (once)
 *   3. Client redirects to target origin with ?handoff_code=<code>
 *   4. Target origin calls POST /api/handoff/consume with code
 *   5. Server verifies hash, checks expiry (60s), single-use, user match, returns targetSlug
 *   6. Target origin establishes session via Supabase (refresh token flow)
 *
 * Never puts access/refresh tokens in URLs. Codes are single-use, time-bounded, user-bound.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildPlatformAppUrl, buildTenantAppUrl, normalizeTenantSlug } from "@/lib/tenant-host";

const HANDOFF_CODE_PARAM = "handoff_code";
const HANDOFF_CODE_TTL_MS = 60_000; // Must match server-side expiry

/** Result of initiating a cross-origin handoff. */
export interface HandoffResult {
  /** Full URL to redirect the user to, including the handoff code. */
  url: string;
  /** The target slug that was validated ('platform' or company slug). */
  targetSlug: string;
}

/**
 * Initiates a handoff to a tenant subdomain.
 * Returns a URL containing a single-use handoff code.
 */
export async function buildTenantHandoffUrl(slug: string, path = "/app"): Promise<HandoffResult> {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) {
    throw new Error("Invalid tenant slug");
  }
  return initiateHandoff("tenant", normalized, path);
}

/**
 * Initiates a handoff to the platform (www) origin.
 */
export async function buildPlatformHandoffUrl(path = "/app"): Promise<HandoffResult> {
  return initiateHandoff("platform", "platform", path);
}

async function initiateHandoff(type: "tenant" | "platform", targetSlug: string, path: string): Promise<HandoffResult> {
  // Call server to issue a single-use handoff code
  const response = await fetch("/api/handoff/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ targetSlug }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to issue handoff code: ${response.status} ${text}`);
  }

  const { code } = await response.json();
  if (!code || typeof code !== "string" || code.length < 22) {
    throw new Error("Invalid handoff code received from server");
  }

  // Build the target URL with the code as a query parameter (not fragment)
  const baseUrl = type === "tenant"
    ? buildTenantAppUrl(targetSlug, path)
    : buildPlatformAppUrl(path);

  const url = new URL(baseUrl);
  url.searchParams.set(HANDOFF_CODE_PARAM, code);

  return { url: url.toString(), targetSlug };
}

/**
 * Consumes an inbound handoff code from the URL query string.
 * Call this early in the app bootstrap on the target origin.
 * Returns the targetSlug on success, or null if no valid code was present.
 */
export async function consumeTenantHandoff(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const code = params.get(HANDOFF_CODE_PARAM);

  if (!code) return null;

  // Remove the code from URL immediately so it doesn't leak via referrer/history
  params.delete(HANDOFF_CODE_PARAM);
  window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);

  // Exchange code for targetSlug verification
  const response = await fetch("/api/handoff/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn("[TenantHandoff] Failed to consume code:", response.status, text);
    return null;
  }

  const { targetSlug } = await response.json();
  if (!targetSlug || typeof targetSlug !== "string") {
    console.warn("[TenantHandoff] Invalid targetSlug in response");
    return null;
  }

  // The session is already established because the Supabase client
  // on the target origin will have the user's cookies (same root domain).
  // If cross-root-domain is needed in future, add explicit setSession here.
  return targetSlug;
}

/**
 * Checks if the current URL contains a handoff code (for early detection).
 */
export function hasPendingHandoff(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(HANDOFF_CODE_PARAM);
}