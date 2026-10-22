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

    // Fixed email regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage(
        "❌ INVALID COORDINATES NODE: The email address format is invalid. Please supply a valid address (e.g. operator@domain.com)."
      );
      setBusy(false);
      return;
    }

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          throw new Error("Full operator name parameters required.");
        }

        // Optional pre-flight check (kept for consistency with your original logic)
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
            "🔒 OPERATOR PROFILE CONFLICT: This email is already registered. Please toggle to 'Secure Node Access' and sign in."
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
          if (
            error.message.toLowerCase().includes("rate limit") ||
            error.status === 429
          ) {
            setErrorMessage(
              "🔒 NETWORK BROADCAST CAP REACHED: The system is throttling signup traffic. Please wait 60 seconds."
            );
            setBusy(false);
            return;
          }
          throw error;
        }

        navigate({ to: "/verify-email", search: { email: email.trim() } });
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) throw error;

        setShowLoadingGate(true);
        setTimeout(() => {
          navigate({ to: "/app" });
        }, 2000);
      }
    } catch (err: any) {
      console.error("Auth terminal synchronization fault:", err);

      // Graceful handling of 504 timeouts (common when a trigger lags)
      if (err.message?.includes("504") || err.status === 504) {
        setErrorMessage(
          "⚠️ CLOUD HANDSHAKE BUFFER DELAY: Account record may have been created successfully. Please toggle to 'Secure Node Access' and try logging in."
        );
      } else {
        setErrorMessage(err.message || "Failed to transmit secure session keys.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (showLoadingGate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-zinc-100 animate-fade-in">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
              System Hydration In Progress
            </p>
            <h2 className="text-sm font-bold text-white mt-1">
              Calibrating Command Cockpit...
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 py-12 text-zinc-100">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 shadow-2xl relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

        {/* Console Header */}
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <img
            src="/icon-192.png"
            alt="ApexMission"
            className="h-16 w-16 object-contain mb-4"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
            Console Authorization Gateway
          </p>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase font-display">
            {isSignUp ? "Initialize Operator" : "Secure Node Access"}
          </h1>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handleAuthentication} className="space-y-4">
          {isSignUp && (
            <div className="flex flex-col gap-3 text-left border-b border-zinc-900 pb-4 mb-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="fullName"
                  className="text-[10px] font-black uppercase tracking-wider text-zinc-500"
                >
                  Operator Moniker
                </label>
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3.5 transition-all focus-within:border-emerald-500/40">
                  <input
                    id="fullName"
                    type="text"
                    required={isSignUp}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marcus Vance"
                    className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
                  />
                </div>
              </div>

              {/* Age attestation */}
              <div className="flex items-start gap-3 rounded-xl border border-zinc-900 bg-black/20 p-3 mt-1">
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
                  I explicitly attest that I meet the required platform operation age
                  threshold of{" "}
                  <span className="text-emerald-400 font-bold">10+ years old</span>. I
                  understand access will be restricted if this is breached.
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5 text-left">
            <label
              htmlFor="email"
              className="text-[10px] font-black uppercase tracking-wider text-zinc-500"
            >
              Security Email Address
            </label>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3.5 transition-all focus-within:border-emerald-500/40">
              <Mail className="h-4 w-4 text-zinc-600 shrink-0" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@apexmission.com"
                className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <label
              htmlFor="password"
              className="text-[10px] font-black uppercase tracking-wider text-zinc-500"
            >
              Access Key Parameter
            </label>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3.5 transition-all focus-within:border-emerald-500/40">
              <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.3)] active:scale-98 disabled:opacity-40 font-display mt-6 shadow-xl shadow-white/5"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-black" />
            ) : (
              <>
                <span>
                  {isSignUp ? "Initialize Console Routing" : "Sync Command Session"}
                </span>
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