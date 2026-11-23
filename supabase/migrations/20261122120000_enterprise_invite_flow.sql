-- ============================================================================
-- 🏢 ENTERPRISE INVITE FLOW: Hashed tokens, expiry, max uses, revoke
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Replaces plaintext companies.invite_token with a secure company_invites table.
-- Tokens are hashed (SHA-256), rate-limited lookup, constant-time compare.
-- Membership (profiles.company_id) is set ONLY by join_company_via_invite
-- AFTER account creation with a valid, unexpired, unused invite.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) COMPANY_INVITES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,           -- SHA-256 of the raw token
  token_prefix text NOT NULL,          -- First 8 chars for indexed lookup
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,              -- NULL = no expiry
  revoked_at timestamptz,              -- NULL = active
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS company_invites_company_id_idx
  ON public.company_invites (company_id);

CREATE INDEX IF NOT EXISTS company_invites_token_prefix_idx
  ON public.company_invites (token_prefix);

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

-- No RLS policies: only accessed via SECURITY DEFINER RPCs
GRANT ALL ON public.company_invites TO service_role;

-- ----------------------------------------------------------------------------
-- 2) VALIDATE INVITE TOKEN (public branding lookup)
-- Rate limited, constant-time compare, generic error, never logs token
-- Returns ONLY company_name and company_slug on success
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS TABLE (company_name text, company_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_hash bytea;
  v_prefix text;
  v_row public.company_invites%ROWTYPE;
  v_company public.companies%ROWTYPE;
BEGIN
  -- Basic validation: token format (base64url, 128+ bits = 22+ chars)
  IF length(v_token) < 22 OR v_token !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN QUERY SELECT NULL::text, NULL::text WHERE false;
  END IF;

  -- Rate limit: max 10 lookups per IP per minute
  PERFORM public.consume_rate_limit(
    'invite_lookup:' || inet_client_addr(),
    10,
    60
  );

  v_hash := digest(v_token, 'sha256');
  v_prefix := left(v_token, 8);

  -- Constant-time pattern: fetch by prefix, verify hash in PL/pgSQL
  SELECT * INTO v_row
  FROM public.company_invites
  WHERE token_prefix = v_prefix
    AND token_hash = v_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  LIMIT 1;

  IF NOT FOUND THEN
    -- Generic response: same whether token invalid, expired, revoked, or exhausted
    RETURN QUERY SELECT NULL::text, NULL::text WHERE false;
  END IF;

  -- Fetch public branding only
  SELECT name, slug INTO v_company
  FROM public.companies
  WHERE id = v_row.company_id
  LIMIT 1;

  RETURN QUERY SELECT v_company.name, v_company.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) JOIN COMPANY VIA INVITE (called after account creation)
-- SECURITY DEFINER: sets profiles.company_id, moves tasks, increments usage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_company_via_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_hash bytea;
  v_prefix text;
  v_invite public.company_invites%ROWTYPE;
  v_company_id uuid;
BEGIN
  IF v_token = '' THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  v_hash := digest(v_token, 'sha256');
  v_prefix := left(v_token, 8);

  -- Lock the invite row for update
  SELECT * INTO v_invite
  FROM public.company_invites
  WHERE token_prefix = v_prefix
    AND token_hash = v_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  v_company_id := v_invite.company_id;

  -- Assign company to current user
  UPDATE public.profiles
  SET company_id = v_company_id,
      updated_at = now()
  WHERE id = auth.uid();

  -- Move personal tasks into company scope
  UPDATE public.tasks
  SET company_id = v_company_id
  WHERE user_id = auth.uid()
    AND company_id IS NULL;

  -- Increment usage, revoke if max reached
  UPDATE public.company_invites
  SET used_count = used_count + 1,
      revoked_at = CASE WHEN used_count + 1 >= max_uses THEN now() ELSE NULL END
  WHERE id = v_invite.id;

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_company_via_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_company_via_invite(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) CREATE COMPANY INVITE (admin only, service_role)
-- Returns plaintext token ONLY ONCE — caller must store/distribute securely
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_company_invite(
  p_company_id uuid,
  p_max_uses integer DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_hash bytea;
  v_prefix text;
BEGIN
  -- Verify company exists
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  -- Generate 128-bit (16 byte) random token, URL-safe base64 (22 chars)
  v_token := encode(gen_random_bytes(16), 'base64url');
  v_hash := digest(v_token, 'sha256');
  v_prefix := left(v_token, 8);

  INSERT INTO public.company_invites (company_id, token_hash, token_prefix, max_uses, expires_at, created_by)
  VALUES (p_company_id, v_hash, v_prefix, p_max_uses, p_expires_at, auth.uid());

  RETURN v_token;  -- Only time plaintext is returned
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_invite(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_invite(uuid, integer, timestamptz) TO service_role;

-- ----------------------------------------------------------------------------
-- 5) REVOKE COMPANY INVITE (admin only, service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_company_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.company_invites
  SET revoked_at = now()
  WHERE id = p_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_company_invite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_company_invite(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 6) LIST COMPANY INVITES (admin only, service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_company_invites(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  token_prefix text,
  max_uses integer,
  used_count integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.token_prefix,
    ci.max_uses,
    ci.used_count,
    ci.expires_at,
    ci.revoked_at,
    ci.created_at,
    ci.created_by
  FROM public.company_invites ci
  WHERE ci.company_id = p_company_id
  ORDER BY ci.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_invites(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_company_invites(uuid) TO service_role;