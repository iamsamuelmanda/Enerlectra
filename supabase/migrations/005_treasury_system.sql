-- ═══════════════════════════════════════════════════════════════
-- TREASURY SYSTEM MIGRATION
-- Multi-rail escrow accounts with liquidity management
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE payment_rail AS ENUM (
  'MTN',
  'AIRTEL',
  'BANK',
  'STABLECOIN'
);

CREATE TYPE rail_status AS ENUM (
  'ACTIVE',
  'DEGRADED',
  'SUSPENDED',
  'DISABLED'
);

CREATE TYPE payout_status AS ENUM (
  'RESERVED',
  'INITIATED',
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REVERSED'
);

-- ─────────────────────────────────────────────────────────────
-- TREASURY RESERVATIONS (Liquidity locking)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE treasury_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id TEXT NOT NULL UNIQUE,
  rail payment_rail NOT NULL,
  amount_ngwee BIGINT NOT NULL CHECK (amount_ngwee > 0),
  
  reserved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  released_at TIMESTAMP,
  
  CONSTRAINT active_reservation CHECK (
    released_at IS NULL OR released_at >= reserved_at
  )
);

CREATE INDEX idx_treasury_reservations_rail 
  ON treasury_reservations(rail) 
  WHERE released_at IS NULL;

CREATE INDEX idx_treasury_reservations_expires 
  ON treasury_reservations(expires_at) 
  WHERE released_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- TREASURY CONFIG (System-wide settings)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE treasury_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active BOOLEAN NOT NULL DEFAULT true,
  
  -- Freeze control
  payouts_frozen BOOLEAN NOT NULL DEFAULT false,
  frozen_at TIMESTAMP,
  frozen_reason TEXT,
  unfrozen_at TIMESTAMP,
  unfrozen_by TEXT,
  unfreeze_notes TEXT,
  
  -- Minimum balances per rail (in ngwee)
  mtn_minimum_balance_ngwee BIGINT NOT NULL DEFAULT 10000, -- 100 ZMW
  airtel_minimum_balance_ngwee BIGINT NOT NULL DEFAULT 10000,
  bank_minimum_balance_ngwee BIGINT NOT NULL DEFAULT 50000, -- 500 ZMW
  stablecoin_minimum_balance_ngwee BIGINT NOT NULL DEFAULT 5000, -- 50 ZMW
  
  -- Reconciliation thresholds
  reconciliation_tolerance_ngwee BIGINT NOT NULL DEFAULT 1000, -- 10 ZMW
  critical_discrepancy_threshold_ngwee BIGINT NOT NULL DEFAULT 100000, -- 1000 ZMW
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT only_one_active CHECK (
    NOT active OR (
      SELECT COUNT(*) FROM treasury_config WHERE active = true
    ) = 1
  )
);

-- Insert default config
INSERT INTO treasury_config (active) VALUES (true);

-- ─────────────────────────────────────────────────────────────
-- TREASURY RECONCILIATIONS (Daily audit logs)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE treasury_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Rail-specific reports (JSONB for flexibility)
  rail_reports JSONB NOT NULL,
  
  -- Overall status
  total_discrepancy_ngwee BIGINT NOT NULL,
  system_balanced BOOLEAN NOT NULL,
  
  -- Actions taken
  actions TEXT[] NOT NULL,
  
  -- Alerts (JSONB: [{severity, message}])
  alerts JSONB NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treasury_reconciliations_timestamp 
  ON treasury_reconciliations(timestamp DESC);

CREATE INDEX idx_treasury_reconciliations_balanced 
  ON treasury_reconciliations(system_balanced, timestamp DESC);

