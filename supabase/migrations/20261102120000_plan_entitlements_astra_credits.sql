-- ============================================================================
-- 📋 PLAN ENTITLEMENTS + AI CREDITS
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Stores plan entitlements for personal (user_id) and enterprise (company_id) accounts.
-- RLS: users read only their own row, company members read only their company's row.
-- NO client writes. All writes happen server-side (service role).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entitlements (
  -- Either user_id OR company_id is set (exclusive)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  plan text NOT NULL CHECK (plan IN ('standard', 'lifetime', 'astra_elite', 'company_core')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),

  -- Astra credits (only used when plan allows Astra)
  astra_credits_balance integer NOT NULL DEFAULT 0,
  credits_reset_at timestamptz,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT entitlements_one_owner CHECK (
    (user_id IS NOT NULL AND company_id IS NULL) OR
    (user_id IS NULL AND company_id IS NOT NULL)
  ),
  CONSTRAINT entitlements_personal_plan CHECK (
    user_id IS NULL OR plan IN ('standard', 'lifetime', 'astra_elite')
  ),
  CONSTRAINT entitlements_company_plan CHECK (
    company_id IS NULL OR plan IN ('company_core')
  ),
  CONSTRAINT entitlements_credits_nonneg CHECK (astra_credits_balance >= 0),

  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS entitlements_company_id_idx ON public.entitlements (company_id);
CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON public.entitlements (user_id);

-- RLS
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

-- Personal: user reads their own row
DROP POLICY IF EXISTS "Users can view their own entitlement" ON public.entitlements;
CREATE POLICY "Users can view their own entitlement"
  ON public.entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Company: member reads their company's row
DROP POLICY IF EXISTS "Company members can view their company entitlement" ON public.entitlements;
CREATE POLICY "Company members can view their company entitlement"
  ON public.entitlements
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- NO INSERT/UPDATE/DELETE policies for authenticated users
-- All writes go through service_role (server-side only)

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_entitlements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_entitlements_updated_at ON public.entitlements;
CREATE TRIGGER update_entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_entitlements_updated_at();

-- ============================================================================
-- 📉 ATOMIC ASTRA CREDITS DECREMENT
-- Only callable by service_role. Atomically decrements credits with check.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_astra_credits(
  p_owner_id uuid,
  p_is_personal boolean,
  p_amount integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_balance integer;
  v_column text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_column := CASE WHEN p_is_personal THEN 'user_id' ELSE 'company_id' END;

  UPDATE public.entitlements
  SET astra_credits_balance = astra_credits_balance - p_amount,
      updated_at = now()
  WHERE (p_is_personal AND user_id = p_owner_id)
     OR (NOT p_is_personal AND company_id = p_owner_id)
    AND astra_credits_balance >= p_amount
    AND status = 'active'
    AND (
      (p_is_personal AND plan = 'astra_elite')
      OR (NOT p_is_personal AND plan = 'company_core')
    )
  RETURNING astra_credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits, wrong plan, or inactive status';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_astra_credits(uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_astra_credits(uuid, boolean, integer) TO service_role;