-- ============================================================================
-- 🎬 SHOWCASE DEMO TENANT SEED
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Seeds a pitch-ready demo workspace for `demo.apexmissions.app`:
--   • company: Showcase Demo Corp  (id fixed, slug strictly 'demo')
--   • 4 operator profiles (Operator Alpha…Delta)
--   • 5 completed tasks dated today across the impact tiers
--
-- Security properties:
--   • Fully idempotent — safe to re-run; nothing is duplicated.
--   • Operator accounts are DISPLAY-ONLY: no password (empty hash) and
--     banned_until far future, so nobody can ever authenticate as them.
--   • profiles.email / subscription_tier are never written by this seed's
--     UPDATE step, so the privilege guard trigger stays satisfied.
--   • The showcase itself is served server-side via the service-role client;
--     no anon SELECT grants are added here.
-- ============================================================================

-- 🏢 Fixed-UUID demo tenant. slug is pinned to 'demo' on every run.
INSERT INTO public.companies (id, name, invite_token, slug, created_at)
VALUES (
  '11111111-1111-4111-8111-111111111111'::uuid,
  'Showcase Demo Corp',
  'DEMO-PREVIEW-99',
  'demo',
  now()
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      invite_token = EXCLUDED.invite_token,
      slug = EXCLUDED.slug;

-- 👤 Display-only auth rows (no usable credential, banned from signing in).
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, banned_until,
  raw_app_meta_data, raw_user_meta_data,
  phone, phone_confirmed_at
)
VALUES
  ('22222222-2222-4222-8222-222222222221'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-alpha@showcase-demo.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Alpha"}', null, null),
  ('22222222-2222-4222-8222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-bravo@showcase-demo.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Bravo"}', null, null),
  ('22222222-2222-4222-8222-222222222223'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-charlie@showcase-demo.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Charlie"}', null, null),
  ('22222222-2222-4222-8222-222222222224'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-delta@showcase-demo.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Delta"}', null, null)
ON CONFLICT (id) DO NOTHING;

-- 🎖️ Operator telemetry (created by the handle_new_user trigger above; this
--    upsert only fills demo-friendly values — never privileged columns).
INSERT INTO public.profiles (id, email, full_name, onboarding_completed, credits, current_streak, max_streak, operational_status)
VALUES
  ('22222222-2222-4222-8222-222222222221'::uuid, 'operator-alpha@showcase-demo.invalid',  'Operator Alpha',  true, 1480, 12, 14, 'OPERATIONAL'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'operator-bravo@showcase-demo.invalid',  'Operator Bravo',  true, 1120,  8,  9, 'OPERATIONAL'),
  ('22222222-2222-4222-8222-222222222223'::uuid, 'operator-charlie@showcase-demo.invalid','Operator Charlie',true,  940,  5,  6, 'OPERATIONAL'),
  ('22222222-2222-4222-8222-222222222224'::uuid, 'operator-delta@showcase-demo.invalid',  'Operator Delta',  true,  610,  3,  4, 'STANDBY')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      onboarding_completed = EXCLUDED.onboarding_completed,
      credits = EXCLUDED.credits,
      current_streak = EXCLUDED.current_streak,
      max_streak = EXCLUDED.max_streak,
      operational_status = EXCLUDED.operational_status;

-- ✅ 5 completed tasks "from today", spread across operators and impact tiers.
INSERT INTO public.tasks (id, company_id, user_id, task_text, impact_tier, is_done, created_at, updated_at)
VALUES
  ('33333333-3333-4333-8333-333333333331'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222221'::uuid,
   'Close Q4 enterprise pipeline review with legal', 'high', true,
   date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours'),
  ('33333333-3333-4333-8333-333333333332'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222222'::uuid,
   'Ship onboarding checklist revamp to staging', 'high', true,
   date_trunc('day', now()) + interval '10 hours 30 minutes', date_trunc('day', now()) + interval '10 hours 30 minutes'),
  ('33333333-3333-4333-8333-333333333333'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222221'::uuid,
   'Draft weekly execution report for leadership', 'medium', true,
   date_trunc('day', now()) + interval '12 hours', date_trunc('day', now()) + interval '12 hours'),
  ('33333333-3333-4333-8333-333333333334'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222223'::uuid,
   'Reconcile vendor invoices against PO backlog', 'medium', true,
   date_trunc('day', now()) + interval '13 hours 15 minutes', date_trunc('day', now()) + interval '13 hours 15 minutes'),
  ('33333333-3333-4333-8333-333333333335'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222224'::uuid,
   'Archive completed sprint boards and update wiki', 'low', true,
   date_trunc('day', now()) + interval '15 hours', date_trunc('day', now()) + interval '15 hours')
ON CONFLICT (id) DO UPDATE
  SET task_text = EXCLUDED.task_text,
      impact_tier = EXCLUDED.impact_tier,
      is_done = EXCLUDED.is_done,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      company_id = EXCLUDED.company_id,
      user_id = EXCLUDED.user_id;
