import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { loadState, saveState, todayKey } from "@/lib/mission-store";

export const Route = createFileRoute("/night-reflection")({
    component: NightReflectionPage,
});

function NightReflectionPage() {
    const [learnings, setLearnings] = useState("");
    const navigate = useNavigate();

    const state = loadState();

    const [wins, setWins] = useState("");
    const [blockers, setBlockers] = useState("");
    const [tomorrowAction, setTomorrowAction] = useState(
        state.daily.text
    );

    const [completedToday, setCompletedToday] =
        useState<boolean | null>(null);

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

        navigate({
            to: "/app",
        });
    }  

    return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
            <img
                src="/icon-192.png"
                alt="ApexMission"
                className="h-32 w-32 object-"
            ></img>
        </div>
            <h1 className="text-center text-5xl font-bold text-white">
                🌙 Night Reflection
            </h1>

            <p className="mt-3 text-center text-gray-400">
                Reflect. Reset. Prepare for tomorrow.
            </p>

            <div className="mt-10 rounded-xl border border-gray-700 p-6">
                <h2 className="mt-8 text-xs uppercase tracking-wider text-gray-500">
                    Mission
                </h2>

                <p className="mt-2 text-xl text-white">
                    {state.mission}
                </p>

                <div className="mt-6">
                    <p className="text-sm text-gray-400">
                        Did you complete today's One Action?
                    </p>

                    <div className="mt-3 flex gap-3">
                        <button
                            onClick={() => setCompletedToday(true)}
                            className={`rounded-lg px-4 py-2 ${
                                completedToday === true
                                ? "bg-green-500 text-black"
                                : "border"
                            }`}
                        >
                            ✅ Yes
                        </button>

                        <button
                            onClick={() => setCompletedToday(false)}
                            className={`rounded-lg px-4 py-2 ${
                                completedToday === false
                                ? "bg-red-500 text-black"
                                : "border"
                            }`}
                        >
                            ❌ No
                        </button>
                    </div>
                </div>

                <div className="mt-8">
                    <label className="text-sm text-gray-400">
                        What went well today?
                    </label>

                    <textarea
                        value={learnings}
                        onChange={(e) => setLearnings(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-white"
                        rows={3}
                    />
                </div>

                <div className="mt-6">
                    <label className="text-sm text-gray-400">
                        What got in your way?
                    </label>

                    <textarea
                        value={blockers}
                        onChange={(e) => setBlockers(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-white"
                        rows={3}
                    />
                </div>

                <div className="mt-8">
                    <label className="text-sm text-gray-400">
                        What did you learn today?
                    </label>

                    <textarea
                        value={wins}
                        onChange={(e) => setWins(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-white"
                        rows={3}
                    />
                </div>

                <div className="mt-6">
                    <label className="text-sm text-gray-400">
                        Tomorrow's One Important Action
                    </label>

                    <input
                        value={tomorrowAction}
                        onChange={(e) =>
                            setTomorrowAction(e.target.value)
                        }
                        className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-white"
                    />
                </div>

              </div>

              <div className="mt-8 flex justify-center">
                <button
                    onClick={endDay}
                    className="rounded-xl bg-white px-8 py-4 font-semibold text-black"
                >
                    Prepare Tomorrow →
                </button>
             </div>
          </div>
       </div>
    );
}