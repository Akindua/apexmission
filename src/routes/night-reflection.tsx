import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { loadState, saveState, todayKey } from "@/lib/mission-store";
import { Target, Check, X } from "lucide-react";

export const Route = createFileRoute("/night-reflection")({
  component: NightReflectionPage,
});

function NightReflectionPage() {
  const [learnings, setLearnings] = useState("");
  const navigate = useNavigate();
  const state = loadState();

  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [tomorrowAction, setTomorrowAction] = useState(state.daily.text);
  const [completedToday, setCompletedToday] = useState<boolean | null>(null);

  function endDay() {
    saveState({
      ...state,
      daily: {
        text: tomorrowAction,
        done: false,
        date: todayKey(),
      },
      reflection: {
        completedToday,
        wins,
        blockers,
        tomorrowAction,
      },
    });

    navigate({ to: "/app" });
  }  

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-zinc-100">
      <div className="w-full max-w-2xl">
        
        {/* Core Header Section */}
        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <img
            src="/icon-192.png"
            alt="ApexMission"
            className="h-20 w-20 object-contain mb-4"
          />
          <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">
            Deconstruct Performance
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
            🌙 Night Reflection
          </h1>
          <p className="mt-2 text-sm text-zinc-500 font-medium">
            Reflect honestly. Reset metrics. Prepare for tomorrow's execution.
          </p>
        </div>

        {/* Master Performance Card */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 shadow-2xl space-y-6">
          
          {/* Mission Core Container */}
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Active Strategic Mission
            </h2>
            <p className="mt-2 text-lg font-bold text-white tracking-tight">
              {state.mission}
            </p>
          </div>

          {/* Validation Checklist Switches */}
          <div className="border-t border-zinc-900 pt-6">
            <p className="text-xs font-bold text-zinc-300">
              Did you execute today's One Action?
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => setCompletedToday(true)}
                className={`flex-1 flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all duration-300 ${
                  completedToday === true
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <Check className="h-4 w-4" /> Mission Cleared
              </button>

              <button
                type="button"
                onClick={() => setCompletedToday(false)}
                className={`flex-1 flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all duration-300 ${
                  completedToday === false
                    ? "border-rose-500/40 bg-rose-950/20 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.05)]"
                    : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <X className="h-4 w-4" /> Mission Failed
              </button>
            </div>
          </div>

          {/* Text Input Row: Wins */}
          <div className="border-t border-zinc-900 pt-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
              What went exceptionally well today? (Daily Wins)
            </label>
            <textarea
              value={wins}
              onChange={(e) => setWins(e.target.value)}
              placeholder="List system victories or milestones..."
              className="w-full rounded-xl border border-zinc-800 bg-black p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.05)]"
              rows={2}
            />
          </div>

          {/* Text Input Row: Blockers */}
          <div className="border-t border-zinc-900 pt-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
              What bottlenecked your execution? (Blockers)
            </label>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="What friction points held back velocity?"
              className="w-full rounded-xl border border-zinc-800 bg-black p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.05)]"
              rows={2}
            />
          </div>

          {/* Text Input Row: Learnings */}
          <div className="border-t border-zinc-900 pt-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
              Strategic Key Learnings
            </label>
            <textarea
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
              placeholder="What will you optimize moving forward?"
              className="w-full rounded-xl border border-zinc-800 bg-black p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.05)]"
              rows={2}
            />
          </div>

          {/* Input Row: Next Action */}
          <div className="border-t border-zinc-900 pt-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5 mb-2">
              <Target className="h-3.5 w-3.5" /> Tomorrow's One Critical Action
            </label>
            <input
              value={tomorrowAction}
              onChange={(e) => setTomorrowAction(e.target.value)}
              placeholder="Define tomorrow's dominant objective..."
              className="w-full rounded-xl border border-zinc-800 bg-black p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.05)]"
            />
          </div>

        </div>

        {/* Submit Execution Button */}
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={endDay}
            className="transform w-full max-w-xs rounded-xl bg-white py-4 text-sm font-bold text-black transition-all duration-300 ease-out hover:scale-102 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 shadow-xl shadow-white/5"
          >
            Seal Day & Prepare Tomorrow →
          </button>
        </div>
        
      </div>
    </div>
  );
}