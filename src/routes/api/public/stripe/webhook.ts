import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function verifySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts: { t?: string; v1?: string } = {};
  for (const segment of header.split(",")) {
    const [rawKey, ...rest] = segment.split("=");
    const key = (rawKey ?? "").trim();
    if (key === "t" || key === "v1") parts[key] = rest.join("=");
  }
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const payload = await request.text();
        if (!verifySignature(payload, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(payload) as {
          type: string;
          data: { object: Record<string, unknown> };
        };
        const obj = event.data.object;
        const metadata = (obj["metadata"] ?? {}) as Record<string, string>;
        const userId = (obj["client_reference_id"] as string) ?? metadata["user_id"];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.type === "checkout.session.completed" && userId) {
          const plan = metadata["plan"] === "lifetime" ? "lifetime" : "monthly";
          await supabaseAdmin.from("entitlements").upsert(
            {
              user_id: userId,
              plan,
              status: "active",
              current_period_end:
                plan === "monthly"
                  ? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
                  : null,
              stripe_customer_id: (obj["customer"] as string) ?? null,
              stripe_subscription_id: (obj["subscription"] as string) ?? null,
              stripe_session_id: (obj["id"] as string) ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        }

        if (
          (event.type === "invoice.paid" || event.type === "customer.subscription.updated") &&
          userId
        ) {
          const periodEnd =
            (obj["current_period_end"] as number | undefined) ??
            ((obj["lines"] as { data?: Array<{ period?: { end?: number } }> } | undefined)?.data?.[0]
              ?.period?.end as number | undefined);
          await supabaseAdmin
            .from("entitlements")
            .update({
              status: (obj["status"] as string) === "canceled" ? "canceled" : "active",
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }

        if (event.type === "customer.subscription.deleted" && userId) {
          await supabaseAdmin
            .from("entitlements")
            .update({ status: "canceled", updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }

        return new Response("ok");
      },
    },
  },
});
