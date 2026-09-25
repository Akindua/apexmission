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

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (!error) {
      navigate({ to: "/plans" });
    }
  };

return (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4">
    <h1 className="text-3xl font-bold">
      Create Account
    </h1>

    <input
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      placeholder="Email"
      className="border p-2"
    />

    <input
      type="password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="Password"
      className="border p-2"
    />

    <button
      onClick={handleSignup}
      className="rounded-lg bg-blue-600 px-4 py-2 text-white"
    >
      Create Account
     </button>
   </div>
 );
}