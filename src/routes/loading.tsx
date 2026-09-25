import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export default function LoadingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
        navigate({ to: "/welcome" });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black">
       <img src="/logo.png" className="w-24white text-3xl mt-4">ApexMission</h1>
       <p className="text-gray-400 mt-2">
           Your mission. One priority. Every day.
       </p>
     </div>
    );
}