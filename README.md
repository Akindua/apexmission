# Mission Control Hub

Build a highly optimized single-page web app called "Mission Control" that helps users prioritize goals and take daily action. Use a clean, modern, dark-mode minimalist interface designed to prevent user distraction.

The dashboard layout must feature these three core sections arranged cleanly on a single screen:

1. THE MISSION CARD (Top): A prominent hero section where users lock in their overarching vision or core focus. Include a dynamic progress bar that calculates the percentage of completed daily items.

2. THE PRIORITY MATRIX (Middle): A three-column grid layout dividing tasks strictly by impact tier: "High Impact" (Red accent), "Medium Impact" (Orange accent), and "Low Impact" (Blue accent). Users should be able to type to quickly add tasks directly into each column.

3. THE DAILY ACTION STEP (Bottom): A hyper-focused section displaying a single, massive task checkbox that resets every 24 hours. Underneath, add an interactive "Daily Streak Counter" tracking consecutive days with a completed task.

Use Tailwind CSS for custom styling, incorporating crisp typography and subtle micro-animations when items are hovered or completed.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0b122175-bc1f-4d10-a3f8-32cf9813004c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Hybrid Onboarding & Multi-Tenant Database

The platform supports two onboarding paths plus an enterprise multi-tenant data model:

### Onboarding Flow (`/onboarding`)

- **Personal Account** — routes straight to the dashboard with `company_id = null` (tenant-less solo operator).
- **Join a Company** — prompts for an enterprise invite token, resolves it via
  `get_company_id_by_invite_token`, binds the tenant via `accept_company_invite`, then routes to the dashboard.

### Database Schema (Supabase migrations)

- `public.companies` — enterprise tenants (`id`, `name`, unique `invite_token`).
- `public.tasks` — mission tasks with **nullable** `company_id` FK → `companies.id` (`user_id` → `auth.users.id`).
- `public.profiles.company_id` — current tenant assignment per user (`NULL` = personal).

### Row-Level Security (tasks)

- Personal accounts (`company_id IS NULL`) can only read/write their **own** tasks.
- Corporate accounts can only read/write tasks whose `company_id` **strictly matches** their enterprise tenant.

### Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## 🔐 Security Architecture

Hardening layers implemented across the stack (see `src/lib/security.server.ts`):

**API layer (`/api/chat`, `/api/mission-plan`, `/api/pdf-plan`, `/api/-welcome-email`)**

- Verified Supabase JWT required on every AI endpoint — none are publicly callable.
- Same-origin enforcement (CSRF / drive-by defense) via `Origin`/`Host` matching.
- Per-user + per-IP sliding-window rate limits (burst and hourly budgets).
- Strict payload validation with length caps; model JSON responses are normalized
  and size-capped before reaching the client.
- Prompt-injection containment: uploaded documents are sanitized, capped, and
  fenced inside explicit untrusted-data delimiters with anti-override directives.
- Webhook endpoints use constant-time shared-secret comparison; error details are
  logged server-side and never echoed to callers.

**Global request middleware (`src/server.ts`)**

- Security headers on every response: HSTS, CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, COOP/CORP, `X-Robots-Tag: noai`.
- Known AI training/scraping crawlers (GPTBot, ClaudeBot, CCBot, PerplexityBot,
  Google-Extended, Bytespider, …) receive `403` on every path.
- Headless automation (Puppeteer, Playwright, curl, wget) is refused on HTML page
  loads; authenticated API clients still work.
- Vulnerability-scanner probe paths (`/.env`, `/.git`, `/wp-admin`, …) are refused.

**Server functions**

- All billing, tenant, and coach server functions run behind `requireSupabaseAuth`;
  the AI coach adds a per-operator hourly budget.
- Stripe checkout URLs are derived from the **actual request origin** (never from
  client input), closing the forged-`origin` redirect hole.

**Persistent rate limiting (Supabase `rate_limits` + `consume_rate_limit` RPC)**

