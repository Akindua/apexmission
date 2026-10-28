import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Crown, Loader2, Zap } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startCheckout, type PlanId } from "@/lib/billing.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — ApexMission Premium" },
      {
        name: "description",
        content:
          "Choose a ApexMission plan: monthly, annual or lifetime access to unlimited priorities, AI Mission Breakdown and streak insights.",
      },
      { property: "og:title", content: "Pricing — ApexMission Premium" },
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
    <div className="page-shell flex flex-col items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="w-full max-w-5xl">
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/40 text-emerald-400">
            <Crown className="size-5" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
            ApexMission Premium
          </span>
          <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
            Unlock your full mission.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 mx-auto">
            Pick the plan that fits. Secure checkout is handled by Stripe.
          </p>
        </div>

        {notice && (
          <div className="mb-6 glass-panel-subtle px-4 py-3 text-sm text-zinc-400 max-w-2xl mx-auto animate-fade-in-up delay-100">
            {notice}
          </div>
        )}

        <div className="mt-6 glass-grid-2">
          {CARDS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col glass-panel ${plan.featured ? "border-emerald-500/30 glass-panel-elevated" : ""} transition-all duration-300`}
            >
              {plan.featured && (
                <span className="absolute -top-2.5 right-4 glass-badge bg-emerald-500/20 border-emerald-500/40 text-emerald-300">
                  Best value
                </span>
              )}
              <h2 className="font-display text-base font-bold text-white">{plan.name}</h2>
              <p className="mt-1 text-xs text-zinc-500">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-bold tabular-nums text-white">
                  {plan.price}
                </span>
                <span className="text-sm text-zinc-500">{plan.cadence}</span>
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-zinc-400">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => upgrade(plan.id)}
                className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
                  plan.featured ? "btn-glass-primary" : "btn-glass-ghost"
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

        <div className="mt-10 text-center animate-fade-in-up delay-200">
          <Link
            to="/app"
            className="text-zinc-500 underline-offset-4 hover:text-emerald-400 transition-colors text-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
