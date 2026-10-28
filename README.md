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
