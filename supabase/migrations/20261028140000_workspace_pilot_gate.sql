-- ============================================================================
-- 💳 ENTERPRISE PILOT LICENSE GATE — STEP 1 OF 2: LICENSE FIELDS
-- Layer: workspace access control
--  - public.companies.is_contract_paid   -> enterprise license activated
--  - public.companies.trial_started_at   -> start of the 14-day pilot window
--
-- ⚠️ DEPLOYMENT ORDER
--   1. Apply this file.
--   2. Review every existing tenant and mark the ones with a signed contract:
--        UPDATE public.companies
--        SET is_contract_paid = true
--        WHERE id IN (...signed contract tenant ids...);
--      Any tenant left unpaid whose trial_started_at is more than 14 days in
--      the past will be locked out as soon as step 2 is applied.
--   3. Apply 20261028140100_workspace_pilot_gate_enforcement.sql.
--
--   Both files are idempotent. Until step 3 runs, no routing gate is active.
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
