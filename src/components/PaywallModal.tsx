import { Check, Crown, X, Zap } from "lucide-react";
import { useEffect } from "react";

const PLANS = [
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
] as const;

export function PaywallModal({
  open,
  reason,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  reason: string;
  onClose: () => void;
  onUpgrade: (planId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Mission Control Premium"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close upgrade dialog"
        onClick={onClose}
        className="absolute inset-0 animate-in fade-in bg-background/80 backdrop-blur-sm duration-300"
      />

      <div className="card-surface relative z-10 w-full max-w-3xl animate-in fade-in zoom-in-95 overflow-hidden p-6 duration-300 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-impact-medium/60 to-transparent" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
            <Crown className="size-4 text-impact-medium" />
          </div>
          <span className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            Mission Control Premium
          </span>
        </div>

        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Unlock your full mission.
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{reason}</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
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
              <h3 className="font-display text-base font-semibold">{plan.name}</h3>
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
                onClick={() => onUpgrade(plan.id)}
                className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  plan.featured
                    ? "bg-foreground text-background hover:opacity-90"
                    : "border border-input text-foreground hover:bg-secondary"
                }`}
              >
                <Zap className="size-4" />
                Upgrade Now via Stripe
              </button>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground/70">
          Secure checkout handled by Stripe. You'll be redirected to complete payment.
        </p>
      </div>
    </div>
  );
}
