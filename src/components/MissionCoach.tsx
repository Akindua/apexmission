import { useChat } from "@ai-sdk/react";
import { extractText } from "@/lib/document-parser";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Lock, MessageCircle, X, Paperclip, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

const STORAGE_KEY = "mission-coach-chat-v1";
const LIMIT_KEY = "apexmission-coach-daily-tokens";
const FREE_HISTORY_LIMIT = 6;

const QUICK_STARTS = [
  { label: "📚 Help me study", prompt: "Help me study — I need a plan for the subject I'm struggling with." },
  { label: "🌱 Life advice", prompt: "I'd like some life advice about what I should focus on right now." },
  {
    label: "⏱️ Fix procrastination",
    prompt: "I keep procrastinating. Help me figure out why and give me a way to start right now.",
  },
];

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
  userName = "User",
  userRank = "Global Operator Node",
  onLockedHistory,
  onActionPlanGenerated,
}: {
  premium?: boolean;
  state: any;
  userName?: string;
  userRank?: string;
  onLockedHistory?: () => void;
  onActionPlanGenerated?: (plan: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    setInitial(loadMessages());
  }, []);

  if (initial === null) {
    return <CoachLauncher open={open} onToggle={() => setOpen(true)} />;
  }
    
  return (
    <CoachPanel
      key="coach"
      open={open}
      setOpen={setOpen}
      initialMessages={initial}
      premium={premium}
      onLockedHistory={onLockedHistory}
      state={state}
      userName={userName}
      userRank={userRank}
      onActionPlanGenerated={onActionPlanGenerated}
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
  premium,
  onLockedHistory,
  state,
  userName,
  userRank,
  onActionPlanGenerated,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  initialMessages: UIMessage[];
  premium: boolean;
  onLockedHistory?: () => void;
  state: any;
  userName: string;
  userRank: string;
  onActionPlanGenerated?: (plan: any) => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedText, setUploadedText] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);

  const isRateLimited = false; 

  const { messages, sendMessage, status } = useChat({
    id: "mission-coach",
    messages: initialMessages,
    transport,
    onError: (e) => setError(e.message || "The coach could not respond. Try again."),
  });

  const hasTriggeredThisSession = useRef(false);
  const userNameRef = useRef(userName);
  const userRankRef = useRef(userRank);

  useEffect(() => {
    userNameRef.current = userName;
    userRankRef.current = userRank;
  }, [userName, userRank]);

  function send(text: string, isSystemTrigger = false) {
    const trimmed = text.trim(); 
    if (!trimmed) return;

    const currentName = userNameRef.current || userName || "User";
    const currentRank = userRankRef.current || userRank || "Global Operator Node";
    
    let humanInputString = trimmed;
    let explicitOnboardingDirective = "";

    if (isSystemTrigger) {
      if (trimmed === "[SYSTEM_AUTO_TRIGGER_SIGNUP_ONBOARDING_GUIDE]") {
        humanInputString = "Initiate my operational onboarding command briefing. Break down how to get started on ApexMission.";
        explicitOnboardingDirective = `
          [CRITICAL COMMAND OVERRIDE: BRAND NEW SIGNUP OPERATOR ONBOARDING INITIALIZATION]
          The operator has JUST CREATED THEIR ACCOUNT. Address the operator by their exact name "${currentName}" immediately in your greeting.
          State their rank standing "${currentRank}" directly to them.
        `;
      } else {
        humanInputString = `Initialize my operational briefing for session start. Review my current metrics, streak, and dashboard components.`;
        explicitOnboardingDirective = `
          [CRITICAL SESSION BRIEFING OVERRIDE: LOGIN ACTIVE REPORT]
          The operator (${currentName}) has just logged into the session.
          Leaderboard Standing: ${currentRank}
          Streak: ${state?.streak?.count || 0} Days
          Credits: ${state?.points || 1000} Credits
        `;
      }
    }

    const textLower = trimmed.toLowerCase();
    const indicatesSlacking = textLower.includes("procrastinate") || textLower.includes("gave up") || textLower.includes("lazy") || textLower.includes("didn't do");
    let cleanCurrentPoints = state?.points || 1000;
  
    if (indicatesSlacking) {
      const aiPenalty = 100; 
      const freshPoints = Math.max(0, cleanCurrentPoints - aiPenalty);
      
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
      }

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

    const nextCount = usageCount + 1;
    setUsageCount(nextCount);
    try {
      localStorage.setItem(LIMIT_KEY, JSON.stringify({
        date: new Date().toDateString(),
        count: nextCount
      }));
    } catch {}

    const highImpactTasks = (state?.tasks?.high || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No high impact vectors initialized.";

    const mediumImpactTasks = (state?.tasks?.medium || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No medium impact vectors initialized.";

    const lowImpactTasks = (state?.tasks?.low || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No low impact maintenance items mapped.";

    const SocraticContext = `
      [ADVANCED APP COMPONENT TELEMETRY & AUTOMATED USER BEHAVIOR ANALYSIS]
      OPERATOR NAME: ${currentName}
      CURRENT STREAK: ${state?.streak?.count || 0} Days
      CREDIT BALANCE: ${state?.points || 1000} Credits
      LEADERBOARD PLACEMENT: ${currentRank}
      
      [GOAL & TASK EXECUTION MATRIX]
      MASTER VISION STATEMENT: "${state?.mission || "No overall mission statement declared."}"
      TODAY'S MASTER FOCUS ACTION: "${state?.daily?.text || "No single master action scheduled."}"
      DAILY ACTION SEALED: ${state?.daily?.done ? "YES (Completed)" : "NO (Pending / At Risk)"}
      
      HIGH IMPACT LEVERAGE TASKS:
      ${highImpactTasks}
      
      MEDIUM IMPACT ALIGNMENT TASKS:
      ${mediumImpactTasks}
      
      LOW IMPACT MAINTENANCE TASKS:
      ${lowImpactTasks}
      
      [REFLECTIONS & BEHAVIORAL TELEMETRY]
      MORNING CHECK-IN STATUS: Completed & Synchronized
      NIGHT REFLECTION LOGS: "${state?.reflection?.wins || "No evening closeout logged yet."}"
      SLACKING / LAZINESS INDICATORS: ${indicatesSlacking ? "DETECTED (Penalty Audited)" : "None active. User maintaining hard work velocity."}

      DIRECTIVE: Act as an elite, unyielding Socratic performance coach. Thoroughly analyze all user app components, task completion rates, goal proximity, work ethic vs. slacking, leaderboard standing, and reflection notes. Hold the user strictly accountable.

      ${explicitOnboardingDirective}
    `;

    const activePayload = uploadedText.trim()
      ? `${humanInputString}\n\n${SocraticContext}\n\n[PARSED DOCUMENT FILE CONTEXT]:\n\n${uploadedText}`
      : `${humanInputString}\n\n${SocraticContext}`;

    void sendMessage({ text: activePayload });
    setInput("");
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__apex_coach_trigger = (triggerText: string) => {
        send(triggerText, true);
        setOpen(true);
      };
    }
    return () => {
      if (typeof window !== "undefined") delete (window as any).__apex_coach_trigger;
    };
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sessionKey = "apex-session-briefing-triggered";
    const sessionAlreadyTriggered = sessionStorage.getItem(sessionKey);
    const isUserLoaded = userName && userName !== "User";

    if (!sessionAlreadyTriggered && !hasTriggeredThisSession.current && isUserLoaded) {
      hasTriggeredThisSession.current = true;
      sessionStorage.setItem(sessionKey, "true");
      setOpen(true);

      const timer = setTimeout(() => {
        send("[SYSTEM_AUTO_TRIGGER_LOGIN_BRIEFING]", true);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [userName, setOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, status]);

  const busy = status === "submitted" || status === "streaming";

  function handleRemoveFile(indexToRemove: number) {
    setFiles((prevFiles: File[]) => prevFiles.filter((_, idx) => idx !== indexToRemove));
    setUploadedText("");
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
      
      onActionPlanGenerated?.({
        mission: plan.mission,
        high: plan.high || [],
        medium: plan.medium || [],
        low: plan.low || [],
        dailyAction: plan.dailyAction || ""
      });
      
      setPlanGenerated(true);
      setFiles([]);
      setUploadedText("");
    } catch (error) {
      console.error("Document action plan mapping failed:", error);
      alert("Could not extract parameters from the attached context file.");
    } finally {
      setGeneratingPlan(false);
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

        <Conversation className="flex-1 bg-black/5">
          <ConversationContent className="gap-4 p-5">
            {messages.length === 0 && (
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-5 text-left text-xs font-medium text-zinc-500 leading-relaxed max-w-sm mx-auto mt-4">
                👋 Initializing mission briefing... Your coach is analyzing your dashboard matrices.
              </div>
            )}
            
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

            {messages.map((message, index) => {
              let text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
              if (!text) return null;

              if (message.role === "user") {
                const telemetryIdx = text.indexOf("\n\n[");
                if (telemetryIdx !== -1) {
                  text = text.substring(0, telemetryIdx).trim();
                }
                if (text.includes("[SYSTEM_AUTO_TRIGGER")) {
                  text = "Initialize my operational briefing and review active metrics.";
                }
              }

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
            </div>

            {(files.length > 0 || planGenerated) && (
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-black/40 border border-zinc-900 animate-fade-in">
                <div className="flex flex-col gap-1 flex-1 text-left min-w-[150px]">
                  {files.length > 0 ? (
                    files.map((file, idx) => (
                      <div key={file.name} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 truncate">
                        📎 {file.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="ml-2 flex size-5 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-rose-400 font-black text-xs transition-colors duration-200"
                          title="Discard document context"
                        >
                          ×
                        </button>
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