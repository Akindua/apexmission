import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Crown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmCheckout, getBilling, type BillingInfo } from "@/lib/billing.functions";

export const Route = createFileRoute("/billing")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your plan — ApexMission" },
      {
        name: "description",
        content: "Confirm your ApexMission purchase and review your current plan and renewal date.",
      },
      { property: "og:title", content: "Your plan — ApexMission" },
      {
        property: "og:description",
        content: "Confirm your ApexMission purchase and review your current plan and renewal date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { session_id } = Route.useSearch();
  const confirm = useServerFn(confirmCheckout);
  const read = useServerFn(getBilling);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) {
          setError("Sign in to see your plan.");
          setLoading(false);
        }
        return;
      }
      try {
        const info = session_id
          ? await confirm({ data: { sessionId: session_id } })
          : await read({});
        if (!cancelled) setBilling(info);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session_id, confirm, read]);

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md glass-panel p-8 text-center">
        <div className="top-highlight" />

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-sm text-zinc-400">Confirming your purchase…</p>
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        ) : billing?.premium ? (
          <>
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-950/40 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
              <CheckCircle2 className="size-10" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-black tracking-tight text-white">
              You're premium.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Plan: <span className="text-white font-semibold">{billing.plan}</span>
              {billing.currentPeriodEnd
                ? ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                : " · lifetime access"}
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-zinc-800/50 bg-zinc-900/40 text-zinc-400">
              <Crown className="size-10" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-black tracking-tight text-white">
              No active plan yet
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              If you just paid, this can take a few seconds. Refresh, or pick a plan below.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link to="/app" className="btn-glass-primary h-11">
            Go to dashboard
          </Link>
          <Link to="/pricing" className="btn-glass-ghost h-11">
            View plans
          </Link>
        </div>
      </div>
    </div>
  );
}
