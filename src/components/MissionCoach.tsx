import { useChat } from "@ai-sdk/react";
import { extractText } from "@/lib/document-parser";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Lock, MessageCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

const STORAGE_KEY = "mission-coach-chat-v1";

/** Free accounts only see the most recent messages; the rest is blurred behind the paywall. */
const FREE_HISTORY_LIMIT = 6;

const QUICK_STARTS = [
  { label: "📚 Help me study", prompt: "Help me study — I need a plan for the subject I'm struggling with." },
  { label: "🌱 Life advice", prompt: "I'd like some life advice about what I should focus on right now." },
  {
    label: "⏱️ Fix my procrastination",
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
}: {
  premium?: boolean;
  onLockedHistory?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedText, setUploadedText] =
    useState("");
    useEffect(() => {
      console.log("Uploaded Text:");
      console.log(uploadedText);
      }, [uploadedText]);

      useEffect(() => {
        setInitial(loadMessages());
      }, []);

      async function generateActionPlan() {
        const response = await fetch(
          "/api/mission-plan",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              document: uploadedText,
            }),
          }
        );
        
        const plan = await response.json();
        
        console.log("PLAN:", plan);
        
        setDailyDraft(plan.dailyAction);
      }

      async function handleFileUpload(
        event: React.ChangeEvent<HTMLInputElement>
      ) {
        const selected = Array.from(
        event.target.files ?? []
        );
        
        if (selected.length === 0) return;
        
        setFiles(selected);
        
        const contents = await Promise.all(
          selected.map(extractText)
        );
        
        const combined =
          contents.join("\n\n");
        
        console.log("COMBINED:", combined);
        
        setUploadedText(combined);
      }

    if (initial === null) {
      return (
        <CoachLauncher 
          open={open} 
          onToggle={() => setOpen(true)}
        />
      );
    };
    
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
      />
    );
  }
  

function CoachLauncher({
  onToggle,
  open,
}: {
  onToggle: () => void;
  open: boolean;
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Open My Mission Coach"
      className={`fixed right-5 bottom-5 z-40 flex h-12 items-center gap-2 rounded-full border border-input bg-secondary px-4 text-sm font-semibold shadow-lg transition-all duration-300 hover:border-foreground/40 active:scale-[0.98] ${
        open ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <MessageCircle className="size-4 text-impact-medium" />
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
  
  handleFileUpload: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  generateActionPlan: () => Promise<void>;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const [error, setError] = useState<string | null>(null);
  const { messages, sendMessage, status } = useChat({
    id: "mission-coach",
    messages: initialMessages,
    transport,
    onError: (e) => setError(e.message || "The coach could not respond. Try again."),
  });

  // Persist the conversation in this browser.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [messages]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, status, textareaRef]);

  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    
    console.log("DOCUMENT:");
    console.log(uploadedText);
    
    setError(null);
    setInput("");
    
    void sendMessage({
      text: `${trimmed}
      
    DOCUMENT CONTENT:
      
    ${uploadedText}`,
    });
  }

  return (
    <>
      <CoachLauncher open={open} onToggle={() => setOpen(true)} />

      {open && (
        <button
          type="button"
          aria-label="Close coach"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        aria-label="My Mission Coach"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <header className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
            <MessageCircle className="size-4 text-impact-medium" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold tracking-tight">My Mission Coach</h2>
            <p className="truncate text-xs text-muted-foreground">Study help, life advice, focus</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close coach"
            className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {QUICK_STARTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={busy}
              onClick={() => send(chip.prompt)}
              className="rounded-full border border-input px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:border-foreground/40 hover:bg-secondary active:scale-[0.97] disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <Conversation className="flex-1">
          <ConversationContent className="gap-4">
            {messages.length === 0 && (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                Ask anything — a tricky school subject, how to organise your week, or why you keep
                putting things off.
              </p>
            )}
            {!premium && messages.length > FREE_HISTORY_LIMIT && (
              <button
                type="button"
                onClick={onLockedHistory}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-secondary/60 px-4 py-3 text-xs font-semibold transition-all duration-200 hover:border-impact-medium/60 active:scale-[0.99]"
              >
                <Lock className="size-3.5 text-impact-medium" />
                Unlock your full coach history
              </button>
            )}
            {messages.map((message, index) => {
              const text = message.parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("");
              if (!text) return null;
              const locked = !premium && index < messages.length - FREE_HISTORY_LIMIT;
              return (
                <div key={message.id} className={locked ? "relative" : undefined}>
                  <div className={locked ? "pointer-events-none blur-[6px] select-none" : undefined}>
                    <Message from={message.role}>
                      <MessageContent>
                        <MessageResponse>{text}</MessageResponse>
                      </MessageContent>
                    </Message>
                  </div>
                  {locked && <span className="absolute inset-0" aria-hidden />}
                </div>
              );
            })}
            {status === "submitted" && <Shimmer className="px-1 text-sm">Thinking...</Shimmer>}
            {error && <p className="px-1 text-sm text-impact-high">{error}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-4">
        <div className="mb-3">
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,image/*"
          onChange={handleFileUpload}
          className="hidden"
          id="coach-upload"
        />
           
        <label
          htmlFor="coach-upload"
          className="cursor-pointer rounded-lg border px-3 py-2 text-sm"
        >
          Upload Files
        </label>
           
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((file) => (
              <div
                key={file.name}
                className="rounded border p-2 text-xs"
              >
                📎 {file.name}
              </div>
            ))}
          </div>
        )}
        {uploadedText && (
          <button
            onClick={generateActionPlan}
            className="mt-3 rounded-lg border px-3 py-2 text-sm"
          >
            Generate Action Plan
          </button>
        )}
        </div>
          <PromptInput
            onSubmit={(_message, event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your coach anything…"
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!input.trim() || busy} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </aside>
    </>
  );
}
