-- ============================================================================
-- 📊 ENTERPRISE EXECUTION ANALYTICS + DAILY PLAN + COMPANY ROUTING
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Adds:
--   1) profiles.current_plan / profiles.plan_date, so the company analytics
--      RPC can measure open high-impact work even though the dashboard keeps
--      the matrix client-side.
--   2) A bounded-telemetry trigger that keeps JSONB plan/history payloads from
--      becoming a storage or CPU weapon.
--   3) get_my_company_route() and get_company_route_by_invite_token(text),
--      which expose only public branding fields (never invite tokens).
--   4) get_company_execution_analytics(integer): a company-scoped,
--      SECURITY DEFINER aggregate over the caller's OWN tenant. The global
--      get_operator_leaderboard() is intentionally never used here.
--   5) Showcase Demo Corp: paid contract flag + realistic multi-week
--      telemetry so the demo tenant subdomain has enterprise data to show.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) DAILY PLAN PERSISTENCE
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_plan jsonb NOT NULL
    DEFAULT '{"high":[],"medium":[],"low":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_date date;

COMMENT ON COLUMN public.profiles.current_plan IS
  'Latest client-side priority matrix snapshot ({high,medium,low} task arrays).';
COMMENT ON COLUMN public.profiles.plan_date IS
  'Local calendar date the current_plan snapshot belongs to.';

-- ----------------------------------------------------------------------------
-- 2) BOUNDED PLAN / HISTORY TELEMETRY
-- The dashboard writes these columns directly (row-level ownership still
-- applies). The trigger clamps malformed or oversized payloads instead of
-- rejecting the write, so a hostile client cannot DoS company analytics.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_plan_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_array jsonb;
  v_clean jsonb := '{}'::jsonb;
BEGIN
  -- --- task_history: bounded JSON array (newest 200 entries) -------------
  IF NEW.task_history IS NULL OR jsonb_typeof(NEW.task_history) <> 'array' THEN
    NEW.task_history := '[]'::jsonb;
  ELSE
    IF jsonb_array_length(NEW.task_history) > 200 THEN
      SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      INTO NEW.task_history
      FROM (
        SELECT value, ord
        FROM jsonb_array_elements(NEW.task_history) WITH ORDINALITY AS e(value, ord)
        ORDER BY ord DESC
        LIMIT 200
      ) recent;
    END IF;

    IF pg_column_size(NEW.task_history) > 262144 THEN
      NEW.task_history := '[]'::jsonb;
    END IF;
  END IF;

  -- --- current_plan: object with three bounded arrays -------------------
  IF NEW.current_plan IS NULL OR jsonb_typeof(NEW.current_plan) <> 'object' THEN
    NEW.current_plan := '{"high":[],"medium":[],"low":[]}'::jsonb;
  ELSE
    FOREACH v_tier IN ARRAY ARRAY['high', 'medium', 'low'] LOOP
      v_array := NEW.current_plan -> v_tier;
      IF v_array IS NULL OR jsonb_typeof(v_array) <> 'array' THEN
        v_array := '[]'::jsonb;
      ELSIF jsonb_array_length(v_array) > 25 THEN
        SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
        INTO v_array
        FROM (
          SELECT value, ord
          FROM jsonb_array_elements(v_array) WITH ORDINALITY AS e(value, ord)
          ORDER BY ord
          LIMIT 25
        ) capped;
      END IF;

      v_clean := jsonb_set(v_clean, ARRAY[v_tier], v_array, true);
    END LOOP;

    NEW.current_plan := v_clean;

    IF pg_column_size(NEW.current_plan) > 131072 THEN
      NEW.current_plan := '{"high":[],"medium":[],"low":[]}'::jsonb;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_plan_telemetry ON public.profiles;
CREATE TRIGGER guard_profile_plan_telemetry
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_plan_telemetry();

