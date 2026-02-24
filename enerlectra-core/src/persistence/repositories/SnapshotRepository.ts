/**
 * Snapshot Repository
 * 
 * Handles snapshot persistence.
 * Enforces STRICT immutability - no updates or deletes allowed.
 */

import { Pool } from 'pg';
import { ClusterSnapshot, ParticipantSnapshot } from '../../domain/marketplace/engines/SnapshotEngine';
import { LifecycleState } from '../../domain/lifecycle/types';

export class SnapshotRepository {
  constructor(private pool: Pool) {}
  
  /**
   * Create snapshot (append-only)
   */
  async create(snapshot: ClusterSnapshot): Promise<ClusterSnapshot> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert snapshot
      const snapshotResult = await client.query(
        `
        INSERT INTO snapshots (
          id,
          cluster_id,
          version,
          lifecycle_state,
          triggered_by,
          target_usd,
          current_usd,
          funding_pct,
          total_pcus,
          target_kw,
          monthly_kwh,
          participant_count,
          gini_coefficient,
          herfindahl_index,
          largest_ownership_pct,
          calculation_trace,
          previous_snapshot_id,
          hash,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
        `,
        [
          snapshot.id,
          snapshot.clusterId,
          snapshot.version,
          snapshot.lifecycleState,
          snapshot.triggeredBy,
          snapshot.targetUSD,
          snapshot.currentUSD,
          snapshot.fundingPct,
          snapshot.totalPCUs,
          snapshot.targetKw,
          snapshot.monthlyKwh,
          snapshot.participantCount,
          snapshot.giniCoefficient,
          snapshot.herfindahlIndex,
          snapshot.largestOwnershipPct,
          JSON.stringify(snapshot.calculationTrace),
          snapshot.previousSnapshotId,
          snapshot.hash,
          snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
        ]
      );
      
