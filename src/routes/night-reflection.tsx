import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadState, todayKey, saveState } from "@/lib/mission-store";
import { Moon, CheckCircle, Flame, ArrowRight, Loader2, MessageSquarePlus } from "lucide-react";

export const Route = createFileRoute("/night-reflection")({
  component: NightReflectionPage,
});

function NightReflectionPage() {
  const navigate = useNavigate();
  const state = loadState();

  const [busy, setBusy] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [actionCompleted, setActionCompleted] = useState<boolean | null>(null);

  const [greetingText] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  });

  const handleCloseoutDay = async () => {
    if (actionCompleted === null || busy) return;
    setBusy(true);

    try {
      const currentStore = loadState();
      
      // Update global store state with localized evening closeout data parameters
      saveState({
        ...currentStore,
        reflection: {
          ...currentStore.reflection,
          completedToday: actionCompleted,
          wins: reflectionText.trim() || "Completed execution interval.",
          date: todayKey()
        }
      });

      setIsFadingOut(true);
      setTimeout(() => {
        navigate({ to: "/app" });
      }, 500);
    } catch (err) {
      console.error("Failed to commit evening closeout:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex min-h-screen items-center justify-center bg-black px-6 py-12 text-zinc-100 transition-all duration-500 ease-in-out ${
      isFadingOut ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"
    }`}>
      <div className="w-full max-w-xl">
        
        {/* Terminal Canopy Header */}
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-950/20 text-indigo-400 mb-4 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <Moon className="h-5 w-5 animate-pulse" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-1">
            Day Closeout Telemetry · {greetingText}
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase font-display">
            Win Your Night
          </h1>
          <p className="mt-2 text-xs text-zinc-500 font-medium max-w-xs">
            Review execution matrices, log tactical metrics, and prepare the mission deck for tomorrow morning.
          </p>
        </div>

        {/* Tactical Form Panel */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Step 1: Verification Node */}
          <div className="text-left">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-3">
              Did you execute today's primary action target?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActionCompleted(true)}
                className={`h-12 flex items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                  actionCompleted === true
                    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-900 bg-black/40 text-zinc-500 hover:border-zinc-800"
                }`}
              >
                ✅ Absolute Success
              </button>
              <button
                type="button"
                onClick={() => setActionCompleted(false)}
                className={`h-12 flex items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                  actionCompleted === false
                    ? "border-rose-500/30 bg-rose-950/20 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.05)]"
                    : "border-zinc-900 bg-black/40 text-zinc-500 hover:border-zinc-800"
                }`}
              >
                ❌ Parameter Breach
              </button>
            </div>
          </div>

          {/* Step 2: Qualitative Audit Block */}
          <div className="flex flex-col gap-2 text-left border-t border-zinc-900 pt-5">
            <label htmlFor="reflection" className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
              <MessageSquarePlus className="h-3.5 w-3.5 text-zinc-600" /> Log Qualitative Reflection Notes
            </label>
            <textarea
              id="reflection"
              rows={3}
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Detail your operational bottleneck or critical wins captured over this interval..."
              className="w-full rounded-xl border border-zinc-900 bg-black/40 p-3.5 text-sm text-zinc-100 placeholder-zinc-700 outline-none focus:border-zinc-800 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Step 3: Streak Status Display */}
          <div className="flex items-center justify-between border-b border-zinc-950 rounded-xl bg-black/40 border border-zinc-900 px-4 py-3 text-xs">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[9px]">Active Streak Cache:</span>
            <span className="font-mono font-black text-orange-400 flex items-center gap-1 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800">
              <Flame className="h-3.5 w-3.5 fill-orange-400 text-orange-500" /> {state?.streak?.count || 0} Interval Cycle
            </span>
          </div>

          {/* Submit Trigger Action Button */}
          <button
            type="button"
            disabled={actionCompleted === null || busy}
            onClick={handleCloseoutDay}
            className="w-full h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-indigo-400 disabled:opacity-30 disabled:pointer-events-none mt-4 font-display shadow-xl shadow-white/5"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-black" />
            ) : (
              <>
                <span>Seal Today's Parameters</span>
                <ArrowRight className="h-4 w-4 text-black" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}