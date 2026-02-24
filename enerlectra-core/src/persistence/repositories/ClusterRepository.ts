/**
 * Cluster Repository
 * 
 * Handles cluster state persistence.
 * Clusters ARE mutable (lifecycle state changes).
 */

import { Pool } from 'pg';
import { ClusterState } from '../../domain/marketplace/engines/AntiWhaleEngine';
import { LifecycleState } from '../../domain/lifecycle/types';

export interface ClusterRecord extends ClusterState {
  name: string;
  location: string;
  targetStorageKwh: number;
  monthlyKwh: number;
  participantCount: number;
  createdAt: Date;
  fundedAt: Date | null;
  operationalAt: Date | null;
  finalizedAt: Date | null;
  deadline: Date;
}

export interface CreateClusterParams {
  name: string;
  location: string;
  targetUSD: number;
  targetKw: number;
  targetStorageKwh: number;
  monthlyKwh: number;
  deadline: Date;
}

export class ClusterRepository {
  constructor(private pool: Pool) {}
  
  /**
   * Create new cluster
   */
  async create(params: CreateClusterParams): Promise<ClusterRecord> {
    const result = await this.pool.query(
      `
      INSERT INTO clusters (
        name,
        location,
        lifecycle_state,
        target_usd,
        target_kw,
        target_storage_kwh,
        monthly_kwh,
        deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        params.name,
        params.location,
        'PLANNING',
        params.targetUSD,
        params.targetKw,
        params.targetStorageKwh,
        params.monthlyKwh,
        params.deadline,
      ]
    );
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Update lifecycle state
   */
  async updateLifecycleState(
    clusterId: string,
    newState: LifecycleState
  ): Promise<ClusterRecord> {
    const timestampField = this.getTimestampField(newState);
    
    const result = await this.pool.query(
      `
      UPDATE clusters
      SET 
        lifecycle_state = $2,
        ${timestampField ? `${timestampField} = NOW(),` : ''}
        is_locked = CASE WHEN $2 IN ('FINALIZED', 'CANCELLED', 'FAILED') THEN TRUE ELSE is_locked END
      WHERE id = $1
      RETURNING *
      `,
      [clusterId, newState]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Cluster ${clusterId} not found`);
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Update funding progress (called after contribution)
   */
  async updateFunding(
    clusterId: string,
    amountUSD: number,
    participantDelta: number = 1
  ): Promise<ClusterRecord> {
    const result = await this.pool.query(
      `
      UPDATE clusters
      SET 
        current_usd = current_usd + $2,
        funding_pct = ((current_usd + $2) / target_usd) * 100,
        participant_count = participant_count + $3
      WHERE id = $1
      RETURNING *
      `,
      [clusterId, amountUSD, participantDelta]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Cluster ${clusterId} not found`);
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get cluster by ID
   */
  async getById(clusterId: string): Promise<ClusterRecord | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters WHERE id = $1
      `,
      [clusterId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get all active clusters (accepting contributions)
   */
  async getActive(): Promise<ClusterRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters
      WHERE lifecycle_state IN ('PLANNING', 'FUNDING')
        AND is_locked = FALSE
        AND deadline > NOW()
      ORDER BY funding_pct DESC, created_at DESC
      `
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get clusters by location
   */
  async getByLocation(location: string): Promise<ClusterRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters
      WHERE location = $1
        AND lifecycle_state IN ('PLANNING', 'FUNDING', 'FUNDED', 'INSTALLING', 'OPERATIONAL')
      ORDER BY created_at DESC
      `,
      [location]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get clusters by state
   */
  async getByState(state: LifecycleState): Promise<ClusterRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters
      WHERE lifecycle_state = $1
      ORDER BY created_at DESC
      `,
      [state]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get clusters nearing deadline (for alerts)
   */
  async getNearingDeadline(hoursRemaining: number = 24): Promise<ClusterRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters
      WHERE lifecycle_state = 'FUNDING'
        AND deadline > NOW()
        AND deadline < NOW() + INTERVAL '1 hour' * $1
        AND funding_pct < 100
      ORDER BY deadline ASC
      `,
      [hoursRemaining]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get clusters that reached 100% (need supplier matching)
   */
  async getFullyFunded(): Promise<ClusterRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM clusters
      WHERE lifecycle_state = 'FUNDING'
        AND funding_pct >= 100
      ORDER BY funded_at ASC NULLS LAST
      `
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Helper: Get timestamp field for lifecycle state
   */
  private getTimestampField(state: LifecycleState): string | null {
    switch (state) {
      case 'FUNDED': return 'funded_at';
      case 'OPERATIONAL': return 'operational_at';
      case 'FINALIZED': return 'finalized_at';
      default: return null;
    }
  }
  
  /**
   * Map database row to domain model
   */
  private mapRow(row: any): ClusterRecord {
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      lifecycleState: row.lifecycle_state,
      targetUSD: parseFloat(row.target_usd),
      currentUSD: parseFloat(row.current_usd),
      fundingPct: parseFloat(row.funding_pct),
      targetKw: parseFloat(row.target_kw),
      targetStorageKwh: parseFloat(row.target_storage_kwh),
      monthlyKwh: parseFloat(row.monthly_kwh),
      isLocked: row.is_locked,
      participantCount: row.participant_count,
      createdAt: row.created_at,
      fundedAt: row.funded_at,
      operationalAt: row.operational_at,
      finalizedAt: row.finalized_at,
      deadline: row.deadline,
    };
  }
}