CREATE TABLE public.entitlements (
  user_id UUID PRIMARY KEY,
  plan TEXT NOT NULL CHECK (plan IN ('monthly','lifetime')),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entitlement"
ON public.entitlements FOR SELECT TO authenticated
USING (auth.uid() = user_id);