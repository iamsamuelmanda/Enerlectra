-- ═══════════════════════════════════════════════════════════════
-- RENWASOL DEMO — transaction visibility table + seed data
-- Run in Supabase SQL Editor if not using supabase db push
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_number TEXT NOT NULL,
  customer_phone TEXT,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED')),
  token TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_meter_number
  ON public.transactions (meter_number);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_phone
  ON public.transactions (customer_phone);

CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON public.transactions (status);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON public.transactions (created_at DESC);

-- Demo seed
DELETE FROM public.transactions
WHERE meter_number IN ('20045123', '20047890', '20041111');

INSERT INTO public.transactions (meter_number, customer_phone, amount, status, token, failure_reason)
VALUES
  ('20045123', '+260977123456', 50, 'DELIVERED', '4810-3827-1094', NULL),
  ('20047890', '+260977654321', 30, 'FAILED', NULL, 'Primenet timeout'),
  ('20041111', '+260955111222', 20, 'PROCESSING', NULL, NULL);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_demo_read ON public.transactions;
CREATE POLICY transactions_demo_read ON public.transactions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS transactions_service_write ON public.transactions;
CREATE POLICY transactions_service_write ON public.transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Confirm seed (should return 3)
SELECT COUNT(*) AS row_count FROM public.transactions;
