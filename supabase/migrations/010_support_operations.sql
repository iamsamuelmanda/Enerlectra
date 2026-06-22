-- ═══════════════════════════════════════════════════════════════
-- OPERATIONAL SUPPORT — organisations, tickets, telegram identity
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.organizations (name, slug)
VALUES
  ('Renwasol', 'renwasol'),
  ('DS Solar', 'ds-solar'),
  ('Boarding House Demo', 'boarding-house')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.telegram_users (
  telegram_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT,
  role TEXT,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_user_id ON public.telegram_users(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_org ON public.telegram_users(organization_id);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  intent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON public.support_tickets(organisation_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON public.support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_demo_read ON public.organizations;
CREATE POLICY organizations_demo_read ON public.organizations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS support_tickets_service ON public.support_tickets;
CREATE POLICY support_tickets_service ON public.support_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
