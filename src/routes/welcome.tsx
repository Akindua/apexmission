import {
  Link,
  createFileRoute,
} from "@tanstack/react-router";

  export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
  });
  
  function WelcomePage() {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <img
          src="/icon-192.png"
          alt="ApexMission Logo"
          className="mx-auto mb-6 -32 h-32 objection-contain"
        />
        <h1 className="mt-4 text-4xl font-bold">
          Welcome to ApexMission
        </h1>
  
        <p className="mt-4 text-muted-foreground">
          Focus on what matters and move one step closer to your goals every day.
        </p>
  
        <div className="mt-8 space-y-3">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="block w-full rounded-lg bg-white p-3 text-black font-semibold"
          >
            Get Started
          </Link>
  
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="block w-full rounded-lg border p-3"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}