-- ============================================================================
-- 💳 ENTERPRISE PILOT LICENSE GATE
-- Layer: workspace access control
--  - public.companies.is_contract_paid   -> enterprise license activated
--  - public.companies.trial_started_at   -> start of the 14-day pilot window
--  - public.get_workspace_access_status() -> caller-scoped billing gate
--
-- ⚠️ OPERATIONS: before applying this in production, set
--    is_contract_paid = true for every tenant that already has a signed
--    enterprise contract. Otherwise its pilot is treated as concluded.
-- ============================================================================

-- 🏢 LICENSE FIELDS
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_contract_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- Existing tenants are measured from the moment their workspace was created.
-- New tenants inherit now() from the column default below.
UPDATE public.companies
SET trial_started_at = created_at
WHERE trial_started_at IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN trial_started_at SET DEFAULT now();

ALTER TABLE public.companies
  ALTER COLUMN trial_started_at SET NOT NULL;

COMMENT ON COLUMN public.companies.is_contract_paid IS
  'True once the enterprise license has been activated.';
COMMENT ON COLUMN public.companies.trial_started_at IS
  'Start of the 14-day pilot window. Access is blocked only after this is more than 14 days in the past.';

CREATE INDEX IF NOT EXISTS companies_contract_status_idx
  ON public.companies (is_contract_paid, trial_started_at);

-- ----------------------------------------------------------------------------
-- 🔐 CALLER-SCOPED ACCESS STATUS
-- Security definer because public.companies is RLS-locked with no policies.
-- Returns only billing fields for the caller's own workspace; invite tokens
-- and other tenant rows are never exposed. The comparison is strictly > 14
-- days, so the boundary moment itself is still allowed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_access_status()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_slug text,
  is_contract_paid boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  is_pilot_expired boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.slug AS company_slug,
    c.is_contract_paid,
    c.trial_started_at,
    c.trial_started_at + interval '14 days' AS trial_ends_at,
    (
      NOT c.is_contract_paid
      AND now() - c.trial_started_at > interval '14 days'
    ) AS is_pilot_expired
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_access_status() TO authenticated;

-- ----------------------------------------------------------------------------
-- 🛡️ WORKSPACE MEMBERSHIP TAMPER PROTECTION
-- profiles.company_id is a security boundary: a corporate operator could
-- otherwise clear it from the browser, become "personal", and bypass the
-- license gate entirely. Only privileged connections and SECURITY DEFINER
-- flows (accept_company_invite) may assign or change it. The personal
-- onboarding NULL -> NULL write is a no-op and remains allowed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_company_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  privileged boolean :=
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR coalesce(auth.role(), '') = 'service_role';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NOT NULL AND NOT privileged THEN
      RAISE EXCEPTION 'Workspace membership can only be assigned through the invite flow.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.company_id IS DISTINCT FROM OLD.company_id AND NOT privileged THEN
    RAISE EXCEPTION 'Workspace membership can only be changed through the invite flow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_company_assignment ON public.profiles;

CREATE TRIGGER guard_profile_company_assignment
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_company_assignment();

REVOKE ALL ON FUNCTION public.guard_profile_company_assignment() FROM PUBLIC, anon, authenticated;
