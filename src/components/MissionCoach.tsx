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
import { Shimmer } from "@/components/ai-elements/shimmer";

const STORAGE_KEY = "mission-coach-chat-v1";
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
  onLockedHistory,
  onActionPlanGenerated,
}: {
  premium?: boolean;
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
    if (!uploadedText) return;
    setGeneratingPlan(true);
    try {
      const response = await fetch("/api/mission-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: uploadedText }),
      });
      if (!response.ok) throw new Error(`Mission Planner failed: ${response.status}`);
      const plan = await response.json();
      onActionPlanGenerated?.(plan);
      setPlanGenerated(true);
    } catch (error) {
      console.error(error);
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
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const [error, setError] = useState<string | null>(null);
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
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    void sendMessage({
      text: uploadedText.trim() 
        ? `${trimmed}\n\nDOCUMENT CONTENT:\n\n${uploadedText}`
        : trimmed,
    });
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
            className="ml-auto rounded-xl border border-zinc-900 bg-zinc-950 p-2 text-zinc-500 transition-colors hover:border-zinc-800 hover:text-white"
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
              disabled={busy}
              onClick={() => send(chip.prompt)}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white active:scale-95 disabled:opacity-50"
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

        {/* Tactical Input Dock Area */}
        <div className="border-t border-zinc-900 p-4 bg-black/20">
          <div className="flex flex-col gap-3 mb-4">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="coach-upload"
            />
            <div className="flex items-center gap-3">
              <label
                htmlFor="coach-upload"
                className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach Context
              </label>

              {uploadedText && (
                <button
                  type="button"
                  onClick={generateActionPlan}
                  disabled={generatingPlan}
                  className="transform flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-2 text-xs font-bold text-emerald-400 transition-all duration-300 hover:scale-102 hover:border-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-40"
                >
                  {generatingPlan ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generatingPlan ? "Mapping..." : planGenerated ? "Regenerate Blueprint" : "Generate Matrix Plan"}
                </button>
              )}
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5 text-left max-h-24 overflow-y-auto">
                {files.map((file) => (
                  <div key={file.name} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2.5 py-1 text-[10px] font-semibold text-zinc-400">
                    📎 {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Standard semantic HTML form ensures keyboard typing focus resets flawlessly */}
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
              placeholder="Brief your execution mentor... (Press Enter to Send)"
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-700 outline-none resize-none min-h-[48px] max-h-32 leading-relaxed"
            />
            <div className="flex justify-end pt-2 border-t border-zinc-900/50 mt-2">
              <button
                type="submit"
                disabled={!input.trim() || busy}
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
