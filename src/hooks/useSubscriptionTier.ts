import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "premium_active" | "lifetime";

export interface SubscriptionState {
  tier: SubscriptionTier;
  premium: boolean;
  loading: boolean;
  signedIn: boolean;
}

/**
 * Live subscription tier for the signed-in user.
 * Reads public.profiles.subscription_tier and listens for realtime updates so
 * the app unlocks the instant a payment lands — no refresh needed.
 */
export function useSubscriptionTier(): SubscriptionState {
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setTier("free");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    const read = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .maybeSingle();
      if (!active) return;
      setTier(((data?.subscription_tier as SubscriptionTier) ?? "free") satisfies SubscriptionTier);
      setLoading(false);
    };
    void read();

    const channel = supabase
      .channel(`profile-tier-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { subscription_tier?: SubscriptionTier } | null)
            ?.subscription_tier;
          if (next) setTier(next);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    tier,
    premium: tier === "premium_active" || tier === "lifetime",
    loading,
    signedIn: userId !== null,
  };
}
