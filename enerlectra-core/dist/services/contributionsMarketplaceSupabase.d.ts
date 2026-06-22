export type ContributionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED' | 'LOCKED';
export interface ContributionRecord {
    id: string;
    userId: string;
    clusterId: string;
    amountUSD: number;
    amountZMW: number;
    exchangeRate: number;
    pcus: number;
    status: ContributionStatus;
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
    paymentResponse?: any;
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
    transactionReference?: string;
}
/**
 * Create new contribution (starts as PENDING)
 */
export declare function createContribution(params: CreateContributionParams): Promise<ContributionRecord>;
/**
 * Mark contribution as COMPLETED (called by webhook)
 */
export declare function markContributionCompleted(contributionId: string, transactionReference: string, paymentResponse?: any): Promise<ContributionRecord>;
/**
 * Mark contribution as FAILED
 */
export declare function markContributionFailed(contributionId: string, reason: string, paymentResponse?: any): Promise<ContributionRecord>;
/**
 * Get contribution by ID
 */
export declare function getContributionById(contributionId: string): Promise<ContributionRecord | null>;
/**
 * Get all user contributions
 */
export declare function getUserContributions(userId: string): Promise<ContributionRecord[]>;
/**
 * Get cluster contributions
 */
export declare function getClusterContributions(clusterId: string): Promise<ContributionRecord[]>;
/**
 * Check if contribution can be withdrawn
 */
export declare function canWithdrawContribution(contributionId: string): Promise<boolean>;

