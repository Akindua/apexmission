
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  subscription_tier text NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','premium_active','lifetime')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create a profile automatically for every new account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Keep subscription_tier in sync with billing entitlements
CREATE OR REPLACE FUNCTION public.sync_subscription_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text;
BEGIN
  IF NEW.status = 'active' AND NEW.plan = 'lifetime' THEN
    tier := 'lifetime';
  ELSIF NEW.status = 'active'
        AND (NEW.current_period_end IS NULL OR NEW.current_period_end > now()) THEN
    tier := 'premium_active';
  ELSE
    tier := 'free';
  END IF;

  INSERT INTO public.profiles (id, subscription_tier)
  VALUES (NEW.user_id, tier)
  ON CONFLICT (id) DO UPDATE
    SET subscription_tier = EXCLUDED.subscription_tier, updated_at = now();

  RETURN NEW;
END; $$;

CREATE TRIGGER entitlements_sync_tier
  AFTER INSERT OR UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_tier();

-- Backfill profiles for existing accounts
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles p
SET subscription_tier = CASE
  WHEN e.status = 'active' AND e.plan = 'lifetime' THEN 'lifetime'
  WHEN e.status = 'active' AND (e.current_period_end IS NULL OR e.current_period_end > now()) THEN 'premium_active'
  ELSE 'free' END
FROM public.entitlements e
WHERE e.user_id = p.id;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
