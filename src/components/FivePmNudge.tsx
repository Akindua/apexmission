import { AlertTriangle, ArrowRight, Clock, X } from "lucide-react";

/**
 * Pre-5PM execution nudge.
 *
 * Appears only when the operator's key task (daily focus, then highest open
 * priority) is still unfinished inside the 3PM–5PM window. Dismissal is scoped
 * to the current day and stored locally by the parent.
 */
export function FivePmNudge({
  taskLabel,
  taskText,
  minutesUntilCutoff,
  onDismiss,
  onFocus,
}: {
  taskLabel: string;
  taskText: string;
  minutesUntilCutoff: number;
  onDismiss: () => void;
  onFocus: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed left-3 right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 mx-auto max-w-xl animate-fade-in rounded-2xl border border-amber-500/40 bg-[#141006]/95 p-3.5 text-left shadow-[0_0_40px_rgba(245,158,11,0.2)] backdrop-blur-xl sm:left-auto sm:right-5 sm:top-5 sm:w-[26rem] sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-950/50 text-amber-400">
          <AlertTriangle className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.18em] text-amber-400">
              <Clock className="size-3" />
              Cutoff approaching
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss 5PM nudge for today"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-amber-500/70 transition-colors hover:bg-amber-950/50 hover:text-amber-300"
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="mt-1 text-xs font-black leading-snug text-white">
            {minutesUntilCutoff} min to 5PM. {taskLabel} is still open.
          </p>
          <p className="mt-1 line-clamp-2 break-words text-[11px] font-medium leading-relaxed text-zinc-400">
            {taskText}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onFocus}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[10px] font-black uppercase tracking-wider text-black transition-colors hover:bg-amber-400"
            >
              Close the gap
              <ArrowRight className="size-3" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Snooze today
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
