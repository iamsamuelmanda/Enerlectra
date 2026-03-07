-- ═══════════════════════════════════════════════════════════════
-- ACCOUNTS CORE SCHEMA
-- Production-grade double-entry ledger for energy clearinghouse
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- ACCOUNT TYPES ENUM
-- ─────────────────────────────────────────────────────────────
CREATE TYPE account_type AS ENUM (
  'CONTRIBUTOR',    -- Individual entitlement position
  'CLUSTER_POOL',   -- Temporary holding account per cycle
  'RESERVE',        -- Persistent surplus/buffer per cluster
  'IMBALANCE',      -- Scoped reconciliation account per cycle
  'SYSTEM'          -- Anchor account for external flows
);

-- ─────────────────────────────────────────────────────────────
-- UNIT ENUM
-- ─────────────────────────────────────────────────────────────
CREATE TYPE account_unit AS ENUM (
  'KWH',   -- Energy
  'ZMW'    -- Currency
);

-- ─────────────────────────────────────────────────────────────
-- ACCOUNTS TABLE
-- ─────────────────────────────────────────────────────────────
-- 🚨 CRITICAL: DO NOT STORE BALANCE HERE
-- Balances are DERIVED from ledger_entries
-- This ensures replay determinism
-- ─────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  account_type account_type NOT NULL,
  unit account_unit NOT NULL,
  
  -- Ownership/scope references
  contributor_id UUID,           -- For CONTRIBUTOR accounts
  cluster_id UUID,               -- For CLUSTER_POOL, RESERVE
  settlement_cycle_id TEXT,      -- For CLUSTER_POOL, IMBALANCE (scoped)
  
  -- Metadata
  label TEXT,                    -- Human-readable label
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- ─────────────────────────────────────────────────────────────
  -- CONSTRAINTS
  -- ─────────────────────────────────────────────────────────────
  
  -- CONTRIBUTOR accounts must have contributor_id
  CONSTRAINT contributor_requires_contributor_id 
    CHECK (
      account_type != 'CONTRIBUTOR' 
      OR contributor_id IS NOT NULL
    ),
  
  -- CLUSTER_POOL accounts must have cluster_id AND settlement_cycle_id
  CONSTRAINT cluster_pool_requires_scope
    CHECK (
      account_type != 'CLUSTER_POOL' 
      OR (cluster_id IS NOT NULL AND settlement_cycle_id IS NOT NULL)
    ),
  
  -- RESERVE accounts must have cluster_id
  CONSTRAINT reserve_requires_cluster_id
    CHECK (
      account_type != 'RESERVE'
      OR cluster_id IS NOT NULL
    ),
  
  -- IMBALANCE accounts must have settlement_cycle_id
  CONSTRAINT imbalance_requires_cycle_id
    CHECK (
      account_type != 'IMBALANCE'
      OR settlement_cycle_id IS NOT NULL
    ),
  
  -- UNIQUE constraint: One CLUSTER_POOL per (cluster_id, settlement_cycle_id, unit)
  CONSTRAINT unique_cluster_pool_per_cycle
    UNIQUE (cluster_id, settlement_cycle_id, unit)
    WHERE account_type = 'CLUSTER_POOL',
  
  -- UNIQUE constraint: One RESERVE per (cluster_id, unit)
  CONSTRAINT unique_reserve_per_cluster
    UNIQUE (cluster_id, unit)
    WHERE account_type = 'RESERVE',
  
  -- UNIQUE constraint: One IMBALANCE per (settlement_cycle_id, unit)
  CONSTRAINT unique_imbalance_per_cycle
    UNIQUE (settlement_cycle_id, unit)
    WHERE account_type = 'IMBALANCE'
);

