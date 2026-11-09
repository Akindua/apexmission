-- ============================================================================
-- 📱 WEB PUSH SUBSCRIPTIONS
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Stores push subscription data for the 4:30 PM reminder.
-- RLS: users can only access their own subscriptions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_date date,
  CONSTRAINT push_subscriptions_valid_timezone CHECK (
    timezone ~ '^[A-Za-z_]+/[A-Za-z_]+$' OR timezone = 'UTC'
  )
);

-- Index for cron query (find subscriptions due for today)
CREATE INDEX IF NOT EXISTS push_subscriptions_last_sent_idx
  ON public.push_subscriptions (last_sent_date)
  WHERE last_sent_date IS NOT NULL;

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view their own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert their own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update their own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete their own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- No anon access (revoked by default due to no GRANT to anon)