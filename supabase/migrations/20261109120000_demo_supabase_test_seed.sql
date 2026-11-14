-- ============================================================================
-- 🎬 DEMO SUPABASE TEST TENANT SEED (DEV ONLY)
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Seeds a demo enterprise workspace for development and preview:
--   • company: Demo Supabase Test  (id fixed, slug strictly 'demo-supabase-test')
--   • 4 operator profiles (Alpha, Bravo, Charlie, Delta)
--   • 5 completed tasks across impact tiers
--
-- SECURITY: This is a DEV-ONLY seed. Do NOT apply to production databases.
-- ============================================================================

-- 🏢 Fixed-UUID demo tenant
INSERT INTO public.companies (id, name, invite_token, slug, created_at)
VALUES (
  '33333333-3333-4333-8333-333333333333'::uuid,
  'Demo Supabase Test',
  'DS-TEST-2026-SEED',
  'demo-supabase-test',
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
  ('44444444-4444-4444-8444-444444444441'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-alpha@demo-supabase-test.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Alpha"}', null, null),
  ('44444444-4444-4444-8444-444444444442'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-bravo@demo-supabase-test.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Bravo"}', null, null),
  ('44444444-4444-4444-8444-444444444443'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-charlie@demo-supabase-test.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Charlie"}', null, null),
  ('44444444-4444-4444-8444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'operator-delta@demo-supabase-test.invalid', '', now(), now(), now(), '2999-12-31T00:00:00Z'::timestamptz,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Operator Delta"}', null, null)
ON CONFLICT (id) DO NOTHING;

-- 🎖️ Operator telemetry profiles
INSERT INTO public.profiles (id, email, full_name, onboarding_completed, credits, current_streak, max_streak, failure_count, operational_status, last_action_logged, company_id)
VALUES
  ('44444444-4444-4444-8444-444444444441'::uuid, 'operator-alpha@demo-supabase-test.invalid', 'Operator Alpha', true, 1480, 12, 14, 0, 'OPERATIONAL', now(), '33333333-3333-4333-8333-333333333333'::uuid),
  ('44444444-4444-4444-8444-444444444442'::uuid, 'operator-bravo@demo-supabase-test.invalid', 'Operator Bravo', true, 1120, 8, 9, 0, 'OPERATIONAL', now(), '33333333-3333-4333-8333-333333333333'::uuid),
  ('44444444-4444-4444-8444-444444444443'::uuid, 'operator-charlie@demo-supabase-test.invalid', 'Operator Charlie', true, 940, 5, 6, 1, 'OPERATIONAL', now(), '33333333-3333-4333-8333-333333333333'::uuid),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'operator-delta@demo-supabase-test.invalid', 'Operator Delta', true, 610, 3, 4, 2, 'STANDBY', now(), '33333333-3333-4333-8333-333333333333'::uuid)
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      onboarding_completed = EXCLUDED.onboarding_completed,
      credits = EXCLUDED.credits,
      current_streak = EXCLUDED.current_streak,
      max_streak = EXCLUDED.max_streak,
      failure_count = EXCLUDED.failure_count,
      operational_status = EXCLUDED.operational_status,
      last_action_logged = EXCLUDED.last_action_logged,
      company_id = EXCLUDED.company_id;

-- ✅ 5 completed tasks from today, spread across operators and impact tiers.
INSERT INTO public.tasks (id, company_id, user_id, task_text, impact_tier, is_done, created_at, updated_at)
VALUES
  ('55555555-5555-4555-8555-555555555551'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
   '44444444-4444-4444-8444-444444444441'::uuid,
   'Close Q4 enterprise pipeline review with legal', 'high', true,
   date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours'),
  ('55555555-5555-4555-8555-555555555552'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
   '44444444-4444-4444-8444-444444444442'::uuid,
   'Ship onboarding checklist revamp to staging', 'high', true,
   date_trunc('day', now()) + interval '10 hours 30 minutes', date_trunc('day', now()) + interval '10 hours 30 minutes'),
  ('55555555-5555-4555-8555-555555555553'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
   '44444444-4444-4444-8444-444444444441'::uuid,
   'Draft weekly executive leadership report', 'medium', true,
   date_trunc('day', now()) + interval '12 hours', date_trunc('day', now()) + interval '12 hours'),
  ('55555555-5555-4555-8555-555555555554'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
   '44444444-4444-4444-8444-444444444443'::uuid,
   'Reconcile vendor invoices against PO backlog', 'medium', true,
   date_trunc('day', now()) + interval '13 hours 15 minutes', date_trunc('day', now()) + interval '13 hours 15 minutes'),
  ('55555555-5555-4555-8555-555555555555'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
   '44444444-4444-4444-8444-444444444444'::uuid,
   'Archive sprint boards and update internal wiki', 'low', true,
   date_trunc('day', now()) + interval '15 hours', date_trunc('day', now()) + interval '15 hours')
ON CONFLICT (id) DO UPDATE
  SET task_text = EXCLUDED.task_text,
      impact_tier = EXCLUDED.impact_tier,
      is_done = EXCLUDED.is_done,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      company_id = EXCLUDED.company_id,
      user_id = EXCLUDED.user_id;

-- 📋 Enterprise current_plan snapshots for demo operators
INSERT INTO public.profiles (id, current_plan, plan_date)
VALUES
  ('44444444-4444-4444-8444-444444444441'::uuid,
   '{"high":[{"text":"Finalize Q4 partnership terms","done":false},{"text":"Review hiring plan","done":true}],"medium":[{"text":"Prepare board pre-read","done":false}],"low":[]}'::jsonb,
   now()),
  ('44444444-4444-4444-8444-444444444442'::uuid,
   '{"high":[{"text":"Ship billing migration","done":false},{"text":"Close security review","done":false}],"medium":[{"text":"Draft launch checklist","done":false}],"low":[{"text":"Update runbook","done":true}]}'::jsonb,
   now()),
  ('44444444-4444-4444-8444-444444444443'::uuid,
   '{"high":[{"text":"Resolve customer escalation","done":false}],"medium":[{"text":"Draft weekly leadership report","done":false}],"low":[]}'::jsonb,
   now()),
  ('44444444-4444-4444-8444-444444444444'::uuid,
   '{"high":[{"text":"Unblock vendor contract","done":false},{"text":"Recover missed sprint scope","done":false},{"text":"Escalate API outage","done":false}],"medium":[{"text":"Reconcile backlog","done":false}],"low":[]}'::jsonb,
   now())
ON CONFLICT (id) DO UPDATE
  SET current_plan = EXCLUDED.current_plan,
      plan_date = EXCLUDED.plan_date;

-- 🔑 Entitlements for demo tenant (company_core plan with Astra credits)
INSERT INTO public.entitlements (user_id, company_id, plan, status, astra_credits_balance, credits_reset_at)
VALUES
  (NULL, '33333333-3333-4333-8333-333333333333'::uuid, 'company_core', 'active', 500, now() + interval '30 days')
ON CONFLICT DO NOTHING;