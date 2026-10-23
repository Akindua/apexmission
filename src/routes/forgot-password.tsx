import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Mail, ArrowRight, Loader2, ShieldAlert, KeyRound } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successTransmission, setSuccessTransmission] = useState(false);

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSuccessTransmission(true);
    } catch (err: any) {
      console.error("Recovery transmission error:", err);
      setErrorMessage(err.message || "Failed to commit security recovery parameters.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#040406] px-6 py-12 text-zinc-100 relative overflow-hidden animate-scan-line">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293706_1px,transparent_1px),linear-gradient(to_bottom,#1f293706_1px,transparent_1px)] bg-[size:28px_24px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 bg-emerald-500/[0.01] rounded-full blur-3xl pointer-events-none" />

      {/* Sleek Obsidian Glassmorphic Account Recovery Panel Card Container */}
      <div className="w-full max-w-md rounded-2xl p-8 text-center relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-zinc-800/80 bg-[#0A0A0F]/80 backdrop-blur-xl transition-all duration-500 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent animate-pulse" />
        
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-zinc-400 mb-6">
          <KeyRound className="h-5 w-5" />
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
          Security Node Recovery
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-mono">
          Restore Access Key
        </h1>
        <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6 max-w-xs mx-auto">
          Transmit a secure encrypted access token handshake directly to your registered operator coordinate inbox.
        </p>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {!successTransmission ? (
          <form onSubmit={handlePasswordRecovery} className="space-y-4">
            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="email" className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Registered Email Address</label>
              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-[#050507] px-3.5 focus-within:border-emerald-500/40 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.05)] transition-all duration-300">
                <Mail className="h-4 w-4 text-zinc-600 shrink-0" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@apexmission.com"
                  className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-800 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.3)] active:scale-98 font-mono mt-6 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <><span>Transmit Recovery Packet</span><ArrowRight className="h-4 w-4 text-black" /></>}
            </button>
          </form>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 text-xs font-semibold text-emerald-400 text-left">
              🚀 SECURITY PACKET BROADCASTED: Check your email inbox. Select the confirmation button link token inside to unlock the security overwrite gate.
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="w-full h-11 rounded-xl border border-zinc-800 bg-transparent text-sm font-bold text-zinc-400 transition-all duration-300 hover:border-zinc-700 hover:text-white hover:bg-zinc-900/20 mt-2"
            >
              ← Return to Console Entry Node
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
