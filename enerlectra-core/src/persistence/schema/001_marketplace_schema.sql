/**
 * Marketplace Schema - Immutable Append-Only Design
 * 
 * Core principles:
 * 1. NO UPDATE statements on transactional tables
 * 2. NO DELETE statements (soft delete via status only)
 * 3. ALL mutations append new rows
 * 4. Triggers enforce immutability
 * 5. Foreign keys enforce referential integrity
 */

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_class AS ENUM ('STARTER', 'INVESTOR', 'ANCHOR');

CREATE TYPE lifecycle_state AS ENUM (
  'PLANNING',
  'FUNDING',
  'FUNDED',
  'INSTALLING',
  'OPERATIONAL',
  'FINALIZED',
  'CANCELLED',
  'FAILED'
);

CREATE TYPE contribution_status AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REVERSED',
  'LOCKED'
);

CREATE TYPE payment_method AS ENUM (
  'MTN_MOBILE_MONEY',
  'AIRTEL_MONEY',
  'BANK_TRANSFER',
  'CARD'
);

CREATE TYPE distribution_method AS ENUM (
  'DIRECT_ENERGY',
  'GRID_CREDIT',
  'CASH_EQUIVALENT',
  'SURPLUS_SOLD'
);

CREATE TYPE settlement_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE snapshot_trigger AS ENUM (
  'CONTRIBUTION_ADDED',
  'CONTRIBUTION_WITHDRAWN',
  'STATE_TRANSITION',
  'SETTLEMENT_EXECUTED',
  'MANUAL_SNAPSHOT',
  'SCHEDULED_SNAPSHOT'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

/**
 * Users table
 * Mutable: User profile can be updated
 */
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  current_class user_class NOT NULL DEFAULT 'STARTER',
  total_invested_usd DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  cluster_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT users_total_invested_positive CHECK (total_invested_usd >= 0),
  CONSTRAINT users_cluster_count_positive CHECK (cluster_count >= 0)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_class ON users(current_class);
CREATE INDEX idx_users_created_at ON users(created_at);

/**
 * Clusters table
 * Mutable: Lifecycle state and funding progress can change
 */
CREATE TABLE clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  lifecycle_state lifecycle_state NOT NULL DEFAULT 'PLANNING',
  
  -- Financial
  target_usd DECIMAL(12, 2) NOT NULL,
  current_usd DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  funding_pct DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  
  -- Technical
  target_kw DECIMAL(10, 2) NOT NULL,
  target_storage_kwh DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  monthly_kwh DECIMAL(12, 2) NOT NULL,
  
  -- Status
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  participant_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  funded_at TIMESTAMPTZ,
  operational_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ NOT NULL,
  
  CONSTRAINT clusters_target_usd_positive CHECK (target_usd > 0),
  CONSTRAINT clusters_current_usd_positive CHECK (current_usd >= 0),
  CONSTRAINT clusters_current_lte_target CHECK (current_usd <= target_usd * 1.01), -- Allow 1% overfunding
  CONSTRAINT clusters_funding_pct_valid CHECK (funding_pct >= 0 AND funding_pct <= 101),
  CONSTRAINT clusters_target_kw_positive CHECK (target_kw > 0),
  CONSTRAINT clusters_monthly_kwh_positive CHECK (monthly_kwh > 0)
);

CREATE INDEX idx_clusters_state ON clusters(lifecycle_state);
CREATE INDEX idx_clusters_location ON clusters(location);
CREATE INDEX idx_clusters_funding_pct ON clusters(funding_pct);
CREATE INDEX idx_clusters_is_locked ON clusters(is_locked);
CREATE INDEX idx_clusters_deadline ON clusters(deadline);

-- ============================================================================
-- IMMUTABLE TRANSACTION TABLES
-- ============================================================================

/**
 * Contributions table - APPEND ONLY
 * Records every contribution attempt (including failed ones)
 */
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  cluster_id UUID NOT NULL REFERENCES clusters(id),
  
  -- Financial
  amount_usd DECIMAL(12, 2) NOT NULL,
  amount_zmw DECIMAL(12, 2) NOT NULL,
  exchange_rate DECIMAL(10, 4) NOT NULL,
  pcus DECIMAL(12, 2) NOT NULL, -- 1 PCU = 1 USD
  
  -- Status
  status contribution_status NOT NULL DEFAULT 'PENDING',
  payment_method payment_method NOT NULL,
  
  -- Calculation at time of contribution
  projected_ownership_pct DECIMAL(5, 2) NOT NULL,
  early_investor_bonus DECIMAL(3, 2) NOT NULL DEFAULT 1.00,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  transaction_reference VARCHAR(255),
  
  -- Locking
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  grace_period_expires_at TIMESTAMPTZ NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT contributions_amount_usd_positive CHECK (amount_usd > 0),
  CONSTRAINT contributions_amount_zmw_positive CHECK (amount_zmw > 0),
  CONSTRAINT contributions_exchange_rate_positive CHECK (exchange_rate > 0),
  CONSTRAINT contributions_pcus_matches_usd CHECK (ABS(pcus - amount_usd) < 0.01),
  CONSTRAINT contributions_ownership_valid CHECK (projected_ownership_pct >= 0 AND projected_ownership_pct <= 100),
  CONSTRAINT contributions_bonus_valid CHECK (early_investor_bonus >= 1.0 AND early_investor_bonus <= 1.5)
);

