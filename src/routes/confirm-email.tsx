import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { TurnstileWidget, type TurnstileHandle } from "@/components/TurnstileWidget";

/** Renders only when configured — pairs with Supabase Auth bot protection. */
const TURNSTILE_SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

const COOLDOWN_SECONDS = 60;

export const Route = createFileRoute("/confirm-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search["email"] === "string" ? search["email"] : undefined,
    next:
      typeof search["next"] === "string" &&
      search["next"].startsWith("/") &&
      !search["next"].startsWith("//")
        ? search["next"]
        : undefined,
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    access_token: typeof search["access_token"] === "string" ? search["access_token"] : undefined,
    refresh_token: typeof search["refresh_token"] === "string" ? search["refresh_token"] : undefined,
    type: typeof search["type"] === "string" ? search["type"] : undefined,
  }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage(): React.ReactElement {
  const navigate = useNavigate();
  const { email, next } = Route.useSearch();
  const destination = next || "/onboarding";

  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileWidgetRef = useRef<TurnstileHandle | null>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setInterval(() => {
        setCooldown((c) => (c <= 1 ? 0 : c - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
    return;
  }, [cooldown]);

  const resetTurnstile = () => {
    setTurnstileToken(null);
    turnstileWidgetRef.current?.reset();
  };

  const handleResendEmail = async () => {
    if (!email || busy || cooldown > 0) return;
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Use canonical host for email redirect
      const redirectUrl = new URL("/verify-email", "https://www.apexmissions.app");
      if (email) redirectUrl.searchParams.set("email", email);
      if (next) redirectUrl.searchParams.set("next", next);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          ...(TURNSTILE_SITE_KEY && turnstileToken ? { captchaToken: turnstileToken } : {}),
        },
      });

      if (error) throw error;

      setSuccessMessage("If this email can be confirmed, a new message is on its way.");
      setCooldown(COOLDOWN_SECONDS);
      resetTurnstile();
    } catch (err) {
      console.error("Resend error:", err);
      // Never reveal whether email exists
      setSuccessMessage("If this email can be confirmed, a new message is on its way.");
      setCooldown(COOLDOWN_SECONDS);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  };

  const handleTrySignIn = async () => {
    // Try signing in again - if email is now confirmed, it will work
    navigate({ to: "/auth", search: { mode: "signin", next }, replace: true });
  };

  if (!email) {
    return (
      <div className="page-shell flex items-center justify-center px-6 py-12">
        <div className="glass-panel max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 size-10 text-rose-400" />
          <h1 className="text-xl font-black uppercase text-white">Missing Email</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            No email provided. Please return to sign in and try again.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="btn-glass-primary w-full h-12 mt-6"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md glass-panel p-8 text-center">
        <div className="top-highlight" />

        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
          <Mail className="size-6" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-display">
          Confirm Your Email
        </h1>

        <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6 max-w-xs mx-auto">
          We sent a confirmation link to <span className="font-mono text-emerald-400">{email}</span>.
          You must click the link before you can sign in.
        </p>

        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70">
              Check your inbox (and spam folder)
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
            Click the activation link in the email, then return here.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p>{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-emerald-400 font-semibold animate-fade-in">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>{successMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleTrySignIn}
            className="btn-glass-primary h-12"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>I've Verified My Email →</span>
          </button>

          <button
            type="button"
            onClick={handleResendEmail}
            disabled={busy || cooldown > 0}
            className="btn-glass-ghost h-11"
          >
            {cooldown > 0 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resend in {cooldown}s
              </>
            ) : busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Resend Confirmation Email
              </>
            )}
          </button>
        </div>

        {TURNSTILE_SITE_KEY && (
          <div className="mt-6 w-full">
            <label
              htmlFor="turnstile-widget"
              className="block text-center font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400"
            >
              Security Challenge — Complete to proceed
            </label>
            <TurnstileWidget
              ref={turnstileWidgetRef}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-zinc-500">
          Didn't get the email?{" "}
          <button
            type="button"
            onClick={handleResendEmail}
            disabled={busy || cooldown > 0}
            className="font-bold text-emerald-400 hover:underline disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
          </button>
        </p>
      </div>
    </div>
  );
}