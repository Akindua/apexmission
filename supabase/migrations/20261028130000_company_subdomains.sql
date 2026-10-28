-- ============================================================================
-- 🌐 WILDCARD SUBDOMAIN → COMPANY TENANT RESOLUTION
-- Layer: enterprise routing
--  - public.companies.slug             -> DNS label (*.apexmissions.app)
--  - public.company_slugify(text)      -> canonical slug normalizer
--  - public.resolve_session_tenant()   -> matches slug to the caller's tenant
-- ============================================================================

-- Canonical URL slug used for subdomain routing. Runs in SQL so backfills and
-- future inserts normalize identically to the client-side validator.
CREATE OR REPLACE FUNCTION public.company_slugify(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(
    both '-' FROM left(
      trim(both '-' FROM lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]+', '-', 'g'))),
      63
    )
  );
$$;

-- 🌐 TENANT SUBDOMAIN COLUMN
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug text;

-- Backfill existing tenants from their display names. Collisions get a short
-- id-derived suffix so the unique index can be created safely.
WITH base AS (
  SELECT
    id,
    created_at,
    coalesce(nullif(public.company_slugify(name), ''), 'company') AS base_slug
  FROM public.companies
  WHERE slug IS NULL
),
numbered AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY created_at, id) AS slug_rank
  FROM base
),
candidates AS (
  SELECT
    n.id,
    CASE
      WHEN n.slug_rank = 1
        AND NOT EXISTS (
          SELECT 1
          FROM public.companies existing
          WHERE existing.slug = n.base_slug
        )
      THEN n.base_slug
      ELSE left(n.base_slug, 56) || '-' || left(replace(n.id::text, '-', ''), 6)
    END AS slug
  FROM numbered n
)
UPDATE public.companies c
SET slug = candidates.slug
FROM candidates
WHERE c.id = candidates.id;

ALTER TABLE public.companies
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_slug_format;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_slug_format
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key
  ON public.companies (slug);

-- ----------------------------------------------------------------------------
-- 🔐 SESSION ↔ SUBDOMAIN MATCH
-- Security definer because public.companies has RLS enabled with no policies.
-- Returns only public branding fields; invite_token is never exposed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_session_tenant(p_subdomain text)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_slug text,
  is_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.slug AS company_slug,
    coalesce(p.company_id = c.id, false) AS is_member
  FROM public.companies c
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE c.slug = public.company_slugify(p_subdomain)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.company_slugify(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_session_tenant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_session_tenant(text) TO authenticated;
