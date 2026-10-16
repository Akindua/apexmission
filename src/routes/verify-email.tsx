import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Mail, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  // Safe extraction lookup maps for the email search parameter strings
  const { email } = useSearch({ from: "/verify-email" }) as { email?: string };

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

    // Core authentication status validator engine
    const checkEmailVerificationStatus = async (isManualClick = false) => {
      if (isManualClick) setChecking(true);
      setErrorMessage(null);
  
      try {
        // 1. Defensively retrieve the current browser user context configuration properties
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        // ✅ SSR/Auth Session Guard: Silently ignore background checks if the session is not yet loaded into browser memory
        if (!user && !isManualClick) {
          return; 
        }
  
        if (user && user.email_confirmed_at) {
          setIsSuccess(true);
          setTimeout(() => {
            navigate({ to: "/plans" });
          }, 1500);
        } else if (isManualClick) {
          // Only force a hard token reload attempt if the operator explicitly requests it via a manual click interaction
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError && refreshError.message.includes("session missing")) {
            setErrorMessage("Verification link not yet confirmed. Please check your email inbox and click the secure confirmation link.");
          } else if (refreshError) {
            throw refreshError;
          } else {
            setErrorMessage("Verification link not yet confirmed. Please check your email inbox and click the secure confirmation link.");
          }
        }
      } catch (err: any) {
        console.error("Verification engine lookup exception bypassed safely:", err);
        if (isManualClick) {
          setErrorMessage(err.message || "Could not re-route token status queries. Check your network terminal links.");
        }
      } finally {
        setChecking(false);
      }
    };  

  // 🔄 AUTOMATIC BACKGROUND POLLING MATRIX
  useEffect(() => {
    // Poll the Supabase authentication cache lines every 3 seconds to catch external inbox validation link clicks automatically
    const pollingInterval = setInterval(() => {
      if (!isSuccess && !checking) {
        checkEmailVerificationStatus(false);
      }
    }, 3000);

    return () => clearInterval(pollingInterval);
  }, [isSuccess, checking]);

  const handleResendEmail = async () => {
    if (!email || busy) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/plans`,
        },
      });
      if (error) throw error;
      alert("🚀 Fresh verification link broadcasted to your inbox grid coordinates safely.");
    } catch (err: any) {
      setErrorMessage(err.message || "Could not re-transmit email parameters.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 text-center shadow-2xl relative overflow-hidden">
        
        {/* Aesthetic Gradient Accent */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-transparent to-transparent transition-all duration-500 ${
          isSuccess ? "via-emerald-400" : "via-zinc-700"
        }`} />

        <div className={`mx-auto flex size-12 items-center justify-center rounded-xl border mb-6 transition-all duration-300 ${
          isSuccess 
            ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
            : "border-zinc-800 bg-zinc-900/40 text-zinc-400"
        }`}>
          {isSuccess ? <CheckCircle className="h-5 w-5 animate-pulse" /> : <Mail className="h-5 w-5" />}
        </div>

        <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 transition-colors ${isSuccess ? "text-emerald-400" : "text-zinc-500"}`}>
          {isSuccess ? "Identity Secured" : "Security Lock Active"}
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2">
          {isSuccess ? "Email Confirmed!" : "Verify Your Identity"}
        </h1>
        <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6">
          {isSuccess 
            ? "Redirecting straight into your plan selection cockpit matrix parameters now..." 
            : `A secure verification token has been deployed to ${email || "your email coordinates"}. Confirm the link to unlock execution access.`}
        </p>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Hardened Explicit Verification Trigger Capsule */}
          <button
            type="button"
            disabled={checking || isSuccess}
            onClick={() => checkEmailVerificationStatus(true)}
            className="w-full h-11 flex items-center justify-center rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 disabled:opacity-40 shadow-xl shadow-white/5"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-black" />
            ) : (
              "I've Verified My Email →"
            )}
          </button>

          <button
            type="button"
            disabled={busy || isSuccess}
            onClick={handleResendEmail}
            className="w-full h-11 rounded-xl border border-zinc-800 bg-transparent text-sm font-bold text-zinc-400 transition-all duration-300 hover:border-zinc-700 hover:text-white disabled:opacity-40"
          >
            {busy ? "Re-transmitting..." : "Resend Verification Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
