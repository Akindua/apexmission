-- ============================================================================
-- 👤 ADD ROLE COLUMN TO PROFILES
-- Copyright (c) 2026 ApexMissions. All rights reserved.
--
-- Adds a role column to the profiles table to support role-based access
-- control (RBAC) for client portal access.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'personal'
    CHECK (role IN ('personal', 'enterprise', 'client_external', 'admin'));

-- Index for fast role-based lookups
CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON public.profiles (role);

-- Backfill existing users with 'personal' role
UPDATE public.profiles
SET role = 'personal'
WHERE role IS NULL OR role = '';