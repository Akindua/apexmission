import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TurnstileWidget, type TurnstileHandle } from "@/components/TurnstileWidget";
import { supabase } from "@/integrations/supabase/client";
import { setStorageScope } from "@/lib/user-storage";
import { TACTICAL_BRIEFING_SESSION_KEY } from "@/lib/synthetic-briefing";
import { recordAuthRedirect } from "@/lib/auth-error-screen";
import {
  ShieldAlert,
  ShieldCheck,
  Loader2,
  KeyRound,
  Mail,
  ArrowRight,
  Fingerprint,
  LogOut,
  ArrowLeft,
} from "lucide-react";

type AuthMode = "signin" | "signup";
type AuthSearch = { mode?: AuthMode | undefined; next?: string | undefined };

/**
 * Cloudflare Turnstile bot protection. Renders only when this public key is
 * configured; pair it with Supabase Auth → Bot protection (secret key) in the
 * dashboard. Until the dashboard is configured the widget is simply inert.
 */
const TURNSTILE_SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

const PASSWORD_MAX_LENGTH = 128;

/** Top common/leaked passwords rejected outright (case-insensitive). */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "letmein1",
  "iloveyou",
  "admin123",
  "welcome1",
  "welcome123",
  "abc12345",
  "passw0rd",
  "p@ssw0rd",
  "football",
  "baseball",
  "superman",
  "trustno1",
  "starwars",
  "whatever",
  "freedom1",
  "master123",
  "qwertyuiop",
  "1q2w3e4r",
  "zaq12wsx",
  "sunshine",
  "princess",
  "dragon123",
  "monkey123",
]);

