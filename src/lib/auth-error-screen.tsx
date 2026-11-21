import { ShieldAlert, LogOut, RefreshCw } from "lucide-react";

/**
 * Loop breaker and error screen for auth-related redirects.
 *
 * Prevents infinite redirect loops between /auth and /app by tracking
 * redirect attempts in sessionStorage. When the limit is tripped, the app
 * shows a static error screen instead of redirecting further.
 *
 * All messages avoid leaking variable names or internal identifiers.
 */

const LOOP_KEY = "apexmission-auth-redirects";
const LOOP_LIMIT = 3;
const LOOP_WINDOW_MS = 10_000;

interface RedirectRecord {
  count: number;
  firstTs: number;
}

/**
 * Records an auth redirect attempt. Returns true if the loop limit has been
 * tripped (caller should stop redirecting and show the error screen instead).
 */
export function recordAuthRedirect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(LOOP_KEY);
    const now = Date.now();
    let record: RedirectRecord;
    if (raw) {
      try {
        record = JSON.parse(raw);
      } catch {
        record = { count: 0, firstTs: now };
      }
      if (now - record.firstTs > LOOP_WINDOW_MS) {
        record = { count: 0, firstTs: now };
      }
    } else {
      record = { count: 0, firstTs: now };
    }
    record.count += 1;
    window.sessionStorage.setItem(LOOP_KEY, JSON.stringify(record));
    return record.count > LOOP_LIMIT;
  } catch {
    return false;
  }
}

/**
 * Resets the redirect counter after a successful load.
 */
export function resetAuthRedirects(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LOOP_KEY);
  } catch {
    // noop
  }
}

/**
 * Result of classifying an auth-related error response.
 */
export type AuthErrorAction = "redirect" | "show-error" | "continue";

/**
 * Classifies an HTTP response into an auth action.
 *
 * - 401 (invalid/expired token) → redirect to /auth
 * - 403 (permission denied) → show error screen (not a session issue)
 * - 500+ (server error) → show error screen
 * - everything else → continue
 */
export function classifyAuthError(response: Response): AuthErrorAction {
  if (response.status === 401) return "redirect";
  if (response.status === 403) return "show-error";
  if (response.status >= 500) return "show-error";
  return "continue";
}

/**
 * Props for the auth error screen.
 */
export interface AuthErrorScreenProps {
  onRetry: () => void;
  onSignOut: () => void;
  message?: string;
}

/**
 * Renders a static error screen when auth/access verification fails.
 * Never redirects, never leaks variable names.
 */
export function AuthErrorScreen({
  onRetry,
  onSignOut,
  message = "Couldn't verify your access. Retry or sign out.",
}: AuthErrorScreenProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-[#07110d] px-6 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(16,185,129,0.05),transparent_60%)]" />
      <div className="relative flex size-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-950/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.18)]">
        <ShieldAlert className="size-5" />
      </div>
      <p className="relative mt-4 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
        Access verification failed
      </p>
      <p className="relative mt-2 max-w-xs text-xs leading-relaxed text-zinc-500">
        {message}
      </p>
      <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-[10px] font-bold text-emerald-400 transition-all hover:bg-emerald-500/30 sm:w-auto"
        >
          <RefreshCw className="size-3.5 shrink-0 mr-2" />
          Retry
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-700/70 bg-zinc-900/40 px-4 py-3 text-[10px] font-bold text-zinc-300 transition-all hover:bg-zinc-800 sm:w-auto"
        >
          <LogOut className="size-3.5 shrink-0 mr-2" />
          Sign out
        </button>
      </div>
    </div>
  );
}
