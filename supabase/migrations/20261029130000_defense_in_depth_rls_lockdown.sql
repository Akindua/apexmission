-- ============================================================================
-- 🛡️ DEFENSE-IN-DEPTH: ANON ROLE LOCKDOWN + FUNCTION EXECUTE RE-ASSERTION
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- NOTE: FORCE ROW LEVEL SECURITY was evaluated for this hardening pass and
-- deliberately NOT applied. The signup path depends on SECURITY DEFINER
-- functions owned by the table owner (handle_new_user, sync_subscription_tier)
-- that insert into public.profiles; FORCE would subject the owner to the
-- authenticated-only policies and break account creation. RLS already covers
-- all non-owner roles, and service_role retains its intended BYPASSRLS path.
-- ============================================================================

-- ============================================================================
-- 🔒 ANON LOCKDOWN
-- RLS already returns zero rows to anon on these tables (no anon policies
-- exist). Revoking the underlying table privileges adds a second, explicit
-- denial layer so a future accidental `CREATE POLICY ... TO anon` cannot
-- silently expose user data to unauthenticated API traffic.
-- ============================================================================
REVOKE ALL ON public.profiles      FROM anon;
REVOKE ALL ON public.entitlements  FROM anon;
REVOKE ALL ON public.tasks         FROM anon;
REVOKE ALL ON public.companies     FROM anon;
REVOKE ALL ON public.points_ledger FROM anon;

-- daily_task_logs may exist only on deployments created after this migration
-- was first published. Guard so the migration never aborts on a missing table.
DO $$
BEGIN
  IF to_regclass('public.daily_task_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.daily_task_logs FROM anon';
  END IF;
END $$;

-- ============================================================================
-- 🔑 SECURITY DEFINER RPCs: re-assert authenticated-only execution
-- (defense-in-depth in case a later migration re-granted PUBLIC/anon execute)
-- ============================================================================
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_company_id_by_invite_token(text)',
    'public.accept_company_invite(text)',
    'public.resolve_session_tenant(text)',
    'public.get_operator_leaderboard()',
    'public.get_workspace_access_status()'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXCEPTION WHEN undefined_function THEN
      -- Function not present in this project stage; skip silently.
      NULL;
    END;
  END LOOP;
END $$;
