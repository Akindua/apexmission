import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Legacy duplicate signup page. All registrations now go through the main auth
 * console so the "already signed in" safeguards apply consistently.
 */
export const Route = createFileRoute("/signup")({
  component: SignupRedirectPage,
});

function SignupRedirectPage() {
  return <Navigate to="/auth" search={{ mode: "signup" }} replace />;
}
