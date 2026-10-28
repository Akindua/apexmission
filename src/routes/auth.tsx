import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, KeyRound, Mail, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthConsolePage,
});

function AuthConsolePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLoadingGate, setShowLoadingGate] = useState(false);

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

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/verify-email`,
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

        navigate({ to: "/verify-email", search: { email: email.trim() } });
      } else {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) throw error;

        const userId = authData.user?.id;
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

        setShowLoadingGate(true);
        setTimeout(() => {
          navigate({
            to: onboardingCompleted ? "/app" : "/onboarding",
          });
        }, 2000);
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
    }
  };

  if (showLoadingGate) {
    return (
      <div className="page-shell flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
              System Hydration In Progress
            </p>
            <h2 className="text-sm font-bold text-white mt-1">Calibrating Command Cockpit...</h2>
          </div>
        </div>
      </div>
    );
  }

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
              <div className="flex items-start gap-3 rounded-xl border border-zinc-900/30 bg-black/20 p-3 mt-1">
                <input
                  id="ageCheck"
                  type="checkbox"
                  required={isSignUp}
                  className="mt-1 size-4 shrink-0 rounded border-zinc-800 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/30 accent-emerald-500"
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
        </form>

        {/* Mode switch */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage(null);
            }}
            className="text-xs font-semibold text-zinc-500 hover:text-emerald-400 transition-colors"
          >
            {isSignUp
              ? "Already registered? Access command deck"
              : "Need authorization? Register fresh console coordinates"}
          </button>
        </div>
      </div>
    </div>
  );
}
