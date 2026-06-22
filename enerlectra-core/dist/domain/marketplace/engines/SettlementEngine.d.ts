/**
 * Settlement Engine
 *
 * Executes periodic settlements to distribute energy/value to participants.
 * Settlements are immutable and create audit trail.
 */
import { LifecycleState } from '../../lifecycle/types';
import { ClusterSnapshot } from './SnapshotEngine';
import { MarketplaceErrorCode } from '../rules/MarketplaceInvariants';
export interface SettlementInput {
    clusterId: string;
    currentState: LifecycleState;
    snapshot: ClusterSnapshot;
    periodStart: string;
    periodEnd: string;
    actualKwhGenerated: number;
    ratePerKwhZMW: number;
    metadata?: Record<string, any>;
}
export interface ParticipantSettlement {
    userId: string;
    userName: string;
    allocatedKwh: number;
    actualKwh: number;
    valueZMW: number;
    distributionMethod: DistributionMethod;
    status: SettlementStatus;
    transactionId?: string;
}
export type DistributionMethod = 'DIRECT_ENERGY' | 'GRID_CREDIT' | 'CASH_EQUIVALENT' | 'SURPLUS_SOLD';
export type SettlementStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export interface Settlement {
    id: string;
    clusterId: string;
    snapshotId: string;
    lifecycleState: LifecycleState;
    periodStart: string;
    periodEnd: string;
    timestamp: string;
    allocatedKwh: number;
    actualKwhGenerated: number;
    utilizationPct: number;
    surplusKwh: number;
    totalValueZMW: number;
    distributedValueZMW: number;
    surplusValueZMW: number;
    participantCount: number;
    settlements: ParticipantSettlement[];
    status: SettlementStatus;
    completedAt?: string;
    calculationTrace: SettlementCalculationStep[];
    previousSettlementId: string | null;
    hash: string;
    metadata?: Record<string, any>;
}
export interface SettlementCalculationStep {
    step: number;
    operation: string;
    input: Record<string, any>;
    output: Record<string, any>;
    explanation: string;
}
export interface SettlementValidation {
    allowed: boolean;
    errorCode?: MarketplaceErrorCode;
    errorMessage?: string;
}
export declare class DomainValidationError extends Error {
    code: MarketplaceErrorCode;
    constructor(code: MarketplaceErrorCode, message: string);
}
export type SettlementIdGenerator = (clusterId: string) => string;
/**
 * Settlement Engine
 */
export declare class SettlementEngine {
    private static idGenerator;
    static configure(options?: {
        idGenerator?: SettlementIdGenerator;
    }): void;
    /**
     * Execute settlement for a period
     */
    static executeSettlement(input: SettlementInput, previousSettlement: Settlement | null): Promise<Settlement>;
    /**
     * Validate settlement is allowed
     */
    private static validateSettlement;
    /**
     * Calculate settlements for each participant
     */
    private static calculateParticipantSettlements;
    /**
     * Determine distribution method for participant
     */
    private static determineDistributionMethod;
    /**
     * Generate settlement calculation trace
     */
    private static generateSettlementTrace;
    /**
     * Process settlement (execute distributions)
     */
    static processSettlement(settlement: Settlement): Promise<Settlement>;
    /**
     * Execute distribution to participant (placeholder)
     */
    private static executeDistribution;
    private static dispatchEnergy;
    private static creditZESCOAccount;
    private static sendPayment;
    private static sellToGrid;
    /**
     * Generate unique settlement ID
     */
    private static generateSettlementId;
    /**
     * Calculate settlement hash
     */
    private static calculateHash;
    /**
     * Verify settlement integrity
     */
    static verifySettlement(settlement: Settlement): boolean;
}

