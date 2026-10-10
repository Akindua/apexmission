import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !fullName) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          // Securely pass the user's name into Supabase's identity metadata dictionary
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) throw error;
      
      navigate({ to: "/verify-email" });
    } catch (err) {
      console.error("Signup failed:", err);
    } finally {
      setLoading(false);
    }
  };

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
          Create Account
        </h1>
        <p className="text-xs font-medium text-zinc-500 mb-8">
          Join ApexMission. Stop planning. Force execution.
        </p>

        <div className="w-full flex flex-col gap-4">
          
          {/* Full Name Input Box Container */}
          <div className="text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              disabled={loading}
              className="w-full rounded-xl border border-zinc-800 bg-[#0D0D11] p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] disabled:opacity-50"
            />
          </div>

          {/* Email Input Box Container */}
          <div className="text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={loading}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full rounded-xl border border-zinc-800 bg-[#0D0D11] p-3.5 text-sm text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-emerald-500/50 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] disabled:opacity-50"
            />
          </div>

          {/* Form Action Submit Trigger Button */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="transform mt-4 w-full rounded-xl bg-white py-3.5 text-sm font-bold text-black transition-all duration-300 ease-out hover:scale-102 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 disabled:opacity-50 shadow-xl shadow-white/5"
          >
            {loading ? "Creating Account..." : "Create Account →"}
          </button>

        </div>
      </div>
    </div>
  );
}