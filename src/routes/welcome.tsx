import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <div className="page-shell flex items-center justify-center px-6 py-16">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-sm centered-glass-card">
        <div className="top-highlight" />

        {/* Premium Geometric Logo Anchor */}
        <div className="relative mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)] animate-fade-in-up">
          <img src="/icon-192.png" alt="ApexMission Logo" className="h-12 w-12 object-contain" />
        </div>

        {/* Solid Neon Emerald Accent Label */}
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2 animate-fade-in-up delay-100">
          Mission Launchpad
        </p>

        <h1 className="font-display text-3xl font-black tracking-tight text-white mb-3 md:text-4xl animate-fade-in-up delay-200">
          Welcome to ApexMission
        </h1>

        <p className="text-xs font-medium text-zinc-500 max-w-xs leading-relaxed mb-10 mx-auto animate-fade-in-up delay-300">
          Focus on what matters most and move exactly one decisive step closer to your goals every
          24 hours.
        </p>

        <div className="w-full flex flex-col gap-3 animate-fade-in-up delay-400">
          {/* Primary Action Button */}
          <Link to="/onboarding" className="btn-glass-primary h-12">
            Get Started →
          </Link>

          {/* Secondary Action Link */}
          <Link to="/auth" search={{ mode: "signin" }} className="btn-glass-ghost h-11">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
