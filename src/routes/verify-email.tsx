import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
 
export const Route = createFileRoute("/verify-email")({
    validateSearch: (search) => ({
        email:
            typeof search.email === "string"
                ? search.email
                : "",
    }),
    component: VerifyEmailPage,
});

function VerifyEmailPage() {
    const navigate = useNavigate();

    const { email } = Route.useSearch();

    window.location.href =
        `/verify-email?email=${encodeURIComponent(email)}`;

    async function handleResend() {
        if (!email) return;
        
        await supabase.auth.resend({
        type: "signup",
        email,
        });
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full rounded-xl border p-8 text-center">
                <h1 className="text-3xl font-bold mb-4">
                    Verify your email
                </h1>

                <p className="text-muted-foreground mb-6">
                    We sent a verification link to your email address.
                    Open the email and click the link to activate your ApexMission account.
                </p>

                <div className="space-y-3 text-sm text-muted-foreground mb-8">
                    <p>✓ Check your Inbox</p>
                    <p>✓ Check Promotions</p>
                    <p>✓ Check Spam/Junk folder</p>
                </div>

                <button
                    onClick={() => navigate({ to: "/auth" })}
                    className="w-full rounded-lg bg-white text-black px-4 py-3"
                >
                    I've verified my email
                </button>

                <button
                    onClick={handleResend}
                    className="mt-3 w-full rounded-lg border px-4 py-3"
                >
                    Resend verification email
                </button>

                <button
                    onClick={() => navigate({ to: "/auth" })}
                    className="mt-3 w-full rounded-lg border px-4 py-3"
                >
                <p className="text-muted-foreground mb-6">
                    We sent a verification link to:

                    <br />

                    <strong>{email}</strong>
                </p>
                    Back to Sign In
                </button>
            </div>
        </div>
    );
   
}