import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verify-email")({
    component: VerifyEmailPage,
});

function VerifyEmailPage() {
    return (
        <div className="flex min-h-screen items-center justify-center px-6">
            <div className="max-w-md text-center">
                <h1 className="text-3xl font-bold">
                    Check your email
                </h1>

                <p className="mt-4 text-muted-foreground">
                    ✅ Almost there...

                    Open your inbox.

                    We've sent you a verification email. Click the link to activate your ApexMission account.
                    Once verified you'll be able to select your plan and start your first mission!
                </p>
            </div>
        </div>
    );
}