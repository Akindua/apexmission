import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Check, Sparkles, Zap, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/plans")({
  component: PlansPage,
});

function PlansPage() {
  const navigate = useNavigate();
  const [operatorMoniker, setOperatorMoniker] = useState("Operator");

  useEffect(() => {
    const pullOperatorProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && user.user_metadata?.["full_name"]) {
        setOperatorMoniker(user.user_metadata["full_name"]);
      }
    };
    pullOperatorProfile();
  }, []);

  return (
    <div className="page-shell flex flex-col items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="w-full max-w-3xl text-center flex flex-col items-center justify-center relative z-10 animate-fade-in-up">
        {/* Geometric Logo Anchor */}
        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
          <img src="/icon-192.png" alt="ApexMission" className="h-12 w-12 object-contain" />
        </div>

        {/* Solid Neon Emerald Accent Label */}
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2">
          Tier Selection Cockpit · Welcome, {operatorMoniker}
        </p>

        <h1 className="font-display text-4xl font-black tracking-tight text-white mb-3 md:text-5xl">
          Choose Your Mission Tier
        </h1>
        <p className="text-sm font-medium text-zinc-500 max-w-md leading-relaxed mb-10 mx-auto">
          Unlock absolute execution metrics. Eliminate choice anxiety and accelerate your core
          output velocity today.
        </p>

        {/* Pricing Split Grid Matrix Container */}
        <div className="w-full glass-grid-2">
          {/* 🔘 TACTICAL FREE PLAN CONTAINER */}
          <div className="glass-panel p-6 md:p-8 flex flex-col justify-between text-left">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
                  Base Operator
                </span>
                <span className="glass-badge-muted">Standard</span>
              </div>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-black text-white tracking-tight">$0</span>
                <span className="text-xs font-semibold text-zinc-600">/ forever</span>
              </div>

              {/* Minimalist Feature List Check Grid */}
              <div className="space-y-4 text-xs font-semibold text-zinc-400 border-t border-zinc-900/30 pt-6">
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> 1 Active Core Mission
                  Tracker
                </p>
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> Standard 3-Tier Priority
                  Matrix
                </p>
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> Fixed Midnight Action
                  Reset Clock
                </p>
                <p className="text-zinc-600 flex items-center gap-2.5">
                  🚫 No Socratic AI Performance Coach Access
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate({ to: "/app" })}
              className="btn-glass-ghost w-full h-11 mt-6"
            >
              Launch Standard Dashboard →
            </button>
          </div>

          {/* ⚡ PREMIUM COMMAND PLAN TIER CONTAINER */}
          <div className="glass-panel-elevated p-6 md:p-8 flex flex-col justify-between text-left relative">
            {/* Absolute Core Spotlight Tag Banner */}
            <div className="absolute top-0 right-6 -translate-y-1/2 glass-badge-premium flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 animate-pulse" /> Lifecycle Memory
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" /> Apex Command
                </span>
                <span className="glass-badge-premium">Premium</span>
              </div>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-2xl font-black text-white tracking-tight uppercase">
                  Coming Soon
                </span>
              </div>

              {/* Complete Premium High-Leverage Advantage Grid */}
              <div className="space-y-4 text-xs font-semibold text-zinc-400 border-t border-zinc-900/30 pt-6">
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> Long-Term Lifecycle
                  Decision Storage Memory
                </p>
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> Full Historical Win/Loss
                  Trend Analytics
                </p>
                <p className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> Strategic Long-Term Goal
                  Optimization
                </p>
                <p className="flex items-center gap-2.5 text-white font-bold">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" /> 24/7 Socratic AI Memory
                  Performance Mentor
                </p>
              </div>
            </div>

            {/* Premium Coming Soon Button */}
            <button
              disabled
              className="btn-glass-ghost w-full h-11 mt-6 opacity-50 cursor-not-allowed"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" /> Coming Soon
            </button>
          </div>
        </div>

        <p className="text-[10px] font-medium text-zinc-600 tracking-wide mt-8 max-w-sm leading-normal">
          Beta features are currently scaling. Long-term behavioral core analysis tables are
          initialized.
        </p>
      </div>
    </div>
  );
}
