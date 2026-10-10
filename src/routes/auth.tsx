import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: 
      typeof search["next"] === "string" 
        ? search["next"] 
        : undefined,
    mode:
      search["mode"] === "signup"
        ? "signup"
        : "signin",
  }),
  head: () => ({
    meta: [
      { title: "Sign in — ApexMission" },
      {
        name: "description",
        content: "Sign in to ApexMission to sync your mission, priorities and premium plan.",
      },
      { property: "og:title", content: "Sign in — ApexMission" },
      {
        property: "og:description",
        content: "Sign in to ApexMission to sync your mission, priorities and premium plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next, mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = 
    next && next.startsWith("/") 
      ? next 
      : "/app";

  // --- AUTOMATED SIGNUP REDIRECT HANDLER ---
  useEffect(() => {
    // If the application requests a signup workflow, immediately redirect to your separate signup route
    if (initialMode === "signup") {
      navigate({ 
        to: "/signup",
        search: { next: destination }
      });
      return;
    }

    // Auto-forward home if an active secure session is already logged in
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(destination);
    });
  }, [initialMode, destination, navigate]);

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (authError) throw authError;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace(destination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Prevent UI flashing if the router is actively forwarding a signup request away
  if (initialMode === "signup") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-500 text-xs">
        <div className="animate-pulse">Routing to custom signup portal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 text-zinc-100">
      <div className="w-full max-w-sm flex flex-col items-center justify-center text-center">
        
        {/* Minimalist Logo Anchor */}
        <img
          src="/icon-192.png"
          alt="ApexMission"
          className="h-16 w-16 object-contain mb-4"
        />

        <h1 className="text-3xl font-black tracking-tight text-white mb-2">
          Sign In
        </h1>
        <p className="text-xs font-medium text-zinc-500 mb-8">
          Welcome back to ApexMission. Stop planning. Force execution.
        </p>

        <form onSubmit={handleSignin} className="w-full flex flex-col gap-4">
          
          {/* Email Input Box Container */}
          <div className="text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={busy}
              className="w-full rounded-xl border border-zinc-800 bg-[#0D0D11] p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] disabled:opacity-50"
            />
          </div>

          {/* Password Input Box Container */}
          <div className="text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={busy}
              className="w-full rounded-xl border border-zinc-800 bg-[#0D0D11] p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] disabled:opacity-50"
            />
          </div>

          {error && <p className="text-xs font-semibold text-rose-500 text-left mt-1">{error}</p>}

          {/* Form Action Submit Trigger Button */}
          <button
            type="submit"
            disabled={busy}
            className="transform mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-black transition-all duration-300 ease-out hover:scale-102 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 disabled:opacity-50 shadow-xl shadow-white/5"
          >
            {busy && <Loader2 className="size-4 animate-spin text-black" />}
            {busy ? "Signing in..." : "Sign in →"}
          </button>
        </form>

        {/* Clear Cross-Routing Navigation Trigger to Custom Signup Page */}
        <button
          type="button"
          onClick={() => navigate({ to: "/signup", search: { next: destination } })}
          className="mt-6 text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300 transition-colors"
        >
          No account? Create an account here
        </button>
      </div>
    </div>
  );
}