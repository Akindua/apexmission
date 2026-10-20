import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Mail, CheckCircle, Radio } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { email } = useSearch({ from: "/verify-email" }) as { email?: string };

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Core authentication status validator engine
  const checkEmailVerificationStatus = async (isManualClick = false) => {
    // ✅ Guard: Block background execution triggers immediately
    if (!isManualClick) return;
    
    setChecking(true);
    setErrorMessage(null);
  
    try {
      // 1. Force a manual refresh token cache handshake from your remote database fields
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
  
      // 2. Retrieve user context configuration properties securely
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
  
      if (user && user.email_confirmed_at) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate({ to: "/plans" });
        }, 1500);
      } else {
        // If they click manually but haven't authorized the inbox packet link, show a defensive alert
        setErrorMessage("Verification link not yet confirmed. Please check your email inbox and click the secure confirmation link before proceeding.");
      }
    } catch (err: any) {
      console.error("Verification engine lookup exception:", err);
      setErrorMessage("Could not re-route token status queries. Ensure you have clicked the confirmation link inside your email inbox.");
    } finally {
      setChecking(false);
    }
  };  
  
  // 🔄 FIXED: Automated background polling matrix removed to prevent involuntary automatic entry.
  useEffect(() => {
    console.log("🔒 Identity verification lock initialized. Manual confirmation required.");
    // The background interval loop is completely gone. System stays locked until button press.
  }, []);
  

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
      alert("🚀 Fresh verification link broadcasted to your inbox grid parameters safely.");
    } catch (err: any) {
      setErrorMessage(err.message || "Could not re-transmit email parameters.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#040406] px-6 py-12 text-zinc-100 relative overflow-hidden animate-scan-line">
      {/* Immersive Industrial Graphical Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none" />
      
      {/* Core Cockpit Card Terminal Shell */}
      <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-[#0A0A0F]/90 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-xl transition-all duration-500 hover:border-zinc-700/50">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        
        {/* Animated Listening Radar Beacon */}
        <div className={`mx-auto flex size-14 items-center justify-center rounded-xl border mb-6 transition-all duration-500 ${
          isSuccess 
            ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.2)]" 
            : "border-zinc-800 bg-zinc-900/40 text-zinc-400"
        }`}>
          {isSuccess ? (
            <CheckCircle className="h-6 w-6 animate-pulse" />
          ) : (
            <Mail className="h-6 w-6 text-zinc-400" />
          )}
        </div>

        <p className={`text-[10px] font-black uppercase tracking-[0.25em] mb-1.5 transition-colors duration-300 ${isSuccess ? "text-emerald-400" : "text-zinc-500"}`}>
          {isSuccess ? "Identity Secured" : "Security Lock Active"}
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-mono">
          {isSuccess ? "Session Verified!" : "Confirm Your Link"}
        </h1>
        <p className="text-xs font-medium text-zinc-400 leading-relaxed mb-6 max-w-xs mx-auto">
          {isSuccess 
            ? "Token handshake synchronized cleanly. Transferring to plan configuration cockpit..." 
            : `A secure verification token message packet has been successfully deployed over to ${email || "your credentials"}. Open your inbox, click the activation link, then return here to confirm.`}
        </p>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* ⚡ ACTIVE SECURE MANUAL VERIFICATION TRIGGER CAPSULE */}
          <button
            type="button"
            disabled={checking || isSuccess}
            onClick={() => checkEmailVerificationStatus(true)}
            className="w-full h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.3)] active:scale-98 font-mono shadow-xl shadow-white/5 disabled:opacity-40"
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
            {busy ? "Re-transmitting Packet..." : "Resend Verification Email"}
          </button>
        </div>
      </div>
    </div>
  );
}