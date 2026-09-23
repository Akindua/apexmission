import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanId = "monthly" | "annual" | "lifetime";

export interface BillingInfo {
  plan: PlanId | null;
  status: string | null;
  premium: boolean;
  currentPeriodEnd: string | null;
  checkoutConfigured: boolean;
}

/**
 * Stripe Price configuration.
 *
 * IMPORTANT:
 * These are your Stripe SANDBOX Price IDs.
 * Use them with your Stripe Sandbox secret key.
 *
 * For production, replace these with your LIVE-mode Price IDs
 * and use your LIVE Stripe secret key.
 */
export const PLANS: Record<
  PlanId,
  {
    name: string;
    priceId: string;
    price: string;
    cadence: string;
    recurring: boolean;
  }
> = {
  monthly: {
    name: "Monthly Tier",
    priceId: "price_1UIRlAGSFGvEe4KG9WAhjD86",
    price: "$9.99",
    cadence: "/mo",
    recurring: true,
  },

  annual: {
    name: "Annual Tier",
    priceId: "price_1UIRqiGSFGvEe4KG9KxzNrgr",
    price: "$59.99",
    cadence: "/yr",
    recurring: true,
  },

  lifetime: {
    name: "Lifetime Access",
    priceId: "price_1UIRxzGSFGvEe4KGyxSLFhmJ",
    price: "$149.99",
    cadence: " one-time",
    recurring: false,
  },
};

function isActive(row: {
  status: string;
  plan: string;
  current_period_end: string | null;
}) {
  if (row.status !== "active") return false;

  // Lifetime access never expires.
  if (row.plan === "lifetime") return true;

  // If Stripe has not supplied an expiration date yet,
  // consider the entitlement active.
  if (!row.current_period_end) return true;

  return new Date(row.current_period_end).getTime() > Date.now();
}

async function readEntitlement(userId: string): Promise<BillingInfo> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("entitlements")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  const checkoutConfigured = Boolean(process.env["STRIPE_SECRET_KEY"]);

  if (!data) {
    return {
      plan: null,
      status: null,
      premium: false,
      currentPeriodEnd: null,
      checkoutConfigured,
    };
  }

  return {
    plan: data.plan as PlanId,
    status: data.status,
    premium: isActive(data as never),
    currentPeriodEnd: data.current_period_end,
    checkoutConfigured,
  };
}

/**
 * Returns the current billing state for the signed-in user.
 */
export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return readEntitlement(context.userId);
  });

/**
 * Re-reads billing entitlement.
 * Used by "Restore access".
 */
export const restorePremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return readEntitlement(context.userId);
  });

/**
 * Creates a Stripe Checkout Session for the selected plan.
 *
 * Flow:
 *
 * Dashboard pricing card
 *        ↓
 * handleUpgrade("monthly" | "annual" | "lifetime")
 *        ↓
 * startCheckout()
 *        ↓
 * PLANS[plan].priceId
 *        ↓
 * Stripe Checkout Session
 *        ↓
 * Redirect user to Stripe
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { plan: PlanId; origin: string }) => {
    if (!data || !(data.plan in PLANS)) {
      throw new Error("Unknown plan");
    }

    if (!data.origin) {
      throw new Error("Missing application origin");
    }

    return data;
  })
  .handler(async ({ data, context }) => {
    const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];

    if (!stripeSecretKey) {
      return {
        url: null as string | null,
        unavailable: true,
        message:
          "Stripe checkout is not configured. Add STRIPE_SECRET_KEY to the server environment.",
      };
    }

    const plan = PLANS[data.plan];

    if (!plan.priceId) {
      throw new Error(`Stripe Price ID is missing for ${data.plan}`);
    }

    const origin = data.origin.replace(/\/$/, "");

    /**
     * Stripe Checkout supports:
     *
     * recurring plans → mode=subscription
     * lifetime plan   → mode=payment
     */
    const body = new URLSearchParams({
      mode: plan.recurring ? "subscription" : "payment",

      success_url:
        `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${origin}/pricing`,

      client_reference_id: context.userId,

      "line_items[0][quantity]": "1",
      "line_items[0][price]": plan.priceId,

      "metadata[user_id]": context.userId,
      "metadata[plan]": data.plan,
    });

    /**
     * Attach the user and selected plan to recurring
     * Stripe subscriptions as well.
     */
    if (plan.recurring) {
      body.set(
        "subscription_data[metadata][user_id]",
        context.userId,
      );

      body.set(
        "subscription_data[metadata][plan]",
        data.plan,
      );
    }

    /**
     * Passing the authenticated email allows Stripe Checkout
     * to pre-populate the customer's email address.
     */
    const email = (
      context.claims as { email?: string } | undefined
    )?.email;

    if (email) {
      body.set("customer_email", email);
    }

    /**
     * Create the Checkout Session server-side.
     *
     * The Stripe secret key NEVER reaches the browser.
     */
    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    const json = (await response.json()) as {
      id?: string;
      url?: string;
      error?: {
        message?: string;
        type?: string;
        code?: string;
      };
    };

    if (!response.ok || !json.url) {
      throw new Error(
        json.error?.message ??
          `Stripe checkout failed (${response.status})`,
      );
    }

    return {
      url: json.url,
      unavailable: false,
      message: "",
    };
  });

/**
 * Confirms a completed Checkout Session.
 *
 * This acts as a fallback in case the Stripe webhook has not
 * updated the entitlement yet when the user returns to the app.
 */
export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => {
    if (!data.sessionId) {
      throw new Error("Missing session id");
    }

    return data;
  })
  .handler(async ({ data, context }) => {
    const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];

    if (!stripeSecretKey) {
      return readEntitlement(context.userId);
    }

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
        data.sessionId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      },
    );

    const session = (await response.json()) as {
      payment_status?: string;
      status?: string;
      client_reference_id?: string;
      customer?: string;
      subscription?: string;
      id?: string;
      metadata?: Record<string, string>;
    };

    if (!response.ok) {
      throw new Error("Could not verify the checkout session");
    }

    /**
     * Verify that this Checkout Session belongs to
     * the currently authenticated user.
     */
    const owner =
      session.client_reference_id ??
      session.metadata?.["user_id"];

    const paid =
      session.payment_status === "paid" ||
      session.status === "complete";

    if (paid && owner === context.userId) {
      const plan =
        (session.metadata?.["plan"] as PlanId) ??
        "monthly";

      /**
       * Never trust an arbitrary metadata value as a PlanId.
       */
      if (!(plan in PLANS)) {
        throw new Error("Invalid plan in Stripe session metadata");
      }

      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");

      await supabaseAdmin.from("entitlements").upsert(
        {
          user_id: context.userId,

          plan,

          status: "active",

          current_period_end:
            plan === "lifetime"
              ? null
              : new Date(
                  Date.now() +
                    (plan === "annual" ? 366 : 31) *
                      24 *
                      60 *
                      60 *
                      1000,
                ).toISOString(),

          stripe_customer_id:
            session.customer ?? null,

          stripe_subscription_id:
            session.subscription ?? null,

          stripe_session_id:
            session.id ?? data.sessionId,

          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        },
      );
    }

    return readEntitlement(context.userId);
  }); 