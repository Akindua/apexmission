-- ============================================================================
-- 🔐 PRIVILEGE LOCKDOWN: ALL TABLES
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Supabase grants anon and authenticated ALL privileges on new tables in
-- public by default. This migration explicitly REVOKEs ALL from anon and
-- authenticated on every table our migrations created, then GRANTs only what
-- the app truly needs. service_role retains full access.
--
-- Tables covered:
--   profiles, companies, tasks, points_ledger, entitlements,
--   push_subscriptions, handoff_codes, rate_limit_buckets, daily_task_logs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) DROP any overly-permissive policies on profiles
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or same company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Recreate the single permissive SELECT policy for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- "Users can update their own profile" already exists from migration
-- 20260923015030 and is not dropped above, so it remains in effect.

-- ----------------------------------------------------------------------------
-- 2) REVOKE ALL from anon and authenticated on every table
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.profiles      FROM anon, authenticated;
REVOKE ALL ON public.companies     FROM anon, authenticated;
REVOKE ALL ON public.tasks         FROM anon, authenticated;
REVOKE ALL ON public.points_ledger FROM anon, authenticated;
REVOKE ALL ON public.entitlements  FROM anon, authenticated;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.handoff_codes FROM anon, authenticated;
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.daily_task_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.daily_task_logs FROM anon, authenticated';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) GRANT only what the app truly needs (RLS limits rows to owner)
-- ----------------------------------------------------------------------------

-- profiles: SELECT own row only (19 columns, no created_at);
-- UPDATE only user-editable columns (no email)
GRANT SELECT (
  id, full_name, company_id, subscription_tier, onboarding_completed,
  credits, beta_points, current_streak, max_streak, failure_count,
  operational_status, last_action_logged, unlocked_layouts, task_history,
  velocity_score, current_plan, plan_date, updated_at
) ON public.profiles TO authenticated;

GRANT UPDATE (
  full_name, onboarding_completed, current_plan, plan_date, task_history
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- companies: NO direct client access (only via SECURITY DEFINER RPCs)
GRANT ALL ON public.companies TO service_role;

-- tasks: users manage their own tasks within their tenant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

-- points_ledger: SELECT own rows only; NO client INSERT
GRANT SELECT (id, profile_id, amount_changed, transaction_reason, created_at)
  ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;

-- entitlements: users read only (writes server-side only)
GRANT SELECT (user_id, company_id, plan, status, astra_credits_balance, credits_reset_at,
              created_at, updated_at)
  ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

-- push_subscriptions: owner-only RLS (keep existing grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- handoff_codes: NO client grants at all (accessed only via SECURITY DEFINER RPCs)
GRANT ALL ON public.handoff_codes TO service_role;

-- rate_limit_buckets: NO direct client access (only via SECURITY DEFINER RPC)
GRANT ALL ON public.rate_limit_buckets TO service_role;

DO $$
BEGIN
  IF to_regclass('public.daily_task_logs') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.daily_task_logs TO authenticated';
    EXECUTE 'GRANT ALL ON public.daily_task_logs TO service_role';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) SECURITY DEFINER function: cross-profile reads (display-safe columns,
--    scoped to caller's own company). Used by leaderboards, team lists, etc.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  company_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.full_name, p.company_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
     OR p.company_id = (
       SELECT caller.company_id
       FROM public.profiles caller
       WHERE caller.id = auth.uid()
         AND caller.company_id IS NOT NULL
       LIMIT 1
     )
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) BEFORE UPDATE trigger on profiles: reject changes to server-owned
--    columns unless the caller is anon or authenticated (service_role writes
--    bypass this guard because current_user = 'service_role').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- current_user is 'service_role' for server-side writes; those bypass.
  -- anon and authenticated are blocked from changing server-owned columns.
  IF current_user IN ('anon', 'authenticated') THEN
    IF OLD.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'company_id is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier THEN
      RAISE EXCEPTION 'subscription_tier is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.credits IS DISTINCT FROM NEW.credits THEN
      RAISE EXCEPTION 'credits is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.beta_points IS DISTINCT FROM NEW.beta_points THEN
      RAISE EXCEPTION 'beta_points is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.current_streak IS DISTINCT FROM NEW.current_streak THEN
      RAISE EXCEPTION 'current_streak is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.max_streak IS DISTINCT FROM NEW.max_streak THEN
      RAISE EXCEPTION 'max_streak is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.failure_count IS DISTINCT FROM NEW.failure_count THEN
      RAISE EXCEPTION 'failure_count is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.operational_status IS DISTINCT FROM NEW.operational_status THEN
      RAISE EXCEPTION 'operational_status is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.last_action_logged IS DISTINCT FROM NEW.last_action_logged THEN
      RAISE EXCEPTION 'last_action_logged is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.unlocked_layouts IS DISTINCT FROM NEW.unlocked_layouts THEN
      RAISE EXCEPTION 'unlocked_layouts is server-owned and cannot be changed by clients';
    END IF;
    IF OLD.velocity_score IS DISTINCT FROM NEW.velocity_score THEN
      RAISE EXCEPTION 'velocity_score is server-owned and cannot be changed by clients';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_update_guard ON public.profiles;
CREATE TRIGGER profiles_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_update_guard();

-- ----------------------------------------------------------------------------
-- 5.5) SECURITY DEFINER RPCs for server-owned profile writes
-- Clients must call these instead of updating profiles directly.
-- ----------------------------------------------------------------------------

-- Adjust credits (used by penalties, rewards, store debits)
CREATE OR REPLACE FUNCTION public.adjust_profile_credits(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE public.profiles
  SET credits = greatest(0, credits + p_amount),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_profile_credits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_profile_credits(uuid, integer) TO authenticated;

-- Change company assignment (used by onboarding/invite acceptance)
CREATE OR REPLACE FUNCTION public.assign_profile_company(p_user_id uuid, p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_company uuid;
BEGIN
  SELECT company_id INTO v_old_company
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  UPDATE public.profiles
  SET company_id = p_company_id,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING company_id INTO v_old_company;

  RETURN p_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_profile_company(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_profile_company(uuid, uuid) TO authenticated;

-- Adjust beta_points (used by hardware terminal store)
CREATE OR REPLACE FUNCTION public.adjust_profile_beta_points(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE public.profiles
  SET beta_points = greatest(0, beta_points + p_amount),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING beta_points INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_profile_beta_points(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_profile_beta_points(uuid, integer) TO authenticated;

-- Update unlocked_layouts (used by hardware terminal store)
CREATE OR REPLACE FUNCTION public.update_profile_unlocked_layouts(p_user_id uuid, p_layouts text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET unlocked_layouts = p_layouts,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_profile_unlocked_layouts(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile_unlocked_layouts(uuid, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) ALTER DEFAULT PRIVILEGES so new tables in public are not granted to
--    anon/authenticated by default (defense in depth for future migrations)
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) Confirm RLS is enabled on every table
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.daily_task_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.daily_task_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;