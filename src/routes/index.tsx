import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ApexMission — Prioritize Goals, Take Daily Action" },
      {
        name: "description",
        content:
          "A distraction-free dashboard to lock in your mission, prioritize tasks by impact, and complete one daily action step.",
      },
      { property: "og:title", content: "ApexMission — Prioritize Goals, Take Daily Action" },
      {
        property: "og:description",
        content:
          "A distraction-free dashboard to lock in your mission, prioritize tasks by impact, and complete one daily action step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeRedirect,
});

function HomeRedirect() {
  return <Navigate to="/welcome" />;
}

