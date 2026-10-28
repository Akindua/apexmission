import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, KeyRound, Loader2, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();

  const [inviteToken, setInviteToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function completeOnboarding() {
    if (typeof window !== "undefined") {
      localStorage.setItem("apex-onboarding-completed", "true");
    }
  }

  // 🧑‍🚀 PERSONAL ACCOUNT PATH — routes straight to the dashboard with company_id = null.
  async function handlePersonalAccount() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: metaError } = await supabase.auth.updateUser({ data: { company_id: null } });
        if (metaError) throw metaError;

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ company_id: null })
          .eq("id", user.id);
        if (profileError) throw profileError;
      }

      completeOnboarding();
      navigate({ to: "/app" });
    } catch (err) {
      console.error("Personal onboarding failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to initialize your personal workspace.",
      );
      setBusy(false);
    }
  }

  // 🏢 JOIN A COMPANY PATH — validates the enterprise invite token, then binds the tenant.
  async function handleJoinCompany() {
    const token = inviteToken.trim();
    if (!token) {
      setErrorMessage("🔑 Enter your company invite token to join the mission grid.");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const { data: companyId, error: lookupError } = await supabase.rpc(
        "get_company_id_by_invite_token",
        {
          p_token: token,
        },
      );
      if (lookupError) throw lookupError;

      if (!companyId) {
        setErrorMessage(
          "❌ Invalid or expired invite token. Request a fresh ApexMission join token from your enterprise admin.",
        );
        setBusy(false);
        return;
      }

      const { error: acceptError } = await supabase.rpc("accept_company_invite", {
        p_invite_token: token,
      });
      if (acceptError) throw acceptError;

      const { error: metaError } = await supabase.auth.updateUser({
        data: { company_id: companyId },
      });
      if (metaError) throw metaError;

      completeOnboarding();
      navigate({ to: "/app" });
    } catch (err) {
      console.error("Company join failed:", err);
      const message =
        err instanceof Error && err.message.includes("Invalid or expired invite token")
          ? "❌ Invalid or expired invite token. Request a fresh ApexMission join token from your enterprise admin."
          : err instanceof Error
            ? err.message
            : "Failed to join the selected company.";
      setErrorMessage(message);
      setBusy(false);
    }
  }

  return (
    <div className="page-shell flex items-center justify-center px-6 py-16">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-xl">
        {/* Header Panel */}
        <div className="glass-panel-elevated p-8 text-center mb-8 animate-fade-in-up">
          <div className="top-highlight" />

          <div className="relative mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            <img src="/icon-192.png" alt="ApexMission Logo" className="h-9 w-9 object-contain" />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
            Mission Launchpad
          </p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-white uppercase">
            Hybrid Onboarding
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-xs font-medium leading-relaxed text-zinc-500">
            Choose your command path. Operate solo or plug into an enterprise tenant.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 glass-panel-subtle p-4 text-left animate-fade-in-up delay-100">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs font-semibold leading-relaxed text-rose-400">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 🧑‍🚀 OPTION 1 — PERSONAL ACCOUNT */}
        <div className="glass-panel p-5 mb-4 animate-fade-in-up delay-200">
          <div className="flex items-start gap-3">
            <div className="icon-wrapper size-10">
              <User className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Personal Account
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                Solo operator mode. Your mission and tasks stay strictly private to you — the tenant
                context is set to <span className="font-bold text-emerald-400">null</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePersonalAccount}
            disabled={busy}
            className="btn-glass-primary w-full h-11 mt-4"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-black" />
            ) : (
              <>Start Solo Mission →</>
            )}
          </button>
        </div>

        {/* 🏢 OPTION 2 — JOIN A COMPANY */}
        <div className="glass-panel p-5 animate-fade-in-up delay-300">
          <div className="flex items-start gap-3">
            <div className="icon-wrapper size-10">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Join a Company
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                Corporate tenant via invite token. Your tasks will be scoped to your enterprise
                company only.
              </p>
            </div>
          </div>

          <div className="mt-4 glass-input-group">
            <label htmlFor="invite-token" className="glass-input-label">
              Enterprise Invite Token
            </label>
            <div className="glass-input-wrapper">
              <KeyRound className="h-4 w-4 shrink-0 text-zinc-600" />
              <input
                id="invite-token"
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="e.g. APEX-XXXXXX"
                disabled={busy}
                className="glass-input-field"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleJoinCompany}
            disabled={busy || !inviteToken.trim()}
            className="btn-glass-secondary w-full h-11 mt-4"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <>Join Mission →</>}
          </button>
        </div>

        <p className="mt-8 text-center text-[10px] font-semibold tracking-wide text-zinc-600">
          Hybrid command paths — solo operators and enterprise tenants.
        </p>
      </div>
    </div>
  );
}
