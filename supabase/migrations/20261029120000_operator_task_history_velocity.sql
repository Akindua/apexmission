-- ============================================================================
-- 🎖️ OPERATOR VELOCITY PERSISTENCE + DAILY COMPLETION TELEMETRY
-- ============================================================================
-- Persists the operator's real task-closure history and computed velocity
-- score to the profile row so the Velocity Consistency Index survives
-- cross-session reloads (sign-out -> sign-in) instead of resetting locally.
--
--  - profiles.task_history   -> jsonb array of real task closures
--                              [{ "date": "YYYY-MM-DD", "text": "..." }]
--  - profiles.velocity_score -> blended execution velocity score (0-100)
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS task_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS velocity_score double precision NOT NULL DEFAULT 0;
