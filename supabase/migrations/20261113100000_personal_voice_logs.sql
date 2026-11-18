-- ============================================================================
-- 🎙️ PERSONAL VOICE LOGS
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Stores voice log transcripts captured via the Web Speech API.
-- RLS ensures each user can only access their own recordings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.voice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0 AND duration_seconds <= 600),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_logs_user_id_idx ON public.voice_logs (user_id);
CREATE INDEX IF NOT EXISTS voice_logs_user_created_idx ON public.voice_logs (user_id, created_at DESC);

-- RLS
ALTER TABLE public.voice_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.voice_logs TO authenticated;
GRANT ALL ON public.voice_logs TO service_role;

DROP POLICY IF EXISTS "voice_logs_select_own" ON public.voice_logs;
CREATE POLICY "voice_logs_select_own"
  ON public.voice_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "voice_logs_insert_own"
  ON public.voice_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "voice_logs_update_own"
  ON public.voice_logs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "voice_logs_delete_own"
  ON public.voice_logs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());