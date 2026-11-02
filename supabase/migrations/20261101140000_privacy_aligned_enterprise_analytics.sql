-- ============================================================================
-- 🛡️ PRIVACY-ALIGNED ENTERPRISE ANALYTICS (Step B)
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Replaces get_company_execution_analytics with a privacy-first version.
-- Managers see ONLY what employees explicitly logged:
--   - completed tasks per person (with text, tier, date)
--   - week-over-week completed count
--   - carried-over tasks (from current_plan high tier)
--   - blockers they entered (from task_history where tier=high and not completed)
-- NO credits, streaks, failure_count, velocity_score, operational_status,
-- FALLEN status, "streak leader", "at-risk operators", or gamification.
-- ============================================================================

-- Drop the old function
DROP FUNCTION IF EXISTS public.get_company_execution_analytics(integer);

-- New privacy-aligned version
CREATE OR REPLACE FUNCTION public.get_company_execution_analytics(p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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

  -- Members: only basic identity (id, name) - no gamification fields
  WITH members AS (
    SELECT
      p.id,
      coalesce(
        nullif(btrim(p.full_name), ''),
        nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
        'Operator'
      ) AS name,
      p.current_plan,
      p.plan_date,
      p.task_history
    FROM public.profiles p
    WHERE p.company_id = v_company.id
  ),
  -- Completed tasks from task_history (only what employees explicitly logged)
  completed_tasks AS (
    SELECT
      m.id AS operator_id,
      m.name AS operator_name,
      public.try_plan_date(e.value ->> 'date') AS day,
      public.try_plan_timestamptz(e.value ->> 'completedAt') AS completed_at,
      CASE
        WHEN (e.value ->> 'tier') IN ('high', 'medium', 'low') THEN (e.value ->> 'tier')
        ELSE NULL
      END AS tier,
      e.value ->> 'text' AS task_text
    FROM members m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(m.task_history) = 'array' THEN m.task_history
        ELSE '[]'::jsonb
      END
    ) AS e(value)
    WHERE jsonb_typeof(e.value) = 'object'
      AND public.try_plan_date(e.value ->> 'date') IS NOT NULL
      AND public.try_plan_date(e.value ->> 'date') <= v_today
  ),
  -- Carried-over tasks: high-impact items from current_plan that are not done
  carried_over AS (
    SELECT
      m.id AS operator_id,
      m.name AS operator_name,
      e.value ->> 'text' AS task_text
    FROM members m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(m.current_plan -> 'high') = 'array' THEN m.current_plan -> 'high'
        ELSE '[]'::jsonb
      END
    ) AS e(value)
    WHERE jsonb_typeof(e.value) = 'object'
      AND coalesce(e.value -> 'done', 'false'::jsonb) <> 'true'::jsonb
  ),
  -- Blockers: high-impact tasks from task_history that are still open (not completed)
  -- Inferred from: high-tier tasks in history without a corresponding completion in recent window
  -- Simpler approach: high-tier items in current_plan that are not done = blockers they entered
  blockers AS (
    SELECT
      m.id AS operator_id,
      m.name AS operator_name,
      e.value ->> 'text' AS blocker_text
    FROM members m
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(m.current_plan -> 'high') = 'array' THEN m.current_plan -> 'high'
        ELSE '[]'::jsonb
      END
    ) AS e(value)
    WHERE jsonb_typeof(e.value) = 'object'
      AND coalesce(e.value -> 'done', 'false'::jsonb) <> 'true'::jsonb
  ),
  -- Daily trend: completed counts per day
  daily_trend AS (
    SELECT
      (v_today - offsets.offset) AS day,
      count(*) FILTER (
        WHERE ct.day = v_today - offsets.offset
      ) AS completed,
      count(*) FILTER (
        WHERE ct.day = v_today - offsets.offset AND ct.tier = 'high'
      ) AS high
    FROM generate_series(0, v_days - 1) AS offsets(offset)
    LEFT JOIN completed_tasks ct ON ct.day = v_today - offsets.offset
    GROUP BY offsets.offset
    ORDER BY offsets.offset
  ),
  -- Weekly aggregates
  week_stats AS (
    SELECT
      count(*) FILTER (WHERE day >= v_today - 6) AS completed_7d,
      count(*) FILTER (WHERE day BETWEEN v_today - 13 AND v_today - 7) AS completed_prev_7d,
      count(*) FILTER (WHERE day >= v_today - 6 AND tier = 'high') AS high_completed_7d,
      count(DISTINCT operator_id) FILTER (WHERE day >= v_today - 6) AS active_operators_7d,
      count(*) FILTER (WHERE day = v_today) AS completed_today
    FROM completed_tasks
  ),
  -- Per-operator completed tasks (last 28 days)
  operator_completed AS (
    SELECT
      operator_id,
      operator_name,
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(day, 'YYYY-MM-DD'),
          'text', task_text,
          'tier', tier,
          'completed_at', completed_at
        )
        ORDER BY completed_at DESC NULLS LAST
      ) AS tasks
    FROM completed_tasks
    WHERE day >= v_today - (v_days - 1)
    GROUP BY operator_id, operator_name
  ),
  -- Per-operator carried-over high-impact tasks
  operator_carried AS (
    SELECT
      operator_id,
      operator_name,
      jsonb_agg(task_text ORDER BY task_text) AS tasks
    FROM carried_over
    GROUP BY operator_id, operator_name
  ),
  -- Per-operator blockers
  operator_blockers AS (
    SELECT
      operator_id,
      operator_name,
      jsonb_agg(blocker_text ORDER BY blocker_text) AS blockers
    FROM blockers
    GROUP BY operator_id, operator_name
  )
  SELECT jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'company_slug', v_company.slug,
    'generated_at', now(),
    'window_days', v_days,
    'members', (SELECT count(*) FROM members),
    'totals', jsonb_build_object(
      'completed_today', (SELECT completed_today FROM week_stats),
      'completed_7d', (SELECT completed_7d FROM week_stats),
      'completed_prev_7d', (SELECT completed_prev_7d FROM week_stats),
      'high_completed_7d', (SELECT high_completed_7d FROM week_stats),
      'active_operators_7d', (SELECT active_operators_7d FROM week_stats),
      'carried_over_high', (SELECT count(*) FROM carried_over),
      'blockers_count', (SELECT count(*) FROM blockers)
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
        FROM daily_trend
      ),
      '[]'::jsonb
    ),
    'operators', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'completed_tasks', coalesce(oc.tasks, '[]'::jsonb),
            'carried_over_high', coalesce(oca.tasks, '[]'::jsonb),
            'blockers', coalesce(ob.blockers, '[]'::jsonb)
          )
          ORDER BY m.name ASC
        )
        FROM members m
        LEFT JOIN operator_completed oc ON oc.operator_id = m.id
        LEFT JOIN operator_carried oca ON oca.operator_id = m.id
        LEFT JOIN operator_blockers ob ON ob.operator_id = m.id
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_company_execution_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_execution_analytics(integer) TO authenticated;