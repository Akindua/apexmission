/**
 * AI Chief of Staff LLM client — generates suggestions from operator context via the
 * /api/chief-of-staff/suggest endpoint.
 *
 * All calls carry zero-data-retention / zero-training headers.
 * Standard features available to all authenticated users.
 * Enterprise features require active enterprise subscription.
 */

import { authHeaders } from "@/lib/api-auth";
import { type ChiefOfStaffContext, type ChiefOfStaffSuggestion } from "./context-builder";

const SUGGEST_ENDPOINT = "/api/chief-of-staff/suggest";

/**
 * Submits operator context to the AI Chief of Staff suggestion API and returns
 * sanitized suggestions.
 */
export async function generateChiefOfStaffSuggestions(
  context: ChiefOfStaffContext & { enterprise?: boolean },
): Promise<ChiefOfStaffSuggestion[]> {
  const headers = await authHeaders();
  const response = await fetch(SUGGEST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      // Check if it's an enterprise feature error
      const text = await response.text().catch(() => "");
      if (text.includes("enterprise")) {
        throw new Error(text);
      }
      throw new Error("AI Chief of Staff is temporarily unavailable.");
    }
    if (response.status === 401) {
      throw new Error("Please sign in to use AI Chief of Staff.");
    }
    throw new Error("AI Chief of Staff is temporarily unavailable.");
  }

  const data = await response.json();
  const rawSuggestions: unknown[] = (data.suggestions ?? []) as unknown[];

  return rawSuggestions.map((s) => ({
    ...(s as object),
    status: "pending" as const,
    createdAt: (s as { createdAt?: string }).createdAt || new Date().toISOString(),
  })) as ChiefOfStaffSuggestion[];
}