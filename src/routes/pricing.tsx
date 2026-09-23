import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Crown, Loader2, Zap } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startCheckout, type PlanId } from "@/lib/billing.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Mission Control Premium" },
      {
        name: "description",
        content:
          "Choose a Mission Control plan: monthly, annual or lifetime access to unlimited priorities, AI Mission Breakdown and streak insights.",
      },
      { property: "og:title", content: "Pricing — Mission Control Premium" },
      {
        property: "og:description",
        content:
          "Monthly, annual or lifetime access to unlimited priorities, AI Mission Breakdown and streak insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

const CARDS: Array<{
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  perks: string[];
  featured: boolean;
}> = [
  {
    id: "monthly",
    name: "Monthly Tier",
    price: "$9.99",
    cadence: "/mo",
    tagline: "Stay sharp, month after month.",
    perks: ["Unlimited priority tasks", "AI Mission Breakdown", "Streak history & insights"],
    featured: false,
  },
  {
    id: "annual",
    name: "Annual Tier",
    price: "$59.99",
    cadence: "/yr",
    tagline: "Half the price of monthly.",
    perks: ["Everything in Monthly", "Two months free", "Priority coach responses"],
    featured: true,
  },
  {
    id: "lifetime",
    name: "Lifetime Access",
    price: "$149.00",
    cadence: " one-time",
    tagline: "Pay once. Execute forever.",
    perks: ["Everything in Annual", "Lifetime access, no renewals", "Early access to new modes"],
    featured: false,
  },
];

function PricingPage() {
  const navigate = useNavigate();
  const checkout = useServerFn(startCheckout);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  async function upgrade(plan: PlanId) {
    setNotice(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    setPending(plan);
    try {
      const res = await checkout({ data: { plan, origin: window.location.origin } });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setNotice(res.message);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout could not be started.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
            <Crown className="size-4 text-impact-medium" />
          </div>
          <span className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            Mission Control Premium
          </span>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Unlock your full mission.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Pick the plan that fits. Secure checkout is handled by Stripe.
        </p>

        {notice && (
          <div className="mt-6 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            {notice}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CARDS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-5 transition-all duration-300 ${
                plan.featured
                  ? "border-impact-medium/50 bg-secondary/50 shadow-[0_0_32px_color-mix(in_oklab,var(--color-impact-medium)_12%,transparent)]"
                  : "border-border bg-background/40 hover:border-foreground/25"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-impact-medium px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-background uppercase">
                  Best value
                </span>
              )}
              <h2 className="font-display text-base font-semibold">{plan.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-bold tabular-nums">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={3} />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => upgrade(plan.id)}
                className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
                  plan.featured
                    ? "bg-foreground text-background hover:opacity-90"
                    : "border border-input text-foreground hover:bg-secondary"
                }`}
              >
                {pending === plan.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                {signedIn === false ? "Sign in to upgrade" : "Upgrade Now via Stripe"}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-8 text-sm">
          <Link to="/" className="text-muted-foreground underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
