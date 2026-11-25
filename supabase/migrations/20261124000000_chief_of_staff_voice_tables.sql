-- Chief of Staff Voice Command Tables
-- Idempotency keys for persistent modification commands
-- Approval tokens for user confirmation flow

-- Idempotency table to prevent duplicate execution of persistent commands
CREATE TABLE IF NOT EXISTS public.chief_of_staff_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Approval tokens for persistent modification commands
CREATE TABLE IF NOT EXISTS public.chief_of_staff_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command text NOT NULL,
  token text NOT NULL UNIQUE,
  preview jsonb NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chief_of_staff_approvals_user_token
  ON public.chief_of_staff_approvals (user_id, token);

CREATE INDEX IF NOT EXISTS idx_chief_of_staff_approvals_expires
  ON public.chief_of_staff_approvals (expires_at);

-- RLS Policies
ALTER TABLE public.chief_of_staff_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chief_of_staff_approvals ENABLE ROW LEVEL SECURITY;

-- Users can only access their own idempotency keys
CREATE POLICY "Users can manage their own idempotency keys"
  ON public.chief_of_staff_idempotency
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only access their own approval tokens
CREATE POLICY "Users can manage their own approval tokens"
  ON public.chief_of_staff_approvals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can bypass RLS for server-side operations
-- (handled by using service role key in server code)

-- Cleanup function for expired approvals
CREATE OR REPLACE FUNCTION public.cleanup_expired_chief_of_staff_approvals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chief_of_staff_approvals
  WHERE expires_at < now() - interval '24 hours';
END;
$$;

-- Trigger to auto-cleanup on new approval insert (optional, can use cron instead)
-- CREATE TRIGGER cleanup_expired_approvals_on_insert
--   AFTER INSERT ON public.chief_of_staff_approvals
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION public.cleanup_expired_chief_of_staff_approvals();