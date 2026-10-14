import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, KeyRound, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !confirmPassword.trim() || busy) return;
    setBusy(true);
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Access key parameter inputs do not match standard array values.");
      setBusy(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: password.trim() });
      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        navigate({ to: "/auth" });
      }, 2000);
    } catch (err: any) {
      console.error("Access key update error:", err);
      setErrorMessage(err.message || "Failed to commit updated security parameters.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 shadow-2xl relative overflow-hidden text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        
        <div className={`mx-auto flex size-12 items-center justify-center rounded-xl border mb-6 ${
          success ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-400" : "border-zinc-800 bg-zinc-900/40 text-zinc-400"
        }`}>
          {success ? <ShieldCheck className="h-5 w-5 animate-pulse" /> : <KeyRound className="h-5 w-5" />}
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
          Security Lifecycle Configuration
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white uppercase font-display mb-2">
          {success ? "Parameters Sealed" : "Re-Key Access Node"}
        </h1>
        <p className="text-xs font-medium text-zinc-500 max-w-xs mx-auto leading-relaxed mb-6">
          {success 
            ? "Your secure node token signature has updated successfully. Re-routing straight to the authentication gate..." 
            : "Establish your fresh access token parameters below to re-authorize command deck telemetry access."}
        </p>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div className="flex flex-col gap-1.5 text-left">
            <label htmlFor="key" className="text-[10px] font-black uppercase tracking-wider text-zinc-500">New Access Key</label>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3.5 transition-all focus-within:border-emerald-500/40">
              <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
              <input
                id="key"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <label htmlFor="confirmKey" className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Confirm Access Key</label>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-black/40 px-3.5 transition-all focus-within:border-emerald-500/40">
              <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
              <input
                id="confirmKey"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || success}
            className="w-full h-12 flex items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 disabled:opacity-40 font-display mt-6 shadow-xl shadow-white/5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <><span>Update Access Key</span><ArrowRight className="h-4 w-4 text-black" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
