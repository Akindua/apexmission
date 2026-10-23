import { useChat } from "@ai-sdk/react";
import { extractText } from "@/lib/document-parser";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Lock, MessageCircle, X, Paperclip, Sparkles, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

const STORAGE_KEY = "mission-coach-chat-v1";
const LIMIT_KEY = "apexmission-coach-daily-tokens";
const FREE_HISTORY_LIMIT = 6;
// ⚡ HARD RATE LIMIT CAP: Restricts total server transmissions to protect your $4.50 credit pool
const MAX_DAILY_MESSAGES = 10;

const QUICK_STARTS = [
  { label: "📚 Help me study", prompt: "Help me study — I need a plan for the subject I'm struggling with." },
  { label: "🌱 Life advice", prompt: "I'd like some life advice about what I should focus on right now." },
  {
    label: "⏱️ Fix procrastination",
    prompt: "I keep procrastinating. Help me figure out why and give me a way to start right now.",
  },
];
function send(text: string) {
    if (!text) return;
    // 🧠 REAL-TIME AI COACH CHAT TEXT SCANNER & SLACKING DEDUCTION WITH NATIVE AUDIO CHIME
    const trimmed = text.trim();
    const textLower = trimmed.toLowerCase();
    const indicatesSlacking = textLower.includes("procrastinate") || textLower.includes("gave up") || textLower.includes("lazy") || textLower.includes("didn't do");
    
    if (indicatesSlacking) {
      const cleanCurrentPoints = state?.points || 0;
      const freshPoints = Math.max(0, cleanCurrentPoints - aiPenalty);
      const aiPenalty = 100;

      try {
        const activeStateStr = localStorage.getItem("apexmission-state");
        if (activeStateStr) {
          const parsedState = JSON.parse(activeStateStr);
          if (parsedState && typeof parsedState.points === "number") {
            cleanCurrentPoints = parsedState.points;
          }
        }
      } catch (e) {
        console.error("Local storage lookup bypassed safely:", e);
      }
      
      if (typeof window !== "undefined") {
        const currentStore = JSON.parse(localStorage.getItem("apexmission-state") || "{}");
        currentStore.points = freshPoints;
        localStorage.setItem("apexmission-state", JSON.stringify(currentStore));

        // 🔊 INTENSE OSCILLATOR SWEEP AUDIO HARBINGER CHIME FOR AI CHAT REBUKES
        try {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            const ctx = new AudioCtxClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(320, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.5);
            
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
          }
        } catch (e) {}
      }

      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          void supabase
            .from("profiles")
            .update({ points: freshPoints, operational_status: "FALLEN" })
            .eq("id", user.id);
        }
      });
    }
}

function loadMessages(): UIMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export function MissionCoach({
  premium = false,
  state,
  onLockedHistory,
  onActionPlanGenerated,
}: {
  premium?: boolean;
  state: any;
  onLockedHistory?: () => void;
  onActionPlanGenerated?: (plan: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedText, setUploadedText] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);

  useEffect(() => {
    setPlanGenerated(false);
  }, [uploadedText]);

  useEffect(() => {
    setInitial(loadMessages());
  }, []);

  async function generateActionPlan() {
    if (!uploadedText || generatingPlan) return;
    setGeneratingPlan(true);
    try {
      const response = await fetch("/api/mission-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: uploadedText }),
      });
      if (!response.ok) throw new Error(`Mission Planner processing failure: ${response.status}`);
      const plan = await response.json();
      
      // ✅ Explicitly passes down clean nextId arrays for all columns to fix the missing medium tier bug
      onActionPlanGenerated?.({
        mission: plan.mission,
        high: plan.high || [],
        medium: plan.medium || [],
        low: plan.low || [],
        dailyAction: plan.dailyAction || ""
      });
      
      setPlanGenerated(true);
      
      // 🔄 AUTOMATIC CACHE CLEAR TRIGGER: Purges your attached files list badge instantly on completion
      setFiles([]);
      setUploadedText("");
      
    } catch (error) {
      console.error("Document action plan mapping failed:", error);
      alert("Could not extract parameters from the attached context file.");
    } finally {
      setGeneratingPlan(false);
    }
  }


  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;
    setFiles(selected);
    setPlanGenerated(false);
    const contents = await Promise.all(selected.map(extractText));
    const combined = contents.join("\n\n");
    setUploadedText(combined);
  }

  if (initial === null) {
    return <CoachLauncher open={open} onToggle={() => setOpen(true)} />;
  }
    
  return (
    <CoachPanel
      key="coach"
      open={open}
      setOpen={setOpen}
      initialMessages={initial}
      input={input}
      setInput={setInput}
      textareaRef={textareaRef}
      premium={premium}
      onLockedHistory={onLockedHistory}
      files={files}
      handleFileUpload={handleFileUpload}
      uploadedText={uploadedText}
      generateActionPlan={generateActionPlan}
      generatingPlan={generatingPlan}
      planGenerated={planGenerated}
      state={state}
    />
  );
}

