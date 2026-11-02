import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Bell, BellOff, Shield, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VITE_VAPID_PUBLIC_KEY } from "@/lib/env";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);

  useEffect(() => {
    checkSupportAndSubscription();
  }, []);

  async function checkSupportAndSubscription() {
    try {
      const isSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(isSupported);
      setPermission(Notification.permission);

      const vapidKey = VITE_VAPID_PUBLIC_KEY;
      setVapidConfigured(!!vapidKey && vapidKey.length > 0);

      if (!isSupported || !vapidKey) {
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(!!subscription);
    } catch (err) {
      console.error("[Settings] Failed to check push status:", err);
      setError("Could not check notification status.");
    } finally {
      setLoading(false);
    }
  }

  async function subscribe() {
    if (!supported || !VITE_VAPID_PUBLIC_KEY) return;
    setError(null);
    setLoading(true);

    try {
      // Request permission explicitly (user gesture required)
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setError("Permission denied. Enable notifications in browser settings to subscribe.");
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Convert base64url VAPID key to Uint8Array
      function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) as BufferSource,
      });

      // Send subscription to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} ${text}`);
      }

      setSubscribed(true);
    } catch (err) {
      console.error("[Settings] Subscribe failed:", err);
      setError(err instanceof Error ? err.message : "Failed to subscribe.");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!supported) return;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      // Notify server
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      setSubscribed(false);
    } catch (err) {
      console.error("[Settings] Unsubscribe failed:", err);
      setError(err instanceof Error ? err.message : "Failed to unsubscribe.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </section>
    );
  }

  if (!supported) {
    return (
      <section className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-5 text-left">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-rose-300">
          <XCircle className="size-4" />
          Push Notifications Not Supported
        </h2>
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-zinc-400">
          Your browser does not support the Web Push API. Push reminders require a modern browser
          with Service Worker and Push API support (Chrome 50+, Firefox 44+, Safari 16+, Edge 17+).
        </p>
      </section>
    );
  }

  if (!vapidConfigured) {
    return (
      <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 text-left">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-300">
          <Shield className="size-4" />
          Server Not Configured
        </h2>
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-zinc-400">
          Push notifications are not configured on the server. The <code className="font-mono bg-black/40 px-1 rounded">VITE_VAPID_PUBLIC_KEY</code>
          environment variable is missing. Contact your administrator.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-5 text-left backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.5)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-emerald-500/15 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
            <Bell className="size-4 shrink-0 text-emerald-400" />
            4:30 PM Push Reminder
          </h2>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-500">
            Receive ONE daily push at ~4:30 PM in your timezone if your top High-impact task is not done.
            Works even when the app is closed.
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider ${
          subscribed
            ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-400"
            : "border-zinc-500/25 bg-zinc-950/30 text-zinc-500"
        }`}>
          {subscribed ? (
            <>
              <CheckCircle2 className="size-3" />
              Subscribed
            </>
          ) : (
            <>
              <BellOff className="size-3" />
              Not subscribed
            </>
          )}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/15 bg-black/40 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
            <Shield className="size-3" />
            How it works
          </h3>
          <ul className="mt-2 grid gap-1.5 text-[10px] font-medium leading-relaxed text-zinc-400">
            <li className="flex items-start gap-1.5">{"1."} <span>Runs once per day at ~4:30 PM in <strong>your local timezone</strong>.</span></li>
            <li className="flex items-start gap-1.5">{"2."} <span>Only fires if you have an unfinished <strong>High-impact</strong> task.</span></li>
            <li className="flex items-start gap-1.5">{"3."} <span>Notification text is generic: <strong>"Time to close your top task before 5 PM."</strong> No task content on lock screen.</span></li>
            <li className="flex items-start gap-1.5">{"4."} <span>Personal accounts only — corporate workspaces do not receive pushes.</span></li>
            <li className="flex items-start gap-1.5">{"5."} <span>Subscription stored encrypted on server; you can revoke anytime below.</span></li>
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-500/15 bg-black/40 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
            <Bell className="size-3" />
            iOS / Safari Notes
          </h3>
          <ul className="mt-2 grid gap-1.5 text-[10px] font-medium leading-relaxed text-zinc-400">
            <li className="flex items-start gap-1.5">{"•"} <span>Requires iOS 16.4+ and <strong>"Add to Home Screen"</strong> (PWA).</span></li>
            <li className="flex items-start gap-1.5">{"•"} <span>In Safari: Share → Add to Home Screen → Open from Home Screen.</span></li>
            <li className="flex items-start gap-1.5">{"•"} <span>Notifications permission must be granted from the Home Screen app.</span></li>
            <li className="flex items-start gap-1.5">{"•"} <span>Focus modes / Do Not Disturb may silence the notification.</span></li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-[11px] font-semibold leading-relaxed text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {subscribed ? (
          <button
            type="button"
            onClick={unsubscribe}
            disabled={loading}
            className="btn-glass-secondary h-11 flex-1 text-xs"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin mr-2" />
            ) : (
              <BellOff className="size-3.5 mr-2" />
            )}
            Unsubscribe from 4:30 PM reminder
          </button>
        ) : (
          <button
            type="button"
            onClick={subscribe}
            disabled={loading || permission === "denied"}
            className="btn-glass-primary h-11 flex-1 text-xs"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin mr-2" />
            ) : (
              <Bell className="size-3.5 mr-2" />
            )}
            {permission === "denied" ? "Enable in browser settings first" : "Subscribe to 4:30 PM reminder"}
          </button>
        )}
        {permission === "denied" && !subscribed && (
          <button
            type="button"
            onClick={() => {
              // Can't programmatically open settings; user must do it manually
            }}
            className="btn-glass-ghost h-11 shrink-0 px-4 text-xs"
            disabled
          >
            Permission blocked
          </button>
        )}
      </div>

      <p className="mt-3 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
        Privacy: We store only your push endpoint and encryption keys (p256dh, auth), plus your timezone.
        No task content is ever sent to the push server. Delete your subscription anytime above.
      </p>
    </section>
  );
}