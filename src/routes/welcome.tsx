import { Link } from "@tanstack/react-router";

export default function WelcomePage() {
   return (
       <div className="min-h-screen flex items-center justify-center px-6">
           <div className="text-center max-w-lg">
              <imgo.png

              <h1 className="text-4xl font-bold">
                  Welcome to ApexMission
              </h1>

              <p className="mt-4 text-muted-foreground">
                Focus on what matters and move one step closer
                to your goals every day.
              </p>

              <div className="mt-8 space-y-3">
                <Link
                  to="/signup"
                  className="block w-full rounded-lg bg-primary p-3"
                >
                  Get Started
                </Link>

                <Link
                  to="/auth"
                  className="block w-full rounded-lg border p-3"
                >
                  Sign In
                </Link>
            </div>
        </div>
    </div>
  );
}