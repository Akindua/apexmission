-- ============================================================================
-- 📄 CLIENT PORTAL TABLES
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Creates tables for client portal document and deliverable management.
-- Tables are tenant-scoped via company_id for RLS enforcement.
-- ============================================================================

-- 📄 CLIENT DOCUMENTS - Documents shared with clients via portal
CREATE TABLE IF NOT EXISTS public.client_portal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 📋 DELIVERABLES - Deliverable items shared with clients via portal
CREATE TABLE IF NOT EXISTS public.client_portal_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 💬 TASK COMMENTS - Comments on tasks with internal_only flag
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  internal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ⏱️ TIME ENTRIES - Time tracking for tasks
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  hours_worked numeric NOT NULL CHECK (hours_worked > 0 AND hours_worked <= 24),
  description text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── RLS POLICIES ──
ALTER TABLE public.client_portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.client_portal_documents TO authenticated;
GRANT SELECT, INSERT ON public.client_portal_deliverables TO authenticated;
GRANT SELECT, INSERT ON public.task_comments TO authenticated;
GRANT SELECT, INSERT ON public.time_entries TO authenticated;
GRANT ALL ON public.client_portal_documents TO service_role;
GRANT ALL ON public.client_portal_deliverables TO service_role;
GRANT ALL ON public.task_comments TO service_role;
GRANT ALL ON public.time_entries TO service_role;

-- Client portal documents: users can see documents from their own company
CREATE POLICY "client_portal_documents_select_tenant_isolation"
  ON public.client_portal_documents
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- Users can insert documents for their own company
CREATE POLICY "client_portal_documents_insert_own_tenant"
  ON public.client_portal_documents
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

-- Client portal deliverables: users can see deliverables from their own company
CREATE POLICY "client_portal_deliverables_select_tenant_isolation"
  ON public.client_portal_deliverables
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );

-- Users can insert deliverables for their own company
CREATE POLICY "client_portal_deliverables_insert_own_tenant"
  ON public.client_portal_deliverables
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

-- Task comments: users can see comments from their own company, excluding internal_only unless they're the author
CREATE POLICY "task_comments_select_tenant_isolation"
  ON public.task_comments
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
    AND (
      internal_only = false
      OR user_id = auth.uid()
    )
  );

-- Users can insert task comments for their own company
CREATE POLICY "task_comments_insert_own_tenant"
  ON public.task_comments
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

-- Time entries: users can see time entries from their own company
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

-- Users can insert time entries for their own company
CREATE POLICY "time_entries_insert_own_tenant"
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