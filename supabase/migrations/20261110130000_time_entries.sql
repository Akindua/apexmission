-- ============================================================================
-- ⏱️ TIME ENTRIES (Enterprise Time Tracking)
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Tracks billable hours for enterprise operators. All records are tenant-scoped
-- via company_id FK to enforce row-level isolation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  hours_worked numeric NOT NULL CHECK (hours_worked > 0 AND hours_worked <= 24),
  description text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index for fast tenant-scoped + owner lookups
CREATE INDEX IF NOT EXISTS time_entries_company_user_idx
  ON public.time_entries (company_id, user_id);
CREATE INDEX IF NOT EXISTS time_entries_task_idx
  ON public.time_entries (task_id);
CREATE INDEX IF NOT EXISTS time_entries_project_idx
  ON public.time_entries (project_id);

-- RLS: tenant-scoped isolation
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

-- Enterprise members can only read/write their own company's time entries
DROP POLICY IF EXISTS "time_entries_select_tenant_isolation" ON public.time_entries;
CREATE POLICY "time_entries_select_tenant_isolation"
  ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- Users can only insert time entries for themselves within their company
DROP POLICY IF EXISTS "time_entries_insert_own_within_tenant" ON public.time_entries;
CREATE POLICY "time_entries_insert_own_within_tenant"
  ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_time_entries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_time_entries_updated_at ON public.time_entries;
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_time_entries_updated_at();