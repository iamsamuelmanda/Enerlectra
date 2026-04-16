/**
 * Contribution Repository
 *
 * Handles all contribution persistence operations.
 * Enforces append-only semantics.
 */
import { Pool } from 'pg';
import { UserPosition } from '../../domain/marketplace/engines/AntiWhaleEngine';
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
export declare class ContributionRepository {
    private pool;
    constructor(pool: Pool);
    /**
     * Create new contribution (PENDING state)
     */
    create(params: CreateContributionParams): Promise<ContributionRecord>;
    /**
     * Mark contribution as COMPLETED
     * This is the ONLY allowed status update
     */
    markCompleted(contributionId: string, transactionReference: string): Promise<ContributionRecord>;
    /**
     * Mark contribution as FAILED
     */
    markFailed(contributionId: string, reason: string): Promise<ContributionRecord>;
    /**
     * Lock contribution (after grace period)
     */
    lock(contributionId: string): Promise<ContributionRecord>;
    /**
     * Get user's position in a cluster
     */
    getUserPosition(userId: string, clusterId: string): Promise<UserPosition | null>;
    /**
     * Get all user contributions across all clusters
     */
    getUserContributions(userId: string): Promise<ContributionRecord[]>;
    /**
     * Get cluster contributions
     */
    getClusterContributions(clusterId: string): Promise<ContributionRecord[]>;
    /**
     * Get contribution by ID
     */
    getById(contributionId: string): Promise<ContributionRecord | null>;
    /**
     * Check if contribution can be withdrawn
     */
    canWithdraw(contributionId: string): Promise<boolean>;
    /**
     * Process contribution withdrawal (REVERSAL)
     */
    withdraw(contributionId: string): Promise<ContributionRecord>;
    /**
     * Map database row to domain model
     */
    private mapRow;
}