CREATE INDEX idx_contributions_user_id ON contributions(user_id);
CREATE INDEX idx_contributions_cluster_id ON contributions(cluster_id);
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_contributions_created_at ON contributions(created_at);
CREATE INDEX idx_contributions_is_locked ON contributions(is_locked);

-- Prevent updates to completed contributions
CREATE OR REPLACE FUNCTION prevent_contribution_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'COMPLETED' AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'Cannot modify completed contribution';
  END IF;
  IF OLD.is_locked = TRUE AND NEW.is_locked != OLD.is_locked THEN
    RAISE EXCEPTION 'Cannot unlock contribution';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_contribution_update
  BEFORE UPDATE ON contributions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_contribution_update();

/**
 * Snapshots table - STRICTLY IMMUTABLE
 * Never updated, never deleted. Only INSERT allowed.
 */
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id),
  version INTEGER NOT NULL,
  lifecycle_state lifecycle_state NOT NULL,
  triggered_by snapshot_trigger NOT NULL,
  
  -- Financial state
  target_usd DECIMAL(12, 2) NOT NULL,
  current_usd DECIMAL(12, 2) NOT NULL,
  funding_pct DECIMAL(5, 2) NOT NULL,
  total_pcus DECIMAL(12, 2) NOT NULL,
  
  -- Energy state
  target_kw DECIMAL(10, 2) NOT NULL,
  monthly_kwh DECIMAL(12, 2) NOT NULL,
  
  -- Distribution metrics
  participant_count INTEGER NOT NULL,
  gini_coefficient DECIMAL(5, 4) NOT NULL, -- 0 = equality, 1 = inequality
  herfindahl_index DECIMAL(10, 4) NOT NULL, -- Concentration measure
  largest_ownership_pct DECIMAL(5, 2) NOT NULL,
  
  -- Calculation trace (JSONB for flexibility)
  calculation_trace JSONB NOT NULL,
  
  -- Immutability chain
  previous_snapshot_id UUID REFERENCES snapshots(id),
  hash VARCHAR(64) NOT NULL,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB,
  
  CONSTRAINT snapshots_version_positive CHECK (version > 0),
  CONSTRAINT snapshots_funding_pct_valid CHECK (funding_pct >= 0 AND funding_pct <= 101),
  CONSTRAINT snapshots_gini_valid CHECK (gini_coefficient >= 0 AND gini_coefficient <= 1),
  CONSTRAINT snapshots_hash_format CHECK (hash ~ '^[0-9a-f]{16,64}$'),
  CONSTRAINT snapshots_unique_version UNIQUE (cluster_id, version)
);

CREATE INDEX idx_snapshots_cluster_id ON snapshots(cluster_id);
CREATE INDEX idx_snapshots_version ON snapshots(version);
CREATE INDEX idx_snapshots_state ON snapshots(lifecycle_state);
CREATE INDEX idx_snapshots_created_at ON snapshots(created_at);
CREATE INDEX idx_snapshots_previous ON snapshots(previous_snapshot_id);

-- Prevent ANY updates or deletes on snapshots
CREATE OR REPLACE FUNCTION prevent_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Snapshots are immutable. No updates or deletes allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_snapshot_update
  BEFORE UPDATE ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

CREATE TRIGGER trigger_prevent_snapshot_delete
  BEFORE DELETE ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

/**
 * Snapshot participants - IMMUTABLE
 * Each snapshot has its own participant records
 */
CREATE TABLE snapshot_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Position at snapshot time
  user_name VARCHAR(255) NOT NULL,
  user_class user_class NOT NULL,
  pcus DECIMAL(12, 2) NOT NULL,
  ownership_pct DECIMAL(5, 2) NOT NULL,
  
  -- Energy allocation
  kwh_per_month DECIMAL(12, 2) NOT NULL,
  monthly_value_zmw DECIMAL(12, 2) NOT NULL,
  
  -- Contribution history
  contribution_count INTEGER NOT NULL,
  first_contribution_at TIMESTAMPTZ NOT NULL,
  last_contribution_at TIMESTAMPTZ NOT NULL,
  early_investor_bonus DECIMAL(3, 2) NOT NULL,
  
  CONSTRAINT snapshot_participants_pcus_positive CHECK (pcus > 0),
  CONSTRAINT snapshot_participants_ownership_valid CHECK (ownership_pct > 0 AND ownership_pct <= 100),
  CONSTRAINT snapshot_participants_kwh_positive CHECK (kwh_per_month >= 0)
);