      // Insert participants
      for (const participant of snapshot.participants) {
        await client.query(
          `
          INSERT INTO snapshot_participants (
            snapshot_id,
            user_id,
            user_name,
            user_class,
            pcus,
            ownership_pct,
            kwh_per_month,
            monthly_value_zmw,
            contribution_count,
            first_contribution_at,
            last_contribution_at,
            early_investor_bonus
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            snapshot.id,
            participant.userId,
            participant.userName,
            participant.userClass,
            participant.pcus,
            participant.ownershipPct,
            participant.kwhPerMonth,
            participant.monthlyValueZMW,
            participant.contributionCount,
            participant.firstContributionAt,
            participant.lastContributionAt,
            participant.earlyInvestorBonus,
          ]
        );
      }
      
      await client.query('COMMIT');
      
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get snapshot by ID
   */
  async getById(snapshotId: string): Promise<ClusterSnapshot | null> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', sp.user_id,
            'userName', sp.user_name,
            'userClass', sp.user_class,
            'pcus', sp.pcus,
            'ownershipPct', sp.ownership_pct,
            'kwhPerMonth', sp.kwh_per_month,
            'monthlyValueZMW', sp.monthly_value_zmw,
            'contributionCount', sp.contribution_count,
            'firstContributionAt', sp.first_contribution_at,
            'lastContributionAt', sp.last_contribution_at,
            'earlyInvestorBonus', sp.early_investor_bonus
          ) ORDER BY sp.ownership_pct DESC
        ) as participants
      FROM snapshots s
      LEFT JOIN snapshot_participants sp ON sp.snapshot_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
      `,
      [snapshotId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get latest snapshot for cluster
   */
  async getLatestForCluster(clusterId: string): Promise<ClusterSnapshot | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM latest_snapshots
      WHERE cluster_id = $1
      `,
      [clusterId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Load full snapshot with participants
    return this.getById(result.rows[0].id);
  }
  
  /**
   * Get snapshot history for cluster
   */
  async getHistoryForCluster(
    clusterId: string,
    limit: number = 10
  ): Promise<ClusterSnapshot[]> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', sp.user_id,
            'userName', sp.user_name,
            'userClass', sp.user_class,
            'pcus',
            /**
   * Get snapshot history for cluster
   */
  async getHistoryForCluster(
    clusterId: string,
    limit: number = 10
  ): Promise<ClusterSnapshot[]> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', sp.user_id,
            'userName', sp.user_name,
            'userClass', sp.user_class,
            'pcus', sp.pcus,
            'ownershipPct', sp.ownership_pct,
            'kwhPerMonth', sp.kwh_per_month,
            'monthlyValueZMW', sp.monthly_value_zmw,
            'contributionCount', sp.contribution_count,
            'firstContributionAt', sp.first_contribution_at,
            'lastContributionAt', sp.last_contribution_at,
            'earlyInvestorBonus', sp.early_investor_bonus
          ) ORDER BY sp.ownership_pct DESC
        ) as participants
      FROM snapshots s
      LEFT JOIN snapshot_participants sp ON sp.snapshot_id = s.id
      WHERE s.cluster_id = $1
      GROUP BY s.id
      ORDER BY s.version DESC, s.created_at DESC
      LIMIT $2
      `,
      [clusterId, limit]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Verify snapshot chain integrity
   */
  async verifyChain(snapshotId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      SELECT verify_snapshot_chain($1) as is_valid
      `,
      [snapshotId]
    );
    
    return result.rows[0].is_valid;
  }
  
  /**
   * Get snapshots by lifecycle state transition
   */
  async getByStateTransition(
    clusterId: string,
    toState: LifecycleState
  ): Promise<ClusterSnapshot[]> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', sp.user_id,
            'userName', sp.user_name,
            'userClass', sp.user_class,
            'pcus', sp.pcus,
            'ownershipPct', sp.ownership_pct,
            'kwhPerMonth', sp.kwh_per_month,
            'monthlyValueZMW', sp.monthly_value_zmw,
            'contributionCount', sp.contribution_count,
            'firstContributionAt', sp.first_contribution_at,
            'lastContributionAt', sp.last_contribution_at,
            'earlyInvestorBonus', sp.early_investor_bonus
          ) ORDER BY sp.ownership_pct DESC
        ) as participants
      FROM snapshots s
      LEFT JOIN snapshot_participants sp ON sp.snapshot_id = s.id
      WHERE s.cluster_id = $1
        AND s.lifecycle_state = $2
        AND s.triggered_by = 'STATE_TRANSITION'
      GROUP BY s.id
      ORDER BY s.created_at DESC
      `,
      [clusterId, toState]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Map database row to domain model
   */
  private mapRow(row: any): ClusterSnapshot {
    return {
      id: row.id,
      clusterId: row.cluster_id,
      version: row.version,
      lifecycleState: row.lifecycle_state,
      timestamp: row.created_at,
      triggeredBy: row.triggered_by,
      
      targetUSD: parseFloat(row.target_usd),
      currentUSD: parseFloat(row.current_usd),
      fundingPct: parseFloat(row.funding_pct),
      totalPCUs: parseFloat(row.total_pcus),
      
      targetKw: parseFloat(row.target_kw),
      monthlyKwh: parseFloat(row.monthly_kwh),
      
      participantCount: row.participant_count,
      participants: row.participants.map((p: any) => ({
        userId: p.userId,
        userName: p.userName,
        userClass: p.userClass,
        pcus: parseFloat(p.pcus),
        ownershipPct: parseFloat(p.ownershipPct),
        kwhPerMonth: parseFloat(p.kwhPerMonth),
        monthlyValueZMW: parseFloat(p.monthlyValueZMW),
        contributionCount: p.contributionCount,
        firstContributionAt: new Date(p.firstContributionAt),
        lastContributionAt: new Date(p.lastContributionAt),
        earlyInvestorBonus: parseFloat(p.earlyInvestorBonus),
      })),
      
      giniCoefficient: parseFloat(row.gini_coefficient),
      herfindahlIndex: parseFloat(row.herfindahl_index),
      largestOwnershipPct: parseFloat(row.largest_ownership_pct),
      
      calculationTrace: row.calculation_trace,
      
      previousSnapshotId: row.previous_snapshot_id,
      hash: row.hash,
      
      metadata: row.metadata,
    };
  }
}