/** Returns an error message when the password fails policy, else null. */
function validatePassword(pw: string, emailAddr: string): string | null {
  const trimmed = pw.trim();
  if (trimmed.length < 8) {
    return "🔒 WEAK ACCESS KEY: Password parameters must be at least 8 characters in length.";
  }
  if (trimmed.length > PASSWORD_MAX_LENGTH) {
    return `🔒 ACCESS KEY TOO LONG: Password parameters are capped at ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (COMMON_PASSWORDS.has(trimmed.toLowerCase())) {
    return "🔒 COMPROMISED ACCESS KEY: This password appears in public breach lists. Choose a unique passphrase.";
  }
  if (emailAddr && trimmed.toLowerCase() === emailAddr.trim().toLowerCase()) {
    return "🔒 WEAK ACCESS KEY: Password cannot match your email address.";
  }
  return null;
}

function sanitizeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

/** Preserves an onboarding invite token carried through `next`. */
function onboardingSearchFromNext(next?: string): { invite: string | undefined } {
  if (!next || !next.startsWith("/onboarding")) return { invite: undefined };
  try {
    const invite = new URL(next, "https://apexmissions.local").searchParams.get("invite");
    const trimmed = invite?.trim().slice(0, 200);
    return { invite: trimmed || undefined };
  } catch {
    return { invite: undefined };
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    mode:
      search["mode"] === "signup" || search["mode"] === "signin"
        ? (search["mode"] as AuthMode)
        : undefined,
    next: sanitizeNext(search["next"]),
  }),
  component: AuthConsolePage,
});

function AuthConsolePage() {
  const navigate = useNavigate();
  const { mode, next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isEmailSendError, setIsEmailSendError] = useState(false);
  const turnstileWidgetRef = useRef<TurnstileHandle | null>(null);

  /** Turnstile tokens are single-use — clear and re-challenge after each attempt. */
  function resetChallenge() {
    setTurnstileToken(null);
    turnstileWidgetRef.current?.reset();
  }

  function resetEmailErrorFlag() {
    setIsEmailSendError(false);
  }

  useEffect(() => {
    setIsSignUp(mode === "signup");
  }, [mode]);

  // Check for existing session on mount — but NEVER auto-redirect.
  // Instead, show the signed-in card and let the user choose.
  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (active) {
          setCurrentEmail(user?.email ?? null);
        }
      })
      .catch(() => {
        if (active) setCurrentEmail(null);
      });

    return () => {
      active = false;
    };
  }, []);

  function switchMode() {
    const nextMode: AuthMode = isSignUp ? "signin" : "signup";
    setErrorMessage(null);
    resetEmailErrorFlag();
    navigate({
      to: "/auth",
      search: { mode: nextMode, next },
      replace: true,
    });
  }

  async function handleSignOutAndShowForm() {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (err) {
      console.warn("Local session disconnect skipped:", err);
    } finally {
      setStorageScope(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
      }
      setCurrentEmail(null);
      setShowForm(true);
      resetEmailErrorFlag();
    }
  }

  function handleContinueToDashboard() {
    navigate({ to: next || "/app" });
  }

  const handleResendEmail = async () => {
    if (!email || busy) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const redirectUrl = new URL("/verify-email", "https://www.apexmissions.app");
      redirectUrl.searchParams.set("email", email.trim());
      const onboardingDestination = next && next.startsWith("/onboarding") ? next : "/onboarding";
      redirectUrl.searchParams.set("next", onboardingDestination);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl.toString(),
          ...(TURNSTILE_SITE_KEY && turnstileToken ? { captchaToken: turnstileToken } : {}),
        },
      });

      if (error) throw error;

      setErrorMessage("If this email can be confirmed, a new message is on its way.");
      // Don't set isEmailSendError here since the resend worked
    } catch (err) {
      console.error("Resend error:", err);
      // Never reveal whether email exists
      setErrorMessage("If this email can be confirmed, a new message is on its way.");
    } finally {
      setBusy(false);
    }
  };

  const handleAuthentication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || busy) return;
    setBusy(true);
    setErrorMessage(null);

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage(
        "❌ INVALID COORDINATES NODE: The email address format is invalid. Please supply a valid address (e.g. operator@domain.com).",
      );
      setBusy(false);
      return;
    }

    const passwordIssue = validatePassword(password, email);
    if (passwordIssue) {
      setErrorMessage(passwordIssue);
      setBusy(false);
      return;
    }

    // Bot protection: when Turnstile is configured, require a live token.
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setErrorMessage("🔒 HUMAN VERIFICATION REQUIRED: Complete the security challenge and retry.");
      setBusy(false);
      return;
    }

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          throw new Error("Full operator name parameters required.");
        }

        // Email uniqueness is enforced by auth.signUp() at the auth level;
        // no separate profile read is needed (and not permitted by RLS).

        // Supabase keeps the current browser session alive when a second
        // signUp is submitted. Deliberately drop the active session first so
        // the new account is not silently conflated with the signed-in one.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) throw signOutError;
          setStorageScope(null);
          setCurrentEmail(null);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
          }
        }

        const onboardingDestination = next && next.startsWith("/onboarding") ? next : "/onboarding";
        // Use canonical host for email confirmation links
        const redirectUrl = new URL("/verify-email", "https://www.apexmissions.app");
        redirectUrl.searchParams.set("email", email.trim());
        redirectUrl.searchParams.set("next", onboardingDestination);

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            emailRedirectTo: redirectUrl.toString(),
            ...(TURNSTILE_SITE_KEY && turnstileToken ? { captchaToken: turnstileToken } : {}),
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          // Handle specific Supabase auth errors gracefully
          const errMsg = error.message || "Unknown error";
          const errCode = error.code || "";
          // Log only status and code, never email or full message
          console.log("[Auth] Signup error:", { status: error.status, code: errCode });

          if (errMsg.toLowerCase().includes("rate limit") || error.status === 429) {
            setErrorMessage(
              "Too many attempts. Please wait a minute and try again.",
            );
            setBusy(false);
            return;
          }

          // Email send failure (500 or SMTP error)
          if (
            error.status === 500 ||
            errCode === "email_not_sent" ||
            errMsg.toLowerCase().includes("email_not_sent") ||
            errMsg.toLowerCase().includes("smtp") ||
            errMsg.toLowerCase().includes("confirmation") ||
            errMsg.toLowerCase().includes("send")
          ) {
            setErrorMessage(
              "We created your account but couldn't send the confirmation email. Tap Resend, or contact support@apexmissions.app.",
            );
            setIsEmailSendError(true);
            setBusy(false);
            return;
          }

          // Invalid/weak input
          if (
            errCode === "invalid_email" ||
            errCode === "weak_password" ||
            errMsg.toLowerCase().includes("weak password") ||
            errMsg.toLowerCase().includes("invalid email")
          ) {
            setErrorMessage(
              "Please check your email and password. Email must be valid and password at least 8 characters.",
            );
            setBusy(false);
            return;
          }

          // Generic fallback - never reveal raw Supabase messages
          setErrorMessage(
            "Something went wrong creating your account. Please try again.",
          );
          setBusy(false);
          return;
        }

        if (data.session?.user) {
          // Email confirmation is disabled on this project: the new account is
          // already authenticated, so go straight to account-type selection.
          setStorageScope(data.session.user.id);
          navigate({ to: "/onboarding", search: onboardingSearchFromNext(next) });
        } else {
          navigate({
            to: "/verify-email",
            search: { email: email.trim(), next: onboardingDestination, code: undefined, access_token: undefined, refresh_token: undefined, type: undefined },
          });
        }
      } else {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
          ...(TURNSTILE_SITE_KEY && turnstileToken
            ? { options: { captchaToken: turnstileToken } }
            : {}),
        });

        if (error) {
          const errMsg = error.message || "Unknown error";
          const errCode = error.code || "";
          console.log("[Auth] Signin error:", { status: error.status, code: errCode });

          // Email not confirmed - navigate to confirm screen with resend option
          if (errCode === "email_not_confirmed" || errMsg.toLowerCase().includes("email not confirmed")) {
            navigate({
              to: "/confirm-email",
              search: { email: email.trim(), next, code: undefined, access_token: undefined, refresh_token: undefined, type: undefined },
              replace: true,
            });
            setBusy(false);
            return;
          }

          if (errMsg.toLowerCase().includes("rate limit") || error.status === 429) {
            setErrorMessage("Too many attempts. Please wait a minute and try again.");
            setBusy(false);
            return;
          }

          if (errCode === "invalid_credentials" || errCode === "invalid_email") {
            setErrorMessage("Invalid email or password.");
            setBusy(false);
            return;
          }

          setErrorMessage("Something went wrong signing in. Please try again.");
          setBusy(false);
          return;
        }

        const userId = authData.user?.id;
        if (userId) {
          setStorageScope(userId);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
          }
        }
        let onboardingCompleted = false;

        if (userId) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", userId)
            .maybeSingle();

          if (profileError) {
            console.error("Onboarding state lookup failed:", profileError);
          }

          onboardingCompleted = Boolean(profile?.onboarding_completed);
        }

        if (onboardingCompleted) {
          navigate({ to: next || "/app" });
        } else {
          navigate({ to: "/onboarding", search: onboardingSearchFromNext(next) });
        }
      }
    } catch (err) {
      console.error("Auth terminal synchronization fault:", err);

      const errStatus =
        err instanceof Error && "status" in err ? (err as { status?: number }).status : undefined;
      const errMsg = err instanceof Error ? err.message : "Unknown error";

      // Handle email confirmation / SMTP errors that may be thrown as exceptions
      if (
        errMsg.toLowerCase().includes("email") ||
        errMsg.toLowerCase().includes("smtp") ||
        errMsg.toLowerCase().includes("confirmation") ||
        errMsg.toLowerCase().includes("send") ||
        errStatus === 500
      ) {
        setErrorMessage(
          "We created your account but couldn't send the confirmation email. Tap Resend, or contact support@apexmissions.app.",
        );
      } else if (err instanceof Error && (err.message.includes("504") || errStatus === 504)) {
        setErrorMessage(
          "⚠️ CLOUD HANDSHAKE BUFFER DELAY: Account record may have been created successfully. Please toggle to 'Secure Node Access' and try logging in.",
        );
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to transmit secure session keys.",
        );
      }
    } finally {
      setBusy(false);
      // Single-use token consumed (or attempt failed) — re-challenge.
      resetChallenge();
    }
  };

  /**
   * Passwordless sign-in via a device passkey (WebAuthn). Supabase handles the
   * ceremony server-side; no shared secret ever leaves the device. Requires
   * WebAuthn to be enabled in the Supabase Auth dashboard.
   */
  const handlePasskeySignIn = async () => {
    if (passkeyBusy) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setErrorMessage("🔒 HUMAN VERIFICATION REQUIRED: Complete the security challenge and retry.");
      return;
    }
    setPasskeyBusy(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPasskey({
        options: {
          ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
        },
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (userId) {
        setStorageScope(userId);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
        }
      }

      navigate({ to: next || "/app" });
    } catch (err) {
      console.error("Passkey authentication fault:", err);
      const msg = err instanceof Error ? err.message : "";
      // If the error mentions webauthn / not configured / not enabled, show setup guide
      const isWebAuthnMissing =
        msg.toLowerCase().includes("webauthn") ||
        msg.toLowerCase().includes("not configured") ||
        msg.toLowerCase().includes("passkey");
      setErrorMessage(
        isWebAuthnMissing
          ? "🔑 PASSKEYS NOT CONFIGURED: Enable WebAuthn in the Supabase Auth dashboard (Settings → WebAuthn) and register a passkey on your device."
          : msg || "Passkey sign-in failed. Use your access key instead.",
      );
    } finally {
      setPasskeyBusy(false);
      // Single-use token consumed (or attempt failed) — re-challenge.
      resetChallenge();
    }
  };

  // When a session exists, show the signed-in card instead of the form
  const signedInCard = currentEmail && (
    <div className="mb-6 glass-panel-subtle p-4 text-left animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">
              You're signed in as <span className="font-mono text-emerald-300">{currentEmail}</span>
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Choose how to continue
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleContinueToDashboard}
            className="btn-glass-primary h-10 px-4 text-sm"
          >
            <ArrowRight className="h-4 w-4" />
            <span>Continue to dashboard</span>
          </button>
          <button
            type="button"
            onClick={handleSignOutAndShowForm}
            className="btn-glass-ghost h-10 px-4 text-sm flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign in as someone else</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md glass-panel p-8">
        <div className="top-highlight" />

        {/* Console Header */}
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="relative mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            <img src="/icon-192.png" alt="ApexMission" className="h-10 w-10 object-contain" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
            Console Authorization Gateway
          </p>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase font-display">
            {isSignUp ? "Initialize Operator" : "Secure Node Access"}
          </h1>
        </div>

        {signedInCard}

        {showForm && (
          <>
            {errorMessage && (
              <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            )}
            {isEmailSendError && isSignUp && (
              <div className="mb-5 flex gap-2">
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={busy}
                  className="btn-glass-primary h-11 px-4 flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Resend Confirmation Email
                </button>
              </div>
            )}

            <form onSubmit={handleAuthentication} className="space-y-4">
              {isSignUp && (
                <div className="flex flex-col gap-3 text-left border-b border-zinc-900/50 pb-4 mb-2">
                  <div className="glass-input-group">
                    <label htmlFor="fullName" className="glass-input-label">
                      Operator Moniker
                    </label>
                    <div className="glass-input-wrapper">
                      <input
                        id="fullName"
                        type="text"
                        required={isSignUp}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Marcus Vance"
                        className="glass-input-field"
                      />
                    </div>
                  </div>

                  {/* Age attestation */}
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-[#04100b]/40 p-3 mt-1">
                    <input
                      id="ageCheck"
                      type="checkbox"
                      required={isSignUp}
                      className="mt-1 size-4 shrink-0 rounded border-emerald-500/30 bg-[#04100b] text-emerald-500 focus:ring-emerald-500/30 accent-emerald-500"
                    />
                    <label
                      htmlFor="ageCheck"
                      className="text-[11px] font-medium text-zinc-400 leading-normal"
                    >
                      I explicitly attest that I meet the required platform operation age threshold of{" "}
                      <span className="text-emerald-400 font-bold">16+ years old</span>. I understand
                      access will be restricted if this is breached.
                    </label>
                  </div>
                </div>
              )}

              <div className="glass-input-group">
                <label htmlFor="email" className="glass-input-label">
                  Security Email Address
                </label>
                <div className="glass-input-wrapper">
                  <Mail className="h-4 w-4 text-zinc-600 shrink-0" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); resetEmailErrorFlag(); }}
                    placeholder="operator@apexmissions.app"
                    className="glass-input-field"
                  />
                </div>
              </div>

              <div className="glass-input-group">
                <label htmlFor="password" className="glass-input-label">
                  Access Key Parameter
                </label>
                <div className="glass-input-wrapper">
                  <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="glass-input-field"
                  />
                </div>
              </div>

              {isSignUp && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-950/15 px-3.5 py-3 text-left">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    <span className="font-bold text-zinc-300">Privacy commitment.</span> ApexMissions
                    only logs manually submitted milestones. We never monitor your device background,
                    screen time, or location parameters.
                  </p>
                </div>
              )}

              {TURNSTILE_SITE_KEY ? (
                <div className="w-full space-y-2">
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
              ) : null}

              <label
                htmlFor="terms-agree"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-3 text-left transition-colors hover:border-emerald-500/30"
              >
                <input
                  id="terms-agree"
                  type="checkbox"
                  required
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-emerald-500/40 bg-[#04100b] text-emerald-400 focus:ring-emerald-500/30 accent-emerald-400"
                />
                <span className="text-[11px] leading-normal text-zinc-400">
                  I agree to the{" "}
                  <a
                    href="/TERMS_POLICY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emerald-400 hover:underline"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="/TERMS_POLICY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emerald-400 hover:underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={
                  busy || (isSignUp && !agreeTerms) || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)
                }
                className="btn-glass-primary w-full h-12 mt-2"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                ) : (
                  <>
                    <span>{isSignUp ? "Initialize Console Routing" : "Sync Command Session"}</span>
                    <ArrowRight className="h-4 w-4 text-black" />
                  </>
                )}
              </button>

              {!isSignUp && (
                <>
                  <div className="relative my-1 py-1">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <span className="w-full border-t border-zinc-800/80" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-transparent px-3 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
                        or authenticate with a passkey
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePasskeySignIn}
                    disabled={passkeyBusy || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-900/40 font-mono text-[11px] font-black uppercase tracking-wider text-zinc-300 transition-all hover:border-emerald-500/40 hover:text-emerald-400 disabled:opacity-60"
                  >
                    {passkeyBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Fingerprint className="h-4 w-4" />
                    )}
                    <span>{passkeyBusy ? "Verifying device…" : "Sign in with passkey"}</span>
                  </button>
                </>
              )}
            </form>

            {/* Mode switch */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={switchMode}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                {isSignUp
                  ? "Already registered? Access command deck"
                  : "Need authorization? Register fresh console coordinates"}
              </button>
            </div>
          </>
        )}

        <p className="mt-4 text-center font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
          © 2026 ApexMissions. All rights reserved.
        </p>
      </div>
    </div>
  );
}