-- Indexes for common queries
CREATE INDEX idx_accounts_contributor ON accounts(contributor_id) WHERE contributor_id IS NOT NULL;
CREATE INDEX idx_accounts_cluster ON accounts(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_accounts_cycle ON accounts(settlement_cycle_id) WHERE settlement_cycle_id IS NOT NULL;
CREATE INDEX idx_accounts_type ON accounts(account_type);

-- ─────────────────────────────────────────────────────────────
-- LEDGER ENTRIES TABLE (THE CORE ENGINE)
-- ─────────────────────────────────────────────────────────────
-- 🚨 APPEND-ONLY. NO UPDATES. NO DELETES.
-- Every transaction = 2 entries (debit + credit)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ledger_entries (
  ledger_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Account reference
  account_id UUID NOT NULL REFERENCES accounts(account_id),
  
  -- Scope
  settlement_cycle_id TEXT NOT NULL,
  
  -- Double-entry: EXACTLY ONE must be > 0
  debit_amount NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  
  -- Unit (must match account unit)
  unit account_unit NOT NULL,
  
  -- Transaction grouping (all entries in same transfer share this)
  transaction_id UUID NOT NULL,
  
  -- Audit trail
  operation_type TEXT NOT NULL,  -- 'PRODUCTION_CREDIT', 'ENTITLEMENT_ALLOCATION', etc.
  description TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- ─────────────────────────────────────────────────────────────
  -- CONSTRAINTS
  -- ─────────────────────────────────────────────────────────────
  
  -- CRITICAL: Cannot have both debit AND credit > 0
  CONSTRAINT no_dual_entry
    CHECK (NOT (debit_amount > 0 AND credit_amount > 0)),
  
  -- CRITICAL: Must have EITHER debit OR credit > 0
  CONSTRAINT must_have_amount
    CHECK (debit_amount > 0 OR credit_amount > 0),
  
  -- Unit must match account unit
  CONSTRAINT unit_matches_account
    CHECK (
      unit = (SELECT unit FROM accounts WHERE account_id = ledger_entries.account_id)
    )
);

-- Indexes for performance
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_cycle ON ledger_entries(settlement_cycle_id);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_created ON ledger_entries(created_at);

-- ─────────────────────────────────────────────────────────────
-- IMMUTABILITY TRIGGER (CRITICAL)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only. No updates or deletes allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_ledger_entries
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER no_delete_ledger_entries
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_mutation();

-- ─────────────────────────────────────────────────────────────
-- ACCOUNT BALANCES VIEW (DERIVED, NOT STORED)
-- ─────────────────────────────────────────────────────────────
-- 🚨 BALANCES ARE COMPUTED FROM LEDGER, NOT STORED
-- This is what enables replay determinism
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.account_id,
  a.account_type,
  a.unit,
  a.contributor_id,
  a.cluster_id,
  a.settlement_cycle_id,
  COALESCE(SUM(le.credit_amount), 0) - COALESCE(SUM(le.debit_amount), 0) AS balance,
  COUNT(le.ledger_entry_id) AS entry_count,
  MAX(le.created_at) AS last_entry_at
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.account_id
GROUP BY 
  a.account_id,
  a.account_type,
  a.unit,
  a.contributor_id,
  a.cluster_id,
  a.settlement_cycle_id;

-- ─────────────────────────────────────────────────────────────
-- CYCLE BALANCE VIEW (FOR INVARIANT CHECKING)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW cycle_balances AS
SELECT
  settlement_cycle_id,
  unit,
  SUM(credit_amount) AS total_credits,
  SUM(debit_amount) AS total_debits,
  SUM(credit_amount) - SUM(debit_amount) AS net_balance
FROM ledger_entries
GROUP BY settlement_cycle_id, unit;

-- ─────────────────────────────────────────────────────────────
-- INVARIANT CHECK FUNCTION
-- ─────────────────────────────────────────────────────────────
-- Call this after every settlement cycle completes
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_cycle_balanced(
  p_settlement_cycle_id TEXT,
  p_unit account_unit
)
RETURNS BOOLEAN AS $$
DECLARE
  v_net_balance NUMERIC;
BEGIN
  SELECT net_balance INTO v_net_balance
  FROM cycle_balances
  WHERE settlement_cycle_id = p_settlement_cycle_id
    AND unit = p_unit;
  
  -- Allow tiny floating point error (1 millionth)
  IF ABS(v_net_balance) > 0.000001 THEN
    RAISE EXCEPTION 'Cycle % unit % not balanced: net = %', 
      p_settlement_cycle_id, p_unit, v_net_balance;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- HELPER: GET ACCOUNT BALANCE
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_account_balance(
  p_account_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT balance INTO v_balance
  FROM account_balances
  WHERE account_id = p_account_id;
  
  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- HELPER: FIND OR CREATE ACCOUNT
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION find_or_create_account(
  p_account_type account_type,
  p_unit account_unit,
  p_contributor_id UUID DEFAULT NULL,
  p_cluster_id UUID DEFAULT NULL,
  p_settlement_cycle_id TEXT DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Try to find existing account
  SELECT account_id INTO v_account_id
  FROM accounts
  WHERE account_type = p_account_type
    AND unit = p_unit
    AND (contributor_id = p_contributor_id OR (contributor_id IS NULL AND p_contributor_id IS NULL))
    AND (cluster_id = p_cluster_id OR (cluster_id IS NULL AND p_cluster_id IS NULL))
    AND (settlement_cycle_id = p_settlement_cycle_id OR (settlement_cycle_id IS NULL AND p_settlement_cycle_id IS NULL))
  LIMIT 1;
  
  -- If not found, create it
  IF v_account_id IS NULL THEN
    INSERT INTO accounts (
      account_type,
      unit,
      contributor_id,
      cluster_id,
      settlement_cycle_id,
      label
    ) VALUES (
      p_account_type,
      p_unit,
      p_contributor_id,
      p_cluster_id,
      p_settlement_cycle_id,
      p_label
    )
    RETURNING account_id INTO v_account_id;
  END IF;
  
  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- TRANSACTION ISOLATION RECOMMENDATION
-- ─────────────────────────────────────────────────────────────
-- For settlement execution, use:
-- BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- ... perform ledger operations ...
-- COMMIT;
-- ─────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════
-- SCHEMA COMPLETE
-- ═══════════════════════════════════════════════════════════════