CREATE INDEX idx_snapshot_participants_snapshot_id ON snapshot_participants(snapshot_id);
CREATE INDEX idx_snapshot_participants_user_id ON snapshot_participants(user_id);
CREATE INDEX idx_snapshot_participants_ownership ON snapshot_participants(ownership_pct DESC);

-- Prevent mutations
CREATE TRIGGER trigger_prevent_snapshot_participant_update
  BEFORE UPDATE ON snapshot_participants
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

CREATE TRIGGER trigger_prevent_snapshot_participant_delete
  BEFORE DELETE ON snapshot_participants
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

/**
 * Settlements table - IMMUTABLE
 * Records energy/value distribution to participants
 */
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id),
  snapshot_id UUID NOT NULL REFERENCES snapshots(id),
  lifecycle_state lifecycle_state NOT NULL,
  
  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Energy metrics
  allocated_kwh DECIMAL(12, 2) NOT NULL,
  actual_kwh_generated DECIMAL(12, 2) NOT NULL,
  utilization_pct DECIMAL(5, 2) NOT NULL,
  surplus_kwh DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  
  -- Financial metrics
  total_value_zmw DECIMAL(12, 2) NOT NULL,
  distributed_value_zmw DECIMAL(12, 2) NOT NULL,
  surplus_value_zmw DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  
  -- Participants
  participant_count INTEGER NOT NULL,
  
  -- Status
  status settlement_status NOT NULL DEFAULT 'PENDING',
  
  -- Calculation trace
  calculation_trace JSONB NOT NULL,
  
  -- Immutability chain
  previous_settlement_id UUID REFERENCES settlements(id),
  hash VARCHAR(64) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB,
  
  CONSTRAINT settlements_period_valid CHECK (period_end > period_start),
  CONSTRAINT settlements_allocated_positive CHECK (allocated_kwh >= 0),
  CONSTRAINT settlements_actual_positive CHECK (actual_kwh_generated >= 0),
  CONSTRAINT settlements_utilization_valid CHECK (utilization_pct >= 0),
  CONSTRAINT settlements_surplus_positive CHECK (surplus_kwh >= 0),
  CONSTRAINT settlements_hash_format CHECK (hash ~ '^[0-9a-f]{16,64}$')
);

CREATE INDEX idx_settlements_cluster_id ON settlements(cluster_id);
CREATE INDEX idx_settlements_snapshot_id ON settlements(snapshot_id);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_period ON settlements(period_start, period_end);
CREATE INDEX idx_settlements_created_at ON settlements(created_at);

-- Prevent mutations
CREATE TRIGGER trigger_prevent_settlement_update
  BEFORE UPDATE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

CREATE TRIGGER trigger_prevent_settlement_delete
  BEFORE DELETE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

/**
 * Participant settlements - IMMUTABLE
 * Individual distribution records
 */
CREATE TABLE participant_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,
  
  -- Energy
  allocated_kwh DECIMAL(12, 2) NOT NULL,
  actual_kwh DECIMAL(12, 2) NOT NULL,
  
  -- Financial
  value_zmw DECIMAL(12, 2) NOT NULL,
  
  -- Distribution
  distribution_method distribution_method NOT NULL,
  status settlement_status NOT NULL DEFAULT 'PENDING',
  transaction_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT participant_settlements_allocated_positive CHECK (allocated_kwh >= 0),
  CONSTRAINT participant_settlements_actual_positive CHECK (actual_kwh >= 0),
  CONSTRAINT participant_settlements_value_positive CHECK (value_zmw >= 0)
);

CREATE INDEX idx_participant_settlements_settlement_id ON participant_settlements(settlement_id);
CREATE INDEX idx_participant_settlements_user_id ON participant_settlements(user_id);
CREATE INDEX idx_participant_settlements_status ON participant_settlements(status);

-- Prevent mutations
CREATE TRIGGER trigger_prevent_participant_settlement_update
  BEFORE UPDATE ON participant_settlements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

CREATE TRIGGER trigger_prevent_participant_settlement_delete
  BEFORE DELETE ON participant_settlements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

-- ============================================================================
-- AUDIT LOG - IMMUTABLE
-- ============================================================================

