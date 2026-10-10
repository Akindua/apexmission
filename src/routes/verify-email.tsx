import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
    validateSearch: (search: Record<string, unknown>) => ({
        email:
            typeof search["email"] === "string"
                ? search["email"]
                : "",
    }),
    component: VerifyEmailPage,
});

function VerifyEmailPage() {
    const navigate = useNavigate();
    const { email } = Route.useSearch();
    
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
    const [busy, setBusy] = useState(false);
    
    async function handleResend() {
        if (!email || busy) return;
        setBusy(true);
        setMessage("");
        setMessageType(null);
    
        try {
            const { error } = await supabase.auth.resend({
                type: "signup",
                email,
            });
    
            if (error) throw error;

            setMessage("Verification email resent successfully!");
            setMessageType("success");
        } catch (err) {
            setMessage("Could not resend verification email. Try again.");
            setMessageType("error");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 text-zinc-100">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-8 text-center shadow-2xl">
                
                {/* Minimalist Logo Anchor */}
                <img
                  src="/icon-192.png"
                  alt="ApexMission"
                  className="mx-auto h-16 w-16 object-contain mb-4"
                />

                {/* Solid Neon Emerald Accent Label */}
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-2">
                    Security Verification
                </p>

                <h1 className="text-3xl font-black tracking-tight text-white mb-4">
                    Verify Your Email
                </h1>

                <p className="text-sm font-medium text-zinc-400 mb-2">
                    We sent a secure activation link to:
                </p>
                <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-3 mb-6">
                    <strong className="text-sm font-bold text-white break-all">{email || "your email address"}</strong>
                </div>

                <p className="text-xs font-medium text-zinc-500 leading-relaxed mb-6">
                    Open the email and click the confirmation link to securely register your hardware cockpit profile configuration.
                </p>

                {/* Tactical Verification Checklist Box */}
                <div className="rounded-xl border border-zinc-900 bg-black/40 p-4 text-left space-y-2 text-xs font-semibold text-zinc-400 mb-8">
                    <p className="flex items-center gap-2 text-emerald-500"><span>✓</span> Check your core inbox folder</p>
                    <p className="flex items-center gap-2"><span>✓</span> Scan your promotional dashboard filter</p>
                    <p className="flex items-center gap-2"><span>✓</span> Inspect your spam/junk archive directory</p>
                </div>

                <div className="w-full flex flex-col gap-3">
                    
                    {/* Primary High-Urgency Action Button */}
                    <button
                        onClick={() => navigate({ to: "/auth" })}
                        className="transform w-full rounded-xl bg-white py-3.5 text-sm font-bold text-black transition-all duration-300 ease-out hover:scale-102 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 shadow-xl shadow-white/5"
                    >
                        I've Verified My Email →
                    </button>

                    {/* Secondary Resend Trigger Capsule */}
                    <button
                        onClick={handleResend}
                        disabled={busy}
                        className="w-full rounded-xl border border-zinc-800 bg-[#0D0D11] py-3.5 text-sm font-bold text-zinc-300 transition-all duration-300 hover:border-zinc-700 hover:text-white active:scale-98 disabled:opacity-50"
                    >
                        {busy ? "Sending..." : "Resend Verification Email"}
                    </button>
                    
                    {/* Return Navigation Anchor */}
                    <button
                        onClick={() => navigate({ to: "/auth" })}
                        className="w-full rounded-xl border border-zinc-800 bg-transparent py-3.5 text-sm font-bold text-zinc-500 transition-all duration-300 hover:border-zinc-700 hover:text-zinc-300 active:scale-98"
                    >
                        Back to Sign In
                    </button>
                </div>

                {/* Dynamic Feedback Message Banners */}
                {message && (
                    <div className={`mt-6 flex items-center justify-center gap-2 rounded-xl border p-4 text-xs font-bold transition-all duration-300 ${
                        messageType === "success"
                            ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-400"
                            : "border-rose-500/20 bg-rose-950/20 text-rose-400"
                    }`}>
                        {messageType === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                        <p>{message}</p>
                    </div>
                )}
                
            </div>
        </div>
    );
}