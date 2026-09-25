import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/loading")({
  component: LoadingPage,
});

function LoadingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: "/welcome" });
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black">
      <h1 className="text-3xl text-white">
        ApexMission
      </h1>

      <p className="mt-2 text-gray-400">
        Your mission. One priority. Every day.
      </p>
    </div>
  );
}