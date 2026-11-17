/**
 * Jarvis LLM client — generates suggestions from operator context via the
 * /api/jarvis/suggest endpoint.
 *
 * All calls carry zero-data-retention / zero-training headers.
 */

import { type JarvisContext, type JarvisSuggestion } from "./context-builder";

const SUGGEST_ENDPOINT = "/api/jarvis/suggest";

/**
 * Submits operator context to the Jarvis suggestion API and returns
 * sanitized suggestions.
 */
export async function generateJarvisSuggestions(context: JarvisContext): Promise<JarvisSuggestion[]> {
  const response = await fetch(SUGGEST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Jarvis requires an active subscription.");
    }
    if (response.status === 401) {
      throw new Error("Please sign in to use Jarvis.");
    }
    throw new Error("Jarvis is temporarily unavailable.");
  }

  const data = await response.json();
  const rawSuggestions: unknown[] = (data.suggestions ?? []) as unknown[];

  return rawSuggestions.map((s) => ({
    ...(s as object),
    status: "pending" as const,
    createdAt: (s as { createdAt?: string }).createdAt || new Date().toISOString(),
  })) as JarvisSuggestion[];
}