CREATE TYPE audit_event_type AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'CLUSTER_CREATED',
  'CLUSTER_STATE_CHANGED',
  'CONTRIBUTION_CREATED',
  'CONTRIBUTION_COMPLETED',
  'CONTRIBUTION_LOCKED',
  'SNAPSHOT_CREATED',
  'SETTLEMENT_CREATED',
  'SETTLEMENT_COMPLETED',
  'VALIDATION_FAILED',
  'SYSTEM_EVENT'
);

/**
 * Audit log - STRICTLY IMMUTABLE
 * Every mutation in the system creates an audit entry
 */
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type audit_event_type NOT NULL,
  
  -- Entities involved
  user_id UUID REFERENCES users(id),
  cluster_id UUID REFERENCES clusters(id),
  contribution_id UUID REFERENCES contributions(id),
  snapshot_id UUID REFERENCES snapshots(id),
  settlement_id UUID REFERENCES settlements(id),
  
  -- Event details
  event_data JSONB NOT NULL,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_cluster_id ON audit_log(cluster_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Prevent ANY mutations on audit log
CREATE TRIGGER trigger_prevent_audit_log_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

CREATE TRIGGER trigger_prevent_audit_log_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();

-- ============================================================================
-- AUTOMATIC AUDIT TRIGGERS
-- ============================================================================

/**
 * Automatically log cluster state changes
 */
CREATE OR REPLACE FUNCTION log_cluster_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.lifecycle_state IS DISTINCT FROM NEW.lifecycle_state THEN
    INSERT INTO audit_log (
      event_type,
      cluster_id,
      event_data
    ) VALUES (
      'CLUSTER_STATE_CHANGED',
      NEW.id,
      jsonb_build_object(
        'old_state', OLD.lifecycle_state,
        'new_state', NEW.lifecycle_state,
        'funding_pct', NEW.funding_pct
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_cluster_state_change
  AFTER UPDATE ON clusters
  FOR EACH ROW
  EXECUTE FUNCTION log_cluster_state_change();

/**
 * Automatically log contribution completion
 */
CREATE OR REPLACE FUNCTION log_contribution_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'COMPLETED' AND NEW.status = 'COMPLETED' THEN
    INSERT INTO audit_log (
      event_type,
      user_id,
      cluster_id,
      contribution_id,
      event_data
    ) VALUES (
      'CONTRIBUTION_COMPLETED',
      NEW.user_id,
      NEW.cluster_id,
      NEW.id,
      jsonb_build_object(
        'amount_usd', NEW.amount_usd,
        'pcus', NEW.pcus,
        'projected_ownership_pct', NEW.projected_ownership_pct
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_contribution_completion
  AFTER UPDATE ON contributions
  FOR EACH ROW
  EXECUTE FUNCTION log_contribution_completion();

/**
 * Automatically log snapshot creation
 */
CREATE OR REPLACE FUNCTION log_snapshot_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    event_type,
    cluster_id,
    snapshot_id,
    event_data
  ) VALUES (
    'SNAPSHOT_CREATED',
    NEW.cluster_id,
    NEW.id,
    jsonb_build_object(
      'version', NEW.version,
      'triggered_by', NEW.triggered_by,
      'funding_pct', NEW.funding_pct,
      'participant_count', NEW.participant_count
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_snapshot_creation
  AFTER INSERT ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION log_snapshot_creation();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Get current user ownership in a cluster
 */
CREATE OR REPLACE FUNCTION get_user_ownership(
  p_user_id UUID,
  p_cluster_id UUID
)
RETURNS TABLE (
  pcus DECIMAL(12, 2),
  ownership_pct DECIMAL(5, 2),
  contribution_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(c.pcus), 0) as pcus,
    CASE 
      WHEN cl.current_usd > 0 THEN 
        (COALESCE(SUM(c.pcus), 0) / cl.current_usd) * 100
      ELSE 0
    END as ownership_pct,
    COUNT(c.id) as contribution_count
  FROM contributions c
  INNER JOIN clusters cl ON cl.id = c.cluster_id
  WHERE c.user_id = p_user_id
    AND c.cluster_id = p_cluster_id
    AND c.status = 'COMPLETED'
  GROUP BY cl.current_usd;
END;
$$ LANGUAGE plpgsql;

/**
 * Verify snapshot chain integrity
 */
CREATE OR REPLACE FUNCTION verify_snapshot_chain(p_snapshot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_snapshot RECORD;
  v_previous RECORD;
BEGIN
  SELECT * INTO v_snapshot FROM snapshots WHERE id = p_snapshot_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- First snapshot in chain
  IF v_snapshot.previous_snapshot_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Verify previous exists
  SELECT * INTO v_previous FROM snapshots WHERE id = v_snapshot.previous_snapshot_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Verify version sequence
  IF v_snapshot.version != v_previous.version + 1 THEN
    RETURN FALSE;
  END IF;
  
  -- Verify same cluster
  IF v_snapshot.cluster_id != v_previous.cluster_id THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;