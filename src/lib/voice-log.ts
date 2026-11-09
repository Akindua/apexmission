/**
 * Browser voice-capture helpers for the 10-second daily log.
 *
 * The Web Speech API is optional and vendor-prefixed. Everything here degrades
 * to a typed fallback when it is unavailable, so the logger never blocks the
 * dashboard.
 *
 * PRIVACY NOTICE: When voice capture is active, audio is sent to the browser's
 * built-in speech recognition service (e.g., Google Cloud Speech-to-Text on
 * Chrome, Apple on-device on Safari, Microsoft on Edge). ApexMission receives
 * ONLY the final transcript the operator chooses to save. Audio is NOT stored
 * by ApexMission and never leaves the browser's speech service.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

export const VOICE_CAPTURE_SECONDS = 10;
export const MAX_VOICE_TRANSCRIPT_CHARS = 2_000;

/** Human-readable description of the speech engine in use. */
export function getSpeechEngineDescription(): string {
  if (typeof window === "undefined") return "Unknown (server-side)";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("chrome") || ua.includes("crios") || ua.includes("edg")) {
    return "Google Cloud Speech-to-Text (Chrome/Edge cloud service)";
  }
  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "Apple on-device speech recognition (Safari, processes audio locally)";
  }
  if (ua.includes("firefox")) {
    return "Mozilla/Web Speech API (Firefox, may use cloud service)";
  }
  return "Browser built-in speech recognition (vendor varies)";
}

/** True if the current browser's speech engine sends audio to a vendor server. */
export function doesSpeechEngineUseCloud(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  // Chrome, Edge, and some Firefox configurations use cloud services
  return ua.includes("chrome") || ua.includes("crios") || ua.includes("edg");
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/**
 * Returns the browser's speech-recognition constructor, or null when the
 * environment does not support voice capture.
 */
export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Constructor = getSpeechRecognitionConstructor();
  if (!Constructor) return null;

  const recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  return recognition;
}

/** Trims and collapses whitespace, then caps the transcript length. */
export function normalizeTranscript(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_VOICE_TRANSCRIPT_CHARS);
}

/** Plain-language explanation for a SpeechRecognition error code. */
export function describeSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow microphone permission for this site, then retry.";
    case "audio-capture":
      return "No microphone was detected. Connect a microphone or type the log instead.";
    case "no-speech":
      return "No speech was detected. Try again a little closer to the microphone.";
    case "network":
      return "The browser's speech service could not be reached. Type the log instead.";
    case "aborted":
      return "Voice capture stopped. You can retry or type the log.";
    default:
      return "Voice capture failed. You can retry or type the log instead.";
  }
}
