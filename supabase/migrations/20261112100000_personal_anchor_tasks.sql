-- ============================================================================
-- 🎯 PERSONAL DAILY PLAN TASKS
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Tracks each personal account operator's single daily "anchor" task — the
-- single highest-impact objective they commit to for today. RLS ensures one
-- row per user per day, scoped strictly to the individual user (personal
-- account, NOT company-scoped).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.personal_daily_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_text text NOT NULL CHECK (char_length(task_text) > 0 AND char_length(task_text) <= 500),
  tier text NOT NULL DEFAULT 'high' CHECK (tier IN ('high', 'medium', 'low')),
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS personal_daily_plan_user_id_idx
  ON public.personal_daily_plan (user_id);

-- One row per user per day
CREATE UNIQUE INDEX IF NOT EXISTS personal_daily_plan_user_id_unique
  ON public.personal_daily_plan (user_id);

-- RLS: each user can only access their own rows
ALTER TABLE public.personal_daily_plan ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.personal_daily_plan TO authenticated;
GRANT ALL ON public.personal_daily_plan TO service_role;

CREATE POLICY "personal_daily_plan_select_own"
  ON public.personal_daily_plan
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "personal_daily_plan_insert_own"
  ON public.personal_daily_plan
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_daily_plan_update_own"
  ON public.personal_daily_plan
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_personal_daily_plan_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_personal_daily_plan_updated_at ON public.personal_daily_plan;
CREATE TRIGGER update_personal_daily_plan_updated_at
  BEFORE UPDATE ON public.personal_daily_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_personal_daily_plan_updated_at();