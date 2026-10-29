import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspaceAccessStatus } from "@/lib/workspace-access.functions";

/**
 * Pages that must remain reachable even when a corporate pilot has ended.
 * Everything else is treated as workspace routing and is checked against the
 * enterprise license before it renders.
 */
const PUBLIC_ROUTES = new Set([
  "/",
  "/auth",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/billing",
  "/workspace-billing",
  "/pricing",
  "/plans",
  "/welcome",
  // Read-only pitch-demo team grid (public by design; demo tenant only).
  "/demo",
]);

function isPublicRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_ROUTES.has(normalized) || normalized.startsWith("/api/");
}

type Verification = {
  path: string;
  status: "allowed" | "blocked";
};

export function WorkspaceAccessGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const protectedRoute = !isPublicRoute(pathname);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);

  // A different account must never inherit the previous account's clearance.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setVerification(null);
        setAuthEpoch((epoch) => epoch + 1);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Clear the cached decision when leaving the workspace so a later return
  // always revalidates instead of trusting an old "allowed" result.
  useEffect(() => {
    if (!protectedRoute) setVerification(null);
  }, [protectedRoute]);

  useEffect(() => {
    if (!protectedRoute) return;

    let cancelled = false;
    let recheckTimer: number | undefined;

    const verify = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        // Guests are handled by the individual route's sign-in flow.
        if (!session) {
          setVerification({ path: pathname, status: "allowed" });
          return;
        }

        const result = await getWorkspaceAccessStatus();
        if (cancelled) return;

        // A transient lookup failure fails open, then retries. It must not be
        // confused with a personal account, which has no workspace to gate.
        if (!result.available) {
          setVerification({ path: pathname, status: "allowed" });
          recheckTimer = window.setTimeout(verify, 60_000);
          return;
        }

        const status = result.status;

        if (status?.isPilotExpired) {
          setVerification({ path: pathname, status: "blocked" });
          await navigate({
            to: "/workspace-billing",
            search: { company: status.companyName },
            replace: true,
          });
          return;
        }

        setVerification({ path: pathname, status: "allowed" });

        // Personal accounts have no workspace to gate. Active unpaid pilots
        // are rechecked so the lock lands even if the dashboard stays open.
        if (status && !status.isContractPaid) {
          recheckTimer = window.setTimeout(verify, 60_000);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("[Workspace] Access verification failed:", error);
        setVerification({ path: pathname, status: "allowed" });
        recheckTimer = window.setTimeout(verify, 60_000);
      }
    };

    void verify();

    return () => {
      cancelled = true;
      if (recheckTimer) window.clearTimeout(recheckTimer);
    };
  }, [authEpoch, navigate, pathname, protectedRoute]);

  const verified =
    !protectedRoute || (verification?.path === pathname && verification.status === "allowed");

  if (!verified) {
    return (
      <WorkspaceGateScreen
        blocked={verification?.path === pathname && verification.status === "blocked"}
      />
    );
  }

  return <>{children}</>;
}

function WorkspaceGateScreen({ blocked }: { blocked: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="app-emerald-canvas fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(16,185,129,0.10),transparent_55%)]" />
      <div className="relative flex size-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-950/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.18)]">
        {blocked ? <ShieldAlert className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
      </div>
      <p className="relative mt-4 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
        {blocked ? "Workspace access paused" : "Verifying workspace access"}
      </p>
      <p className="relative mt-2 max-w-xs text-xs leading-relaxed text-zinc-500">
        {blocked
          ? "Your pilot has ended. Redirecting to enterprise billing…"
          : "Checking your enterprise license and pilot window…"}
      </p>
    </div>
  );
}
