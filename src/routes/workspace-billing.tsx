import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWorkspaceAccessStatus,
  type WorkspaceAccessStatus,
} from "@/lib/workspace-access.functions";
import { setStorageScope } from "@/lib/user-storage";

export const Route = createFileRoute("/workspace-billing")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    company: typeof search["company"] === "string" ? search["company"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Enterprise license — ApexMission" },
      {
        name: "description",
        content:
          "Finalize your enterprise license activation to restore workspace access and automated summary reports.",
      },
      { property: "og:title", content: "Enterprise license — ApexMission" },
      {
        property: "og:description",
        content:
          "Finalize your enterprise license activation to restore workspace access and automated summary reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceBillingPage,
});

const PILOT_ENDED_COPY =
  "Your 14-day pilot block has successfully concluded. To restore workspace access and continue receiving automated summary reports, please finalize your enterprise license activation.";

const SUPPORT_EMAIL = "support@apexmissions.app";

type AuthState = "checking" | "signed_out" | "signed_in";

function WorkspaceBillingPage() {
  const { company } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkspaceAccessStatus | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [unavailable, setUnavailable] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session) {
          setAuthState("signed_out");
          return;
        }

        setAuthState("signed_in");

        const result = await getWorkspaceAccessStatus();
        if (cancelled) return;

        if (!result.available) {
          setUnavailable(true);
          return;
        }

        setStatus(result.status);
      } catch (error) {
        console.error("[Workspace] Billing status lookup failed:", error);
        if (!cancelled) {
          // Never falsely claim that a pilot expired when the backend could
          // not be reached. The guard fails open and retries automatically.
          setUnavailable(true);
          setAuthState((current) => (current === "checking" ? "signed_out" : current));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn("Local session disconnect skipped:", error);
    } finally {
      setStorageScope(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("apex-session-briefing-triggered");
      }
      setSigningOut(false);
      navigate({
        to: "/auth",
        search: { mode: "signin", next: "/workspace-billing" },
        replace: true,
      });
    }
  }

  if (authState === "checking") {
    return <LoadingPanel />;
  }

  const companyName = status?.companyName || company || "Your workspace";

  if (authState === "signed_out") {
    return (
      <PausedPanel
        companyName={companyName}
        status={null}
        signedIn={false}
        signingOut={false}
        onSignOut={handleSignOut}
      />
    );
  }

  if (unavailable) {
    return <UnavailablePanel />;
  }

  if (!status) {
    return <NoWorkspacePanel companyName={companyName} />;
  }

  if (status.isPilotExpired) {
    return (
      <PausedPanel
        companyName={companyName}
        status={status}
        signedIn
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.isContractPaid) {
    return <ActiveLicensePanel companyName={companyName} />;
  }

  return <ActivePilotPanel companyName={companyName} status={status} />;
}

function LoadingPanel() {
  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div
        className="relative flex flex-col items-center text-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-7 animate-spin text-emerald-400" />
        <p className="mt-4 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
          Checking workspace license
        </p>
      </div>
    </div>
  );
}

function PausedPanel({
  companyName,
  status,
  signedIn,
  signingOut,
  onSignOut,
}: {
  companyName: string;
  status: WorkspaceAccessStatus | null;
  signedIn: boolean;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const mailtoHref = buildMailto({
    companyName,
    companyId: status?.companyId,
    intent: "expired",
  });

  return (
    <BillingFrame wide>
      <BillingPanel>
        <LicenseHeader
          tone="amber"
          icon={<ShieldAlert className="size-6" />}
          eyebrow="Enterprise billing"
          title="Workspace access paused."
          companyName={companyName}
        />

        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 sm:p-5">
          <p className="text-sm font-medium leading-relaxed text-zinc-200">{PILOT_ENDED_COPY}</p>
          {!signedIn ? (
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Sign in to verify this workspace&apos;s live license status.
            </p>
          ) : null}
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusCell label="Workspace" value={companyName} />
          <StatusCell label="Pilot status" value="Concluded" />
          <StatusCell
            label="Pilot ended"
            value={status ? formatDate(status.trialEndsAt) : "Sign in to view"}
            icon={<CalendarClock className="size-3.5" />}
          />
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <a href={mailtoHref} className="btn-glass-primary h-11 min-h-11 flex-1">
            <Mail className="mr-2 size-4" />
            Finalize enterprise license
          </a>
          {signedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="btn-glass-ghost h-11 min-h-11 flex-1 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 size-4" />
              )}
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              search={{ mode: "signin", next: "/workspace-billing" }}
              className="btn-glass-ghost h-11 min-h-11 flex-1"
            >
              Sign in
            </Link>
          )}
        </div>

        <SupportFooter />

        <p className="mt-5 text-center text-[10px] leading-relaxed text-zinc-600">
          Access remains restricted for every employee and manager account in this workspace until
          the enterprise license is activated.
        </p>
      </BillingPanel>
    </BillingFrame>
  );
}

