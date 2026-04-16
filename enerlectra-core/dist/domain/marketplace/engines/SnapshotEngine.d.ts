/**
 * Snapshot Engine
 *
 * Creates immutable point-in-time calculations of cluster state.
 * Snapshots are NEVER updated, only appended.
 * Enables replay, audit, and explainability.
 */
import { LifecycleState } from '../../lifecycle/types';
import { MarketplaceErrorCode } from '../rules/MarketplaceInvariants';
export interface SnapshotInput {
    clusterId: string;
    currentState: LifecycleState;
    targetUSD: number;
    currentUSD: number;
    targetKw: number;
    monthlyKwh: number;
    contributions: ContributionSnapshot[];
    triggeredBy: SnapshotTrigger;
    metadata?: Record<string, any>;
}
export interface ContributionSnapshot {
    userId: string;
    userName: string;
    userClass: 'STARTER' | 'INVESTOR' | 'ANCHOR';
    pcus: number;
    timestamp: string;
    earlyInvestorBonus: number;
}
export interface ParticipantSnapshot {
    userId: string;
    userName: string;
    userClass: 'STARTER' | 'INVESTOR' | 'ANCHOR';
    pcus: number;
    ownershipPct: number;
    kwhPerMonth: number;
    monthlyValueZMW: number;
    contributionCount: number;
    firstContributionAt: string;
    lastContributionAt: string;
    earlyInvestorBonus: number;
}
export interface ClusterSnapshot {
    id: string;
    clusterId: string;
    version: number;
    lifecycleState: LifecycleState;
    timestamp: string;
    triggeredBy: SnapshotTrigger;
    targetUSD: number;
    currentUSD: number;
    fundingPct: number;
    totalPCUs: number;
    targetKw: number;
    monthlyKwh: number;
    participantCount: number;
    participants: ParticipantSnapshot[];
    giniCoefficient: number;
    herfindahlIndex: number;
    largestOwnershipPct: number;
    calculationTrace: CalculationStep[];
    previousSnapshotId: string | null;
    hash: string;
    metadata?: Record<string, any>;
}
export type SnapshotTrigger = 'CONTRIBUTION_ADDED' | 'CONTRIBUTION_WITHDRAWN' | 'STATE_TRANSITION' | 'SETTLEMENT_EXECUTED' | 'MANUAL_SNAPSHOT' | 'SCHEDULED_SNAPSHOT';
export interface CalculationStep {
    step: number;
    operation: string;
    input: Record<string, any>;
    output: Record<string, any>;
    formula: string;
    explanation: string;
}
export interface SnapshotValidation {
    allowed: boolean;
    errorCode?: MarketplaceErrorCode;
    errorMessage?: string;
}
export declare class SnapshotValidationError extends Error {
    code: MarketplaceErrorCode;
    constructor(code: MarketplaceErrorCode, message: string);
}
export type SnapshotIdGenerator = (clusterId: string) => string;
/**
 * Snapshot Engine
 */
export declare class SnapshotEngine {
    private static idGenerator;
    static configure(options?: {
        idGenerator?: SnapshotIdGenerator;
    }): void;
    /**
     * Create immutable snapshot of cluster state
     */
    static createSnapshot(input: SnapshotInput, previousSnapshot: ClusterSnapshot | null, ratePerKwhZMW?: number): Promise<ClusterSnapshot>;
    /**
     * Validate snapshot creation is allowed
     */
    private static validateSnapshot;
    /**
     * Calculate participant positions
     */
    private static calculateParticipants;
    /**
     * Calculate Gini coefficient (inequality measure)
     */
    private static calculateGiniCoefficient;
    /**
     * Calculate Herfindahl-Hirschman Index (concentration measure)
     */
    private static calculateHerfindahlIndex;
    /**
     * Generate calculation trace for explainability
     */
    private static generateCalculationTrace;
    /**
     * Generate unique snapshot ID
     */
    private static generateSnapshotId;
    /**
     * Calculate snapshot hash (for immutability proof)
     */
    private static calculateHash;
    /**
     * Verify snapshot integrity
     */
    static verifySnapshot(snapshot: ClusterSnapshot): boolean;
    /**
     * Compare two snapshots (for audit/replay)
     */
    static compareSnapshots(before: ClusterSnapshot, after: ClusterSnapshot): {
        fundingChange: number;
        participantChange: number;
        ownershipChanges: Map<string, number>;
    };
}