-- ----------------------------------------------------------------------------
-- 3) SAFE JSONB -> DATE / TIMESTAMPTZ PARSERS
-- A company member could write a malformed history entry. These helpers turn
-- that into NULL instead of raising and breaking analytics for the whole
-- tenant. They are not part of the public API.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_plan_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_plan_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR p_value !~ '^\d{4}-\d{2}-\d{2}T' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_plan_date(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_plan_timestamptz(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) COMPANY ROUTING RPCS
-- Public branding only: id, display name, DNS slug. Invite tokens are the
-- lookup key for the invite variant and are never returned.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_company_route()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.slug
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_company_route() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_route() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_company_route_by_invite_token(p_token text)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.slug
  FROM public.companies c
  WHERE c.invite_token = btrim(coalesce(p_token, ''))
    AND length(btrim(coalesce(p_token, ''))) BETWEEN 4 AND 200
  LIMIT 1;
$$;

-- Callable before sign-in so a demo/invite link can route to the correct
-- tenant subdomain. Possession of the exact token is the authorization; the
-- response exposes branding only.
REVOKE ALL ON FUNCTION public.get_company_route_by_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_route_by_invite_token(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) COMPANY-SCOPED EXECUTION ANALYTICS
-- Only the caller's own company is aggregated. No operator PII beyond the
-- display name/telemetry already shown on the company dashboard is returned.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_company_execution_analytics(p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company public.companies%ROWTYPE;
  v_days integer := greatest(7, least(coalesce(p_days, 28), 90));
  v_today date := current_date;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.*
  INTO v_company
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  WITH members AS (
    SELECT
      p.id,
      coalesce(
        nullif(btrim(p.full_name), ''),
        nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
        'Operator'
      ) AS name,
      p.credits,
      p.current_streak,
      p.max_streak,
      p.failure_count,
      p.velocity_score,
      p.operational_status,
      p.last_action_logged,
      p.current_plan,
      p.plan_date,
      p.task_history
    FROM public.profiles p
    WHERE p.company_id = v_company.id
  ),
  history AS (
    SELECT
      m.id AS operator_id,
      public.try_plan_date(e.value ->> 'date') AS day,
      CASE
        WHEN (e.value ->> 'tier') IN ('high', 'medium', 'low') THEN (e.value ->> 'tier')
        ELSE NULL
      END AS tier,
      public.try_plan_timestamptz(e.value ->> 'completedAt') AS completed_at
    FROM members m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(m.task_history) = 'array' THEN m.task_history
        ELSE '[]'::jsonb
      END
    ) AS e(value)
    WHERE jsonb_typeof(e.value) = 'object'
  ),
  pending AS (
    SELECT
      m.id AS operator_id,
      count(*) FILTER (
        WHERE coalesce(e.value -> 'done', 'false'::jsonb) <> 'true'::jsonb
      ) AS pending_high
    FROM members m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(m.current_plan -> 'high') = 'array' THEN m.current_plan -> 'high'
        ELSE '[]'::jsonb
      END
    ) AS e(value)
    WHERE jsonb_typeof(e.value) = 'object'
    GROUP BY m.id
  ),
  operator_stats AS (
    SELECT
      m.id,
      m.name,
      m.credits,
      m.current_streak,
      m.max_streak,
      m.failure_count,
      m.velocity_score,
      m.operational_status,
      m.last_action_logged,
      m.plan_date,
      coalesce(h.completed_today, 0)::integer AS completed_today,
      coalesce(h.completed_7d, 0)::integer AS completed_7d,
      coalesce(h.completed_prev_7d, 0)::integer AS completed_prev_7d,
      coalesce(h.completed_window, 0)::integer AS completed_window,
      coalesce(p.pending_high, 0)::integer AS pending_high,
      h.last_completion_at
    FROM members m
    LEFT JOIN (
      SELECT
        operator_id,
        count(*) FILTER (WHERE day = v_today) AS completed_today,
        count(*) FILTER (WHERE day >= v_today - 6) AS completed_7d,
        count(*) FILTER (WHERE day BETWEEN v_today - 13 AND v_today - 7) AS completed_prev_7d,
        count(*) FILTER (WHERE day >= v_today - (v_days - 1)) AS completed_window,
        max(completed_at) AS last_completion_at
      FROM history
      WHERE day IS NOT NULL AND day <= v_today
      GROUP BY operator_id
    ) h ON h.operator_id = m.id
    LEFT JOIN pending p ON p.operator_id = m.id
  ),
  trend AS (
    SELECT
      (v_today - offsets.offset) AS day,
      count(h.operator_id) FILTER (
        WHERE h.day = v_today - offsets.offset
      ) AS completed,
      count(h.operator_id) FILTER (
        WHERE h.day = v_today - offsets.offset AND h.tier = 'high'
      ) AS high
    FROM generate_series(0, v_days - 1) AS offsets(offset)
    LEFT JOIN history h ON h.day = v_today - offsets.offset
    GROUP BY offsets.offset
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE day = v_today) AS completed_today,
      count(*) FILTER (WHERE day >= v_today - 6) AS completed_7d,
      count(*) FILTER (WHERE day BETWEEN v_today - 13 AND v_today - 7) AS completed_prev_7d,
      count(*) FILTER (WHERE day >= v_today - (v_days - 1)) AS completed_window,
      count(*) FILTER (WHERE day >= v_today - 6 AND tier = 'high') AS high_completed_7d,
      count(DISTINCT operator_id) FILTER (WHERE day >= v_today - 6) AS active_operators_7d
    FROM history
    WHERE day IS NOT NULL AND day <= v_today
  )
  SELECT jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'company_slug', v_company.slug,
    'generated_at', now(),
    'window_days', v_days,
    'members', (SELECT count(*) FROM members),
    'totals', jsonb_build_object(
      'completed_today', (SELECT completed_today FROM totals),
      'completed_7d', (SELECT completed_7d FROM totals),
      'completed_prev_7d', (SELECT completed_prev_7d FROM totals),
      'completed_window', (SELECT completed_window FROM totals),
      'high_completed_7d', (SELECT high_completed_7d FROM totals),
      'pending_high', (SELECT coalesce(sum(pending_high), 0) FROM pending),
      'active_operators_7d', (SELECT active_operators_7d FROM totals)
    ),
    'trend', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', to_char(day, 'YYYY-MM-DD'),
            'completed', completed,
            'high', high
          )
          ORDER BY day
        )
        FROM trend
      ),
      '[]'::jsonb
    ),
    'operators', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'credits', credits,
            'current_streak', current_streak,
            'max_streak', max_streak,
            'failure_count', failure_count,
            'velocity_score', velocity_score,
            'operational_status', operational_status,
            'last_action_logged', last_action_logged,
            'plan_date', plan_date,
            'completed_today', completed_today,
            'completed_7d', completed_7d,
            'completed_prev_7d', completed_prev_7d,
            'completed_window', completed_window,
            'pending_high', pending_high,
            'last_completion_at', last_completion_at
          )
          ORDER BY completed_7d DESC, name ASC
        )
        FROM operator_stats
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_execution_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_execution_analytics(integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) SHOWCASE DEMO CORP: PAID CONTRACT + ENTERPRISE TELEMETRY
-- The demo tenant must bypass the 14-day pilot gate so its console is always
-- available. The four operator rows are display-only (banned auth accounts);
-- they are attached to the tenant so the enterprise view has realistic data.
-- ----------------------------------------------------------------------------
UPDATE public.companies
SET is_contract_paid = true,
    trial_started_at = coalesce(trial_started_at, now())
