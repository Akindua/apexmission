-- ============================================================================
-- 📦 DATA EXPORT REQUESTS (Right of Access / Data Portability)
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Tracks user-initiated data export requests for asynchronous processing.
-- Status lifecycle: pending -> processing -> completed | failed
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  request_type text NOT NULL DEFAULT 'full_export'
    CHECK (request_type IN ('full_export', 'account_only')),
  file_url text,                          -- S3 presigned URL (set on completion)
  expires_at timestamptz,                 -- Pre-signed URL expiry (24h from generation)
  error_message text,                     -- Populated when status = 'failed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz                -- Timestamp when terminal state reached
);

-- Indexes for worker polling and user lookups
CREATE INDEX IF NOT EXISTS data_export_requests_user_status_idx
  ON public.data_export_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS data_export_requests_status_created_idx
  ON public.data_export_requests (status, created_at)
  WHERE status IN ('pending', 'processing');

-- RLS: users can only see their own export requests
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.data_export_requests TO authenticated;
GRANT ALL ON public.data_export_requests TO service_role;

DROP POLICY IF EXISTS "Users can view their own export requests" ON public.data_export_requests;
CREATE POLICY "Users can view their own export requests"
  ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own export requests" ON public.data_export_requests;
CREATE POLICY "Users can insert their own export requests"
  ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE/DELETE policies for authenticated users (server/worker only via service_role)

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_data_export_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_data_export_requests_updated_at ON public.data_export_requests;
CREATE TRIGGER update_data_export_requests_updated_at
  BEFORE UPDATE ON public.data_export_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_data_export_requests_updated_at();