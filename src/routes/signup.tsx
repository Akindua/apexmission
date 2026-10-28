import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignup = async () => {
    if (!email || !password || !fullName) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) throw error;

      console.log("Signup success:", data);
      navigate({ to: "/verify-email", search: { email: email.trim() } });
    } catch (err) {
      console.error("Signup failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell flex items-center justify-center px-6 py-12">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative w-full max-w-sm glass-panel p-8 text-center">
        <div className="top-highlight" />

        {/* Minimalist Logo Anchor */}
        <div className="relative mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/15 to-emerald-950/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
          <img src="/icon-192.png" alt="ApexMission" className="h-9 w-9 object-contain" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white mb-1">Create Account</h1>
        <p className="text-xs font-medium text-zinc-500 mb-6">
          Join ApexMission. Stop planning. Force execution.
        </p>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-left flex items-start gap-2 text-xs text-rose-400 font-semibold">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="w-full flex flex-col gap-3">
          {/* Full Name Input */}
          <div className="glass-input-group text-left">
            <label className="glass-input-label">Full Name</label>
            <div className="glass-input-wrapper">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                disabled={loading}
                className="glass-input-field"
              />
            </div>
          </div>

          {/* Email Input */}
          <div className="glass-input-group text-left">
            <label className="glass-input-label">Email Address</label>
            <div className="glass-input-wrapper">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={loading}
                className="glass-input-field"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="glass-input-group text-left">
            <label className="glass-input-label">Password</label>
            <div className="glass-input-wrapper">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="glass-input-field"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="btn-glass-primary w-full h-11 mt-1"
          >
            {loading ? "Creating Account..." : "Create Account →"}
          </button>
        </div>
      </div>
    </div>
  );
}
