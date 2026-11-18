import { UnauthorizedError } from "@/lib/auth-redirect";

export interface MissionPlan {
  mission: string;
  high: string[];
  medium: string[];
  low: string[];
  dailyAction: string;
}

export async function generateMissionPlan(mission: string): Promise<MissionPlan> {
  // Server requires a verified Supabase session on every planner call.
  const { authHeaders } = await import("@/lib/api-auth");
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

  if (!response.ok) {
    const text = await response.text();

    if (response.status === 401) {
      throw new UnauthorizedError("Session expired — sign in required.");
    }

    console.error(text);

    throw new Error(`Mission Planner failed: ${response.status}`);
  }

  return response.json();
}
