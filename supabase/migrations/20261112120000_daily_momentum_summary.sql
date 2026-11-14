-- ============================================================================
-- 📊 DAILY MOMENTUM SUMMARY
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Daily aggregated telemetry for personal account operators: total focus time,
// focus sessions completed, anchor task completion status, and whether the
// user's first activity of the day fell outside the expected morning window
-- (used for the gentle "reset routine" nudge).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_momentum_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  total_focus_minutes integer NOT NULL DEFAULT 0 CHECK (total_focus_minutes >= 0),
  focus_sessions_completed integer NOT NULL DEFAULT 0 CHECK (focus_sessions_completed >= 0),
  anchor_task_completed boolean NOT NULL DEFAULT false,
  anchor_task_id uuid REFERENCES public.personal_daily_plan(id) ON DELETE SET NULL,
  first_activity_at timestamptz,
  is_momentum_reset_needed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS daily_momentum_summary_user_id_idx
  ON public.daily_momentum_summary (user_id);

-- One row per user per day
CREATE UNIQUE INDEX IF NOT EXISTS daily_momentum_summary_user_date_unique
  ON public.daily_momentum_summary (user_id, summary_date);

-- RLS: each user can only access their own summary
ALTER TABLE public.daily_momentum_summary ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.daily_momentum_summary TO authenticated;
GRANT ALL ON public.daily_momentum_summary TO service_role;

CREATE POLICY "daily_momentum_summary_select_own"
  ON public.daily_momentum_summary
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "daily_momentum_summary_insert_own"
  ON public.daily_momentum_summary
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "daily_momentum_summary_update_own"
  ON public.daily_momentum_summary
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_daily_momentum_summary_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_daily_momentum_summary_updated_at ON public.daily_momentum_summary;
CREATE TRIGGER update_daily_momentum_summary_updated_at
  BEFORE UPDATE ON public.daily_momentum_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_daily_momentum_summary_updated_at();