function CoachLauncher({ onToggle, open }: { onToggle: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`fixed right-5 bottom-5 z-40 flex h-12 transform items-center gap-2.5 rounded-full border border-zinc-800 bg-[#0D0D11] px-5 text-xs font-bold tracking-wide text-zinc-200 shadow-2xl transition-all duration-300 ease-out hover:scale-105 hover:border-emerald-500/40 hover:text-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] active:scale-98 ${
        open ? "pointer-events-none opacity-0 scale-90" : "opacity-100 scale-100"
      }`}
    >
      <MessageCircle className="size-4.5 text-emerald-400 animate-pulse" />
      My Mission Coach
    </button>
  );
}

function CoachPanel({
  open,
  setOpen,
  initialMessages,
  input,
  setInput,
  textareaRef,
  premium,
  onLockedHistory,
  files,
  handleFileUpload,
  uploadedText,
  generateActionPlan,
  generatingPlan,
  planGenerated,
  state,
}: {
  uploadedText: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  initialMessages: UIMessage[];
  input: string;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  premium: boolean;
  onLockedHistory?: () => void;
  files: File[];
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  generateActionPlan: () => Promise<void>;
  generatingPlan: boolean;
  planGenerated: boolean;
  state: any;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const [error, setError] = useState<string | null>(null);

  // --- 🔒 LOCAL BUDGETING TRACKER ENGINE ---
  const [usageCount, setUsageCount] = useState(() => {
    try {
      const today = new Date().toDateString();
      const raw = localStorage.getItem(LIMIT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === today) return Number(parsed.count || 0);
      }
    } catch {}
    return 0;
  });

  const isRateLimited = usageCount >= MAX_DAILY_MESSAGES;

  const { messages, sendMessage, status } = useChat({
    id: "mission-coach",
    messages: initialMessages,
    transport,
    onError: (e) => setError(e.message || "The coach could not respond. Try again."),
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, status, textareaRef]);

  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || isRateLimited) return;
    setError(null);
    setInput("");

    // Calculate, save, and increment local text usage blocks
    const nextCount = usageCount + 1;
    setUsageCount(nextCount);
    try {
      localStorage.setItem(LIMIT_KEY, JSON.stringify({
        date: new Date().toDateString(),
        count: nextCount
      }));
    } catch {}

    // --- 🧠 RIGOROUS SOCRATIC DEFICIT TRANS-MATRIX INTERCEPT ---
    const SocraticContext = `
      [CRITICAL IDENTITY TELEMETRY BALANCES]
      CURRENT OPERATOR STREAK: ${currentStreakCount} Days.
      NET CREDIT ACCOUNT BALANCE: ${userCredits} Points.
      OPERATIONAL HUD RECON STATUS: "${currentStatus}"
      RECORDED DEADLINE BREAK FAULTS: ${failureTally} Failures.
      CURRENT ASSIGNED FOCUS OBJECTIVE: "${state?.daily?.text || "No target scheduled"}"
      YESTERDAY REFLECTION SUMMARY: "${state?.reflection?.wins || "No historical notes logged for previous interval."}"
      
      CORE BEHAVIORAL DIRECTIVE: You are an unyielding, elite Socratic performance coach. You are not here to offer comfort; you are here to force absolute mission execution. Look closely at the operator's message and cross-examine it against their execution streak, execution balances, failures, and past reflection data. 
      If their streak is 0, or their status is "FALLEN", or their failure count is greater than 0, or if their reflection signals a pattern of procrastination, choice anxiety, or broken promises, EXPLICITLY CALL OUT THEIR BAD PAST DECISIONS and EXPLICITLY REBUKE THEIR BROKEN RESOLVES. Confront them about why they are lingering at the bottom of the network leaderboard ranks. Force them to confront why they are deviating from their long-term vision matrix. Do not allow intellectual side-stepping. Demand strategic clarity for the rest of their lifecycle.
    `;

    const activePayload = uploadedText.trim()
      ? `${trimmed}\n\n${SocraticContext}\n\n[PARSED DOCUMENT FILE CONTEXT]:\n\n${uploadedText}`
      : `${trimmed}\n\n${SocraticContext}`;

    if (typeof onSendMessage === "function") {
      onSendMessage(activePayload);
    } else {
      // Fallback: If your component directly invokes a TanStack query mutation array hook
      void executeChatMutation({ text: activePayload });
    }
  }


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      <CoachLauncher open={open} onToggle={() => setOpen(true)} />

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-[#0D0D11] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        {/* Header Block */}
        <header className="flex items-center gap-3 border-b border-zinc-900 px-5 py-4 bg-black/20">
          <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-400">
            <MessageCircle className="size-4.5 animate-pulse" />
          </div>
          <div className="min-w-0 text-left">
            <h2 className="font-display text-sm font-black tracking-tight text-white uppercase">My Mission Coach</h2>
            <p className="truncate text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Socratic Strategy · Active</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-500 transition-colors hover:border-zinc-800 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-900 px-5 py-3.5 bg-black/10">
          {QUICK_STARTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={busy || isRateLimited}
              onClick={() => send(chip.prompt)}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white active:scale-95 disabled:opacity-30"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat History Core */}
        <Conversation className="flex-1 bg-black/5">
          <ConversationContent className="gap-4 p-5">
            {messages.length === 0 && (
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-5 text-left text-xs font-medium text-zinc-500 leading-relaxed max-w-sm mx-auto mt-4">
                👋 Ask your coach anything — cross-examine a complex assignment script, optimize your focus blocks, or isolate exactly why procrastination is getting in your path.
              </div>
            )}
            
            {/* 🔒 DAILY BUDGETING HISTORY SYNC */}
            {!premium && messages.length > FREE_HISTORY_LIMIT && (
              <button
                type="button"
                onClick={onLockedHistory}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3.5 text-xs font-bold text-emerald-400 transition-all duration-300 hover:border-emerald-500/40"
              >
                <Lock className="size-3.5" />
                Unlock Complete Strategy Logs
              </button>
            )}

            {/* MESSAGE RENDERING ENGINE */}
            {messages.map((message, index) => {
              const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
              if (!text) return null;
              const locked = !premium && index < messages.length - FREE_HISTORY_LIMIT;
              return (
                <div key={message.id} className={locked ? "relative opacity-40 grayscale blur-[4px] pointer-events-none select-none" : "w-full text-left"}>
                  <Message from={message.role}>
                    <MessageContent className={message.role === "user" ? "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-2xl px-4 py-3 text-sm ml-auto max-w-[85%]" : "text-zinc-300 text-sm leading-relaxed p-2 max-w-full"}>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {locked && <span className="absolute inset-0" aria-hidden />}
                </div>
              );
            })}
            
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 p-2 text-left animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
              </div>
            )}
            {error && <p className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 text-xs font-bold text-rose-400 text-left">{error}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input Control Terminal Layout Matrix */}
        <div className="border-t border-zinc-900 p-4 bg-black/20">
          <div className="flex flex-col gap-3 mb-4">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="coach-upload"
              disabled={isRateLimited}
            />
            
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="coach-upload"
                className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach Context
              </label>

              <div className="font-mono text-[10px] font-bold bg-black border border-zinc-800 px-2 py-1 rounded text-zinc-500 uppercase tracking-wider">
                {MAX_DAILY_MESSAGES - usageCount} Briefs Left Today
              </div>
            </div>

            {/* ✅ FIXED LAYER: Supports File Badges, Generation Triggers, and Regenerate Toggles cleanly */}
            {(files.length > 0 || planGenerated) && (
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-black/40 border border-zinc-900 animate-fade-in">
                <div className="flex flex-col gap-1 flex-1 text-left min-w-[150px]">
                  {files.length > 0 ? (
                    files.map((file) => (
                      <div key={file.name} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 truncate">
                        📎 {file.name}
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider pl-1">
                      ✓ Strategy Matrix Loaded
                    </div>
                  )}
                </div>

                {uploadedText && (
                  <button
                    type="button"
                    onClick={generateActionPlan}
                    disabled={generatingPlan}
                    className="transform inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[11px] font-bold text-black transition-all duration-300 hover:bg-emerald-400 active:scale-95 disabled:opacity-40"
                  >
                    {generatingPlan ? (
                      <Loader2 className="h-3 w-3 animate-spin text-black" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {generatingPlan ? "Extracting..." : planGenerated ? "Regenerate Mission Plan" : "Generate Mission Plan"}
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="relative flex flex-col w-full rounded-xl border border-zinc-800 bg-[#050507] p-3 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.08)] transition-all duration-300"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRateLimited ? "Quota cap reached..." : "Brief your execution mentor... (Press Enter)"}
              disabled={isRateLimited || busy}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-700 outline-none resize-none min-h-[48px] max-h-32 disabled:opacity-30 leading-relaxed"
            />
            <div className="flex justify-end pt-2 border-t border-zinc-900/50 mt-2">
              <button
                type="submit"
                disabled={!input.trim() || busy || isRateLimited}
                className="rounded-lg bg-white text-black px-4 py-1.5 text-xs font-bold transition-all duration-200 hover:bg-emerald-400 hover:text-black disabled:opacity-20"
              >
                {busy ? "Sending..." : "Send Brief →"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
