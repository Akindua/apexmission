import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ShieldAlert, Sparkles, Zap } from "lucide-react";

export const Route = createFileRoute("/plans")({
  component: PlansPage,
});

function PlansPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 py-12 text-zinc-100">
      <div className="w-full max-w-3xl text-center flex flex-col items-center justify-center">
        
        {/* Minimalist Logo Anchor */}
        <img
          src="/icon-192.png"
          alt="ApexMission"
          className="h-16 w-16 object-contain mb-4 animate-fade-in"
        />

        {/* Solid Neon Emerald Accent Label */}
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-2">
          Tier Selection Cockpit
        </p>

        <h1 className="text-3xl font-black tracking-tight text-white mb-3 md:text-4xl">
          Choose Your Mission Tier
        </h1>
        <p className="text-sm font-medium text-zinc-500 max-w-md leading-relaxed mb-12">
          Unlock absolute execution. Limit your anxiety and accelerate your core daily output velocity today.
        </p>

        {/* Pricing Dashboard Split Grid Matrix Container */}
        <div className="w-full grid md:grid-cols-2 gap-6 items-stretch">
          
          {/* 🔘 TACTICAL FREE PLAN CONTAINER */}
          <div className="flex flex-col justify-between rounded-2xl border border-zinc-900 bg-[#0A0A0E]/60 p-6 text-left relative transition-all duration-300 hover:border-zinc-800">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Base Operator</span>
                <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">Active</span>
              </div>
              
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-black text-white tracking-tight">$0</span>
                <span className="text-xs font-semibold text-zinc-600">/ forever</span>
              </div>

              {/* Minimalist Feature List Check Grid */}
              <div className="space-y-3.5 text-xs font-semibold text-zinc-400 border-t border-zinc-900/60 pt-6">
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-zinc-600" /> 1 Active Core Mission Tracker</p>
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-zinc-600" /> Standard 3-Tier Priority Matrix</p>
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-zinc-600" /> Fixed Midnight Action Reset Clock</p>
                <p className="text-zinc-600 flex items-center gap-2.5">🚫 No Socratic AI Performance Coach Access</p>
              </div>
            </div>

            <button
              onClick={() => navigate({ to: "/app" })}
              className="mt-8 w-full rounded-xl border border-zinc-800 bg-transparent py-3.5 text-center text-sm font-bold text-zinc-300 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/40 hover:text-white active:scale-98"
            >
              Launch Standard Dock →
            </button>
          </div>

          {/* ⚡ PREMIUM COMMAND PLAN TIER CONTAINER */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/30 bg-[#0E1612]/30 p-6 text-left relative transition-all duration-300 shadow-[0_0_30px_rgba(16,185,129,0.02)]">
            
            {/* Absolute Core Spotlight Tag Banner */}
            <div className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1 shadow-lg">
              <Sparkles className="h-2.5 w-2.5 animate-pulse" /> Highly Recommended
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1"><Zap className="h-3.5 w-3.5 fill-emerald-400" /> Apex Command</span>
                <span className="rounded-md bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-400">Beta Mode</span>
              </div>
              
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-black text-white tracking-tight">$8</span>
                <span className="text-xs font-semibold text-zinc-500">/ month</span>
              </div>

              {/* Complete Premium High-Leverage Advantage Grid */}
              <div className="space-y-3.5 text-xs font-semibold text-zinc-300 border-t border-emerald-500/10 pt-6">
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-emerald-400" /> Unlimited High-Focus Mission Cards</p>
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-emerald-400" /> Smart Task Breakdown Matrix Engine</p>
                <p className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-emerald-400" /> Advanced Morning Briefing Analytics</p>
                <p className="flex items-center gap-2.5 text-white font-bold"><Check className="h-4 w-4 shrink-0 text-emerald-400" /> 24/7 Built-In Socratic AI Performance Coach</p>
              </div>
            </div>

            {/* Premium Glowing Interactive Active Trigger capsule */}
            <button
              disabled
              className="transform mt-8 w-full rounded-xl bg-white py-3.5 text-center text-sm font-bold text-black opacity-90 transition-all duration-300 ease-out hover:scale-102 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 relative group flex items-center justify-center gap-1.5"
            >
              <ShieldAlert className="h-4 w-4 text-black shrink-0" /> Premium Coming Soon
            </button>
          </div>

        </div>

        <p className="text-[10px] font-medium text-zinc-600 tracking-wide mt-8 max-w-sm leading-normal">
          Beta features are permanently unlocked for standard testing users. Complete secure integration pipeline clears next month.
        </p>
      </div>
    </div>
  );
}