-- ─────────────────────────────────────────────────────────────
-- INBOUND PAYMENTS (External → Internal)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE inbound_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL UNIQUE,
  rail payment_rail NOT NULL,
  external_reference TEXT NOT NULL, -- MTN transaction ID, etc.
  
  amount_ngwee BIGINT NOT NULL CHECK (amount_ngwee > 0),
  buyer_id TEXT NOT NULL,
  
  confirmed_at TIMESTAMP NOT NULL,
  internally_settled BOOLEAN NOT NULL DEFAULT false,
  internally_settled_at TIMESTAMP,
  
  -- Reversal tracking
  reversal_window_ends_at TIMESTAMP NOT NULL,
  reversed_at TIMESTAMP,
  reversal_reason TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inbound_payments_rail ON inbound_payments(rail);
CREATE INDEX idx_inbound_payments_buyer ON inbound_payments(buyer_id);
CREATE INDEX idx_inbound_payments_settled ON inbound_payments(internally_settled);
CREATE INDEX idx_inbound_payments_reversal_window 
  ON inbound_payments(reversal_window_ends_at) 
  WHERE reversed_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- OUTBOUND PAYOUTS (Internal → External)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE outbound_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id TEXT NOT NULL UNIQUE,
  rail payment_rail NOT NULL,
  
  amount_ngwee BIGINT NOT NULL CHECK (amount_ngwee > 0),
  contributor_id TEXT NOT NULL,
  destination_account TEXT NOT NULL, -- Phone, IBAN, wallet address
  
  status payout_status NOT NULL DEFAULT 'RESERVED',
  
  initiated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  reversed_at TIMESTAMP,
  
  external_reference TEXT, -- Set when confirmed by rail
  error_message TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbound_payouts_rail ON outbound_payouts(rail);
CREATE INDEX idx_outbound_payouts_contributor ON outbound_payouts(contributor_id);
CREATE INDEX idx_outbound_payouts_status ON outbound_payouts(status);
CREATE INDEX idx_outbound_payouts_pending 
  ON outbound_payouts(initiated_at) 
  WHERE status IN ('INITIATED', 'PENDING');

-- ─────────────────────────────────────────────────────────────
-- TREASURY OPERATIONS LOG (Audit trail)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE treasury_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL,
  rail payment_rail NOT NULL,
  
  amount_ngwee BIGINT NOT NULL CHECK (amount_ngwee > 0),
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  
  status TEXT NOT NULL,
  external_reference TEXT,
  error_message TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treasury_operations_type ON treasury_operations(operation_type);
CREATE INDEX idx_treasury_operations_rail ON treasury_operations(rail);
CREATE INDEX idx_treasury_operations_created ON treasury_operations(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Function: Check if payouts are frozen
CREATE OR REPLACE FUNCTION are_payouts_frozen()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(payouts_frozen, false)
    FROM treasury_config
    WHERE active = true
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Get total reserved amount per rail
CREATE OR REPLACE FUNCTION get_reserved_amount(p_rail payment_rail)
RETURNS BIGINT AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT SUM(amount_ngwee)
      FROM treasury_reservations
      WHERE rail = p_rail
        AND released_at IS NULL
        AND expires_at > NOW()
    ),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-expire old reservations (run via cron)
CREATE OR REPLACE FUNCTION expire_old_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE treasury_reservations
  SET released_at = NOW()
  WHERE released_at IS NULL
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════

-- View: Treasury health dashboard
CREATE OR REPLACE VIEW treasury_health AS
SELECT
  (SELECT payouts_frozen FROM treasury_config WHERE active = true) AS payouts_frozen,
  (SELECT COUNT(*) FROM treasury_reservations WHERE released_at IS NULL AND expires_at > NOW()) AS active_reservations,
  (SELECT COUNT(*) FROM outbound_payouts WHERE status IN ('INITIATED', 'PENDING')) AS pending_payouts,
  (SELECT system_balanced FROM treasury_reconciliations ORDER BY timestamp DESC LIMIT 1) AS last_reconciliation_balanced,
  (SELECT timestamp FROM treasury_reconciliations ORDER BY timestamp DESC LIMIT 1) AS last_reconciliation_at;

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════