function ActiveLicensePanel({ companyName }: { companyName: string }) {
  return (
    <BillingFrame>
      <BillingPanel>
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-950/40 text-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.22)]">
            <CheckCircle2 className="size-7" />
          </div>
          <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
            Enterprise license
          </p>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-white">
            Workspace access is active.
          </h1>
          <p className="mt-2 break-words text-xs text-zinc-500">{companyName}</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            This workspace has an active enterprise license. Automated summary reports and the
            operator dashboard are available.
          </p>
          <Link to="/app" className="btn-glass-primary mt-6 h-11 min-h-11 w-full">
            Return to dashboard
            <ArrowRight className="ml-2 size-4" />
          </Link>
          <SupportFooter />
        </div>
      </BillingPanel>
    </BillingFrame>
  );
}

function ActivePilotPanel({
  companyName,
  status,
}: {
  companyName: string;
  status: WorkspaceAccessStatus;
}) {
  const daysRemaining = pilotDaysRemaining(status.trialEndsAt);
  const mailtoHref = buildMailto({
    companyName,
    companyId: status.companyId,
    intent: "active",
  });

  return (
    <BillingFrame wide>
      <BillingPanel>
        <LicenseHeader
          tone="sky"
          icon={<CalendarClock className="size-6" />}
          eyebrow="Enterprise pilot"
          title="Your pilot is active."
          companyName={companyName}
        />

        <div className="mt-6 rounded-xl border border-sky-500/20 bg-sky-950/10 p-4 sm:p-5">
          <p className="text-sm font-medium leading-relaxed text-zinc-200">
            {daysRemaining > 0
              ? `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining in your 14-day pilot.`
              : "Your pilot concludes today."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Your pilot ends on {formatDate(status.trialEndsAt)}. Finalize the enterprise license
            before then to keep automated summary reports and dashboard access running without
            interruption.
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusCell label="Workspace" value={companyName} />
          <StatusCell label="Pilot status" value="Active" />
          <StatusCell
            label="Pilot ends"
            value={formatDate(status.trialEndsAt)}
            icon={<CalendarClock className="size-3.5" />}
          />
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <a href={mailtoHref} className="btn-glass-primary h-11 min-h-11 flex-1">
            <Mail className="mr-2 size-4" />
            Finalize enterprise license
          </a>
          <Link to="/app" className="btn-glass-ghost h-11 min-h-11 flex-1">
            Return to dashboard
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </div>

        <SupportFooter />
      </BillingPanel>
    </BillingFrame>
  );
}

function NoWorkspacePanel({ companyName }: { companyName: string }) {
  return (
    <BillingFrame>
      <BillingPanel>
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-zinc-700/70 bg-zinc-900/60 text-zinc-400">
            <Building2 className="size-7" />
          </div>
          <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
            Enterprise billing
          </p>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-white">
            No enterprise workspace linked.
          </h1>
          <p className="mt-2 break-words text-xs text-zinc-500">{companyName}</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            This account is not linked to a company workspace, so there is no enterprise license to
            review. If you expected to be part of a company workspace, sign in with your work
            account or ask your administrator for an invite.
          </p>
          <Link to="/app" className="btn-glass-primary mt-6 h-11 min-h-11 w-full">
            Return to dashboard
            <ArrowRight className="ml-2 size-4" />
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Enterprise workspace access")}`}
            className="btn-glass-ghost mt-2 h-11 min-h-11 w-full"
          >
            <Mail className="mr-2 size-4" />
            Contact support
          </a>
          <SupportFooter />
        </div>
      </BillingPanel>
    </BillingFrame>
  );
}

function UnavailablePanel() {
  return (
    <BillingFrame>
      <BillingPanel>
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-950/30 text-amber-400">
            <ShieldAlert className="size-7" />
          </div>
          <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">
            Enterprise billing
          </p>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-white">
            License check unavailable.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            We couldn&apos;t verify this workspace&apos;s enterprise license right now. Your
            dashboard remains available while the check retries automatically, but access may be
            paused once the license status can be confirmed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-glass-primary mt-6 h-11 min-h-11 w-full"
          >
            <RefreshCw className="mr-2 size-4" />
            Retry license check
          </button>
          <Link to="/app" className="btn-glass-ghost mt-2 h-11 min-h-11 w-full">
            Return to dashboard
          </Link>
          <SupportFooter />
        </div>
      </BillingPanel>
    </BillingFrame>
  );
}

function BillingFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page-shell flex items-center justify-center px-4 py-10 sm:px-6">
      <div className="ambient-emerald-glow-sm" />
      <div className="grid-pattern-overlay" />
      <div className={`relative w-full ${wide ? "max-w-2xl" : "max-w-lg"}`}>{children}</div>
    </div>
  );
}

