import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { loadState, saveState, todayKey } from "@/lib/mission-store";

export const Route = createFileRoute("/daily-briefing")({
  component: DailyBriefingPage,
});

function DailyBriefingPage() {
  const navigate = useNavigate();
  
  const state = loadState();
  
  function startDay() {
    localStorage.setItem(
      "apexmission-morning-checkin",
      todayKey()
    );

    const state = loadState();

    saveState({
      ...state,
      lastMorningBriefingDate: todayKey(),
    });
  
    navigate({ to: "/app" });
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="max-w-xl text-center">
      <div className="flex justify-center">
        <img
          src="/icon-192.png"
          alt="ApexMission"
          className="mx-auto mb-4 h-40 w-40 object-contain"
          ></img>
        </div>

        <h1 className="mt-4 text-center text-5xl font-bold text-white">
          ☀️ Good Morning
        </h1>
    
        <p className="mt-3 text-gray-400">
          Win your morning. Win your day.
        </p>
    
      <div className="mt-8 rounded-xl border border-impact-medium/30 bg-secondary/20 p-6">
        <h2 className="text-sm uppercase tracking-wider text-impact-medium">
          Today's One Action
        </h2>

        <p className="mt-3 text-2xl font-bold text-white">
          {state.daily.text}
        </p>
        
      </div>
          
        <div className="mt-8 rounded-xl border border-gray-700 p-6 text-left">
          <h2 className="text-sm uppercase tracking-wider text-gray-400">
              Mission
          </h2>
    
          <p className="mt-2 text-lg text-white">
          {
            state.mission.trim()
              ? state.mission
              : "Set your mission to unlock the full ApexMission experience."
          }
          </p>

          <h2 className="mt-6 text-sm uppercase tracking-wider text-gray-400">
            Progress
          </h2>

          <p className="mt-2 text-white">
            {state.tasks.high.length} High Impact Tasks
          </p>
    
          <h2 className="mt-6 text-sm uppercase tracking-wider text-gray-400">
            Streak
          </h2>
    
          <p className="mt-2 text-orange-400">
            🔥 {state.streak.count} Day Streak
          </p>
        </div>
          <h2 className="mt-6 text-sm uppercase tracking-wider text-gray-400">
            Yesterday
          </h2>

          <p className="mt-2 text-white">
            {state.reflection.completedToday === true
              ? "✅ Completed One Daily Action"
              : state.reflection.completedToday === false
                ? "❌ Missed Daily Action"
                : "No reflection available"}
          </p>
          {state.reflection.wins && (
            <>
              <h2 className="mt-6 text-sm uppercase tracking-wider text-gray-400">
                Yesterday's Reflection
              </h2>

              <p className="mt-2 text-white">
                {state.reflection.wins || "No daily action set yet"}
              </p>
            </>
          )}
        <div className="mt-6 rounded-lg border border-gray-700 p-4">
          <p className="text-sm text-gray-400">
            Ready for today?
          </p>

          <p className="mt-2 text-white">
            Focus on one action. Build momentum. Move your mission forward.
          </p>
        </div>

        <button
          onClick={startDay}
          className="mt-8 rounded-xl bg-white px-8 py-4 font-semibold text-black transition-all hover:bg-gray-200"
        >
          Begin Today's Mission
        </button>
      </div>
    </div>
  );
}
