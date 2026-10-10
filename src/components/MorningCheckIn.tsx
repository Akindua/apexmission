import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadState, todayKey } from "@/lib/mission-store";

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

  const [greetingText, setGreetingText] = useState(() => {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    return `${month}. ${dayNum}${suffix} ${year}`;
  });

  const [userName, setUserName] = useState("User");

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

  function handleBeginMission() {
    setIsFadingOut(true);
    localStorage.setItem("apexmission-morning-checkin", todayKey());
    setTimeout(() => {
      navigate({
        to: "/app",
      });
    }, 500);
  }

  return (
    <div 
      className={`flex min-h-screen items-center justify-center bg-black px-6 text-zinc-100 transition-all duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"
      }`}
    >
      <div className="w-full max-w-2xl">
        {/* Clean, Non-Transparent Header Container */}
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

        {/* Dashboard Panels */}
        <div className="mt-10 rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 shadow-2xl">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Today's One Action
            </p>
            <p className="mt-2 text-2xl font-extrabold text-white tracking-tight">
              {state.daily?.text || "No target scheduled"}
            </p>
          </div>

          <div className="mt-8 border-t border-zinc-900 pt-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Mission
            </p>
            <p className="mt-2 text-base text-zinc-300 font-medium leading-relaxed">
              {state.mission}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-zinc-900 pt-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Progress</p>
              <p className="text-sm font-semibold text-zinc-300 mt-1">4 High Impact Tasks</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Streak</p>
              <p className="text-sm font-semibold text-zinc-300 mt-1">🔥 0 Day Streak</p>
            </div>
          </div>

          {state.reflection && (
            <div className="mt-6 border-t border-zinc-900 pt-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Yesterday's Reflection</p>
              <p className="text-sm text-zinc-400 mt-1 italic">
                "{state.reflection.wins || "No reflection available"}"
              </p>
            </div>
          )}
        </div>

        {/* Enhanced Glowing Call To Action Launch Trigger Row */}
        <div className="mt-8 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-xs text-zinc-500 italic max-w-sm">
            Focus on one action. Build momentum. Move your mission forward.
          </p>
          
          <button
            onClick={handleBeginMission}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 group-hover:border-emerald-500/20 group-hover:bg-emerald-950/30 group-hover:text-emerald-400 transition-colors duration-300"
          >
            Begin Today's Mission →
          </button>
        </div>
      </div>
    </div>
  );
}
