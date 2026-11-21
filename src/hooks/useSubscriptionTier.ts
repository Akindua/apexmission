import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "premium_active" | "lifetime";

export interface SubscriptionState {
  tier: SubscriptionTier;
  premium: boolean;
  loading: boolean;
  signedIn: boolean;
}

export function useSubscriptionTier(): SubscriptionState {
  const [tier, setTier] = useState<SubscriptionTier>("free");
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
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("id, subscription_tier, onboarding_completed, company_id")
          .maybeSingle();
        if (!active) return;
        if (error) {
          console.error("[useSubscriptionTier] profile fetch failed:", error);
          setTier("free");
        } else {
          setTier(((data?.subscription_tier as SubscriptionTier) ?? "free") satisfies SubscriptionTier);
        }
        setLoading(false);
      } catch (err) {
        if (!active) return;
        console.error("[useSubscriptionTier] unexpected error:", err);
        setTier("free");
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
      setLoading(false);
      return;
    }
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      try {
        // Read the current tier once before subscribing.
        const { data, error } = await supabase
          .from("profiles")
          .select("id, subscription_tier, onboarding_completed, company_id")
          .maybeSingle();
        if (!active) return;
        if (error) {
          console.error("[useSubscriptionTier] profile fetch failed:", error);
          setTier("free");
        } else {
          setTier(((data?.subscription_tier as SubscriptionTier) ?? "free") satisfies SubscriptionTier);
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
    premium: tier === "premium_active" || tier === "lifetime",
    loading,
    signedIn: userId !== null,
  };
}
