import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export default function LoadingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: "/welcome" });
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black">
      /logo.png

      <h1 className="mt-4 text-3xl text-white">
        ApexMission
      </h1>

      <p className="mt-2 text-gray-400">
        Your mission. One priority. Every day.
      </p>
    </div>
  );
}