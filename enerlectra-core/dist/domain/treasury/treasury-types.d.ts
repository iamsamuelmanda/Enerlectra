/**
 * Treasury Types
 * External boundary accounts and payment rail definitions
 */
import { Ngwee } from '../settlement/settlement-types';
export declare enum PaymentRail {
    MTN = "MTN",
    AIRTEL = "AIRTEL",
    BANK = "BANK",
    STABLECOIN = "STABLECOIN"
}
export declare enum RailStatus {
    ACTIVE = "ACTIVE",
    DEGRADED = "DEGRADED",
    SUSPENDED = "SUSPENDED",
    DISABLED = "DISABLED"
}
export declare enum TreasuryAccountType {
    EXTERNAL_ESCROW_MTN = "EXTERNAL_ESCROW_MTN",
    EXTERNAL_ESCROW_AIRTEL = "EXTERNAL_ESCROW_AIRTEL",
    EXTERNAL_ESCROW_BANK = "EXTERNAL_ESCROW_BANK",
    EXTERNAL_ESCROW_STABLECOIN = "EXTERNAL_ESCROW_STABLECOIN",
    TREASURY_INTERNAL = "TREASURY_INTERNAL",
    FEE_RESERVE = "FEE_RESERVE",
    INSURANCE_RESERVE = "INSURANCE_RESERVE",
    OPERATIONAL_RESERVE = "OPERATIONAL_RESERVE"
}
export interface RailLiquidity {
    rail: PaymentRail;
    internalBalanceNgwee: Ngwee;
    externalBalanceNgwee: Ngwee;
    discrepancyNgwee: Ngwee;
    availableNgwee: Ngwee;
    reservedNgwee: Ngwee;
    reversalBufferNgwee: Ngwee;
    minimumBalanceNgwee: Ngwee;
    status: RailStatus;
    lastReconciled: Date;
}
export interface TreasuryState {
    totalInternalNgwee: Ngwee;
    totalExternalNgwee: Ngwee;
    totalDiscrepancyNgwee: Ngwee;
    rails: Map<PaymentRail, RailLiquidity>;
    feeReserveNgwee: Ngwee;
    insuranceReserveNgwee: Ngwee;
    operationalReserveNgwee: Ngwee;
    isBalanced: boolean;
    canPayout: boolean;
    lastReconciliation: Date;
}
export interface InboundPayment {
    paymentId: string;
    rail: PaymentRail;
    externalReference: string;
    amountNgwee: Ngwee;
    buyerId: string;
    confirmedAt: Date;
    internallySettled: boolean;
    reversalWindowEndsAt: Date;
    reversalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface OutboundPayout {
    payoutId: string;
    rail: PaymentRail;
    amountNgwee: Ngwee;
    contributorId: string;
    destinationAccount: string;
    status: PayoutStatus;
    initiatedAt: Date;
    completedAt?: Date;
    failedAt?: Date;
    externalReference?: string;
    errorMessage?: string;
}
export declare enum PayoutStatus {
    RESERVED = "RESERVED",// Liquidity reserved, not sent yet
    INITIATED = "INITIATED",// Sent to rail API
    PENDING = "PENDING",// Waiting for rail confirmation
    COMPLETED = "COMPLETED",// Confirmed by rail
    FAILED = "FAILED",// Rail rejected
    REVERSED = "REVERSED"
}
export interface ReconciliationReport {
    timestamp: Date;
    railReports: {
        rail: PaymentRail;
        internalBalance: Ngwee;
        externalBalance: Ngwee;
        discrepancy: Ngwee;
        status: 'BALANCED' | 'MINOR_DRIFT' | 'MAJOR_DISCREPANCY';
    }[];
    totalDiscrepancy: Ngwee;
    systemBalanced: boolean;
    actions: string[];
    alerts: {
        severity: 'INFO' | 'WARNING' | 'CRITICAL';
        message: string;
    }[];
}
export interface LiquidityCheckResult {
    canPayout: boolean;
    rail: PaymentRail;
    requestedNgwee: Ngwee;
    availableNgwee: Ngwee;
    insufficientBy?: Ngwee;
    reason?: string;
    suggestedRail?: PaymentRail;
    canRetryAt?: Date;
}
export interface TreasuryOperation {
    operationId: string;
    type: TreasuryOperationType;
    rail: PaymentRail;
    amountNgwee: Ngwee;
    fromAccount: string;
    toAccount: string;
    timestamp: Date;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    externalReference?: string;
    errorMessage?: string;
}
export declare enum TreasuryOperationType {
    INBOUND_SETTLEMENT = "INBOUND_SETTLEMENT",// External → Internal
    OUTBOUND_PAYOUT = "OUTBOUND_PAYOUT",// Internal → External
    RAIL_REBALANCE = "RAIL_REBALANCE",// Between external rails
    RESERVE_ALLOCATION = "RESERVE_ALLOCATION",// To reserves
    RESERVE_RELEASE = "RESERVE_RELEASE"
}

