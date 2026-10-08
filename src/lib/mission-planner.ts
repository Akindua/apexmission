
export interface MissionPlan {
        high: string[];
        medium: string[];
        low: string[];
        dailyAction: string;
    }


export async function generateMissionPlan(
    mission: string
): Promise<MissionPlan> {
    const response = await fetch("/api/mission-plan", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            mission,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        
        console.error(text);
        
        throw new Error(
            `Mission Planner failed: ${response.status}`
        );
    }

    return response.json();
}