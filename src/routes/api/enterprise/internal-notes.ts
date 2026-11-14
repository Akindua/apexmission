import { createFileRoute } from "@tanstack/react-router";
import { requireEnterpriseTier } from "@/lib/security.enterprise";

export const Route = createFileRoute("/api/enterprise/internal-notes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // 🛡️ Enterprise tier only - client_external users should be rejected
        const actor = await requireEnterpriseTier(request);
        if (actor instanceof Response) return actor;

        return new Response(
          JSON.stringify({
            status: "success",
            internal_notes: [
              { id: "note-1", title: "Q3 Strategy", content: "Confidential internal strategy" },
              { id: "note-2", title: "Staffing Review", content: "Internal performance review" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      },
    },
  },
});
