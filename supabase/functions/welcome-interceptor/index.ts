import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

serve(async (req) => {
  try {
    const { email, full_name } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
      });
    }

    const firstName = full_name?.split(" ")[0] || "there";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ApexMission <noreply@apexmissions.app>",
        to: [email],
        subject: "You’re in. Time to execute.",
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
            <p>Hey ${firstName},</p>

            <p>Welcome to <strong>ApexMission</strong>.</p>

            <p>This isn’t another app that helps you make pretty plans.<br>
            It’s built for people who are done negotiating with themselves.</p>

            <p><strong>Your only mission right now:</strong></p>

            <p style="font-size: 18px; font-weight: 600;">
              Set one Master Focus Action today and complete it before midnight.
            </p>

            <p>Do that, and you start building real momentum.<br>
            Skip it, and the streak dies. That’s the point.</p>

            <p>Open the app and lock it in.</p>

            <p>I’ll be here.<br>
            Akindu<br>
            Founder, ApexMission</p>
          </div>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});