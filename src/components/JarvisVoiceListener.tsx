"use client";

import { Mic, MicOff, Square, Zap, Loader2, X, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { handleUnauthenticated } from "@/lib/api-auth";
import { cn } from "@/lib/utils";
import { JarvisNudgeCard } from "@/components/JarvisNudge/JarvisNudgeCard";
import type { JarvisSuggestion } from "@/services/jarvis";

/**
 * JarvisVoiceListener — Press-to-speak Jarvis listener.
 *
 * Captures audio from the device microphone via the Web Audio API /
 * MediaRecorder API on explicit user click, transcribes it through the
 * /api/jarvis/voice endpoint (Whisper + Jarvis suggestion generation), and
 * renders the resulting suggestions as JarvisNudgeCards.
 *
 * Privacy:
 *   - Microphone is only accessed on explicit user click (press-to-speak)
 *   - Audio is never stored by ApexMission — it is sent to the Whisper API
 *     for transcription and immediately discarded
 *   - No background listening; no wake-word detection
 *   - Transcript and suggestions are shown to the user before anything is
 *     applied; every suggestion requires explicit Apply
 */
export interface JarvisVoiceListenerProps {
  /** Context sent to the Jarvis API for suggestion generation. */
  context: {
    firstName: string;
    mission: string | null;
    highTasks: Array<{ id: string; text: string; done: boolean }>;
    mediumTasks: Array<{ id: string; text: string; done: boolean }>;
    lowTasks: Array<{ id: string; text: string; done: boolean }>;
    dailyAction: string | null;
    dailyDone: boolean;
    streakCount: number;
  };
  /** Callback fired when new suggestions are received from the voice turn. */
  onSuggestionsReceived?: (suggestions: JarvisSuggestion[]) => void;
  /** Whether the user has an active enterprise subscription for advanced features. */
  enterprise?: boolean;
}

type ListenerState =
  "idle" | "requesting-permission" | "listening" | "processing" | "ready" | "error";

export function JarvisVoiceListener({
  context,
  onSuggestionsReceived,
  enterprise = false,
}: JarvisVoiceListenerProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<ListenerState>("idle");
  const [transcript, setTranscript] = useState("");
  [useState<JarvisSuggestion[]>([])]; // suggestions rendered by parent via JarvisNudgeCard
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const MAX_RECORD_SECONDS = 60;

  function cleanup() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Already stopped.
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    startTimeRef.current = null;
    setSecondsElapsed(0);
    setAudioLevel(0);
  }

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function updateAudioLevel() {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray) return;
    analyser.getByteFrequencyData(dataArray as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    const len = dataArray.length;
    for (let i = 0; i < len; i++) {
      sum += dataArray[i] ?? 0;
    }
    const avg = len > 0 ? sum / len : 0;
    setAudioLevel(avg / 255);
  }

  function renderLevel() {
    if (!analyserRef.current || !dataArrayRef.current) return;
    updateAudioLevel();
    animationFrameRef.current = requestAnimationFrame(renderLevel);
  }

  const startListening = useCallback(async () => {
    setError(null);
    setState("requesting-permission");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // mono
          sampleRate: 16000, // 16 kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up audio level visualization.
      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      )();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cleanup();
        if (audioChunksRef.current.length === 0) {
          setState("idle");
          return;
        }
        await processAudio();
      };

      recorder.onerror = () => {
        cleanup();
        setState("error");
        setError("Microphone recording failed. Please retry.");
      };

      recorder.start(1000); // collect 1-second chunks
      startTimeRef.current = Date.now();
      setState("listening");
      setSecondsElapsed(0);
      renderLevel();

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current!) / 1000);
        setSecondsElapsed(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) {
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      cleanup();
      setState("error");
      setError(
        err instanceof Error
          ? `Microphone access failed: ${err.message}`
          : "Microphone access failed. Please retry.",
      );
    }
  }, [enterprise]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && state === "listening") {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setState("idle");
    }
  }, [state]);

  const processAudio = useCallback(async () => {
    setState("processing");
    setTranscript("");

    try {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm;codecs=opus",
      });

      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.webm");
      formData.append("context", JSON.stringify({ ...context, enterprise }));

      const response = await fetch("/api/jarvis/voice", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        if (handleUnauthenticated(response)) {
          setState("idle");
          return;
        }
        if (response.status === 403) {
          setError(enterprise
            ? "Enterprise Jarvis features require an active enterprise subscription."
            : "Jarvis voice is temporarily unavailable.");
        } else if (response.status === 400) {
          setError("No speech detected. Please try again.");
        } else {
          setError("Jarvis voice is temporarily unavailable.");
        }
        setState("idle");
        return;
      }

      const data = await response.json();
      setTranscript(data.transcript || "");

      const suggestions: JarvisSuggestion[] = (data.suggestions ?? []).map((s: any) => ({
        ...s,
        status: "pending" as const,
        createdAt: s.createdAt || new Date().toISOString(),
      }));

      onSuggestionsReceived?.(suggestions);
      setState("ready");
    } catch {
      setState("error");
      setError("Jarvis voice is temporarily unavailable.");
    }
  }, [context, onSuggestionsReceived]);

  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    setTranscript("");
    setError(null);
    setAudioLevel(0);
    setSecondsElapsed(0);
  }, []);

  const levelBarWidth = Math.round(audioLevel * 100);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-left backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-400">
            <Zap className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Jarvis Voice</h3>
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              Press-to-speak copilot
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="Close voice listener"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      {enterprise && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="size-3.5 text-sky-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              Enterprise Mode
            </p>
          </div>
          <p className="text-[10px] text-zinc-400">Advanced enterprise features enabled.</p>
        </div>
      )}

      {/* State-driven UI */}
      {state === "idle" && (
        <button
          type="button"
          onClick={startListening}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border bg-zinc-800 px-4 py-3 text-[11px] font-bold transition-all",
            "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500/30 hover:text-white",
          )}
        >
          <Mic className="size-4 shrink-0" />
          <span>Press to speak to Jarvis</span>
        </button>
      )}

      {state === "requesting-permission" && (
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex size-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/50">
            <Loader2 className="size-5 animate-spin text-zinc-400" />
          </div>
          <p className="text-[10px] font-bold text-zinc-400">Requesting microphone access…</p>
        </div>
      )}

      {state === "listening" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex size-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <Mic className="size-6 animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Listening…
            </p>
            <p className="text-sm font-mono text-white">{secondsElapsed}s</p>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{ width: `${Math.min(levelBarWidth, 100)}%` }}
            />
          </div>
          <p className="text-[9px] text-zinc-500">Speak naturally. Click stop when finished.</p>
          <button
            type="button"
            onClick={stopListening}
            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <Square className="size-3.5 shrink-0" />
            Stop
          </button>
        </div>
      )}

      {state === "processing" && (
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
          <p className="text-[10px] font-bold text-zinc-400">
            Transcribing & generating suggestions…
          </p>
        </div>
      )}

      {state === "ready" && transcript && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              You said:
            </h4>
            <button
              type="button"
              onClick={startListening}
              className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-2 py-1 text-[9px] font-bold text-emerald-400 hover:bg-zinc-800 transition-colors"
            >
              <Mic className="size-3 shrink-0" />
              Record again
            </button>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 mb-3">
            <p className="text-[11px] leading-relaxed text-zinc-300">{transcript}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3 mb-3">
          <p className="text-[10px] font-bold text-rose-400">{error}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-1 flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            <X className="size-3 shrink-0" />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
