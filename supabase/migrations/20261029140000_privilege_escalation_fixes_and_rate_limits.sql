-- ============================================================================
-- 🛡️ PRIVILEGE ESCALATION FIXES + PERSISTENT RATE LIMITING
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- 1) profiles.subscription_tier was writable by the row's owner via the
--    "Users can update their own profile" policy, and the app trusts this
--    column for premium gating (useSubscriptionTier). Any authenticated user
--    could PATCH their own row to 'lifetime' and unlock paid features.
--    Fixed with column-level privilege revocation + a trigger guard.
-- 2) profiles.email is likewise locked (the canonical address lives in
--    auth.users; nothing legitimate writes it client-side).
-- 3) Gamified counters remain client-writable by design, but are now clamped
--    to sane bounds so they cannot be weaponized (negative/absurd values).
-- 4) points_ledger rows get amount bounds.
-- 5) New rate_limits table + SECURITY DEFINER RPC giving AI endpoints
--    rate limits that survive restarts and span server instances.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 + 2: COLUMN-LEVEL LOCKDOWN (PostgREST enforces column privileges)
-- ---------------------------------------------------------------------------
REVOKE UPDATE (subscription_tier, email) ON public.profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3: TRIGGER GUARD (defense-in-depth: covers every write path, not just REST)
-- ---------------------------------------------------------------------------
-- NOTE: deliberately NOT SECURITY DEFINER — the guard must observe the real
-- invoking role via current_user (definer functions run as 'postgres',
-- server writes run as 'service_role', client writes as 'authenticated').
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Primary key can never change.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  -- Entitlement + identity columns: only server-side definer functions or the
  -- service role may change them.
  IF (NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
      OR NEW.email IS DISTINCT FROM OLD.email)
     AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Privileged profile columns cannot be modified by clients';
  END IF;

  -- Gamified telemetry is client-computed by design; clamp instead of reject
  -- so the app keeps working while absurd injections become impossible.
  NEW.credits        := LEAST(GREATEST(COALESCE(NEW.credits, 0), 0), 1000000);
  NEW.beta_points    := LEAST(GREATEST(COALESCE(NEW.beta_points, 0), 0), 10000000);
  NEW.current_streak := LEAST(GREATEST(COALESCE(NEW.current_streak, 0), 0), 3650);
  NEW.max_streak     := LEAST(GREATEST(COALESCE(NEW.max_streak, 0), 0), 3650);
  NEW.failure_count  := LEAST(GREATEST(COALESCE(NEW.failure_count, 0), 0), 100000);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_privileges ON public.profiles;
CREATE TRIGGER enforce_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- 4: LEDGER SANITY BOUNDS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.points_ledger
    ADD CONSTRAINT points_ledger_amount_bounds
    CHECK (amount_changed BETWEEN -100000 AND 100000);
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already applied
END $$;

-- ---------------------------------------------------------------------------
-- 5: PERSISTENT RATE LIMITER
--    In-memory limiters reset on deploy/restart and are per-instance. This
--    table-backed limiter is atomic (UPSERT ... RETURNING) and shared by all
--    instances. No client policies exist: only the SECURITY DEFINER RPC can
--    touch the rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO service_role;

-- Atomic fixed-window counter. Returns TRUE when the call is within budget.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0
     OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN FALSE; -- fail closed on bad config
  END IF;

  -- Opportunistic cleanup of long-dead buckets (~1% of calls).
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
    WHERE window_start < now() - interval '1 day';
  END IF;

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    THEN 1
                  ELSE rate_limits.count + 1
                END,
        window_start = CASE
                  WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    THEN now()
                  ELSE rate_limits.window_start
                END
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO authenticated;
