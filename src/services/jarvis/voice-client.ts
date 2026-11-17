/**
 * Jarvis voice client — submits recorded audio to /api/jarvis/voice for
 * Whisper transcription + suggestion generation.
 */

import type { JarvisContext } from "./context-builder";
import type { JarvisSuggestion } from "./context-builder";

const VOICE_ENDPOINT = "/api/jarvis/voice";

export interface JarvisVoiceResult {
  transcript: string;
  suggestions: JarvisSuggestion[];
}

/**
 * Submits an audio blob plus operator context to the Jarvis voice API.
 * Returns the transcript and generated suggestions.
 */
export async function submitJarvisVoice(
  audioBlob: Blob,
  context: JarvisContext
): Promise<JarvisVoiceResult> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice.webm");
  formData.append("context", JSON.stringify(context));

  const response = await fetch(VOICE_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Jarvis voice requires an active subscription.");
    }
    if (response.status === 401) {
      throw new Error("Please sign in to use Jarvis voice.");
    }
    if (response.status === 400) {
      throw new Error("No speech detected. Please try again.");
    }
    throw new Error("Jarvis voice is temporarily unavailable.");
  }

  const data = await response.json();
  return {
    transcript: data.transcript || "",
    suggestions: (data.suggestions ?? []).map((s: unknown) => ({
      ...(s as object),
      status: "pending" as const,
      createdAt: (s as { createdAt?: string }).createdAt || new Date().toISOString(),
    })) as JarvisSuggestion[],
  };
}
