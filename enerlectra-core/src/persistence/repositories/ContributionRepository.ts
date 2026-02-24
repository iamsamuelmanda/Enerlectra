/**
 * Contribution Repository
 * 
 * Handles all contribution persistence operations.
 * Enforces append-only semantics.
 */

import { Pool, PoolClient } from 'pg';
import {
  ContributionRequest,
  UserState,
  ClusterState,
  UserPosition,
} from '../../domain/marketplace/engines/AntiWhaleEngine';
import { ValidationResult } from '../../domain/marketplace/engines/AntiWhaleEngine';

export interface ContributionRecord {
  id: string;
  userId: string;
  clusterId: string;
  amountUSD: number;
  amountZMW: number;
  exchangeRate: number;
  pcus: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED' | 'LOCKED';
  paymentMethod: 'MTN_MOBILE_MONEY' | 'AIRTEL_MONEY' | 'BANK_TRANSFER' | 'CARD';
  projectedOwnershipPct: number;
  earlyInvestorBonus: number;
  isLocked: boolean;
  lockedAt: Date | null;
  gracePeriodExpiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
  transactionReference?: string;
}

export interface CreateContributionParams {
  userId: string;
  clusterId: string;
  amountUSD: number;
  amountZMW: number;
  exchangeRate: number;
  paymentMethod: string;
  projectedOwnershipPct: number;
  earlyInvestorBonus: number;
  ipAddress?: string;
  userAgent?: string;
}

export class ContributionRepository {
  constructor(private pool: Pool) {}
  
