import { serve } from "https://deno.land";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Captured auth event signal webhook payload:", payload);

    const { record } = payload;
    if (!record || !record.id) {
      return new Response("Invalid trigger row payload parameter mapping.", { status: 400 });
    }

    // 🧠 PREMIUM MONOCHROMATIC COCKPIT WELCOME EMAIL PAYLOAD
    const htmlEmailTemplate = `
      <!DOCTYPE html>
      <html>
      <body style="background-color: #000000; color: #d4d4d8; font-family: monospace; padding: 40px 20px; margin: 0;">
        <table align="center" width="100%" style="max-width: 500px; margin: 0 auto; border: 1px solid #27272a; background-color: #0d0d11; border-radius: 12px; padding: 32px;">
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #18181b;">
              <span style="font-size: 14px; font-weight: 900; letter-spacing: 0.25em; color: #ffffff; text-transform: uppercase;">ApexMission</span><br>
              <span style="font-size: 9px; font-weight: bold; color: #10b981; text-transform: uppercase; letter-spacing: 0.15em;">Onboarding Matrix Initialized</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; padding-bottom: 24px; font-size: 13px; line-height: 1.6; color: #a1a1aa;">
              Welcome to the Console Loop, Operator <strong>\${record.full_name || "New User"}</strong>.<br><br>
              Your profile node database rows are successfully verified and synchronized. Your 24/7 Socratic AI Performance Mentor panel is armed, and daily timeline cutoff clocks are actively running.<br><br>
              Stop planning. Lock in parameters. Force absolute mission execution starting today.
            </td>
          </tr>
          <tr>
            <td style="padding-top: 16px; border-top: 1px solid #18181b; font-size: 10px; color: #52525b; text-align: center;">
              ApexMission © 2026 Operational Command Deck System
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const mailResponse = await fetch("https://resend.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer \${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ApexMission Command <onboarding@resend.dev>",
        to: [record.email || "25wp@queensu.ca"],
        subject: "🔒 OPERATIONAL DIRECTIVE: Launch Your Command Console Matrix",
        html: htmlEmailTemplate,
      }),
    });

    const mailResult = await mailResponse.json();
    return new Response(JSON.stringify({ status: "Success", mailResult }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
