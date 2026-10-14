import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { loadState, todayKey, saveState } from "@/lib/mission-store";
import { Moon, Flame, ArrowRight, Loader2, MessageSquarePlus } from "lucide-react";

export const Route = createFileRoute("/night-reflection")({
  component: NightReflectionPage,
});

function NightReflectionPage() {
  const navigate = useNavigate();
  const state = loadState();

  const [busy, setBusy] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [actionCompleted, setActionCompleted] = useState<boolean | null>(null);

  // --- 📝 FOUR DISTINCT STRUCTURAL FOCUS LOG FIELDS ---
  const [wentWell, setWentWell] = useState("");
  const [couldImprove, setCouldImprove] = useState("");
  const [lessonsLearned, setLessonsLearned] = useState("");
  const [takeIntoTomorrow, setTakeIntoTomorrow] = useState("");

  const [greetingText] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  });

  const handleCloseoutDay = async () => {
    if (actionCompleted === null || busy) return;
    setBusy(true);

    try {
      const currentStore = loadState();
      
      // Combine all answers cleanly into a structured review string for the AI coach to read later
      const synthesizedReflection = `
        1. WHAT WENT WELL: ${wentWell.trim() || "No entry recorded."}
        2. DEFICIT AREAS: ${couldImprove.trim() || "No entry recorded."}
        3. KEY ACQUIRED INTEL: ${lessonsLearned.trim() || "No entry recorded."}
        4. NEXT VELOCITY BLOCK: ${takeIntoTomorrow.trim() || "No entry recorded."}
      `;

      saveState({
        ...currentStore,
        reflection: {
          ...currentStore.reflection,
          completedToday: actionCompleted,
          wins: synthesizedReflection,
          date: todayKey()
        }
      });

      setIsFadingOut(true);
      setTimeout(() => {
        navigate({ to: "/app" });
      }, 500);
    } catch (err) {
      console.error("Failed to commit evening closeout data:", err);
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

          {/* Step 2: Formulated Socratic Questions Array */}
          <div className="space-y-4 border-t border-zinc-900 pt-5 text-left">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
              <MessageSquarePlus className="h-3.5 w-3.5 text-zinc-600" /> Core Performance Review
            </h3>

            {/* Question 1 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="q1" className="text-[10px] font-bold text-zinc-500">What went well today?</label>
              <input
                id="q1"
                type="text"
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="Identify exact wins or strategic execution markers..."
                className="h-10 rounded-xl border border-zinc-900 bg-black/40 px-3.5 text-xs text-white outline-none focus:border-zinc-800 transition-colors"
              />
            </div>

            {/* Question 2 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="q2" className="text-[10px] font-bold text-zinc-500">What could have gone better?</label>
              <input
                id="q2"
                type="text"
                value={couldImprove}
                onChange={(e) => setCouldImprove(e.target.value)}
                placeholder="Pinpoint specific bottlenecks or distraction leaks..."
                className="h-10 rounded-xl border border-zinc-900 bg-black/40 px-3.5 text-xs text-white outline-none focus:border-zinc-800 transition-colors"
              />
            </div>

            {/* Question 3 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="q3" className="text-[10px] font-bold text-zinc-500">What did you learn?</label>
              <input
                id="q3"
                type="text"
                value={lessonsLearned}
                onChange={(e) => setLessonsLearned(e.target.value)}
                placeholder="What operational insights did you capture?"
                className="h-10 rounded-xl border border-zinc-900 bg-black/40 px-3.5 text-xs text-white outline-none focus:border-zinc-800 transition-colors"
              />
            </div>

            {/* Question 4 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="q4" className="text-[10px] font-bold text-zinc-500">What do you want to take into tomorrow?</label>
              <input
                id="q4"
                type="text"
                value={takeIntoTomorrow}
                onChange={(e) => setTakeIntoTomorrow(e.target.value)}
                placeholder="Define tomorrow morning's catalyst focus action target..."
                className="h-10 rounded-xl border border-zinc-900 bg-black/40 px-3.5 text-xs text-white outline-none focus:border-zinc-800 transition-colors"
              />
            </div>
          </div>

          {/* Active Streak Cache Node */}
          <div className="flex items-center justify-between border-t border-zinc-950 rounded-xl bg-black/40 border border-zinc-900 px-4 py-3 text-xs">
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