- AI budgets are enforced twice: a fast per-instance in-memory limiter, then a
  shared database limiter that survives deploys/restarts and spans instances.

**Privilege-escalation fixes (migration 20261029140000)**

- `profiles.subscription_tier` / `profiles.email` are **no longer client-writable**
  (column-level `REVOKE UPDATE` + a trigger guard). Previously any signed-in user
  could PATCH their own row to `lifetime` and unlock paid features.
- Gamified counters (`credits`, `beta_points`, streaks…) stay client-managed but
  are clamped to sane bounds; ledger amounts are bounded.

**Bot protection (Cloudflare Turnstile on every auth form)**

- Set `VITE_TURNSTILE_SITE_KEY` (public) and enable **Bot protection** with the
  Turnstile secret under Supabase Auth → Settings in the dashboard. Every auth
  surface — sign-in, sign-up, forgot-password, and password reset — then
  requires a live human-verification token (single-use, re-challenged after
  each attempt).
- Password policy: 8–128 chars, breach-list blocklist, cannot equal email.

**Passwordless sign-in (WebAuthn passkeys)**

- The sign-in console offers "Sign in with passkey" (`supabase.auth.signInWithPasskey`).
  Phishing-resistant hardware/device-key authentication with no shared secret.
  Enable **WebAuthn** under Supabase Auth → Settings; until then the button
  surfaces a clear configuration error and password sign-in keeps working.

**Dependency hygiene**

- `npm audit` maintained: critical DOMPurify XSS bypass, seroval code injection,
  and undici advisories patched. Remaining known items: `katex` (no upstream fix;
  renders math client-side only) and `zod@3` (fix requires a breaking v4 major).

**Database (Supabase migrations)**

- Row-Level Security on every table with tenant-scoped policies; `anon` table
  privileges revoked (deny-by-default); SECURITY DEFINER RPCs are
  authenticated-only with locked `search_path`.

**Client**

- Text-field hard caps (mission 500, task 300, daily action 300 chars, 25 tasks
  per tier); minimum 8-character passwords.

## © Copyright & Intellectual Property

Copyright (c) 2026 ApexMissions. All rights reserved — see [`LICENSE`](./LICENSE).

- The source code is **proprietary and unlicensed** (`"license": "UNLICENSED"`).
  No right to copy, clone, scrape, reverse-engineer, or train models on this
  software or its output is granted.
- `robots.txt` + server-side UA screening prohibit AI crawlers and bulk scrapers.
- Every page ships `copyright` and `robots: noai` meta tags, plus an in-app
  copyright footer on the auth console and dashboard.

## 🎬 Showcase Demo Tenant (`demo.apexmissions.app`)

A pitch-ready, read-only workspace for live sales walkthroughs:

- **Seed**: `supabase/migrations/20261029150000_showcase_demo_seed.sql` creates
  the `Showcase Demo Corp` tenant (fixed UUID, `slug = 'demo'`, invite code
  `DEMO-PREVIEW-99`), 4 display-only operators (Operator Alpha…Delta), and 5
  completed tasks dated today across all impact tiers.
- **Routing**: requests to `demo.<root-domain>` are rewritten server-side
  (`withDemoShowcaseRewrite` in `src/lib/tenant-host.ts`) to the public
  `/demo` showcase route — the live team grid renders immediately, no login.
- **Security**: the showcase reads exclusively through the service-role client
  (`getDemoShowcase`) with strict slug validation; no anon REST grants are
  added. Seeded operator accounts can never authenticate (empty password hash +
  `banned_until = '2999-12-31'`). The route is `noindex, nofollow, noai` and
  disallowed in `robots.txt`.
- **Hosting**: point the `demo` subdomain (CNAME/redirect) at the same
  deployment as `www`. Apply migrations via Lovable sync or `supabase db push`.
- **Server env vars**: `demo.apexmissions.app` renders via `supabaseAdmin`
  (service role). Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your
  Lovable / Vercel environment variables — without them the showcase route
  renders a clear "dataset not configured" page instead of crashing. See
  `.env.example`.
