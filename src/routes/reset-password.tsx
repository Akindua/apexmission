import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setStorageScope } from "@/lib/user-storage";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setReady(Boolean(data.session));
      })
      .catch(() => {
        if (active) setReady(false);
      });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Your new access key must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The access keys do not match. Re-enter the same key twice.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Force a fresh sign-in with the new credential.
      await supabase.auth.signOut({ scope: "local" });
      setStorageScope(null);
      setSuccess(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not update the access key. Request a new link.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md glass-panel p-8 text-center">
        <div className="top-highlight" />

        <div
          className={`mx-auto flex size-12 items-center justify-center rounded-xl border mb-6 ${
            success
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
              : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400"
          }`}
        >
          {success ? <CheckCircle className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
          Security Overwrite Gate
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-display">
          {success ? "Access Key Updated" : "Set New Access Key"}
        </h1>

        {success ? (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs font-medium leading-relaxed text-zinc-400">
              Your password was rotated successfully. Sign in again with the new access key to
              resume your mission.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
              className="btn-glass-primary w-full h-11"
            >
              Continue to sign in
              <ArrowRight className="h-4 w-4 text-black" />
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium leading-relaxed text-zinc-500 mb-6 max-w-xs mx-auto">
              {ready
                ? "Enter and confirm your new access key below."
                : "This recovery link is missing or has expired. Request a fresh password reset email."}
            </p>

            {errorMessage && (
              <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            )}

            {ready ? (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div className="glass-input-group">
                  <label htmlFor="new-password" className="glass-input-label">
                    New Access Key
                  </label>
                  <div className="glass-input-wrapper">
                    <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
                    <input
                      id="new-password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      className="glass-input-field"
                    />
                  </div>
                </div>

                <div className="glass-input-group">
                  <label htmlFor="confirm-password" className="glass-input-label">
                    Confirm New Access Key
                  </label>
                  <div className="glass-input-wrapper">
                    <KeyRound className="h-4 w-4 text-zinc-600 shrink-0" />
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repeat the new access key"
                      className="glass-input-field"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-glass-primary w-full h-12 mt-2"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-black" />
                  ) : (
                    <>
                      <span>Commit New Access Key</span>
                      <ArrowRight className="h-4 w-4 text-black" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => navigate({ to: "/forgot-password" })}
                className="btn-glass-primary w-full h-11"
              >
                Request a new reset link
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
