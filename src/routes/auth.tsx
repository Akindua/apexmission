import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { supabase } from "@/integrations/supabase/client";
import { setStorageScope } from "@/lib/user-storage";
import { TACTICAL_BRIEFING_SESSION_KEY } from "@/lib/synthetic-briefing";
import {
  ShieldAlert,
  ShieldCheck,
  Loader2,
  KeyRound,
  Mail,
  ArrowRight,
  Fingerprint,
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  /** Turnstile tokens are single-use — clear and re-challenge after each attempt. */
  function resetChallenge() {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  }

  useEffect(() => {
    setIsSignUp(mode === "signup");
  }, [mode]);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (active) setCurrentEmail(user?.email ?? null);
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
    navigate({
      to: "/auth",
      search: { mode: nextMode, next },
      replace: true,
    });
  }

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

        const { data: existingProfile, error: profileCheckError } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email.trim())
          .maybeSingle();

        if (profileCheckError) {
          console.error("Database pre-flight check:", profileCheckError);
        }

        if (existingProfile) {
          setErrorMessage(
            "🔒 OPERATOR PROFILE CONFLICT: This email is already registered. Please toggle to 'Secure Node Access' and sign in.",
          );
          setBusy(false);
          return;
        }

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

        const redirectUrl = new URL("/verify-email", window.location.origin);
        redirectUrl.searchParams.set("email", email.trim());
        redirectUrl.searchParams.set("next", "/onboarding");

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
          if (error.message.toLowerCase().includes("rate limit") || error.status === 429) {
            setErrorMessage(
              "🔒 NETWORK BROADCAST CAP REACHED: The system is throttling signup traffic. Please wait 60 seconds.",
            );
            setBusy(false);
            return;
          }
          throw error;
        }

        if (data.session?.user) {
          // Email confirmation is disabled on this project: the new account is
          // already authenticated, so go straight to account-type selection.
          setStorageScope(data.session.user.id);
          navigate({ to: "/onboarding" });
        } else {
          navigate({
            to: "/verify-email",
            search: { email: email.trim(), next: "/onboarding" },
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

        if (error) throw error;

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

        navigate({
          to: onboardingCompleted ? next || "/app" : "/onboarding",
        });
      }
    } catch (err) {
      console.error("Auth terminal synchronization fault:", err);

      const errStatus =
        err instanceof Error && "status" in err ? (err as { status?: number }).status : undefined;
      if (err instanceof Error && (err.message.includes("504") || errStatus === 504)) {
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
    setPasskeyBusy(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
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
      setErrorMessage(
        err instanceof Error && err.message.toLowerCase().includes("webauthn")
          ? "🔑 PASSKEYS NOT CONFIGURED: Enable WebAuthn in the Supabase Auth dashboard to use hardware-key sign-in."
          : err instanceof Error
            ? err.message
            : "Passkey sign-in failed. Use your access key instead.",
      );
    } finally {
      setPasskeyBusy(false);
    }
  };

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

        {isSignUp && currentEmail && (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-amber-300 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1">
              <p>
                Currently signed in as{" "}
                <span className="font-mono text-amber-200">{currentEmail}</span>.
              </p>
              <p className="text-[11px] font-medium text-amber-200/70">
                Registering a new account will disconnect this session. Your saved mission data
                stays on this device and is restored when you sign back in.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
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
                  <span className="text-emerald-400 font-bold">10+ years old</span>. I understand
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@apexmission.com"
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
                <span className="font-bold text-zinc-300">Privacy Guarantee.</span> ApexMissions
                only logs manually submitted milestones. We never monitor your device background,
                screen time, or location parameters.
              </p>
            </div>
          )}

          {TURNSTILE_SITE_KEY && (
            <div className="flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: "dark", size: "flexible" }}
              />
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-glass-primary w-full h-12 mt-2">
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
                disabled={passkeyBusy}
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

        <p className="mt-4 text-center font-mono text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
          © 2026 ApexMissions. All rights reserved.
        </p>
      </div>
    </div>
  );
}
