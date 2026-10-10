import {
  Link,
  createFileRoute,
} from "@tanstack/react-router";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-6 text-zinc-100">
      <div className="w-full max-w-sm text-center flex flex-col items-center justify-center">
        
        {/* Premium Geometric Logo Anchor */}
        <img
          src="/icon-192.png"
          alt="ApexMission Logo"
          className="h-28 w-28 object-contain mb-4 animate-fade-in"
        />
        
        {/* Solid Neon Emerald Accent Label */}
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-2">
          Mission Launchpad
        </p>

        <h1 className="text-3xl font-black tracking-tight text-white mb-3 md:text-4xl">
          Welcome to ApexMission
        </h1>
  
        <p className="text-sm font-medium text-zinc-500 max-w-xs leading-relaxed mb-10">
          Focus on what matters most and move exactly one decisive step closer to your goals every 24 hours.
        </p>
  
        <div className="w-full flex flex-col gap-4">
          
          {/* Primary High-Urgengy Action Button (Get Started -> Links to your custom /signup Page) */}
          <Link
            to="/signup"
            className="transform block w-full rounded-xl bg-white py-4 text-center text-sm font-bold text-black transition-all duration-300 ease-out hover:scale-105 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] active:scale-98 shadow-xl shadow-white/5"
          >
            Get Started →
          </Link>
  
          {/* Secondary Low-Profile Action Link Toggle (Sign In) */}
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="block w-full rounded-xl border border-zinc-800 bg-[#0D0D11] py-4 text-center text-sm font-bold text-zinc-400 transition-all duration-300 hover:border-zinc-700 hover:text-white active:scale-98"
          >
            Sign In
          </Link>
          
        </div>
      </div>
    </div>
  );
}