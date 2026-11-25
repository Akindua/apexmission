"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  X,
  Loader2,
  Shield,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceVisualizer, type VoiceVisualizerState } from "./VoiceVisualizer";
import { handleUnauthenticated, authHeaders } from "@/lib/api-auth";
import { getFunctionDefinitions } from "@/lib/chief-of-staff-commands";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";

type VoiceCommandState =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "connected"
  | "listening"
  | "processing"
  | "speaking"
  | "awaiting-approval"
  | "muted"
  | "error";

interface PendingApproval {
  command: string;
  preview: unknown;
  token: string;
  expiresAt: number;
}

export interface VoiceCommandPanelProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  mission: string | null;
  tasks: Record<
    "high" | "medium" | "low",
    Array<{ id?: string; text: string; done: boolean; tier?: "high" | "medium" | "low" }>
  >;
  daily: { text: string; done: boolean };
  streak: { count: number };
  isEnterprise: boolean;
}

export function VoiceCommandPanel({
  open,
  onClose,
  userName,
  mission,
  tasks,
  daily,
  streak,
  isEnterprise,
}: VoiceCommandPanelProps) {
  const { enterprise: hasEnterpriseAccess, loading: subscriptionLoading } = useSubscriptionTier();
  const isEnterpriseEntitled = isEnterprise && hasEnterpriseAccess && !subscriptionLoading;

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceCommandState>("idle");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [showPrivacyDisclosure, setShowPrivacyDisclosure] = useState(false);
  const [voiceConsentGiven, setVoiceConsentGiven] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const pendingToolCallsRef = useRef<Map<string, { name: string; args: unknown }>>(new Map());
  const pendingApprovalRef = useRef<PendingApproval | null>(null);
  const handleRealtimeMessageRef = useRef<(message: Record<string, unknown>) => void>(() => {});

  // Reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop session timer
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionStartRef.current = null;
    setSessionDuration(0);

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    dataChannelRef.current = null;

    // Stop microphone stream
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    // Stop remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    // Reset state
    setConnected(false);
    setInputLevel(0);
    setOutputLevel(0);
    setTranscript("");
    setAiResponse("");
    setPendingApproval(null);
    pendingApprovalRef.current = null;
    pendingToolCallsRef.current.clear();
  }, []);

  // Cleanup on unmount or when panel closes
  useEffect(() => {
    if (!open) {
      cleanup();
      setVoiceState("idle");
    }
    return () => {
      cleanup();
    };
  }, [open, cleanup]);

  // Audio level monitoring
  const startAudioLevelMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateLevel() {
      const analyser = analyserRef.current;
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = dataArray.length > 0 ? sum / dataArray.length : 0;
      setInputLevel(avg / 255);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    }

    updateLevel();
  }, []);

  const startOutputLevelMonitoring = useCallback(() => {
    const audioCtx = audioContextRef.current;
    const audioEl = remoteAudioRef.current;
    if (!audioEl || !audioCtx) return;

    // Create analyser for remote audio if not exists
    const outputAnalyser = audioCtx.createAnalyser();
    outputAnalyser.fftSize = 256;
    const dataArray = new Uint8Array(outputAnalyser.frequencyBinCount);

    // Connect remote audio to analyser
    const source = audioCtx.createMediaElementSource(audioEl);
    source.connect(outputAnalyser);
    outputAnalyser.connect(audioCtx.destination);

    function updateOutputLevel() {
      const audioEl = remoteAudioRef.current;
      if (!audioEl || audioEl.paused) {
        setOutputLevel(0);
        return;
      }
      outputAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = dataArray.length > 0 ? sum / dataArray.length : 0;
      setOutputLevel(avg / 255);
      animationFrameRef.current = requestAnimationFrame(updateOutputLevel);
    }

    updateOutputLevel();
  }, []);

  // Session timer
  const startSessionTimer = useCallback(() => {
    sessionStartRef.current = Date.now();
    sessionTimerRef.current = setInterval(() => {
      if (sessionStartRef.current) {
        setSessionDuration(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
    }, 1000);
  }, []);

  // Get ephemeral token from server
  const getRealtimeToken = useCallback(async (): Promise<{
    client_secret: { value: string; expires_at: number };
    expires_at: number;
  } | null> => {
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/chief-of-staff/realtime-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ enterprise: isEnterpriseEntitled, voice: "alloy" }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Enterprise features require an active enterprise subscription");
        }
        throw new Error("Failed to create realtime session");
      }

      return await response.json();
    } catch (error) {
      console.error("[VoiceCommand] Token request failed:", error);
      throw error;
    }
  }, [isEnterpriseEntitled]);

  // Handle tool calls from the AI
  const handleToolCall = useCallback(
    async (toolCall: { name: string; arguments: string; call_id: string }) => {
      const { name, arguments: argsStr, call_id } = toolCall;
      let args: unknown;
      try {
        args = JSON.parse(argsStr);
      } catch {
        console.error("[VoiceCommand] Invalid tool arguments:", argsStr);
        return;
      }

      console.log("[VoiceCommand] Tool call:", name, args);

      // Check if this is a persistent modification requiring approval
      const commandRegistry = await import("@/lib/chief-of-staff-commands").then((m) =>
        m.getCommandRegistry(),
      );
      const command = commandRegistry.get(name);

      if (command?.category === "persistent-modification") {
        // Create approval token
        try {
          const headers = await authHeaders();
          const approvalResponse = await fetch("/api/chief-of-staff/create-approval", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ command: name, preview: args }),
          });

          if (!approvalResponse.ok) {
            throw new Error("Failed to create approval");
          }

          const { token, expires_at } = await approvalResponse.json();
          const expiresAtMs =
            typeof expires_at === "number" ? expires_at * 1000 : Date.now() + 60 * 1000;
          const preview = await command.handler(args, {
            userId: "", // Will be filled by server
            token: "",
            isEnterprise: isEnterpriseEntitled,
            companyId: null,
            missionContext: {
              firstName: userName.split(" ")[0],
              mission,
              highTasks: tasks.high,
              mediumTasks: tasks.medium,
              lowTasks: tasks.low,
              dailyAction: daily.text ?? null,
              dailyDone: daily.done,
              streakCount: streak.count,
            },
          });

          const pending: PendingApproval = {
            command: name,
            preview,
            token,
            expiresAt: expiresAtMs,
          };
          setPendingApproval(pending);
          pendingApprovalRef.current = pending;
          setVoiceState("awaiting-approval");

          // Send tool result indicating approval required
          if (dataChannelRef.current?.readyState === "open") {
            dataChannelRef.current.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id,
                  output: JSON.stringify({
                    requiresApproval: true,
                    preview,
                    approvalToken: token,
                    message:
                      "This action requires your explicit approval. Please review and confirm.",
                  }),
                },
              }),
            );
          }
        } catch (error) {
          console.error("[VoiceCommand] Approval creation failed:", error);
        }
        return;
      }

      // Execute read-only or reversible commands directly
      try {
        const headers = await authHeaders();
        const executeResponse = await fetch("/api/chief-of-staff/execute-command", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ command: name, input: args }),
        });

        if (!executeResponse.ok) {
          throw new Error(`Command failed: ${executeResponse.status}`);
        }

        const result = await executeResponse.json();

        // Send tool result back to AI
        if (dataChannelRef.current?.readyState === "open") {
          dataChannelRef.current.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id,
                output: JSON.stringify(result),
              },
            }),
          );
        }
      } catch (error) {
        console.error("[VoiceCommand] Command execution failed:", error);
        if (dataChannelRef.current?.readyState === "open") {
          dataChannelRef.current.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id,
                output: JSON.stringify({
                  error: error instanceof Error ? error.message : "Command failed",
                }),
              },
            }),
          );
        }
      }
    },
    [isEnterpriseEntitled, mission, tasks, daily, streak],
  );

  // Handle approval confirmation
  const handleApprovalConfirm = useCallback(async (approved: boolean) => {
    if (!pendingApprovalRef.current) return;

    const { command: commandName, token } = pendingApprovalRef.current;

    if (!approved) {
      // Send rejection to AI
      if (dataChannelRef.current?.readyState === "open") {
        dataChannelRef.current.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: `approval-${Date.now()}`,
              output: JSON.stringify({ approved: false, message: "User rejected the action" }),
            },
          }),
        );
      }
      setPendingApproval(null);
      pendingApprovalRef.current = null;
      setVoiceState("listening");
      return;
    }

    // Execute with approval token
    try {
      const headers = await authHeaders();
      // We need to get the original arguments - in a real implementation,
      // these would be stored with the approval token
      const executeResponse = await fetch("/api/chief-of-staff/execute-command", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          command: commandName,
          input: {}, // Arguments would come from stored preview
          approvalToken: token,
        }),
      });

      const result = await executeResponse.json();

      if (dataChannelRef.current?.readyState === "open") {
        dataChannelRef.current.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: `approval-${Date.now()}`,
              output: JSON.stringify({ approved: true, ...result }),
            },
          }),
        );
      }
    } catch (error) {
      console.error("[VoiceCommand] Approval execution failed:", error);
    }

    setPendingApproval(null);
    pendingApprovalRef.current = null;
    setVoiceState("listening");
  }, []);

  // Start voice session
  const startVoiceSession = useCallback(async () => {
    if (voiceState !== "idle" && voiceState !== "muted") return;

    setErrorMessage(null);
    setVoiceState("requesting-permission");

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneStreamRef.current = stream;

      // Set up audio context for input monitoring
      const AudioCtor =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        throw new Error("Web Audio API not available");
      }
      const audioCtx = new AudioCtor();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;

      startAudioLevelMonitoring();

      // Get ephemeral token
      setVoiceState("connecting");
      const tokenResponse = await getRealtimeToken();
      if (!tokenResponse) {
        throw new Error("Failed to get realtime token");
      }
      const { client_secret } = tokenResponse;

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [],
      });
      peerConnectionRef.current = pc;

      // Set up remote audio
      const audioEl = new Audio();
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          audioEl.srcObject = stream;
          startOutputLevelMonitoring();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[VoiceCommand] Connection state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setConnected(true);
          setVoiceState("listening");
          startSessionTimer();
        } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          setConnected(false);
          setVoiceState("error");
          setErrorMessage("Connection lost. Please try again.");
        }
      };

      // Add microphone track
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create data channel for tool calls
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log("[VoiceCommand] Data channel open");
        // Send session update with tools
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              tools: getFunctionDefinitions(isEnterpriseEntitled),
              tool_choice: "auto",
              instructions: `You are the AI Chief of Staff for ${userName.split(" ")[0]}. Current mission: ${mission || "Not declared"}. 
High-impact tasks: ${
                tasks.high
                  .filter((t) => !t.done)
                  .map((t) => t.text)
                  .join("; ") || "none"
              }
Daily action: ${daily.text || "none"} (${daily.done ? "done" : "pending"})
Streak: ${streak.count} days.
${isEnterpriseEntitled ? "Enterprise mode: You have access to organization context." : "Personal mode."}`,
            },
          }),
        );
      };

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleRealtimeMessageRef.current?.(message);
        } catch (error) {
          console.error("[VoiceCommand] Message parse error:", error);
        }
      };

      dc.onclose = () => {
        console.log("[VoiceCommand] Data channel closed");
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI Realtime API via WebRTC
      const sdp = offer.sdp ?? "";
      const response = await fetch(
        `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: sdp,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to establish WebRTC connection");
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      console.error("[VoiceCommand] Session start failed:", error);
      cleanup();
      setVoiceState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to start voice session");
    }
  }, [
    voiceState,
    userName,
    mission,
    tasks,
    daily,
    streak,
    isEnterpriseEntitled,
    getRealtimeToken,
    startAudioLevelMonitoring,
    startOutputLevelMonitoring,
    startSessionTimer,
    cleanup,
  ]);

  // Handle incoming realtime messages
  const handleRealtimeMessage = useCallback(
    (message: Record<string, unknown>) => {
      switch (message["type"]) {
        case "session.created":
        case "session.updated":
          console.log("[VoiceCommand] Session ready");
          break;

        case "conversation.item.created": {
          const item = message["item"] as Record<string, unknown> | undefined;
          if (item && item["type"] === "message") {
            const content = (item["content"] as unknown[] | undefined)?.[0] as
              Record<string, unknown> | undefined;
            if (content && content["type"] === "input_text") {
              setTranscript(String(content["text"] ?? ""));
            } else if (content && content["type"] === "text") {
              setAiResponse(String(content["text"] ?? ""));
              setVoiceState("speaking");
            }
          }
          break;
        }

        case "response.audio_transcript.delta":
          // Partial transcript
          break;

        case "response.audio_transcript.done":
          setTranscript(String(message["transcript"] ?? ""));
          break;

        case "response.text.delta":
          setAiResponse((prev) => prev + String(message["delta"] ?? ""));
          break;

        case "response.text.done":
          setVoiceState("listening");
          break;

        case "response.function_call_arguments.done": {
          const toolCall = message as Record<string, unknown>;
          handleToolCall({
            name: String(toolCall["name"] ?? ""),
            arguments: String(toolCall["arguments"] ?? ""),
            call_id: String(toolCall["call_id"] ?? ""),
          });
          break;
        }

        case "input_audio_buffer.speech_started":
          setVoiceState("listening");
          break;

        case "input_audio_buffer.speech_stopped":
          setVoiceState("processing");
          break;

        case "rate_limits.updated":
          console.log("[VoiceCommand] Rate limits:", message["rate_limits"]);
          break;

        case "error": {
          const error = message["error"] as Record<string, unknown> | undefined;
          console.error("[VoiceCommand] Realtime error:", error);
          setErrorMessage(String(error?.["message"] ?? "Realtime error occurred"));
          setVoiceState("error");
          break;
        }

        default:
          console.log("[VoiceCommand] Unhandled message:", message["type"]);
      }
    },
    [handleToolCall],
  );

  // Keep ref in sync
  useEffect(() => {
    handleRealtimeMessageRef.current = handleRealtimeMessage;
  }, [handleRealtimeMessage]);

  // Stop voice session
  const stopVoiceSession = useCallback(() => {
    cleanup();
    setVoiceState("idle");
  }, [cleanup]);

  // Toggle microphone mute
  const toggleMicrophoneMute = useCallback(() => {
    if (microphoneStreamRef.current) {
      const tracks = microphoneStreamRef.current.getAudioTracks();
      tracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicrophoneMuted(!microphoneMuted);
      if (!microphoneMuted) {
        setVoiceState("muted");
      } else if (voiceState === "muted") {
        setVoiceState("listening");
      }
    }
  }, [microphoneMuted, voiceState]);

  // Toggle speaker mute
  const toggleSpeakerMute = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
      setSpeakerMuted(!speakerMuted);
    }
  }, [speakerMuted]);

  // Visualizer state mapping
  const visualizerState: VoiceVisualizerState = (() => {
    switch (voiceState) {
      case "idle":
      case "requesting-permission":
        return "idle";
      case "connecting":
        return "connecting";
      case "listening":
        return microphoneMuted ? "muted" : "listening";
      case "processing":
        return "processing";
      case "speaking":
        return "speaking";
      case "awaiting-approval":
        return "awaiting-approval";
      case "muted":
        return "muted";
      case "error":
        return "error";
      default:
        return "idle";
    }
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 h-full w-full md:w-[480px] bg-zinc-950 border-l border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
      {/* Backdrop */}
      <button
        type="button"
        onClick={stopVoiceSession}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close Voice Command"
      />

      {/* Panel content */}
      <div className="relative z-10 h-full flex flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Mic className="size-5" />
            </div>
            <div>
              <h2 className="font-black text-white tracking-tight">AI Chief of Staff</h2>
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/70">
                Voice Command
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEnterprise && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400">
                Enterprise
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Voice Command"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Privacy Disclosure */}
          {(!voiceConsentGiven && voiceState === "idle") || showPrivacyDisclosure ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <Shield className="size-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-amber-400 text-sm mb-2">
                    Voice Feature Disclosure
                  </h3>
                  <ul className="text-[11px] leading-relaxed text-zinc-300 space-y-1">
                    <li>
                      • Audio is transmitted to OpenAI's Realtime API for live voice conversation
                    </li>
                    <li>• OpenAI processes audio for speech recognition and generation</li>
                    <li>
                      • Transcripts may be temporarily retained by OpenAI per their data policy
                    </li>
                    <li>• ApexMissions does not store raw audio recordings</li>
                    <li>• Microphone activates only on explicit user action (Press to Speak)</li>
                    <li>
                      • You can stop listening at any time or close this panel to end the session
                    </li>
                    <li>• Data processing occurs on OpenAI infrastructure (US-based)</li>
                    <li>• You may withdraw consent anytime by closing Voice Command</li>
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceConsentGiven(true);
                        setShowPrivacyDisclosure(false);
                      }}
                      className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-black hover:bg-emerald-400"
                    >
                      <CheckCircle className="size-3.5" />I Understand & Consent
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPrivacyDisclosure(!showPrivacyDisclosure)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-[11px] font-bold text-zinc-400 hover:bg-zinc-800"
                    >
                      <AlertCircle className="size-3.5" />
                      Learn More
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Voice Visualizer */}
          <div className="flex flex-col items-center justify-center py-4">
            <VoiceVisualizer
              state={visualizerState}
              inputLevel={microphoneMuted ? 0 : inputLevel}
              outputLevel={speakerMuted ? 0 : outputLevel}
              sessionDuration={sessionDuration}
              connected={connected}
              errorMessage={errorMessage || ""}
              transcript={transcript}
              aiResponse={aiResponse}
              pendingAction={
                pendingApproval ? `Execute ${pendingApproval.command.replace(/_/g, " ")}?` : ""
              }
              reducedMotion={reducedMotion}
              size="xl"
            />
          </div>

          {/* Controls */}
          <div className="space-y-3 pt-2">
            {/* Microphone/Speaker controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMicrophoneMute}
                disabled={
                  voiceState === "idle" ||
                  voiceState === "error" ||
                  voiceState === "requesting-permission" ||
                  voiceState === "connecting"
                }
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border transition-all",
                  microphoneMuted
                    ? "border-rose-500/30 bg-rose-950/30 text-rose-400"
                    : "border-emerald-500/30 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-500/50 hover:text-black",
                )}
                aria-label={microphoneMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {microphoneMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </button>

              <button
                type="button"
                onClick={toggleSpeakerMute}
                disabled={
                  voiceState === "idle" ||
                  voiceState === "error" ||
                  voiceState === "requesting-permission" ||
                  voiceState === "connecting"
                }
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border transition-all",
                  speakerMuted
                    ? "border-rose-500/30 bg-rose-950/30 text-rose-400"
                    : "border-blue-500/30 bg-blue-950/30 text-blue-400 hover:bg-blue-500/50 hover:text-black",
                )}
                aria-label={speakerMuted ? "Unmute speaker" : "Mute speaker"}
              >
                {speakerMuted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
              </button>
            </div>

            {/* Main action button */}
            {voiceState === "idle" && voiceConsentGiven && (
              <button
                type="button"
                onClick={startVoiceSession}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-[11px] font-bold text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all hover:bg-emerald-500/50 hover:text-black"
              >
                <Mic className="size-5 shrink-0" />
                <span>Start Voice Command</span>
              </button>
            )}

            {voiceState === "requesting-permission" && (
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <div className="flex size-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/50">
                  <Loader2 className="size-5 animate-spin text-zinc-400" />
                </div>
                <p className="text-[10px] font-bold text-zinc-400">Requesting microphone access…</p>
              </div>
            )}

            {["connecting", "listening", "processing", "speaking"].includes(voiceState) && (
              <button
                type="button"
                onClick={stopVoiceSession}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-[11px] font-bold text-rose-400 transition-all hover:bg-rose-500/50 hover:text-black"
              >
                <Square className="size-5 shrink-0" />
                <span>Stop Listening</span>
              </button>
            )}

            {voiceState === "awaiting-approval" && pendingApproval && (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                    CONFIRM ACTION
                  </p>
                  <p className="text-[11px] leading-relaxed text-zinc-300">
                    {JSON.stringify(pendingApproval.preview, null, 2)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprovalConfirm(true)}
                    className="flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black hover:bg-emerald-400"
                  >
                    <CheckCircle className="size-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprovalConfirm(false)}
                    className="flex-1 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/50 hover:text-black"
                  >
                    <X className="size-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            )}

            {voiceState === "error" && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3">
                <p className="text-[10px] font-bold text-rose-400 mb-2">
                  {errorMessage ?? "Unknown error"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={startVoiceSession}
                    className="flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black hover:bg-emerald-400"
                  >
                    <Loader2 className="size-3.5" />
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-[10px] font-bold text-zinc-400 hover:bg-zinc-800"
                  >
                    <X className="size-3.5" />
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Privacy settings link */}
            <button
              type="button"
              onClick={() => setShowPrivacyDisclosure(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-[9px] font-bold text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <Shield className="size-3.5" />
              <span>Microphone Privacy Settings</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-4">
          <p className="text-[9px] font-medium text-zinc-500 text-center">
            Voice Command uses OpenAI Realtime API. Audio is processed in real-time and not stored
            by ApexMissions.
            <br />
            Microphone is only active during explicit voice sessions.
          </p>
        </div>
      </div>
    </div>
  );
}
