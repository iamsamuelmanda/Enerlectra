/**
 * Materialized views for efficient querying
 */

-- ============================================================================
-- CURRENT STATE VIEWS
-- ============================================================================

/**
 * Latest snapshot for each cluster
 */
CREATE MATERIALIZED VIEW latest_snapshots AS
SELECT DISTINCT ON (cluster_id)
  s.*
FROM snapshots s
ORDER BY cluster_id, version DESC, created_at DESC;

CREATE UNIQUE INDEX idx_latest_snapshots_cluster ON latest_snapshots(cluster_id);
CREATE INDEX idx_latest_snapshots_state ON latest_snapshots(lifecycle_state);

/**
 * Current user positions across all clusters
 */
CREATE MATERIALIZED VIEW user_positions AS
SELECT 
  u.id as user_id,
  u.name as user_name,
  u.current_class,
  c.id as cluster_id,
  c.name as cluster_name,
  c.lifecycle_state,
  COALESCE(SUM(contrib.pcus), 0) as total_pcus,
  CASE 
    WHEN c.current_usd > 0 THEN 
      (COALESCE(SUM(contrib.pcus), 0) / c.current_usd) * 100
    ELSE 0
  END as ownership_pct,
  COUNT(contrib.id) as contribution_count,
  MIN(contrib.created_at) as first_contribution_at,
  MAX(contrib.created_at) as last_contribution_at
FROM users u
CROSS JOIN clusters c
LEFT JOIN contributions contrib ON 
  contrib.user_id = u.id 
  AND contrib.cluster_id = c.id 
  AND contrib.status = 'COMPLETED'
GROUP BY u.id, u.name, u.current_class, c.id, c.name, c.lifecycle_state, c.current_usd
HAVING COUNT(contrib.id) > 0;

CREATE INDEX idx_user_positions_user_id ON user_positions(user_id);
CREATE INDEX idx_user_positions_cluster_id ON user_positions(cluster_id);
CREATE INDEX idx_user_positions_ownership ON user_positions(ownership_pct DESC);

/**
 * Cluster statistics with participant counts
 */
CREATE MATERIALIZED VIEW cluster_statistics AS
SELECT 
  c.id as cluster_id,
  c.name,
  c.location,
  c.lifecycle_state,
  c.target_usd,
  c.current_usd,
  c.funding_pct,
  c.target_kw,
  c.monthly_kwh,
  c.is_locked,
  COUNT(DISTINCT contrib.user_id) as participant_count,
  COUNT(contrib.id) as total_contributions,
  MAX(contrib.created_at) as last_contribution_at,
  ls.gini_coefficient,
  ls.largest_ownership_pct,
  c.created_at,
  c.deadline
FROM clusters c
LEFT JOIN contributions contrib ON 
  contrib.cluster_id = c.id 
  AND contrib.status = 'COMPLETED'
LEFT JOIN latest_snapshots ls ON ls.cluster_id = c.id
GROUP BY 
  c.id, c.name, c.location, c.lifecycle_state, c.target_usd, 
  c.current_usd, c.funding_pct, c.target_kw, c.monthly_kwh, 
  c.is_locked, ls.gini_coefficient, ls.largest_ownership_pct,
  c.created_at, c.deadline;

CREATE UNIQUE INDEX idx_cluster_statistics_id ON cluster_statistics(cluster_id);
CREATE INDEX idx_cluster_statistics_state ON cluster_statistics(lifecycle_state);
CREATE INDEX idx_cluster_statistics_location ON cluster_statistics(location);

-- ============================================================================
-- REFRESH FUNCTIONS
-- ============================================================================

/**
 * Refresh all materialized views
 */
CREATE OR REPLACE FUNCTION refresh_marketplace_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY latest_snapshots;
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_positions;
  REFRESH MATERIALIZED VIEW CONCURRENTLY cluster_statistics;
END;
$$ LANGUAGE plpgsql;

/**
 * Automatically refresh views after significant changes
 */
CREATE OR REPLACE FUNCTION trigger_refresh_views()
RETURNS TRIGGER AS $$
BEGIN
  -- Async refresh (don't block transaction)
  PERFORM pg_notify('refresh_views', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refresh_on_snapshot
  AFTER INSERT ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_views();

CREATE TRIGGER trigger_refresh_on_contribution
  AFTER UPDATE ON contributions
  FOR EACH ROW
  WHEN (OLD.status != NEW.status AND NEW.status = 'COMPLETED')
  EXECUTE FUNCTION trigger_refresh_views();