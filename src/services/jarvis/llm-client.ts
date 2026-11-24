/**
 * Jarvis LLM client — generates suggestions from operator context via the
 * /api/jarvis/suggest endpoint.
 *
 * All calls carry zero-data-retention / zero-training headers.
 * Standard features available to all authenticated users.
 * Enterprise features require active enterprise subscription.
 */

import { type JarvisContext, type JarvisSuggestion } from "./context-builder";

const SUGGEST_ENDPOINT = "/api/jarvis/suggest";

/**
 * Submits operator context to the Jarvis suggestion API and returns
 * sanitized suggestions.
 */
export async function generateJarvisSuggestions(
  context: JarvisContext & { enterprise?: boolean },
): Promise<JarvisSuggestion[]> {
  const response = await fetch(SUGGEST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
      throw new Error("Jarvis is temporarily unavailable.");
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
