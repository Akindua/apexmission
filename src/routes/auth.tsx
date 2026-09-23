import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Mission Control" },
      {
        name: "description",
        content: "Sign in to Mission Control to sync your mission, priorities and premium plan.",
      },
      { property: "og:title", content: "Sign in — Mission Control" },
      {
        property: "og:description",
        content: "Sign in to Mission Control to sync your mission, priorities and premium plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = next && next.startsWith("/") ? next : "/";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(destination);
    });
  }, [destination]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: authError } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin + destination },
            });
      if (authError) throw authError;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: destination });
      } else {
        setError("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-surface w-full max-w-sm p-7">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
            <Target className="size-4 text-impact-high" />
          </div>
          <span className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            Mission Control
          </span>
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            aria-label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background/40 px-3 text-sm outline-none focus:border-foreground/40"
          />
          <input
            type="password"
            required
            minLength={6}
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background/40 px-3 text-sm outline-none focus:border-foreground/40"
          />
          {error && <p className="text-xs text-impact-high">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
