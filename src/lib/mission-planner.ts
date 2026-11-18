export interface MissionPlan {
  mission: string;
  high: string[];
  medium: string[];
  low: string[];
  dailyAction: string;
}

export async function generateMissionPlan(mission: string): Promise<MissionPlan> {
  // Server requires a verified Supabase session on every planner call.
  const { authHeaders, handleUnauthenticated } = await import("@/lib/api-auth");
  const response = await fetch("/api/mission-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      mission,
    }),
  });

  if (handleUnauthenticated(response)) {
    // Redirect already issued by handleUnauthenticated.
    throw new Error("Authentication required: redirecting to sign in.");
  }

  if (!response.ok) {
    const text = await response.text();

    console.error(text);

    throw new Error(`Mission Planner failed: ${response.status}`);
  }

  return response.json();
}
