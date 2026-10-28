import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Mail, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search["email"] === "string" ? search["email"] : undefined,
    next:
      typeof search["next"] === "string" &&
      search["next"].startsWith("/") &&
      !search["next"].startsWith("//")
        ? search["next"]
        : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { email, next } = Route.useSearch();
  const destination = next || "/onboarding";

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const checkEmailVerificationStatus = async (isManualClick = false) => {
    if (!isManualClick) return;

    setChecking(true);
    setErrorMessage(null);

    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const emailIdentity = user?.identities?.find((id) => id.provider === "email");

      const isVerified =
        Boolean(user?.email_confirmed_at) ||
        emailIdentity?.identity_data?.["email_verified"] === true;

      // Guard against confirming the wrong account when another session is
      // still active in this browser.
      if (user?.email && email && user.email.toLowerCase() !== email.trim().toLowerCase()) {
        setErrorMessage(
          `This browser is signed in as ${user.email}. Sign out and open the verification link for ${email} to activate the new account.`,
        );
        return;
      }

      if (user && isVerified) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate({ to: destination });
        }, 1500);
      } else {
        setErrorMessage(
          "Verification link not yet confirmed. Please check your email inbox and click the secure confirmation link before proceeding.",
        );
      }
    } catch (err) {
      console.error("Verification engine lookup exception:", err);
      setErrorMessage(
        "Could not re-route token status queries. Ensure you have clicked the confirmation link inside your email inbox.",
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    console.log("🔒 Identity verification lock initialized. Manual confirmation required.");
  }, []);

  const handleResendEmail = async () => {
    if (!email || busy) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const redirectUrl = new URL("/verify-email", window.location.origin);
      if (email) redirectUrl.searchParams.set("email", email);
      if (next) redirectUrl.searchParams.set("next", next);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
        },
      });
      if (error) throw error;
      alert("🚀 Fresh verification link broadcasted to your inbox grid parameters safely.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not re-transmit email parameters.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />

      <div
        className={`relative w-full max-w-md glass-panel ${isSuccess ? "border-emerald-500/20" : ""} p-8 text-center`}
      >
        <div className="top-highlight" />

        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-xl border mb-6 transition-all duration-500 ${
            isSuccess
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
              : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400"
          }`}
        >
          {isSuccess ? (
            <CheckCircle className="h-6 w-6 animate-pulse" />
          ) : (
            <Mail className="h-6 w-6 text-zinc-400" />
          )}
        </div>

        <p
          className={`text-[10px] font-black uppercase tracking-[0.25em] mb-1.5 transition-colors duration-300 ${isSuccess ? "text-emerald-400" : "text-zinc-500"}`}
        >
          {isSuccess ? "Identity Secured" : "Security Lock Active"}
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase font-display">
          {isSuccess ? "Session Verified!" : "Confirm Your Link"}
        </h1>
        <p className="text-xs font-medium text-zinc-400 leading-relaxed mb-6 max-w-xs mx-auto">
          {isSuccess
            ? "Token handshake synchronized cleanly. Transferring to account setup..."
            : `A secure verification token message packet has been successfully deployed over to ${email || "your credentials"}. Open your inbox, click the activation link, then return here to confirm.`}
        </p>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={checking || isSuccess}
            onClick={() => checkEmailVerificationStatus(true)}
            className="btn-glass-primary h-12"
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
            className="btn-glass-ghost h-11"
          >
            {busy ? "Re-transmitting Packet..." : "Resend Verification Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
