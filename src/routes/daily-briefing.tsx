import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadState, todayKey, saveState } from "@/lib/mission-store";
import { Clock, CheckSquare, Square, Flame, Target } from "lucide-react";

export const Route = createFileRoute("/daily-briefing")({
  component: DailyBriefingPage,
});

const getOrdinalSuffix = (day: number) => {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
};

function DailyBriefingPage() {
  const navigate = useNavigate();
  const state = loadState();

  const [isFadingOut, setIsFadingOut] = useState(false);
  const [userName, setUserName] = useState("User");

  // --- 1. DYNAMIC DATE LABELS ---
  const [greetingText] = useState(() => {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    return `${month}. ${dayNum}${suffix} ${year}`;
  });

  // --- 2. LIVE COUNTDOWN TICKER STATE ---
  const [countdownStr, setCountdownStr] = useState("");

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const noon = new Date();
      noon.setHours(12, 0, 0, 0);

      const diffMs = noon.getTime() - now.getTime();
      if (diffMs <= 0) {
        setCountdownStr("00h 00m 00s");
        return;
      }

      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

      const pad = (num: number) => String(num).padStart(2, "0");
      setCountdownStr(`${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- 3. MORNING CHECKLIST STATE MATRIX ---
  const [checklist, setChecklist] = useState({
    hydration: false,
    meditation: false,
    workout: false,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;

  // --- 4. TIME WINDOW GUARDRAIL ENGINE ---
  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || "User";
        setUserName(displayName.charAt(0).toUpperCase() + displayName.slice(1));
      }
    };
    fetchUserProfile();
  }, []);

  function startDay() {
    setIsFadingOut(true);
    localStorage.setItem("apexmission-morning-checkin", todayKey());

    const currentState = loadState();
    saveState({
      ...currentState,
      lastMorningBriefingDate: todayKey(),
    });

    setTimeout(() => {
      navigate({ to: "/app" });
    }, 500);
  }

  return (
    <div 
      className={`flex min-h-screen items-center justify-center bg-black px-6 py-12 text-zinc-100 transition-all duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"
      }`}
    >
      <div className="w-full max-w-2xl">
        {/* Header Container */}
        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <img
            src="/icon-192.png"
            alt="ApexMission"
            className="h-24 w-24 object-contain mb-4"
          />
          
          {/* Solid Neon Emerald Date Tag */}
          <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">
            {greetingText}
          </p>
          
          {/* Solid White Greeting Typography Header */}
          <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
            ☀️ Good Morning {userName}!
          </h1>
          <p className="mt-2 text-sm text-zinc-500 font-medium">
            Win your morning. Win your day. Win your night.
          </p>
        </div>

        {/* ⏱️ AUTOMATIC LIVE TIMER COUNTDOWN TICKER BANNER */}
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3.5 flex items-center justify-between text-left">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Lock-in Window Closing</p>
              <p className="text-xs text-zinc-400 mt-0.5">Complete your morning briefing routine before noon cutoff.</p>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-sm font-black text-amber-400 tabular-nums bg-black px-3 py-1 rounded-md border border-amber-500/10">
              {countdownStr || "00h 00m 00s"}
            </span>
          </div>
        </div>

        {/* Core Dashboard Content Panel Container */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 shadow-2xl space-y-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Today's One Action
            </p>
            <p className="mt-2 text-2xl font-extrabold text-white tracking-tight">
              {state.daily?.text || "No target scheduled"}
            </p>
          </div>

          <div className="border-t border-zinc-900 pt-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Mission
            </p>
            <p className="mt-2 text-base text-zinc-300 font-medium leading-relaxed">
              {state.mission.trim() ? state.mission : "Set your mission to unlock the full ApexMission experience."}
            </p>
          </div>

          {/* 🧘 MORNING ROUTINE CHECKLIST TRACKER BLOCK */}
          <div className="border-t border-zinc-900 pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Morning Routine Checklist</p>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/10">
                {completedCount} / 3 Sealed
              </span>
            </div>
            
            <div className="grid sm:grid-cols-3 gap-3">
              {/* Hydration Element */}
              <button
                type="button"
                onClick={() => toggleCheck("hydration")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.hydration 
                    ? "border-emerald-500/30 bg-emerald-950/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.02)]" 
                    : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.hydration ? <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" /> : <Square className="h-4 w-4 shrink-0 text-zinc-700" />}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Hydration</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">💧 500ml Water</p>
                </div>
              </button>

              {/* Meditation Element */}
              <button
                type="button"
                onClick={() => toggleCheck("meditation")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.meditation 
                    ? "border-emerald-500/30 bg-emerald-950/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.02)]" 
                    : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.meditation ? <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" /> : <Square className="h-4 w-4 shrink-0 text-zinc-700" />}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Meditation</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">🧘 10 Min Focus</p>
                </div>
              </button>

              {/* Workout Element */}
              <button
                type="button"
                onClick={() => toggleCheck("workout")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.workout 
                    ? "border-emerald-500/30 bg-emerald-950/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.02)]" 
                    : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.workout ? <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" /> : <Square className="h-4 w-4 shrink-0 text-zinc-700" />}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Workout</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">🏋️ Movement Drill</p>
                </div>
              </button>
            </div>
          </div>

          {/* Metric Scopes Footer Area */}
          <div className="mt-6 flex items-center justify-between border-t border-zinc-900 pt-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Progress Scope</p>
              <p className="text-sm font-semibold text-zinc-300 mt-1">{state.tasks?.high?.length || 0} High Impact Tasks</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Streak Status</p>
              <p className="text-sm font-semibold text-zinc-300 mt-1 flex items-center gap-1 justify-end">
                <Flame className="h-4 w-4 text-orange-500 fill-orange-500" /> {state.streak?.count || 0} Day Streak
              </p>
            </div>
          </div>

          {/* Yesterday's Completion Metric Summary Row */}
          <div className="mt-6 flex flex-col gap-1 border-t border-zinc-900 pt-6 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Yesterday</p>
            <p className="text-sm text-zinc-300 font-semibold mt-0.5">
              {state.reflection?.completedToday === true
                ? "✅ Completed One Daily Action"
                : state.reflection?.completedToday === false
                  ? "❌ Missed Daily Action"
                  : "No reflection notes logged"}
            </p>
          </div>

          {state.reflection?.wins && (
            <div className="mt-6 border-t border-zinc-900 pt-6 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Yesterday's Reflection</p>
              <p className="text-sm text-zinc-400 mt-1 italic leading-relaxed">
                "{state.reflection.wins}"
              </p>
            </div>
          )}
        </div>

        {/* Enhanced Glowing Call To Action Launch Trigger Row */}
        <div className="mt-8 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-xs text-zinc-500 italic max-w-sm">
            Lock in your morning checklist routines, lock down your targets, and force absolute daily execution.
          </p>
          
          <button
            type="button"
            onClick={startDay}
            className="transform w-full max-w-xs rounded-xl bg-white py-4 font-bold text-black transition-all duration-300 ease-out hover:scale-105 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] active:scale-95 shadow-xl shadow-white/5"
          >
            Begin Today's Mission →
          </button>
        </div>
      </div>
    </div>
  );
}
