import { ShieldCheck } from "lucide-react";

/**
 * Corporate onboarding assurance banner. Kept as a shared component so every
 * enterprise entry point communicates the same tenant-isolation guarantees.
 */
export function PrivacyShieldBanner({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-label="Privacy Shield"
      className={`relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-[#07130f]/60 to-transparent p-3.5 text-left ${className}`}
    >
      <span className="pointer-events-none absolute inset-y-3 left-0 w-px bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent" />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-950/40 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.15)]">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-emerald-400">
            Privacy Shield
          </p>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-400">
            Enterprise Grade Security Active. All operational data is insulated via tenant-isolated
            Row-Level Security (RLS) firewalls. ApexMissions never tracks screen monitoring,
            location metrics, or background device telemetries.
          </p>
        </div>
      </div>
    </aside>
  );
}
