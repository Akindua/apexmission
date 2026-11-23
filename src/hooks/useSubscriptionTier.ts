import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "premium_active" | "lifetime";
export type EnterpriseTier = "company_core" | null;

export interface SubscriptionState {
  tier: SubscriptionTier;
  enterpriseTier: EnterpriseTier;
  premium: boolean;
  enterprise: boolean;
  loading: boolean;
  signedIn: boolean;
}

export function useSubscriptionTier(): SubscriptionState {
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [enterpriseTier, setEnterpriseTier] = useState<EnterpriseTier>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // ---- Read current tier on mount and on auth changes ----
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      if (!active) return;
      try {
        const { data: session } = await supabase.auth.getSession();
        const id = (session as { user?: { id: string } | null } | null)?.user?.id ?? null;
        if (!active) return;
        setUserId(id);
        if (!id) {
          setTier("free");
          setEnterpriseTier(null);
          setLoading(false);
          return;
        }
        // Fetch profile with company_id for enterprise check
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, subscription_tier, onboarding_completed, company_id")
          .eq("id", id)
          .maybeSingle();
        
        if (!active) return;
        if (profileError) {
          console.error("[useSubscriptionTier] profile fetch failed:", profileError);
          setTier("free");
          setEnterpriseTier(null);
        } else {
          setTier(((profile?.subscription_tier as SubscriptionTier) ?? "free") satisfies SubscriptionTier);
          
          // If user belongs to a company, check for enterprise subscription
          if (profile?.company_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: entitlement } = await (supabase as any)
              .from("entitlements")
              .select("plan, status, company_id")
              .eq("company_id", profile.company_id)
              .maybeSingle();
            
            if (entitlement?.plan === "company_core" && entitlement?.status === "active") {
              setEnterpriseTier("company_core");
            } else {
              setEnterpriseTier(null);
            }
          } else {
            setEnterpriseTier(null);
          }
        }
        setLoading(false);
      } catch (err) {
        if (!active) return;
        console.error("[useSubscriptionTier] unexpected error:", err);
        setTier("free");
        setEnterpriseTier(null);
        setLoading(false);
      }
    };
    void refresh();

    // Re-read tier whenever the auth session changes (login / logout / token refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      setUserId(id);
      if (id) {
        void refresh();
      } else {
        setTier("free");
        setEnterpriseTier(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---- Realtime tier updates via postgres_changes ----
  useEffect(() => {
    if (!userId) {
      setTier("free");
      setEnterpriseTier(null);
      setLoading(false);
      return;
    }
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      try {
        // Read the current tier once before subscribing.
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, subscription_tier, onboarding_completed, company_id")
          .eq("id", userId)
          .maybeSingle();
        if (!active) return;
        if (profileError) {
          console.error("[useSubscriptionTier] profile fetch failed:", profileError);
          setTier("free");
          setEnterpriseTier(null);
        } else {
          setTier(((profile?.subscription_tier as SubscriptionTier) ?? "free") satisfies SubscriptionTier);
          
          // Check enterprise subscription
          if (profile?.company_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: entitlement } = await (supabase as any)
              .from("entitlements")
              .select("plan, status, company_id")
              .eq("company_id", profile.company_id)
              .maybeSingle();
            
            if (entitlement?.plan === "company_core" && entitlement?.status === "active") {
              setEnterpriseTier("company_core");
            } else {
              setEnterpriseTier(null);
            }
          } else {
            setEnterpriseTier(null);
          }
        }
        setLoading(false);

        // Create the channel inside this effect, register .on() BEFORE .subscribe().
        channel = supabase.channel(`profile-tier-${userId}-${Date.now()}`);
        channel
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${userId}`,
            },
            (payload) => {
              if (!active) return;
              const next = (payload.new as { subscription_tier?: SubscriptionTier } | null)
                ?.subscription_tier;
              if (next) setTier(next);
            },
          )
          // Also listen for entitlement changes for the company
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "entitlements",
              filter: profile?.company_id ? `company_id=eq.${profile.company_id}` : `user_id=eq.${userId}`,
            },
            (payload) => {
              if (!active) return;
              const ent = payload.new as { plan?: string; status?: string } | null;
              if (ent?.plan === "company_core" && ent?.status === "active") {
                setEnterpriseTier("company_core");
              } else if (ent?.plan === "company_core" && ent?.status !== "active") {
                setEnterpriseTier(null);
              }
            },
          )
          .subscribe();
      } catch (err) {
        if (!active) return;
        console.error("[useSubscriptionTier] realtime setup failed:", err);
        setLoading(false);
      }
    };

    void setup();

    return () => {
      active = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  return {
    tier,
    enterpriseTier,
    premium: tier === "premium_active" || tier === "lifetime",
    enterprise: enterpriseTier === "company_core",
    loading,
    signedIn: userId !== null,
  };
}