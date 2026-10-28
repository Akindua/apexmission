-- ============================================================================
-- 🎖️ ZERO-API SYNTHETIC ENGINE — OPERATOR PROFILE TELEMETRY
-- ============================================================================
-- Adds the persistent onboarding gate plus the profile metadata consumed by
-- the synthetic briefing engine and the ranked operator leaderboard.
--
--  - profiles.onboarding_completed  -> first-session tutorial state (permanent)
--  - profiles.full_name             -> Operator Name used by the greeting
--  - profiles.credits/streaks/etc.  -> leaderboard + task trend telemetry
--  - get_operator_leaderboard()     -> safe ranked ledger RPC (no private PII)
-- ============================================================================

-- 👤 OPERATOR PROFILE METADATA
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beta_points integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS last_action_logged text,
  ADD COLUMN IF NOT EXISTS unlocked_layouts text[] NOT NULL DEFAULT ARRAY['default']::text[];

-- 🧭 Existing operators are already past their first-ever session. New
--    accounts inherit onboarding_completed = false and receive the tutorial
--    exactly once, after which the app writes true permanently.
UPDATE public.profiles
SET onboarding_completed = true
WHERE onboarding_completed = false;

-- 🔁 Keep the Operator Name in sync with auth metadata at signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill missing operator names from auth metadata.
UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  split_part(p.email, '@', 1)
)
FROM auth.users u
WHERE p.id = u.id
  AND (p.full_name IS NULL OR btrim(p.full_name) = '');

-- 🏆 SAFE RANKED LEADERBOARD RPC
-- SECURITY DEFINER lets authenticated operators read the ranked ledger while
-- public.profiles RLS continues to protect private rows. Only non-sensitive
-- telemetry is projected.
CREATE OR REPLACE FUNCTION public.get_operator_leaderboard()
RETURNS TABLE (
  id uuid,
  operator_name text,
  credits integer,
  current_streak integer,
  max_streak integer,
  failure_count integer,
  operational_status text,
  rank_position bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(
      NULLIF(btrim(p.full_name), ''),
      split_part(p.email, '@', 1),
      'OPERATOR'
    ) AS operator_name,
    p.credits,
    p.current_streak,
    p.max_streak,
    p.failure_count,
    p.operational_status,
    RANK() OVER (
      ORDER BY p.credits DESC, p.current_streak DESC, p.id ASC
    ) AS rank_position
  FROM public.profiles p
  ORDER BY p.credits DESC, p.current_streak DESC, p.id ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operator_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operator_leaderboard() TO authenticated;

-- 🧾 OPERATOR POINT AUDIT LEDGER (used by the leaderboard/hardware console)
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_changed integer NOT NULL,
  transaction_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS points_ledger_profile_created_idx
  ON public.points_ledger (profile_id, created_at DESC);

GRANT SELECT, INSERT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators can view their own ledger" ON public.points_ledger;
CREATE POLICY "Operators can view their own ledger"
  ON public.points_ledger
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operators can append their own ledger" ON public.points_ledger;
CREATE POLICY "Operators can append their own ledger"
  ON public.points_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());
