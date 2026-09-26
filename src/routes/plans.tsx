import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/plans")({
  component: PlansPage,
});

function PlansPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
    <h1 className="text-3xl font-bold">
      Choose Your Plan
    </h1>

    <button
      onClick={() => navigate({ to: "/app" })}
      className="rounded-lg bg-blue-600 px-4 py-2 text-white"
    >
      Start Free
    </button>

    <button
      className="rounded-lg border px-4 py-2"
    >
      Premium Coming Soon
     </button>
    </div>
  );
}