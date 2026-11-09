import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, PenLine, RotateCcw, Square, Shield, AlertCircle } from "lucide-react";

import {
  createSpeechRecognition,
  describeSpeechError,
  doesSpeechEngineUseCloud,
  getSpeechEngineDescription,
  isSpeechRecognitionSupported,
  MAX_VOICE_TRANSCRIPT_CHARS,
  normalizeTranscript,
  type SpeechRecognitionLike,
  VOICE_CAPTURE_SECONDS,
} from "@/lib/voice-log";

type VoiceMode = "idle" | "listening" | "review" | "saving" | "saved";

/**
 * 10-second voice day log.
 *
 * One tap starts a ten-second capture. The transcript stays editable before
 * anything is saved, so a misheard word never becomes permanent.
 */
export function VoiceDayLogger({
  onSave,
  disabled = false,
}: {
  onSave: (transcript: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [secondsLeft, setSecondsLeft] = useState(VOICE_CAPTURE_SECONDS);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);

  const engineDescription = getSpeechEngineDescription();
  const usesCloud = doesSpeechEngineUseCloud();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const finishingRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function disposeRecognition() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
  }

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
    return () => {
      clearTimer();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      disposeRecognition();
    };
  }, []);

  function finishCapture() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    }
    const combined = normalizeTranscript(`${finalRef.current} ${interimRef.current}`);
    setTranscript(combined);
    setInterim("");
    interimRef.current = "";
    setMode("review");
  }

  function startCapture() {
    if (disabled || mode === "listening" || mode === "saving") return;

    setError(null);
    setTranscript("");
    setInterim("");
    finalRef.current = "";
    interimRef.current = "";
    finishingRef.current = false;
    clearTimer();

    if (!isSpeechRecognitionSupported()) {
      setSupported(false);
      setMode("review");
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setSupported(false);
      setMode("review");
      return;
    }

    recognition.onresult = (event) => {
      let finalText = finalRef.current;
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;

        if (result.isFinal) {
          finalText = `${finalText} ${alternative.transcript}`.trim();
        } else {
          interimText = `${interimText} ${alternative.transcript}`.trim();
        }
      }

      finalRef.current = finalText;
      interimRef.current = interimText;
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      setError(describeSpeechError(event.error));
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setSupported(false);
      }
      finishingRef.current = true;
      clearTimer();
      setInterim("");
      interimRef.current = "";
      setTranscript(normalizeTranscript(finalRef.current));
      setMode(finalRef.current.trim() ? "review" : "idle");
    };

    recognition.onend = () => {
      if (finishingRef.current) return;
      finishCapture();
    };

    recognitionRef.current = recognition;
    setMode("listening");
    setSecondsLeft(VOICE_CAPTURE_SECONDS);

    try {
      recognition.start();
    } catch {
      setError("Voice capture could not start. Type the log instead.");
      setMode("review");
      disposeRecognition();
      return;
    }

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, Math.ceil(VOICE_CAPTURE_SECONDS - elapsed));
      setSecondsLeft(remaining);
      if (remaining <= 0) finishCapture();
    }, 200);
  }

  function stopCapture() {
    finishCapture();
  }

  function reset() {
    clearTimer();
    disposeRecognition();
    finishingRef.current = false;
    finalRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
    setSecondsLeft(VOICE_CAPTURE_SECONDS);
    setMode("idle");
  }

  async function save() {
    const text = normalizeTranscript(transcript);
    if (!text || mode === "saving") return;

    setMode("saving");
    setError(null);
    try {
      await onSave(text);
      setMode("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setMode("idle");
        setTranscript("");
      }, 3_500);
    } catch {
      setError("The log could not be saved. Your transcript is still here — try again.");
      setMode("review");
    }
  }

  const progress = Math.round(((VOICE_CAPTURE_SECONDS - secondsLeft) / VOICE_CAPTURE_SECONDS) * 100);

  return (
    <section
      aria-label="10-second voice day log"
      className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 text-left backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.5)] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
            <Mic className="size-4 shrink-0 text-emerald-400" />
            10-Second Voice Day Log
          </h2>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-500">
            Say what moved today, what blocked you, and the next action. Review the transcript,
            then save. Audio is not stored by ApexMission.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-950/30 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">
          {mode === "listening" ? `0:${String(secondsLeft).padStart(2, "0")}` : "10 sec"}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-300"
        >
          {error}
        </p>
      )}

      {mode === "idle" && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={startCapture}
            disabled={disabled}
            className="btn-glass-primary h-11 min-w-0 flex-1 text-xs"
          >
            <Mic className="size-4" />
            {supported ? "Start 10-second log" : "Type today's log"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTranscript("");
              setMode("review");
            }}
            disabled={disabled}
            className="btn-glass-secondary h-11 shrink-0 px-4 text-xs"
          >
            <PenLine className="size-4" />
            Type instead
          </button>
        </div>
      )}

      {/* Privacy disclosure - shown when idle or before first capture */}
      {(mode === "idle" || showPrivacyNotice) && (
        <details
          className="mt-3 group"
          open={showPrivacyNotice}
          onToggle={() => setShowPrivacyNotice(!showPrivacyNotice)}
        >
          <summary className="flex items-center gap-1.5 cursor-pointer font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors">
            <Shield className="size-3.5 shrink-0 text-emerald-400/80" />
            <AlertCircle className="size-3.5 shrink-0 text-amber-400/80" />
            <span>Speech engine: {engineDescription}</span>
            {usesCloud && (
              <span className="ml-1 inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase tracking-wider text-amber-300">
                Sends audio to cloud
              </span>
            )}
            <span className="ml-auto text-zinc-600 group-open:rotate-90 transition-transform">
              ▼
            </span>
          </summary>
          <div className="mt-2 ml-7 border-l border-emerald-500/20 pl-3 text-[10px] font-medium leading-relaxed text-zinc-400">
            <p>
              {usesCloud
                ? "Audio is sent to the vendor's cloud speech service for transcription. ApexMission only receives the final text you choose to save."
                : "Audio is processed on-device by the browser's built-in speech engine. ApexMission only receives the final text you choose to save."}
            </p>
            <p className="mt-1">
              You can review and edit the transcript before saving. Nothing is stored until you click "Save day log".
            </p>
            <p className="mt-1">
              Prefer typing? Click "Type instead" to skip voice capture entirely.
            </p>
          </div>
        </details>
      )}

      {mode === "listening" && (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-black/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
              </span>
              <span className="truncate font-mono text-[10px] font-black uppercase tracking-wider text-rose-400">
                Listening — speak naturally
              </span>
            </div>
            <span className="font-mono text-lg font-black tabular-nums text-emerald-400">
              0:{String(secondsLeft).padStart(2, "0")}
            </span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-emerald-500/20 bg-black">
            <div
              className="h-full rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)] transition-[width] duration-200 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-3 min-h-10 text-sm font-medium leading-relaxed text-zinc-300">
            {interim || (
              <span className="text-zinc-600 italic">Start with “Today I finished…”</span>
            )}
          </p>

          <button
            type="button"
            onClick={stopCapture}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 text-xs font-black uppercase tracking-wider text-rose-300 transition-colors hover:border-rose-500/60 hover:bg-rose-500 hover:text-black"
          >
            <Square className="size-3.5 fill-current" />
            Stop and review
          </button>
        </div>
      )}

      {(mode === "review" || mode === "saving") && (
        <div className="mt-4">
          <label
            htmlFor="voice-day-log"
            className="font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400/80"
          >
            Review transcript
          </label>
          <textarea
            id="voice-day-log"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            maxLength={MAX_VOICE_TRANSCRIPT_CHARS}
            rows={4}
            placeholder="Today I finished… Tomorrow I will…"
            disabled={mode === "saving"}
            className="mt-2 w-full resize-y rounded-xl border border-emerald-500/20 bg-black/60 px-3 py-2.5 text-sm font-medium leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-emerald-500/50 disabled:opacity-60"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
              {transcript.trim().length}/{MAX_VOICE_TRANSCRIPT_CHARS} characters
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={mode === "saving"}
                className="btn-glass-ghost h-10 px-3 text-[11px]"
              >
                <RotateCcw className="size-3.5" />
                Discard
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={mode === "saving" || !transcript.trim()}
                className="btn-glass-primary h-10 px-4 text-[11px]"
              >
                {mode === "saving" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Save day log
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "saved" && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-3 text-xs font-bold text-emerald-300"
        >
          <Check className="size-4 shrink-0" />
          Day log saved to your private reflection history.
        </div>
      )}
    </section>
  );
}
