-- ═══════════════════════════════════════════════════════════════
-- PAYMENT INTENTS MIGRATION
-- State machine for buyer payment orchestration
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- PAYMENT INTENT STATE ENUM
-- ─────────────────────────────────────────────────────────────

CREATE TYPE payment_intent_state AS ENUM (
  'CREATED',
  'RESERVED',
  'INITIATED',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'SETTLED',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
);

-- ─────────────────────────────────────────────────────────────
-- PAYMENT INTENTS TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL UNIQUE,
  buyer_id TEXT NOT NULL,
  
  -- What's being purchased
  energy_wh BIGINT NOT NULL CHECK (energy_wh > 0),
  amount_ngwee BIGINT NOT NULL CHECK (amount_ngwee > 0),
  price_per_wh BIGINT NOT NULL CHECK (price_per_wh > 0),
  
  -- Payment method
  rail payment_rail NOT NULL,
  destination_account TEXT,
  
  -- State
  state payment_intent_state NOT NULL DEFAULT 'CREATED',
  
  -- Lifecycle timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reserved_at TIMESTAMP,
  initiated_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  settled_at TIMESTAMP,
  failed_at TIMESTAMP,
  expired_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Expiry
  expires_at TIMESTAMP NOT NULL,
  
  -- External references
  external_reference TEXT,
  treasury_reservation_id TEXT,
  
  -- Settlement linkage
  settlement_cycle_id TEXT,
  ledger_transaction_id TEXT,
  
  -- Error tracking
  error_message TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata JSONB,
  
  -- Constraints
  CONSTRAINT valid_timestamps CHECK (
    created_at <= expires_at
  ),
  
  CONSTRAINT reserved_before_initiated CHECK (
    reserved_at IS NULL OR initiated_at IS NULL OR reserved_at <= initiated_at
  ),
  
  CONSTRAINT initiated_before_confirmed CHECK (
    initiated_at IS NULL OR confirmed_at IS NULL OR initiated_at <= confirmed_at
  ),
  
  CONSTRAINT confirmed_before_settled CHECK (
    confirmed_at IS NULL OR settled_at IS NULL OR confirmed_at <= settled_at
  )
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE INDEX idx_payment_intents_buyer 
  ON payment_intents(buyer_id);

CREATE INDEX idx_payment_intents_state 
  ON payment_intents(state);

CREATE INDEX idx_payment_intents_rail 
  ON payment_intents(rail);

CREATE INDEX idx_payment_intents_external_ref 
  ON payment_intents(external_reference) 
  WHERE external_reference IS NOT NULL;

CREATE INDEX idx_payment_intents_expires 
  ON payment_intents(expires_at) 
  WHERE state IN ('RESERVED', 'AWAITING_CONFIRMATION');

CREATE INDEX idx_payment_intents_created 
  ON payment_intents(created_at DESC);

CREATE INDEX idx_payment_intents_settlement_cycle 
  ON payment_intents(settlement_cycle_id) 
  WHERE settlement_cycle_id IS NOT NULL;

-- Composite index for common queries
CREATE INDEX idx_payment_intents_buyer_state 
  ON payment_intents(buyer_id, state, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Function: Get payment intents that need expiry processing
CREATE OR REPLACE FUNCTION get_expired_payment_intents()
RETURNS TABLE(
  intent_id TEXT,
  buyer_id TEXT,
  state payment_intent_state,
  expires_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pi.intent_id,
    pi.buyer_id,
    pi.state,
    pi.expires_at
  FROM payment_intents pi
  WHERE pi.state IN ('RESERVED', 'AWAITING_CONFIRMATION')
    AND pi.expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: Get payment intent statistics
CREATE OR REPLACE FUNCTION get_payment_intent_stats(
  p_buyer_id TEXT DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NULL,
  p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE(
  total_count BIGINT,
  created_count BIGINT,
  reserved_count BIGINT,
  initiated_count BIGINT,
  awaiting_confirmation_count BIGINT,
  confirmed_count BIGINT,
  settled_count BIGINT,
  failed_count BIGINT,
  expired_count BIGINT,
  cancelled_count BIGINT,
  total_amount_ngwee BIGINT,
  settled_amount_ngwee BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE state = 'CREATED') AS created,
      COUNT(*) FILTER (WHERE state = 'RESERVED') AS reserved,
      COUNT(*) FILTER (WHERE state = 'INITIATED') AS initiated,
      COUNT(*) FILTER (WHERE state = 'AWAITING_CONFIRMATION') AS awaiting,
      COUNT(*) FILTER (WHERE state = 'CONFIRMED') AS confirmed,
      COUNT(*) FILTER (WHERE state = 'SETTLED') AS settled,
      COUNT(*) FILTER (WHERE state = 'FAILED') AS failed,
      COUNT(*) FILTER (WHERE state = 'EXPIRED') AS expired,
      COUNT(*) FILTER (WHERE state = 'CANCELLED') AS cancelled,
      SUM(amount_ngwee) AS total_amount,
      SUM(amount_ngwee) FILTER (WHERE state = 'SETTLED') AS settled_amount
    FROM payment_intents
    WHERE (p_buyer_id IS NULL OR buyer_id = p_buyer_id)
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
  )
  SELECT
    total,
    created,
    reserved,
    initiated,
    awaiting,
    confirmed,
    settled,
    failed,
    expired,
    cancelled,
    COALESCE(total_amount, 0),
    COALESCE(settled_amount, 0),
    CASE
      WHEN settled + failed + expired + cancelled > 0
      THEN (settled::NUMERIC / (settled + failed + expired + cancelled)) * 100
      ELSE 0
    END
  FROM stats;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────

-- View: Active payment intents (not terminal)
CREATE OR REPLACE VIEW active_payment_intents AS
SELECT *
FROM payment_intents
WHERE state NOT IN ('SETTLED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- View: Payment intents awaiting confirmation
CREATE OR REPLACE VIEW awaiting_confirmation_intents AS
SELECT
  intent_id,
  buyer_id,
  rail,
  amount_ngwee,
  initiated_at,
  expires_at,
  EXTRACT(EPOCH FROM (NOW() - initiated_at)) AS seconds_waiting
FROM payment_intents
WHERE state = 'AWAITING_CONFIRMATION'
ORDER BY initiated_at ASC;

-- View: Payment intent summary by buyer
CREATE OR REPLACE VIEW payment_intent_summary_by_buyer AS
SELECT
  buyer_id,
  COUNT(*) AS total_intents,
  COUNT(*) FILTER (WHERE state = 'SETTLED') AS settled_count,
  SUM(amount_ngwee) AS total_amount_ngwee,
  SUM(amount_ngwee) FILTER (WHERE state = 'SETTLED') AS settled_amount_ngwee,
  MAX(created_at) AS last_purchase_at
FROM payment_intents
GROUP BY buyer_id;

-- ─────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────

-- Prevent modification of terminal states
CREATE OR REPLACE FUNCTION prevent_terminal_state_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('SETTLED', 'FAILED', 'EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot modify payment intent in terminal state: %', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_modify_terminal_payment_intents
  BEFORE UPDATE ON payment_intents
  FOR EACH ROW
  EXECUTE FUNCTION prevent_terminal_state_modification();

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════

-- Verification queries:
-- SELECT * FROM get_expired_payment_intents();
-- SELECT * FROM get_payment_intent_stats();
-- SELECT * FROM active_payment_intents;
-- SELECT * FROM awaiting_confirmation_intents;