/**
 * Settlement Repository
 * 
 * Handles settlement persistence.
 * Enforces immutability.
 */

import { Pool } from 'pg';
import { Settlement, ParticipantSettlement } from '../../domain/marketplace/engines/SettlementEngine';

export class SettlementRepository {
  constructor(private pool: Pool) {}
  
  /**
   * Create settlement (append-only)
   */
  async create(settlement: Settlement): Promise<Settlement> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert settlement
      await client.query(
        `
        INSERT INTO settlements (
          id,
          cluster_id,
          snapshot_id,
          lifecycle_state,
          period_start,
          period_end,
          allocated_kwh,
          actual_kwh_generated,
          utilization_pct,
          surplus_kwh,
          total_value_zmw,
          distributed_value_zmw,
          surplus_value_zmw,
          participant_count,
          status,
          calculation_trace,
          previous_settlement_id,
          hash,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `,
        [
          settlement.id,
          settlement.clusterId,
          settlement.snapshotId,
          settlement.lifecycleState,
          settlement.periodStart,
          settlement.periodEnd,
          settlement.allocatedKwh,
          settlement.actualKwhGenerated,
          settlement.utilizationPct,
          settlement.surplusKwh,
          settlement.totalValueZMW,
          settlement.distributedValueZMW,
          settlement.surplusValueZMW,
          settlement.participantCount,
          settlement.status,
          JSON.stringify(settlement.calculationTrace),
          settlement.previousSettlementId,
          settlement.hash,
          settlement.metadata ? JSON.stringify(settlement.metadata) : null,
        ]
      );
      
      // Insert participant settlements
      for (const participant of settlement.settlements) {
        await client.query(
          `
          INSERT INTO participant_settlements (
            settlement_id,
            user_id,
            user_name,
            allocated_kwh,
            actual_kwh,
            value_zmw,
            distribution_method,
            status,
            transaction_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            settlement.id,
            participant.userId,
            participant.userName,
            participant.allocatedKwh,
            participant.actualKwh,
            participant.valueZMW,
            participant.distributionMethod,
            participant.status,
            participant.transactionId,
          ]
        );
      }
      
      await client.query('COMMIT');
      
      return settlement;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update settlement status (ONLY allowed status changes)
   */
  async updateStatus(
    settlementId: string,
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  ): Promise<Settlement> {
    const result = await this.pool.query(
      `
      UPDATE settlements
      SET 
        status = $2,
        completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED') THEN NOW() ELSE completed_at END
      WHERE id = $1
      RETURNING *
      `,
      [settlementId, status]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Settlement ${settlementId} not found`);
    }
    
    // Load full settlement with participants
    return this.getById(settlementId)!;
  }
  
  /**
   * Update participant settlement status
   */
  async updateParticipantStatus(
    participantSettlementId: string,
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transactionId?: string
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE participant_settlements
      SET 
        status = $2,
        transaction_id = COALESCE($3, transaction_id),
        completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED') THEN NOW() ELSE completed_at END
      WHERE id = $1
      `,
      [participantSettlementId, status, transactionId]
    );
  }
  
  /**
   * Get settlement by ID
   */
  async getById(settlementId: string): Promise<Settlement | null> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', ps.user_id,
            'userName', ps.user_name,
            'allocatedKwh', ps.allocated_kwh,
            'actualKwh', ps.actual_kwh,
            'valueZMW', ps.value_zmw,
            'distributionMethod', ps.distribution_method,
            'status', ps.status,
            'transactionId', ps.transaction_id
          )
        ) as participant_settlements
      FROM settlements s
      LEFT JOIN participant_settlements ps ON ps.settlement_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
      `,
      [settlementId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get latest settlement for cluster
   */
  async getLatestForCluster(clusterId: string): Promise<Settlement | null> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', ps.user_id,
            'userName', ps.user_name,
            'allocatedKwh', ps.allocated_kwh,
            'actualKwh', ps.actual_kwh,
            'valueZMW', ps.value_zmw,
            'distributionMethod', ps.distribution_method,
            'status', ps.status,
            'transactionId', ps.transaction_id
          )
        ) as participant_settlements
      FROM settlements s
      LEFT JOIN participant_settlements ps ON ps.settlement_id = s.id
      WHERE s.cluster_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [clusterId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get settlement history for cluster
   */
  async getHistoryForCluster(
    clusterId: string,
    limit: number = 10
  ): Promise<Settlement[]> {
    const result = await this.pool.query(
      `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'userId', ps.user_id,
            'userName', ps.user_name,
            'allocatedKwh', ps.allocated_kwh,
            'actualKwh', ps.actual_kwh,
            'valueZMW', ps.value_zmw,
            'distributionMethod', ps.distribution_method,
            'status', ps.status,
            'transactionId', ps.transaction_id
          )
        ) as participant_settlements
      FROM settlements s
      LEFT JOIN participant_settlements ps ON ps.settlement_id = s.id
      WHERE s.cluster_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $2
      `,
      [clusterId, limit]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get user settlement history
   */
  async getUserSettlements(
    userId: string,
    limit: number = 10
  ): Promise<ParticipantSettlement[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM participant_settlements
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [userId, limit]
    );
    
    return result.rows.map(row => ({
      userId: row.user_id,
      userName: row.user_name,
      allocatedKwh: parseFloat(row.allocated_kwh),
      actualKwh: parseFloat(row.actual_kwh),
      valueZMW: parseFloat(row.value_zmw),
      distributionMethod: row.distribution_method,
      status: row.status,
      transactionId: row.transaction_id,
    }));
  }
  
  /**
   * Map database row to domain model
   */
  private mapRow(row: any): Settlement {
    return {
      id: row.id,
      clusterId: row.cluster_id,
      snapshotId: row.snapshot_id,
      lifecycleState: row.lifecycle_state,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      timestamp: row.created_at,
      
      allocatedKwh: parseFloat(row.allocated_kwh),
      actualKwhGenerated: parseFloat(row.actual_kwh_generated),
      utilizationPct: parseFloat(row.utilization_pct),
      surplusKwh: parseFloat(row.surplus_kwh),
      
      totalValueZMW: parseFloat(row.total_value_zmw),
      distributedValueZMW: parseFloat(row.distributed_value_zmw),
      surplusValueZMW: parseFloat(row.surplus_value_zmw),
      
      participantCount: row.participant_count,
      settlements: row.participant_settlements.map((ps: any) => ({
        userId: ps.userId,
        userName: ps.userName,
        allocatedKwh: parseFloat(ps.allocatedKwh),
        actualKwh: parseFloat(ps.actualKwh),
        valueZMW: parseFloat(ps.valueZMW),
        distributionMethod: ps.distributionMethod,
        status: ps.status,
        transactionId: ps.transactionId,
      })),
      
      status: row.status,
      completedAt: row.completed_at,
      
      calculationTrace: row.calculation_trace,
      
      previousSettlementId: row.previous_settlement_id,
      hash: row.hash,
      
      metadata: row.metadata,
    };
  }
}