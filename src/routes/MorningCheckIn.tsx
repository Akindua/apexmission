import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appendReflectionEntry, loadState, saveState, todayKey } from "@/lib/mission-store";
import { setScopedItem } from "@/lib/user-storage";
import { Clock, CheckSquare, Square, Target } from "lucide-react";

export const Route = createFileRoute("/MorningCheckIn")({
  component: DailyBriefingPage,
});

const getOrdinalSuffix = (day: number) => {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

function DailyBriefingPage() {
  const navigate = useNavigate();
  const state = loadState();

  const [isFadingOut, setIsFadingOut] = useState(false);
  const [userName, setUserName] = useState("User");

  const [greetingText] = useState(() => {
    const now = new Date();
    const month = now.toLocaleDateString("en-US", { month: "short" });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    return `${month}. ${dayNum}${suffix} ${year}`;
  });

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

  const [checklist, setChecklist] = useState({
    hydration: false,
    meditation: false,
    workout: false,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && !data.session) {
          navigate({ to: "/auth", replace: true });
        }
      })
      .catch(() => {
        if (active) navigate({ to: "/auth", replace: true });
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const currentHour = new Date().getHours();
    const isMorningWindow = currentHour >= 5 && currentHour < 12;

    if (!isMorningWindow) {
      navigate({ to: "/app" });
      return;
    }

    const fetchUserProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const displayName =
          user.user_metadata?.["full_name"] || user.email?.split("@")[0] || "User";
        setUserName(displayName.charAt(0).toUpperCase() + displayName.slice(1));
      }
    };
    fetchUserProfile();
  }, [navigate]);

  function handleBeginMission() {
    setIsFadingOut(true);
    setScopedItem("apexmission-morning-checkin", todayKey());

    const currentStore = loadState();
    const morningEntry = {
      date: todayKey(),
      phase: "morning" as const,
      wins: "",
      blockers: "",
      tomorrowAction: "",
      dailyAction: state.daily?.text || "",
      actionCompleted: false,
      routineSealed: completedCount,
      createdAt: new Date().toISOString(),
    };

    saveState({
      ...currentStore,
      reflectionHistory: appendReflectionEntry(currentStore.reflectionHistory, morningEntry),
    });

    setTimeout(() => {
      navigate({ to: "/app" });
    }, 500);
  }

  return (
    <div
      className={`page-shell flex items-center justify-center transition-all duration-500 ease-in-out ${isFadingOut ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"}`}
    >
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-lg glass-panel p-8 text-center">
        <div className="top-highlight" />

        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <div className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            <img src="/icon-192.png" alt="ApexMission" className="h-12 w-12 object-contain" />
          </div>

          <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">
            {greetingText}
          </p>

          <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-5xl">
            Good Morning, {userName}.
          </h1>
          <p className="mt-2 text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Win your morning. Win your day. Win your night.
          </p>
        </div>

        {/* Timer Banner */}
        <div className="mb-6 glass-panel-subtle p-3.5 flex items-center justify-between text-left">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-emerald-400 animate-pulse" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Lock-in Window Closing
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Complete your morning briefing routine before noon cutoff.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-sm font-black text-emerald-400 tabular-nums glass-input px-3 py-1 rounded-md">
              {countdownStr || "00h 00m 00s"}
            </span>
          </div>
        </div>

        {/* Main Glass Content */}
        <div className="glass-panel p-6 space-y-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 justify-center">
              <Target className="h-3.5 w-3.5" /> Today's One Action
            </p>
            <p className="mt-2 text-xl font-extrabold text-white tracking-tight text-center">
              {state.daily?.text || "No target scheduled"}
            </p>
          </div>

          <div className="glass-divider pt-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 text-center">
              Your Ultimate Mission
            </p>
            <p className="mt-2 text-base text-zinc-300 font-medium leading-relaxed text-center">
              {state.mission}
            </p>
          </div>

          <div className="glass-divider pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Morning Routine Checklist
              </p>
              <span className="glass-badge-premium">{completedCount} / 3 Sealed</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {/* Hydration */}
              <button
                type="button"
                onClick={() => toggleCheck("hydration")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.hydration
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-800/50 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.hydration ? (
                  <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Square className="h-4 w-4 shrink-0 text-zinc-700" />
                )}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Hydration</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">💧 500ml Water</p>
                </div>
              </button>

              {/* Meditation */}
              <button
                type="button"
                onClick={() => toggleCheck("meditation")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.meditation
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-800/50 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.meditation ? (
                  <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Square className="h-4 w-4 shrink-0 text-zinc-700" />
                )}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Meditation</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">🧘 10 Min Focus</p>
                </div>
              </button>

              {/* Workout */}
              <button
                type="button"
                onClick={() => toggleCheck("workout")}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                  checklist.workout
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "border-zinc-800/50 bg-black/40 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {checklist.workout ? (
                  <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Square className="h-4 w-4 shrink-0 text-zinc-700" />
                )}
                <div className="truncate">
                  <p className="text-xs font-bold text-zinc-200">Workout</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">🏋️ Movement Drill</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between glass-divider pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Progress Scope
              </p>
              <p className="text-sm font-semibold text-zinc-300 mt-1">
                {state.tasks?.high?.length ?? 0} High Impact Tasks
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Streak Status
              </p>
              <p className="text-sm font-semibold text-zinc-300 mt-1">
                🔥 {state.streak?.count ?? 0} Day Streak
              </p>
            </div>
          </div>

          {state.reflection && (
            <div className="glass-divider pt-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Yesterday's Reflection
              </p>
              <p className="text-sm text-zinc-400 mt-1 italic text-center">
                "{state.reflection.wins || "No reflection notes found."}"
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-6 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-xs text-zinc-500 italic max-w-sm">
            Lock down your targets, seal your routines, and force absolute execution.
          </p>

          <button
            type="button"
            onClick={handleBeginMission}
            className="btn-glass-primary w-full max-w-xs h-11"
          >
            Begin Today's Mission →
          </button>
        </div>
      </div>
    </div>
  );
}
