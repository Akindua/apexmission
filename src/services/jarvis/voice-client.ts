/**
 * AI Chief of Staff voice client — submits recorded audio to /api/chief-of-staff/voice for
 * Whisper transcription + suggestion generation.
 */

import type { ChiefOfStaffContext } from "./context-builder";
import type { ChiefOfStaffSuggestion } from "./context-builder";

const VOICE_ENDPOINT = "/api/chief-of-staff/voice";

export interface ChiefOfStaffVoiceResult {
  transcript: string;
  suggestions: ChiefOfStaffSuggestion[];
}

/**
 * Submits an audio blob plus operator context to the AI Chief of Staff voice API.
 * Returns the transcript and generated suggestions.
 */
export async function submitChiefOfStaffVoice(
  audioBlob: Blob,
  context: ChiefOfStaffContext & { enterprise?: boolean },
): Promise<ChiefOfStaffVoiceResult> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice.webm");
  formData.append("context", JSON.stringify(context));

  const response = await fetch(VOICE_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 403) {
      // Check if it's an enterprise feature error
      const text = await response.text().catch(() => "");
      if (text.includes("enterprise")) {
        throw new Error(text);
      }
      throw new Error("AI Chief of Staff voice is temporarily unavailable.");
    }
    if (response.status === 401) {
      throw new Error("Please sign in to use AI Chief of Staff voice.");
    }
    if (response.status === 400) {
      throw new Error("No speech detected. Please try again.");
    }
    throw new Error("AI Chief of Staff voice is temporarily unavailable.");
  }

  const data = await response.json();
  return {
    transcript: data.transcript || "",
    suggestions: (data.suggestions ?? []).map((s: unknown) => ({
      ...(s as object),
      status: "pending" as const,
      createdAt: (s as { createdAt?: string }).createdAt || new Date().toISOString(),
    })) as ChiefOfStaffSuggestion[],
  };
}