WHERE id = '11111111-1111-4111-8111-111111111111'::uuid;

WITH demo_ops AS (
  SELECT *
  FROM (
    VALUES
      (
        '22222222-2222-4222-8222-222222222221'::uuid,
        0,  -- seed
        2,  -- cadence (days)
        0,  -- minimum offset
        1850, 0,
        '{"high":[{"text":"Finalize Q4 partnership terms","done":false},{"text":"Review hiring plan for next quarter","done":true}],"medium":[{"text":"Prepare board pre-read","done":false}],"low":[]}'::jsonb
      ),
      (
        '22222222-2222-4222-8222-222222222222'::uuid,
        1, 3, 2, 1420, 1,
        '{"high":[{"text":"Ship billing migration","done":false},{"text":"Close security review","done":false}],"medium":[],"low":[{"text":"Update runbook","done":true}]}'::jsonb
      ),
      (
        '22222222-2222-4222-8222-222222222223'::uuid,
        0, 4, 1, 1180, 2,
        '{"high":[{"text":"Resolve customer escalation","done":false}],"medium":[{"text":"Draft launch checklist","done":false}],"low":[]}'::jsonb
      ),
      (
        '22222222-2222-4222-8222-222222222224'::uuid,
        4, 3, 8, 760, 6,
        '{"high":[{"text":"Unblock vendor contract","done":false},{"text":"Recover missed sprint scope","done":false},{"text":"Escalate API outage","done":false}],"medium":[{"text":"Reconcile backlog","done":false}],"low":[]}'::jsonb
      )
  ) AS t(id, seed, cadence, min_offset, credits, failures, plan)
),
generated_history AS (
  SELECT
    o.id,
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(current_date - g.day_offset, 'YYYY-MM-DD'),
        'text', (ARRAY[
          'Closed enterprise pipeline review',
          'Shipped onboarding checklist to staging',
          'Drafted weekly leadership report',
          'Reconciled vendor invoices',
          'Archived sprint boards',
          'Unblocked legal review for Q4 contract'
        ])[1 + ((g.day_offset + o.seed) % 6)],
        'tier', (ARRAY['high', 'medium', 'low'])[1 + ((g.day_offset + o.seed) % 3)],
        'completedAt',
          to_char(current_date - g.day_offset, 'YYYY-MM-DD')
          || 'T'
          || lpad(((8 + ((g.day_offset * 2 + o.seed) % 9))::text), 2, '0')
          || ':15:00Z'
      )
      ORDER BY g.day_offset DESC
    ) AS task_history
  FROM demo_ops o
  CROSS JOIN LATERAL generate_series(o.min_offset, 13) AS g(day_offset)
  WHERE ((g.day_offset - o.min_offset) % o.cadence) = 0
  GROUP BY o.id
)
UPDATE public.profiles p
SET company_id = '11111111-1111-4111-8111-111111111111'::uuid,
    task_history = h.task_history,
    current_plan = o.plan,
    plan_date = current_date,
    credits = o.credits,
    failure_count = o.failures,
    velocity_score = CASE
      WHEN o.failures >= 5 THEN 24
      WHEN o.failures >= 2 THEN 58
      ELSE 86
    END
FROM demo_ops o
JOIN generated_history h ON h.id = o.id
WHERE p.id = o.id;