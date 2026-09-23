import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmCheckout, getBilling, type BillingInfo } from "@/lib/billing.functions";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your plan — Mission Control" },
      {
        name: "description",
        content: "Confirm your Mission Control purchase and review your current plan and renewal date.",
      },
      { property: "og:title", content: "Your plan — Mission Control" },
      {
        property: "og:description",
        content: "Confirm your Mission Control purchase and review your current plan and renewal date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
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
        const info = session_id ? await confirm({ data: { sessionId: session_id } }) : await read({});
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-surface w-full max-w-md p-7">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Confirming your purchase…
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : billing?.premium ? (
          <>
            <CheckCircle2 className="size-8 text-success" />
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">You're premium.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Plan: <span className="text-foreground">{billing.plan}</span>
              {billing.currentPeriodEnd
                ? ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                : " · lifetime access"}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight">No active plan yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If you just paid, this can take a few seconds. Refresh, or pick a plan below.
            </p>
          </>
        )}

        <div className="mt-6 flex gap-3 text-sm">
          <Link to="/" className="text-foreground underline-offset-4 hover:underline">
            Go to dashboard
          </Link>
          <Link to="/pricing" className="text-muted-foreground underline-offset-4 hover:underline">
            View plans
          </Link>
        </div>
      </div>
    </div>
  );
}