  /**
   * Create new contribution (PENDING state)
   */
  async create(params: CreateContributionParams): Promise<ContributionRecord> {
    const gracePeriodExpiresAt = new Date();
    gracePeriodExpiresAt.setHours(gracePeriodExpiresAt.getHours() + 24);
    
    const result = await this.pool.query(
      `
      INSERT INTO contributions (
        user_id,
        cluster_id,
        amount_usd,
        amount_zmw,
        exchange_rate,
        pcus,
        status,
        payment_method,
        projected_ownership_pct,
        early_investor_bonus,
        grace_period_expires_at,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
      `,
      [
        params.userId,
        params.clusterId,
        params.amountUSD,
        params.amountZMW,
        params.exchangeRate,
        params.amountUSD, // PCUs = USD (1:1)
        'PENDING',
        params.paymentMethod,
        params.projectedOwnershipPct,
        params.earlyInvestorBonus,
        gracePeriodExpiresAt,
        params.ipAddress,
        params.userAgent,
      ]
    );
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Mark contribution as COMPLETED
   * This is the ONLY allowed status update
   */
  async markCompleted(
    contributionId: string,
    transactionReference: string
  ): Promise<ContributionRecord> {
    const result = await this.pool.query(
      `
      UPDATE contributions
      SET 
        status = 'COMPLETED',
        completed_at = NOW(),
        transaction_reference = $2
      WHERE id = $1
        AND status = 'PENDING'
      RETURNING *
      `,
      [contributionId, transactionReference]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Cannot mark contribution ${contributionId} as completed`);
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Mark contribution as FAILED
   */
  async markFailed(contributionId: string, reason: string): Promise<ContributionRecord> {
    const result = await this.pool.query(
      `
      UPDATE contributions
      SET status = 'FAILED'
      WHERE id = $1
        AND status = 'PENDING'
      RETURNING *
      `,
      [contributionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Cannot mark contribution ${contributionId} as failed`);
    }
    
    // Log failure reason in audit log
    await this.pool.query(
      `
      INSERT INTO audit_log (event_type, contribution_id, event_data)
      VALUES ('VALIDATION_FAILED', $1, $2)
      `,
      [contributionId, JSON.stringify({ reason })]
    );
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Lock contribution (after grace period)
   */
  async lock(contributionId: string): Promise<ContributionRecord> {
    const result = await this.pool.query(
      `
      UPDATE contributions
      SET 
        is_locked = TRUE,
        locked_at = NOW(),
        status = 'LOCKED'
      WHERE id = $1
        AND status = 'COMPLETED'
        AND is_locked = FALSE
        AND NOW() > grace_period_expires_at
      RETURNING *
      `,
      [contributionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Cannot lock contribution ${contributionId}`);
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Get user's position in a cluster
   */
  async getUserPosition(userId: string, clusterId: string): Promise<UserPosition | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM get_user_ownership($1, $2)
      `,
      [userId, clusterId]
    );
    
    if (result.rows.length === 0 || result.rows[0].pcus === '0') {
      return null;
    }
    
    const positionData = result.rows[0];
    
    // Get contributions
    const contribResult = await this.pool.query(
      `
      SELECT id, amount_usd, created_at, is_locked
      FROM contributions
      WHERE user_id = $1
        AND cluster_id = $2
        AND status = 'COMPLETED'
      ORDER BY created_at ASC
      `,
      [userId, clusterId]
    );
    
    return {
      clusterId,
      currentPCUs: parseFloat(positionData.pcus),
      currentOwnershipPct: parseFloat(positionData.ownership_pct),
      contributions: contribResult.rows.map(row => ({
        id: row.id,
        amountUSD: parseFloat(row.amount_usd),
        timestamp: row.created_at,
        isLocked: row.is_locked,
      })),
    };
  }
  
  /**
   * Get all user contributions across all clusters
   */
  async getUserContributions(userId: string): Promise<ContributionRecord[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM contributions
      WHERE user_id = $1
        AND status IN ('COMPLETED', 'LOCKED')
      ORDER BY created_at DESC
      `,
      [userId]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get cluster contributions
   */
  async getClusterContributions(clusterId: string): Promise<ContributionRecord[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM contributions
      WHERE cluster_id = $1
        AND status IN ('COMPLETED', 'LOCKED')
      ORDER BY created_at ASC
      `,
      [clusterId]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }
  
  /**
   * Get contribution by ID
   */
  async getById(contributionId: string): Promise<ContributionRecord | null> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM contributions
      WHERE id = $1
      `,
      [contributionId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }
  
  /**
   * Check if contribution can be withdrawn
   */
  async canWithdraw(contributionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      SELECT 
        c.status,
        c.is_locked,
        c.grace_period_expires_at,
        cl.funding_pct
      FROM contributions c
      INNER JOIN clusters cl ON cl.id = c.cluster_id
      WHERE c.id = $1
      `,
      [contributionId]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const row = result.rows[0];
    
    // Cannot withdraw if locked
    if (row.is_locked || row.status === 'LOCKED') {
      return false;
    }
    
    // Cannot withdraw after grace period
    if (new Date() > row.grace_period_expires_at) {
      return false;
    }
    
    // Cannot withdraw if cluster > 80% funded (soft finality)
    if (row.funding_pct >= 80) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Process contribution withdrawal (REVERSAL)
   */
  async withdraw(contributionId: string): Promise<ContributionRecord> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mark contribution as REVERSED
      const result = await client.query(
        `
        UPDATE contributions
        SET status = 'REVERSED'
        WHERE id = $1
          AND status = 'COMPLETED'
          AND is_locked = FALSE
        RETURNING *
        `,
        [contributionId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Cannot withdraw contribution ${contributionId}`);
      }
      
      const contribution = this.mapRow(result.rows[0]);
      
      // Update cluster funding
      await client.query(
        `
        UPDATE clusters
        SET 
          current_usd = current_usd - $1,
          funding_pct = ((current_usd - $1) / target_usd) * 100,
          participant_count = (
            SELECT COUNT(DISTINCT user_id)
            FROM contributions
            WHERE cluster_id = $2
              AND status IN ('COMPLETED', 'LOCKED')
          )
        WHERE id = $2
        `,
        [contribution.amountUSD, contribution.clusterId]
      );
      
      // Update user total invested
      await client.query(
        `
        UPDATE users
        SET total_invested_usd = total_invested_usd - $1
        WHERE id = $2
        `,
        [contribution.amountUSD, contribution.userId]
      );
      
      await client.query('COMMIT');
      
      return contribution;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Map database row to domain model
   */
  private mapRow(row: any): ContributionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      clusterId: row.cluster_id,
      amountUSD: parseFloat(row.amount_usd),
      amountZMW: parseFloat(row.amount_zmw),
      exchangeRate: parseFloat(row.exchange_rate),
      pcus: parseFloat(row.pcus),
      status: row.status,
      paymentMethod: row.payment_method,
      projectedOwnershipPct: parseFloat(row.projected_ownership_pct),
      earlyInvestorBonus: parseFloat(row.early_investor_bonus),
      isLocked: row.is_locked,
      lockedAt: row.locked_at,
      gracePeriodExpiresAt: row.grace_period_expires_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      transactionReference: row.transaction_reference,
    };
  }
}