function BillingPanel({ children }: { children: ReactNode }) {
  return (
    <div className="glass-panel relative overflow-hidden p-6 text-left sm:p-8">
      <div className="top-highlight" />
      {children}
    </div>
  );
}

function LicenseHeader({
  tone,
  icon,
  eyebrow,
  title,
  companyName,
}: {
  tone: "amber" | "sky";
  icon: ReactNode;
  eyebrow: string;
  title: string;
  companyName: string;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-500/25 bg-amber-950/30 text-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.16)]"
      : "border-sky-500/25 bg-sky-950/30 text-sky-400 shadow-[0_0_24px_rgba(14,165,233,0.16)]";
  const eyebrowClasses = tone === "amber" ? "text-amber-400" : "text-sky-400";

  return (
    <div className="flex items-start gap-4">
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border ${toneClasses}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className={`font-mono text-[10px] font-black uppercase tracking-[0.25em] ${eyebrowClasses}`}
        >
          {eyebrow}
        </p>
        <h1 className="mt-1 font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-500">
          <Building2 className="mt-0.5 size-3.5 shrink-0 text-zinc-600" />
          <span className="min-w-0 break-words">{companyName}</span>
        </p>
      </div>
    </div>
  );
}

function SupportFooter() {
  return (
    <div className="mt-5 flex flex-col gap-1 border-t border-zinc-800/60 pt-4 text-center">
      <p className="text-[11px] text-zinc-500">
        Need your license agreement or invoice? Contact our enterprise billing desk.
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=Enterprise%20billing`}
        className="inline-flex min-h-11 items-center justify-center font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300"
      >
        {SUPPORT_EMAIL}
      </a>
    </div>
  );
}

function StatusCell({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800/70 bg-black/30 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-bold text-zinc-200">{value}</dd>
    </div>
  );
}

function buildMailto({
  companyName,
  companyId,
  intent,
}: {
  companyName: string;
  companyId?: string | undefined;
  intent: "expired" | "active";
}) {
  const subject = encodeURIComponent(`Enterprise license activation — ${companyName}`);
  const body = encodeURIComponent(
    [
      `Workspace: ${companyName}`,
      companyId ? `Workspace ID: ${companyId}` : "",
      "",
      intent === "expired"
        ? "Please help us finalize the enterprise license activation and restore workspace access."
        : "Our pilot is active and we would like to finalize the enterprise license before it concludes.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

function pilotDaysRemaining(trialEndsAt: string): number {
  const endsAt = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(endsAt)) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 86_400_000));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
