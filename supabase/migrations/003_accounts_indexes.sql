-- ═══════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Composite index for common balance queries
CREATE INDEX idx_ledger_account_cycle 
  ON ledger_entries(account_id, settlement_cycle_id);

-- Index for transaction atomicity verification
CREATE INDEX idx_ledger_transaction_created 
  ON ledger_entries(transaction_id, created_at);

-- Partial index for pool accounts (frequently queried)
CREATE INDEX idx_accounts_pool 
  ON accounts(cluster_id, settlement_cycle_id) 
  WHERE account_type = 'CLUSTER_POOL';

-- ═══════════════════════════════════════════════════════════════
-- INDEXES COMPLETE
-- ═══════════════════════════════════════════════════════════════