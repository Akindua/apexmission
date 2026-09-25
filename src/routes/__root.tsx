import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "ApexMission",
      },
    ],
  }),
  component: () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0D0D11] p-4 text-zinc-100">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-emerald-500">ApexMission</h1>
        <h5 className="mt-4 text-xl font-semibold">Something went wrong on our end.</h5>
        <p className="mt-2 text-sm text-zinc-400">
          You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  ),
});
