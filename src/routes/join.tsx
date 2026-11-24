import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck, KeyRound, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PrivacyShieldBanner } from "@/components/PrivacyShieldBanner";

export const Route = createFileRoute("/join")({
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "confirm" | "redirect">("input");
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");

  async function handleValidateToken(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setErrorMessage("Enter your company invite token.");
      return;
    }
    setBusy(true);
    setErrorMessage(null);

    try {
      // Call validate_invite_token RPC — returns only company_name and company_slug
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("validate_invite_token", {
        p_token: trimmed,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.company_name || !row?.company_slug) {
        // Generic error — same message whether token invalid, expired, revoked, or exhausted
        setErrorMessage(
          "❌ Invalid or expired invite token. Request a fresh invite from your organization administrator.",
        );
        setBusy(false);
        return;
      }

      setCompanyName(row.company_name);
      setCompanySlug(row.company_slug);
      setStep("confirm");
    } catch (err) {
      console.error("Invite token validation failed:", err);
      setErrorMessage(
        "❌ Invalid or expired invite token. Request a fresh invite from your organization administrator.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleContinueToSignup() {
    // Redirect to company subdomain auth page with signup mode
    // The token is passed via the URL so the signup flow can use it after account creation
    const targetUrl = `https://${companySlug}.apexmissions.app/auth?mode=signup&invite=${encodeURIComponent(token.trim())}`;
    window.location.href = targetUrl;
  }

  function handleBack() {
    setStep("input");
    setCompanyName("");
    setCompanySlug("");
    setErrorMessage(null);
  }

  return (
    <div className="page-shell flex items-center justify-center px-6 py-16">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-md centered-glass-card">
        <div className="top-highlight" />

        {/* Logo */}
        <div className="relative mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)] animate-fade-in-up">
          <img src="/icon-192.png" alt="ApexMission Logo" className="h-12 w-12 object-contain" />
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2 animate-fade-in-up delay-100">
          Enterprise Access
        </p>

        <h1 className="font-display text-3xl font-black tracking-tight text-white mb-3 md:text-4xl animate-fade-in-up delay-200">
          Join Your Organization
        </h1>

        <p className="text-xs font-medium text-zinc-500 max-w-xs leading-relaxed mb-10 mx-auto animate-fade-in-up delay-300">
          Enter your company invite token to access your organization's workspace.
        </p>

        {step === "input" && (
          <div className="w-full animate-fade-in-up delay-400">
            <form onSubmit={handleValidateToken} className="space-y-4">
              <div className="glass-input-group">
                <label htmlFor="invite-token" className="glass-input-label">
                  Company Invite Token
                </label>
                <div className="glass-input-wrapper">
                  <KeyRound className="h-4 w-4 shrink-0 text-zinc-600" />
                  <input
                    id="invite-token"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="e.g. ApexMission_Invite_xxxxxxxx"
                    disabled={busy}
                    className="glass-input-field"
                    autoComplete="off"
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-left flex items-start gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <p>{errorMessage}</p>
                </div>
              )}

              <PrivacyShieldBanner />

              <button
                type="submit"
                disabled={busy || !token.trim()}
                className="btn-glass-primary w-full h-12"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                ) : (
                  <>
                    Validate Token
                    <ArrowRight className="h-4 w-4 text-black" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] text-zinc-500">
              Don't have a token?{" "}
              <a
                href="/auth?mode=signup"
                className="font-bold text-emerald-400 hover:underline"
              >
                Create a personal account
              </a>
            </p>
          </div>
        )}

        {step === "confirm" && (
          <div className="w-full animate-fade-in-up delay-400 space-y-4">
            <div className="glass-panel-elevated p-5 text-center">
              <ShieldCheck className="mx-auto mb-3 size-8 text-emerald-400" />
              <p className="text-sm font-semibold text-white mb-1">Token Validated</p>
              <p className="font-mono text-lg font-black text-emerald-300">{companyName}</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Subdomain: <span className="font-mono text-zinc-400">{companySlug}.apexmissions.app</span>
              </p>
            </div>

            <PrivacyShieldBanner />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="btn-glass-ghost flex-1 h-11"
              >
                <ArrowRight className="h-4 w-4 -rotate-180" />
                Back
              </button>
              <button
                type="button"
                onClick={handleContinueToSignup}
                className="btn-glass-primary flex-1 h-11"
              >
                Continue to Sign Up
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}