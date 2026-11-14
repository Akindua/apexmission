-- ============================================================================
-- ⏱️ PERSONAL FOCUS SESSIONS
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Tracks individual focus sessions (Pomodoro-style: 25-min focus + 5-min break)
-- completed by personal account users. Each row is scoped to the user's own
-- account — no cross-tenant access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.personal_focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_minutes integer NOT NULL DEFAULT 25 CHECK (planned_minutes > 0 AND planned_minutes <= 120),
  actual_minutes integer NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
  completed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast per-user lookups
CREATE INDEX IF NOT EXISTS personal_focus_sessions_user_id_idx
  ON public.personal_focus_sessions (user_id);
CREATE INDEX IF NOT EXISTS personal_focus_sessions_date_idx
  ON public.personal_focus_sessions (created_at DESC);

-- RLS: each user can only access their own sessions
ALTER TABLE public.personal_focus_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.personal_focus_sessions TO authenticated;
GRANT ALL ON public.personal_focus_sessions TO service_role;

CREATE POLICY "personal_focus_sessions_select_own"
  ON public.personal_focus_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "personal_focus_sessions_insert_own"
  ON public.personal_focus_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_focus_sessions_update_own"
  ON public.personal_focus_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_personal_focus_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_personal_focus_sessions_updated_at ON public.personal_focus_sessions;
CREATE TRIGGER update_personal_focus_sessions_updated_at
  BEFORE UPDATE ON public.personal_focus_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_personal_focus_sessions_updated_at();