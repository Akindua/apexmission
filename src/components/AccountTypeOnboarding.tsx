import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type AccountMode = "personal" | "company";

interface AccountTypeOnboardingProps {
  nextRoute?: string;
  onComplete?: () => void;
}

export function AccountTypeOnboarding({
  nextRoute = "/app",
  onComplete,
}: AccountTypeOnboardingProps) {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<AccountMode | null>(null);
  const [companyCode, setCompanyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function updateProfileCompany(companyId: string | null) {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(userError.message || "You must be signed in to continue.");
    }

    if (!userData.user) {
      throw new Error("No active user found.");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ company_id: companyId })
      .eq("id", userData.user.id);

    if (profileError) {
      throw new Error(profileError.message || "Failed to update your account profile.");
    }
  }

  async function completeRoute() {
    if (onComplete) {
      onComplete();
      return;
    }

    navigate({ to: nextRoute });
  }

  async function handlePersonalAccount() {
    setLoading(true);
    setErrorMessage(null);

    try {
      await updateProfileCompany(null);
      await completeRoute();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to continue.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompanyJoin(event: FormEvent) {
    event.preventDefault();

    const normalizedCode = companyCode.trim();
    if (!normalizedCode) {
      setErrorMessage("Please enter your company invitation code.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const token = normalizedCode.toLowerCase();

      const { data: companyId, error: companyLookupError } = await supabase.rpc(
        "get_company_id_by_invite_token",
        { p_token: token },
      );

      if (companyLookupError) {
        throw new Error(companyLookupError.message || "Unable to verify company code.");
      }

      if (!companyId) {
        throw new Error("That company code is invalid or not found.");
      }

      // SECURITY DEFINER RPC validates the token and binds the tenant without
      // exposing the companies table through client-side RLS.
      const { error: acceptError } = await supabase.rpc("accept_company_invite", {
        p_invite_token: token,
      });

      if (acceptError) {
        throw new Error(acceptError.message || "Unable to join that company workspace.");
      }

      await supabase.auth.updateUser({ data: { company_id: companyId } });
      await completeRoute();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify company code.";
      setErrorMessage(
        message.includes("Invalid or expired invite token")
          ? "That company code is invalid or not found."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-[#0b0b0d] p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400/80">
          Account Setup
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Choose your workspace</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Personal users can start immediately. Business users can join a company with an invitation
          code.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelectedMode("personal")}
          className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
            selectedMode === "personal"
              ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
              : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
          }`}
          disabled={loading}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">Personal Account</span>
            <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
              Free
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Skip company setup and go straight to your personal dashboard.
          </p>
          <div className="mt-4 text-sm font-medium text-emerald-300">
            {selectedMode === "personal" ? "Selected" : "Choose personal"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMode("company")}
          className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
            selectedMode === "company"
              ? "border-sky-500 bg-sky-500/10 shadow-lg shadow-sky-500/10"
              : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
          }`}
          disabled={loading}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">Join a Company</span>
            <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
              Team
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Enter your company invitation code or workspace identifier to join a business team.
          </p>
          <div className="mt-4 text-sm font-medium text-sky-300">
            {selectedMode === "company" ? "Selected" : "Choose company"}
          </div>
        </button>
      </div>

      {selectedMode === "personal" && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handlePersonalAccount}
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Saving profile..." : "Continue to personal dashboard"}
          </button>
        </div>
      )}

      {selectedMode === "company" && (
        <form onSubmit={handleCompanyJoin} className="mt-6 space-y-4">
          <label className="block text-left">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Company Invitation Code
            </span>
            <input
              type="text"
              value={companyCode}
              onChange={(event) => setCompanyCode(event.target.value)}
              placeholder="e.g. acme-team or 5f2a..."
              disabled={loading}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
            />
          </label>

          {errorMessage ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Verifying company..." : "Verify and join company"}
          </button>
        </form>
      )}
    </div>
  );
}

export default AccountTypeOnboarding;
