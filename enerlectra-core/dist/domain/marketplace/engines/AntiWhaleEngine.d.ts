/**
 * Anti-Whale Engine
 *
 * Prevents ownership concentration and enforces contribution limits.
 * All validation happens HERE before persistence.
 */
import { LifecycleState } from '../../lifecycle/types';
import { MarketplaceErrorCode } from '../rules/MarketplaceInvariants';
export type UserClass = 'STARTER' | 'INVESTOR' | 'ANCHOR';
export interface ContributionRequest {
    userId: string;
    clusterId: string;
    amountUSD: number;
    timestamp: string;
}
export interface ClusterState {
    id: string;
    lifecycleState: LifecycleState;
    targetUSD: number;
    currentUSD: number;
    fundingPct: number;
    createdAt: string;
    isLocked: boolean;
}
export interface UserState {
    id: string;
    totalInvestedUSD: number;
    currentClass: UserClass;
    clusterCount: number;
}
export interface UserPosition {
    clusterId: string;
    currentPCUs: number;
    currentOwnershipPct: number;
    contributions: {
        id: string;
        amountUSD: number;
        timestamp: string;
        isLocked: boolean;
    }[];
}
export interface ValidationResult {
    allowed: boolean;
    errorCode?: MarketplaceErrorCode;
    errorMessage?: string;
    details?: {
        projectedOwnershipPct?: number;
        maxAllowedUSD?: number;
        overflowUSD?: number;
        currentClass?: UserClass;
        nextClass?: UserClass;
    };
}
/**
 * Anti-Whale Engine
 */
export declare class AntiWhaleEngine {
    /**
     * Validate contribution against ALL marketplace invariants
     */
    static validateContribution(request: ContributionRequest, cluster: ClusterState, user: UserState, userPosition: UserPosition | null): ValidationResult;
    /**
     * Check 1: Lifecycle state allows contributions
     */
    private static checkLifecycleState;
    /**
     * Check 2: Cluster not locked/finalized
     */
    private static checkClusterLock;
    /**
     * Check 3: Amount within class limits
     */
    private static checkClassLimits;
    /**
     * Check 4: Cluster has capacity
     */
    private static checkClusterCapacity;
    /**
     * Check 5: Ownership caps (anti-whale + class limit)
     */
    private static checkOwnershipCaps;
    /**
     * Validate withdrawal
     */
    static validateWithdrawal(contributionId: string, cluster: ClusterState, userPosition: UserPosition): ValidationResult;
    /**
     * Validate ownership transfer (marketplace trade)
     */
    static validateTransfer(ownershipPct: number, cluster: ClusterState, fromUser: UserState, toUser: UserState, toUserPosition: UserPosition | null): ValidationResult;
    /**
     * Determine user class based on total investment
     */
    static determineUserClass(totalInvestedUSD: number): UserClass;
    /**
     * Calculate early investor bonus
     */
    static calculateEarlyInvestorBonus(clusterFundingPct: number): number;
}
