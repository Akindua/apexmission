
-- ============================================================================
-- 🛡️ HYBRID ONBOARDING + MULTI-TENANT ISOLATION LAYER
-- Layer 2 of 3: Backend Schema
--  - public.companies          -> enterprise tenants (each with a unique invite token)
--  - public.tasks              -> mission tasks with a NULLABLE company_id FK -> companies.id
--  - public.profiles.company_id -> current tenant assignment (NULL = personal account)
-- ============================================================================

-- 🏢 ENTERPRISE TENANT REGISTRY
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 📋 MISSION TASK MATRIX (multi-tenant aware: nullable company scoping)
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_text text NOT NULL,
  impact_tier text NOT NULL CHECK (impact_tier IN ('high', 'medium', 'low')),
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ⚡ Composite index for fast tenant-scoped + owner task lookups
CREATE INDEX IF NOT EXISTS tasks_company_owner_idx
  ON public.tasks (company_id, user_id);

-- 👤 TENANT ASSIGNMENT ON PROFILES (NULL => personal, NOT NULL => corporate)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Personal accounts are tenant-less by default; keep explicit NULLs untouched.
UPDATE public.profiles
SET company_id = NULL
WHERE company_id IS NULL;

-- ============================================================================
-- 🔐 SECURITY LAYER: ROW LEVEL SECURITY POLICIES FOR tasks
-- ============================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

-- 👤 PERSONAL ACCOUNTS (company_id IS NULL): strictly isolated to their OWN tasks.
CREATE POLICY "tasks_select_personal_isolation"
  ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tasks.user_id = auth.uid()
    AND tasks.company_id IS NULL
  );

-- 🏢 CORPORATE ACCOUNTS (company_id IS NOT NULL): strictly filtered to their
--    OWN enterprise tenant via the member <-> company mapping.
CREATE POLICY "tasks_select_corporate_tenant_isolation"
  ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tasks.user_id = auth.uid()
    AND tasks.company_id IS NOT NULL
    AND tasks.company_id = (
      SELECT c.id
      FROM public.companies c
      JOIN public.profiles p ON p.company_id = c.id
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- ✍️ INBOUND TASK CREATION: owner only, and only within a valid tenant context
--    (personal => company_id NULL, corporate => company_id must equal own tenant).
CREATE POLICY "tasks_insert_own_within_tenant"
  ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    tasks.user_id = auth.uid()
    AND (
      tasks.company_id IS NULL
      OR tasks.company_id = (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.company_id = c.id
        WHERE p.id = auth.uid()
        LIMIT 1
      )
    )
  );

-- ✏️ UPDATES: owner-only and tenant-consistent.
CREATE POLICY "tasks_update_own_within_tenant"
  ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    tasks.user_id = auth.uid()
    AND (
      tasks.company_id IS NULL
      OR tasks.company_id = (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.company_id = c.id
        WHERE p.id = auth.uid()
        LIMIT 1
      )
    )
  )
  WITH CHECK (
    tasks.user_id = auth.uid()
    AND (
      tasks.company_id IS NULL
      OR tasks.company_id = (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.company_id = c.id
        WHERE p.id = auth.uid()
        LIMIT 1
      )
    )
  );

-- 🗑️ DELETES: owner-only and tenant-consistent.
CREATE POLICY "tasks_delete_own_within_tenant"
  ON public.tasks
  FOR DELETE TO authenticated
  USING (
    tasks.user_id = auth.uid()
    AND (
      tasks.company_id IS NULL
      OR tasks.company_id = (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.company_id = c.id
        WHERE p.id = auth.uid()
        LIMIT 1
      )
    )
  );

-- 🔒 COMPANIES TABLE: RLS enabled with NO permissive policies, so tenant rows
--    are only ever resolved through the invite-token security functions below.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 🔑 INVITE TOKEN RESOLUTION (SECURITY DEFINER: bypasses RLS, validates token).
CREATE OR REPLACE FUNCTION public.get_company_id_by_invite_token(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.invite_token = p_token
  LIMIT 1;
$$;

-- 🚀 CORPORATE JOIN: resolves + validates the enterprise token and assigns the
--    caller's tenant (moving any personal tasks into the enterprise scope).
CREATE OR REPLACE FUNCTION public.accept_company_invite(p_invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.invite_token = p_invite_token;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  UPDATE public.profiles
  SET company_id = v_company_id,
      updated_at = now()
  WHERE id = auth.uid();

  UPDATE public.tasks
  SET company_id = v_company_id
  WHERE user_id = auth.uid()
    AND company_id IS NULL;

  RETURN v_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_company_id_by_invite_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_id_by_invite_token(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_company_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invite(text) TO authenticated;
