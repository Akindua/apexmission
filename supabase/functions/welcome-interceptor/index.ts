// welcome-interceptor — Supabase welcome-email function.
//
// 🔒 SECURITY HARDENING (this function previously had NO authentication and
// was callable by anyone who knew the URL — an open relay burning the Resend
// key and domain reputation):
//  - rejects non-POST methods
//  - requires a Bearer SUPABASE_WEBHOOK_SECRET shared secret (constant-time compare)
//  - validates + caps the payload (email format, name length)
//  - HTML-escapes interpolated values (no markup injection into the email)
//  - rate limits by client IP (per-instance memory)
//  - returns generic errors; provider details stay in the server log only
//
// Copyright (c) 2026 ApexMissions. All rights reserved.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("SUPABASE_WEBHOOK_SECRET");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_CHARS = 60;

// --- tiny in-memory rate limiter (per instance) -----------------------------
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Constant-time shared-secret comparison.
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Shared-secret gate — only the trusted caller (Supabase Auth hook) may send.
  if (!WEBHOOK_SECRET) {
    console.error("[welcome-interceptor] SUPABASE_WEBHOOK_SECRET is not configured");
    return json({ error: "Not configured" }, 503);
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !safeCompare(token, WEBHOOK_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";
  if (!rateLimit(`welcome:${clientIp}`, 10, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  let email = "";
  let firstName = "there";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim() : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    if (fullName) firstName = fullName.split(/\s+/)[0] ?? "there";
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (firstName.length > MAX_NAME_CHARS) {
    firstName = firstName.slice(0, MAX_NAME_CHARS);
  }

  if (!RESEND_API_KEY) {
    console.error("[welcome-interceptor] RESEND_API_KEY is not configured");
    return json({ error: "Not configured" }, 503);
  }

  const safeName = escapeHtml(firstName);

  try {
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
            <p>Hey ${safeName},</p>

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

            <p style="font-size: 11px; color: #888;">
              © 2026 ApexMissions. All rights reserved.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      // Provider details stay server-side only.
      console.error("[welcome-interceptor] Resend API error:", res.status, await res.text());
      return json({ error: "Email delivery failed" }, 502);
    }

    return json({ success: true });
  } catch (error) {
    console.error("[welcome-interceptor] send failed:", error);
    return json({ error: "Email delivery failed" }, 500);
  }
});
