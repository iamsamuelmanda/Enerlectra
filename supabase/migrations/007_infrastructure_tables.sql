-- ═══════════════════════════════════════════════════════════════
-- INFRASTRUCTURE MONITORING TABLES
-- Webhook logs, job executions, snapshots, alerts
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- WEBHOOK LOGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'MTN', 'AIRTEL', etc.
  payload JSONB NOT NULL,
  signature TEXT,
  
  status TEXT NOT NULL, -- 'RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED', 'ERROR'
  error_message TEXT,
  
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMP,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_source ON webhook_logs(source);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_received ON webhook_logs(received_at DESC);
CREATE INDEX idx_webhook_logs_retry 
  ON webhook_logs(retry_count, status) 
  WHERE status = 'ERROR';

-- ─────────────────────────────────────────────────────────────
-- JOB EXECUTIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  
  success BOOLEAN NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NOT NULL,
  duration_ms INTEGER NOT NULL,
  
  result JSONB,
  error_message TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_executions_name ON job_executions(job_name);
CREATE INDEX idx_job_executions_started ON job_executions(started_at DESC);
CREATE INDEX idx_job_executions_success ON job_executions(success, job_name);

-- ─────────────────────────────────────────────────────────────
-- TREASURY SNAPSHOTS (Hourly state for trending)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE treasury_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL,
  
  state JSONB NOT NULL, -- Full TreasuryState object
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treasury_snapshots_timestamp 
  ON treasury_snapshots(timestamp DESC);

-- ─────────────────────────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE alert_severity AS ENUM (
  'INFO',
  'WARNING',
  'ERROR',
  'CRITICAL'
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity alert_severity NOT NULL,
  source TEXT NOT NULL, -- 'treasury', 'payment_intent', 'background_jobs', etc.
  
  message TEXT NOT NULL,
  metadata JSONB,
  
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMP,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged, created_at DESC);
CREATE INDEX idx_alerts_source ON alerts(source);

-- ─────────────────────────────────────────────────────────────
-- SYSTEM HEALTH CHECKS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  status TEXT NOT NULL, -- 'healthy', 'degraded', 'unhealthy'
  checks JSONB NOT NULL, -- { database: 'ok', treasury: 'ok', ... }
  
  response_time_ms INTEGER,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_checks_timestamp 
  ON health_checks(timestamp DESC);

CREATE INDEX idx_health_checks_status 
  ON health_checks(status, timestamp DESC);

-- ─────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────

-- View: Recent webhook failures
CREATE OR REPLACE VIEW recent_webhook_failures AS
SELECT 
  id,
  source,
  error_message,
  retry_count,
  received_at,
  last_retry_at
FROM webhook_logs
WHERE status IN ('ERROR', 'FAILED')
  AND received_at > NOW() - INTERVAL '24 hours'
ORDER BY received_at DESC;

-- View: Recent job failures
CREATE OR REPLACE VIEW recent_job_failures AS
SELECT
  id,
  job_name,
  error_message,
  started_at,
  duration_ms
FROM job_executions
WHERE success = false
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- View: Unacknowledged alerts
CREATE OR REPLACE VIEW unacknowledged_alerts AS
SELECT
  id,
  severity,
  source,
  message,
  created_at
FROM alerts
WHERE acknowledged = false
ORDER BY 
  CASE severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'ERROR' THEN 2
    WHEN 'WARNING' THEN 3
    WHEN 'INFO' THEN 4
  END,
  created_at DESC;

-- View: System health summary
CREATE OR REPLACE VIEW system_health_summary AS
WITH latest_health AS (
  SELECT * FROM health_checks
  ORDER BY timestamp DESC
  LIMIT 1
),
latest_reconciliation AS (
  SELECT * FROM treasury_reconciliations
  ORDER BY timestamp DESC
  LIMIT 1
)
SELECT
  h.status AS overall_status,
  h.timestamp AS last_check_at,
  r.system_balanced AS treasury_balanced,
  r.timestamp AS last_reconciliation_at,
  (SELECT COUNT(*) FROM unacknowledged_alerts WHERE severity IN ('CRITICAL', 'ERROR')) AS critical_alerts
FROM latest_health h
CROSS JOIN latest_reconciliation r;

-- ─────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Function: Get job execution statistics
CREATE OR REPLACE FUNCTION get_job_statistics(
  p_job_name TEXT DEFAULT NULL,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  job_name TEXT,
  total_executions BIGINT,
  successful_executions BIGINT,
  failed_executions BIGINT,
  success_rate NUMERIC,
  avg_duration_ms NUMERIC,
  last_execution TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.job_name,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE je.success = true) AS successful_executions,
    COUNT(*) FILTER (WHERE je.success = false) AS failed_executions,
    (COUNT(*) FILTER (WHERE je.success = true)::NUMERIC / COUNT(*)) * 100 AS success_rate,
    AVG(je.duration_ms) AS avg_duration_ms,
    MAX(je.started_at) AS last_execution
  FROM job_executions je
  WHERE (p_job_name IS NULL OR je.job_name = p_job_name)
    AND je.started_at > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY je.job_name
  ORDER BY je.job_name;
END;
$$ LANGUAGE plpgsql;

-- Function: Get webhook statistics
CREATE OR REPLACE FUNCTION get_webhook_statistics(
  p_source TEXT DEFAULT NULL,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  source TEXT,
  total_webhooks BIGINT,
  processed BIGINT,
  failed BIGINT,
  ignored BIGINT,
  error BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wl.source,
    COUNT(*) AS total_webhooks,
    COUNT(*) FILTER (WHERE wl.status = 'PROCESSED') AS processed,
    COUNT(*) FILTER (WHERE wl.status = 'FAILED') AS failed,
    COUNT(*) FILTER (WHERE wl.status = 'IGNORED') AS ignored,
    COUNT(*) FILTER (WHERE wl.status = 'ERROR') AS error,
    (COUNT(*) FILTER (WHERE wl.status = 'PROCESSED')::NUMERIC / COUNT(*)) * 100 AS success_rate
  FROM webhook_logs wl
  WHERE (p_source IS NULL OR wl.source = p_source)
    AND wl.received_at > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY wl.source
  ORDER BY wl.source;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════

-- Verification queries:
-- SELECT * FROM system_health_summary;
-- SELECT * FROM unacknowledged_alerts;
-- SELECT * FROM get_job_statistics();
-- SELECT * FROM get_webhook_statistics();