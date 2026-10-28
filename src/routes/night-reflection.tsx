import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { loadState, todayKey, saveState, appendReflectionEntry } from "@/lib/mission-store";
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

  const [wentWell, setWentWell] = useState("");
  const [couldImprove, setCouldImprove] = useState("");
  const [lessonsLearned, setLessonsLearned] = useState("");
  const [takeIntoTomorrow, setTakeIntoTomorrow] = useState("");

  const [greetingText] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  });

  const handleCloseoutDay = async () => {
    if (actionCompleted === null || busy) return;
    setBusy(true);

    try {
      const currentStore = loadState();

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
          blockers: couldImprove.trim() || currentStore.reflection.blockers,
          tomorrowAction:
            takeIntoTomorrow.trim() || currentStore.reflection.tomorrowAction,
          date: todayKey(),
        },
        reflectionHistory: appendReflectionEntry(currentStore.reflectionHistory, {
          date: todayKey(),
          phase: "night",
          wins: synthesizedReflection,
          blockers: couldImprove.trim() || currentStore.reflection.blockers,
          tomorrowAction:
            takeIntoTomorrow.trim() || currentStore.reflection.tomorrowAction,
          actionCompleted,
          createdAt: new Date().toISOString(),
        }),
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
    <div
      className={`page-shell flex items-center justify-center transition-all duration-500 ease-in-out ${isFadingOut ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"}`}
    >
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="w-full max-w-xl relative z-10">
        {/* Terminal Canopy Header */}
        <div className="mb-8 flex flex-col items-center justify-center text-center animate-fade-in-up">
          <div className="relative mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <Moon className="h-5 w-5 animate-pulse" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
            Day Closeout Telemetry · {greetingText}
          </p>
          <h1 className="font-display text-3xl font-black tracking-tight text-white uppercase">
            Win Your Night
          </h1>
        </div>

        {/* Main Glass Content */}
        <div className="glass-panel p-6 sm:p-8 space-y-6 animate-fade-in-up delay-100">
          {/* Step 1: Verification Node */}
          <div className="text-left">
            <label className="glass-input-label">
              Did you execute today's primary action target?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActionCompleted(true)}
                className={`h-12 flex items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                  actionCompleted === true
                    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-900/50 bg-black/40 text-zinc-500 hover:border-zinc-800"
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
                    : "border-zinc-900/50 bg-black/40 text-zinc-500 hover:border-zinc-800"
                }`}
              >
                ❌ Parameter Breach
              </button>
            </div>
          </div>

          {/* Step 2: Formulated Socratic Questions Array */}
          <div className="space-y-4 glass-divider pt-6 text-left">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
              <MessageSquarePlus className="h-3.5 w-3.5 text-zinc-600" /> Core Performance Review
            </h3>

            {/* Question 1 */}
            <div className="glass-input-group">
              <label htmlFor="q1" className="glass-input-label">
                What went well today?
              </label>
              <div className="glass-input-wrapper">
                <input
                  id="q1"
                  type="text"
                  value={wentWell}
                  onChange={(e) => setWentWell(e.target.value)}
                  placeholder="Identify exact wins or strategic execution markers..."
                  className="glass-input-field"
                />
              </div>
            </div>

            {/* Question 2 */}
            <div className="glass-input-group">
              <label htmlFor="q2" className="glass-input-label">
                What could have gone better?
              </label>
              <div className="glass-input-wrapper">
                <input
                  id="q2"
                  type="text"
                  value={couldImprove}
                  onChange={(e) => setCouldImprove(e.target.value)}
                  placeholder="Pinpoint specific bottlenecks or distraction leaks..."
                  className="glass-input-field"
                />
              </div>
            </div>

            {/* Question 3 */}
            <div className="glass-input-group">
              <label htmlFor="q3" className="glass-input-label">
                What did you learn?
              </label>
              <div className="glass-input-wrapper">
                <input
                  id="q3"
                  type="text"
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  placeholder="What operational insights did you capture?"
                  className="glass-input-field"
                />
              </div>
            </div>

            {/* Question 4 */}
            <div className="glass-input-group">
              <label htmlFor="q4" className="glass-input-label">
                What do you want to take into tomorrow?
              </label>
              <div className="glass-input-wrapper">
                <input
                  id="q4"
                  type="text"
                  value={takeIntoTomorrow}
                  onChange={(e) => setTakeIntoTomorrow(e.target.value)}
                  placeholder="Define tomorrow morning's catalyst focus action target..."
                  className="glass-input-field"
                />
              </div>
            </div>
          </div>

          {/* Active Streak Cache Node */}
          <div className="glass-panel-subtle rounded-xl px-4 py-3 text-xs flex items-center justify-between">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[9px]">
              Active Streak Cache:
            </span>
            <span className="font-mono font-black text-emerald-400 flex items-center gap-1 glass-input px-2.5 py-1 rounded">
              <Flame className="h-3.5 w-3.5 fill-emerald-400 text-emerald-500" />{" "}
              {state?.streak?.count || 0} Interval Cycle
            </span>
          </div>

          {/* Submit Trigger Action Button */}
          <button
            type="button"
            disabled={actionCompleted === null || busy}
            onClick={handleCloseoutDay}
            className="btn-glass-primary w-full h-11 mt-2"
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
