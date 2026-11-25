"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export type VoiceVisualizerState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "awaiting-approval"
  | "muted"
  | "error";

export interface VoiceVisualizerProps {
  state: VoiceVisualizerState;
  /** Audio level from microphone input (0.0 to 1.0) */
  inputLevel?: number;
  /** Audio level from AI output (0.0 to 1.0) */
  outputLevel?: number;
  /** Session duration in seconds */
  sessionDuration?: number;
  /** Connection status */
  connected?: boolean;
  /** Error message when in error state */
  errorMessage?: string;
  /** Current transcript (when available) */
  transcript?: string;
  /** Current AI response text */
  aiResponse?: string;
  /** Pending approval action description */
  pendingAction?: string;
  /** Whether reduced motion is preferred */
  reducedMotion?: boolean;
  /** Custom className */
  className?: string;
  /** Size of the visualizer */
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASSES = {
  sm: "w-32 h-32",
  md: "w-48 h-48",
  lg: "w-64 h-64",
  xl: "w-80 h-80",
};

const STATE_LABELS: Record<VoiceVisualizerState, string> = {
  idle: "STANDING BY",
  connecting: "ESTABLISHING VOICE LINK",
  listening: "LISTENING",
  processing: "PROCESSING COMMAND",
  speaking: "CHIEF RESPONDING",
  "awaiting-approval": "AWAITING APPROVAL",
  muted: "MICROPHONE MUTED",
  error: "CONNECTION ERROR",
};

const STATE_COLORS: Record<
  VoiceVisualizerState,
  { primary: string; secondary: string; glow: string }
> = {
  idle: { primary: "#10b981", secondary: "#059669", glow: "rgba(16, 185, 129, 0.3)" },
  connecting: { primary: "#3b82f6", secondary: "#2563eb", glow: "rgba(59, 130, 246, 0.4)" },
  listening: { primary: "#10b981", secondary: "#059669", glow: "rgba(16, 185, 129, 0.5)" },
  processing: { primary: "#f59e0b", secondary: "#d97706", glow: "rgba(245, 158, 11, 0.4)" },
  speaking: { primary: "#06b6d4", secondary: "#0891b2", glow: "rgba(6, 182, 212, 0.5)" },
  "awaiting-approval": {
    primary: "#f59e0b",
    secondary: "#d97706",
    glow: "rgba(245, 158, 11, 0.4)",
  },
  muted: { primary: "#6b7280", secondary: "#4b5563", glow: "rgba(107, 114, 128, 0.2)" },
  error: { primary: "#ef4444", secondary: "#dc2626", glow: "rgba(239, 68, 68, 0.3)" },
};

export function VoiceVisualizer({
  state,
  inputLevel = 0,
  outputLevel = 0,
  sessionDuration = 0,
  connected = false,
  errorMessage,
  transcript,
  aiResponse,
  pendingAction,
  reducedMotion = false,
  className,
  size = "lg",
}: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const ringsRef = useRef<Array<{ radius: number; speed: number; opacity: number; phase: number }>>(
    [],
  );
  const pulsePhaseRef = useRef(0);
  const waveformRef = useRef<number[]>([]);

  // Initialize rings on mount
  useEffect(() => {
    const numRings = 5;
    ringsRef.current = Array.from({ length: numRings }, (_, i) => ({
      radius: 0.15 + i * 0.12,
      speed: 0.0005 + i * 0.0002,
      opacity: 0.6 - i * 0.08,
      phase: (i / numRings) * Math.PI * 2,
    }));
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 4;

    let lastTime = performance.now();

    function animate(currentTime: number) {
      const dt = currentTime - lastTime;
      lastTime = currentTime;
      timeRef.current += dt;

      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      const colors = STATE_COLORS[state];
      const isActive = ["listening", "speaking", "processing", "connecting"].includes(state);
      const isAudioActive = state === "listening" ? inputLevel > 0.01 : outputLevel > 0.01;

      // Update pulse phase for active states
      if (isActive && !reducedMotion) {
        pulsePhaseRef.current += dt * 0.003;
      }

      // Draw background glow
      if (isActive && !reducedMotion) {
        const glowRadius = maxRadius * (0.8 + 0.3 * Math.sin(pulsePhaseRef.current * 2));
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          glowRadius,
        );
        gradient.addColorStop(0, colors.glow);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      // Draw concentric rings
      if (!reducedMotion) {
        ringsRef.current.forEach((ring, i) => {
          if (state === "connecting") {
            // Rotating segmented rings for connecting
            ring.phase += ring.speed * dt;
            const segments = 8;
            for (let s = 0; s < segments; s++) {
              const segmentPhase = ring.phase + (s / segments) * Math.PI * 2;
              const opacity = ring.opacity * (0.5 + 0.5 * Math.sin(segmentPhase * 3));
              ctx.beginPath();
              ctx.arc(
                centerX,
                centerY,
                maxRadius * ring.radius,
                segmentPhase,
                segmentPhase + (Math.PI / segments) * 0.8,
              );
              ctx.strokeStyle = `${colors.primary}${Math.round(opacity * 255)
                .toString(16)
                .padStart(2, "0")}`;
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          } else if (state === "processing") {
            // Amber segmented rotating rings
            ring.phase += ring.speed * dt * 1.5;
            const segments = 6;
            for (let s = 0; s < segments; s++) {
              const segmentPhase = ring.phase + (s / segments) * Math.PI * 2;
              const opacity =
                ring.opacity * (0.4 + 0.6 * Math.sin(segmentPhase * 2 + timeRef.current * 0.005));
              ctx.beginPath();
              ctx.arc(
                centerX,
                centerY,
                maxRadius * ring.radius,
                segmentPhase,
                segmentPhase + (Math.PI / segments) * 1.2,
              );
              ctx.strokeStyle = `${colors.primary}${Math.round(opacity * 255)
                .toString(16)
                .padStart(2, "0")}`;
              ctx.lineWidth = 3;
              ctx.stroke();
            }
          } else if (isActive) {
            // Expanding pulse rings for listening/speaking
            const pulseRadius =
              maxRadius * (ring.radius + 0.15 * Math.sin(pulsePhaseRef.current * 1.5 + ring.phase));
            const opacity =
              ring.opacity * (0.5 + 0.5 * Math.sin(pulsePhaseRef.current * 2 + ring.phase));
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `${colors.primary}${Math.round(opacity * 255)
              .toString(16)
              .padStart(2, "0")}`;
            ctx.lineWidth = state === "listening" ? 2 : 3;
            ctx.stroke();
          }
        });
      }

      // Draw central orb
      const orbRadius = maxRadius * 0.25;
      const orbGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        orbRadius,
      );

      if (state === "idle") {
        orbGradient.addColorStop(0, `${colors.primary}40`);
        orbGradient.addColorStop(1, `${colors.secondary}20`);
      } else if (state === "muted") {
        orbGradient.addColorStop(0, `${colors.primary}30`);
        orbGradient.addColorStop(1, `${colors.secondary}10`);
      } else if (state === "error") {
        orbGradient.addColorStop(0, `${colors.primary}60`);
        orbGradient.addColorStop(1, `${colors.secondary}30`);
      } else {
        const intensity = isAudioActive ? 1 : 0.7;
        orbGradient.addColorStop(0, colors.primary);
        orbGradient.addColorStop(0.5, colors.secondary);
        orbGradient.addColorStop(
          1,
          `${colors.primary}${Math.round(intensity * 200)
            .toString(16)
            .padStart(2, "0")}`,
        );
      }

      ctx.beginPath();
      ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = orbGradient;
      ctx.fill();

      // Orb inner glow
      if (isActive && !reducedMotion) {
        const innerGlow = ctx.createRadialGradient(
          centerX,
          centerY,
          orbRadius * 0.3,
          centerX,
          centerY,
          orbRadius * 1.5,
        );
        innerGlow.addColorStop(0, `${colors.primary}60`);
        innerGlow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(centerX, centerY, orbRadius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = innerGlow;
        ctx.fill();
      }

      // Audio-reactive waveform around orb
      if ((state === "listening" || state === "speaking") && !reducedMotion) {
        const level = state === "listening" ? inputLevel : outputLevel;
        const waveformPoints = 64;
        const baseRadius = orbRadius * 1.3;

        // Update waveform buffer
        waveformRef.current.push(level);
        if (waveformRef.current.length > waveformPoints) {
          waveformRef.current.shift();
        }

        // Draw waveform as radial bars
        ctx.save();
        ctx.translate(centerX, centerY);

        for (let i = 0; i < waveformPoints; i++) {
          const angle = (i / waveformPoints) * Math.PI * 2;
          const bufferIndex = Math.floor((i / waveformPoints) * waveformRef.current.length);
          const amplitude = waveformRef.current[bufferIndex] || 0;
          const barLength = baseRadius + amplitude * maxRadius * 0.4;
          const barWidth = ((Math.PI * 2) / waveformPoints) * barLength * 0.8;

          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * baseRadius, Math.sin(angle) * baseRadius);
          ctx.lineTo(Math.cos(angle) * barLength, Math.sin(angle) * barLength);
          ctx.strokeStyle = `${colors.primary}${Math.round((0.4 + amplitude * 0.6) * 255)
            .toString(16)
            .padStart(2, "0")}`;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        ctx.restore();
      }

      // Muted indicator
      if (state === "muted") {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-orbRadius, -orbRadius);
        ctx.lineTo(orbRadius, orbRadius);
        ctx.strokeStyle = `${colors.primary}80`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Error indicator
      if (state === "error") {
        ctx.save();
        ctx.translate(centerX, centerY - orbRadius * 1.5);
        // Triangle warning
        ctx.beginPath();
        ctx.moveTo(0, -orbRadius * 0.5);
        ctx.lineTo(-orbRadius * 0.4, orbRadius * 0.4);
        ctx.lineTo(orbRadius * 0.4, orbRadius * 0.4);
        ctx.closePath();
        ctx.fillStyle = colors.primary;
        ctx.fill();
        // Exclamation mark
        ctx.fillStyle = "#000";
        ctx.font = `bold ${orbRadius * 0.5}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", 0, orbRadius * 0.05);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [state, inputLevel, outputLevel, reducedMotion]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      // Trigger re-render by updating a dummy state or just let the animation loop handle it
    });
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className={cn("relative", SIZE_CLASSES[size])}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          aria-label={`AI Chief of Staff voice visualizer - ${STATE_LABELS[state]}`}
          role="img"
        />
        {/* Status overlay */}
        <div className="absolute bottom-[-2.5rem] left-1/2 -translate-x-1/2 text-center w-full max-w-xs">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider",
              {
                "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30": [
                  "idle",
                  "listening",
                ].includes(state),
                "bg-blue-950/80 text-blue-400 border border-blue-500/30": state === "connecting",
                "bg-amber-950/80 text-amber-400 border border-amber-500/30": [
                  "processing",
                  "awaiting-approval",
                ].includes(state),
                "bg-cyan-950/80 text-cyan-400 border border-cyan-500/30": state === "speaking",
                "bg-zinc-950/80 text-zinc-400 border border-zinc-500/30": state === "muted",
                "bg-rose-950/80 text-rose-400 border border-rose-500/30": state === "error",
              },
            )}
          >
            {["connecting", "listening", "processing", "speaking"].includes(state) &&
              !reducedMotion && (
                <span className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-current" />
                </span>
              )}
            {state === "muted" && (
              <svg
                className="size-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95a7 7 0 0 1-5 2.05" />
              </svg>
            )}
            {state === "error" && (
              <svg
                className="size-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{STATE_LABELS[state]}</span>
          </div>
        </div>

        {/* Session duration */}
        {sessionDuration > 0 && (
          <div className="absolute top-[-2rem] left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-950/80 border border-zinc-700 text-[10px] font-mono tabular-nums text-zinc-400">
            {formatDuration(sessionDuration)}
          </div>
        )}
      </div>

      {/* Transcript / AI Response */}
      {(transcript || aiResponse) && (
        <div className="mt-4 w-full max-w-md text-center">
          {transcript && (
            <div className="mb-2 p-3 rounded-lg border border-zinc-700 bg-zinc-950/50 text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                YOU SAID
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-300">{transcript}</p>
            </div>
          )}
          {aiResponse && (
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30 text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/80 mb-1">
                CHIEF RESPONDING
              </p>
              <p className="text-[11px] leading-relaxed text-emerald-300">{aiResponse}</p>
            </div>
          )}
        </div>
      )}

      {/* Pending approval */}
      {pendingAction && state === "awaiting-approval" && (
        <div className="mt-4 w-full max-w-md p-4 rounded-xl border border-amber-500/30 bg-amber-950/30">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="size-4 shrink-0 text-amber-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
              AWAITING APPROVAL
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300">{pendingAction}</p>
        </div>
      )}

      {/* Error message */}
      {errorMessage && state === "error" && (
        <div className="mt-4 w-full max-w-md p-3 rounded-lg border border-rose-500/20 bg-rose-950/20 text-center">
          <p className="text-[10px] font-bold text-rose-400">{errorMessage}</p>
        </div>
      )}

      {/* Connection status */}
      <div
        className={cn(
          "mt-2 flex items-center justify-center gap-1.5 text-[9px] font-mono",
          connected ? "text-emerald-400" : "text-zinc-500",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600",
          )}
        />
        <span>{connected ? "CONNECTED" : "DISCONNECTED"}</span>
      </div>
    </div>
  );
}
