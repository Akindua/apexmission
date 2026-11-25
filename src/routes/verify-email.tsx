import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Mail, CheckCircle, ShieldCheck } from "lucide-react";
import { TurnstileWidget, type TurnstileHandle } from "@/components/TurnstileWidget";

/** Renders only when configured — pairs with Supabase Auth bot protection. */
const TURNSTILE_SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

const COOLDOWN_SECONDS = 60;

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search["email"] === "string" ? search["email"] : undefined,
    next:
      typeof search["next"] === "string" &&
      search["next"].startsWith("/") &&
      !search["next"].startsWith("//")
        ? search["next"]
        : undefined,
    // PKCE code from Supabase email link
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    // Token-hash style (legacy)
    access_token: typeof search["access_token"] === "string" ? search["access_token"] : undefined,
    refresh_token: typeof search["refresh_token"] === "string" ? search["refresh_token"] : undefined,
    type: typeof search["type"] === "string" ? search["type"] : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage(): React.ReactElement {
  const navigate = useNavigate();
  const { email, next, code, access_token, refresh_token, type } = Route.useSearch();
  const destination = next || "/onboarding";

  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
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

  // Handle PKCE code or token-hash from URL
  useEffect(() => {
    if (code || (access_token && refresh_token && type === "signup")) {
      checkEmailVerificationStatus(true);
    }
    return;
  }, [code, access_token, refresh_token, type]);

  const checkEmailVerificationStatus = async (isManualClick = false) => {
    if (!isManualClick && !code && !(access_token && refresh_token)) return;

    setChecking(true);
    setErrorMessage(null);

    try {
      // If we have a PKCE code, exchange it for a session
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }

      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const emailIdentity = user?.identities?.find((id) => id.provider === "email");

      const isVerified =
        Boolean(user?.email_confirmed_at) ||
        emailIdentity?.identity_data?.["email_verified"] === true;

      // Guard against confirming the wrong account when another session is
      // still active in this browser.
      if (user?.email && email && user.email.toLowerCase() !== email.trim().toLowerCase()) {
        setErrorMessage(
          `This browser is signed in as ${user.email}. Sign out and open the verification link for ${email} to activate the new account.`,
        );
        return;
      }

      if (user && isVerified) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate({ to: destination });
        }, 1500);
      } else {
        setErrorMessage(
          "Verification link not yet confirmed. Please check your email inbox and click the secure confirmation link before proceeding.",
        );
      }
    } catch (err) {
      console.error("Verification engine lookup exception:", err);
      setErrorMessage(
        "Could not verify your link. Ensure you clicked the confirmation link inside your email inbox.",
      );
    } finally {
      setChecking(false);
    }
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

  useEffect(() => {
    console.log("🔒 Identity verification lock initialized. Manual confirmation required.");
    return;
  }, []);

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

      <div
        className={`relative w-full max-w-md glass-panel ${isSuccess ? "border-emerald-500/20" : ""} p-8 text-center`}
      >
        <div className="top-highlight" />

        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-xl border mb-6 transition-all duration-500 ${
            isSuccess
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
              : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400"
          }`}
        >
          {isSuccess ? (
            <CheckCircle className="h-6 w-6 animate-pulse" />
          ) : (
            <Mail className="h-6 w-6 text-zinc-400" />
          )}
        </div>

        <p
          className={`text-[10px] font-black uppercase tracking-[0.25em] mb-1.5 transition-colors duration-300 ${isSuccess ? "text-emerald-400" : "text-zinc-500"}`}
        >
          {isSuccess ? "Identity Secured" : "Security Lock Active"}
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-display">
          {isSuccess ? "Session Verified!" : "Confirm Your Link"}
        </h1>
        <p className="text-xs font-medium text-zinc-400 leading-relaxed mb-6 max-w-xs mx-auto">
          {isSuccess
            ? "Token handshake synchronized cleanly. Transferring to account setup..."
            : `A secure verification token message packet has been successfully deployed over to ${email || "your credentials"}. Open your inbox, click the activation link, then return here to confirm.`}
        </p>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p>{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-emerald-400 font-semibold animate-fade-in">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>{successMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => checkEmailVerificationStatus(true)}
            disabled={checking || isSuccess}
            className="btn-glass-primary h-12"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-black" />
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                I've Verified My Email →
              </>
            )}
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
                Resend Verification Email
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