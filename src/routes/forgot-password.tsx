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
    } catch (err) {
      console.error("Recovery transmission error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to commit security recovery parameters.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md glass-panel p-8 text-center">
        <div className="top-highlight" />

        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-800/50 bg-zinc-900/40 text-zinc-400 mb-6">
          <KeyRound className="h-5 w-5" />
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
          Security Node Recovery
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-display">
          Restore Access Key
        </h1>
        <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6 max-w-xs mx-auto">
          Transmit a secure encrypted access token handshake directly to your registered operator
          coordinate inbox.
        </p>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {!successTransmission ? (
          <form onSubmit={handlePasswordRecovery} className="space-y-4">
            <div className="glass-input-group text-left">
              <label htmlFor="email" className="glass-input-label">
                Registered Email Address
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

            <button type="submit" disabled={busy} className="btn-glass-primary w-full h-12 mt-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-black" />
              ) : (
                <>
                  <span>Transmit Recovery Packet</span>
                  <ArrowRight className="h-4 w-4 text-black" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 text-xs font-semibold text-emerald-400 text-left">
              🚀 SECURITY PACKET BROADCASTED: Check your email inbox. Select the confirmation button
              link token inside to unlock the security overwrite gate.
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="btn-glass-ghost w-full h-11"
            >
              ← Return to Console Entry Node
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
