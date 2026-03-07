/**
 * Treasury Types
 * External boundary accounts and payment rail definitions
 */

import { Ngwee } from '../settlement/settlement-types';

// ═══════════════════════════════════════════════════════════════
// PAYMENT RAILS
// ═══════════════════════════════════════════════════════════════

export enum PaymentRail {
  MTN = 'MTN',
  AIRTEL = 'AIRTEL',
  BANK = 'BANK',
  STABLECOIN = 'STABLECOIN'
}

export enum RailStatus {
  ACTIVE = 'ACTIVE',
  DEGRADED = 'DEGRADED',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED'
}

// ═══════════════════════════════════════════════════════════════
// TREASURY ACCOUNT TYPES (Extends existing AccountType)
// ═══════════════════════════════════════════════════════════════

export enum TreasuryAccountType {
  // External boundary accounts (per rail)
  EXTERNAL_ESCROW_MTN = 'EXTERNAL_ESCROW_MTN',
  EXTERNAL_ESCROW_AIRTEL = 'EXTERNAL_ESCROW_AIRTEL',
  EXTERNAL_ESCROW_BANK = 'EXTERNAL_ESCROW_BANK',
  EXTERNAL_ESCROW_STABLECOIN = 'EXTERNAL_ESCROW_STABLECOIN',
  
  // Internal anchor
  TREASURY_INTERNAL = 'TREASURY_INTERNAL',
  
  // Reserve accounts
  FEE_RESERVE = 'FEE_RESERVE',
  INSURANCE_RESERVE = 'INSURANCE_RESERVE',
  OPERATIONAL_RESERVE = 'OPERATIONAL_RESERVE'
}

// ═══════════════════════════════════════════════════════════════
// LIQUIDITY STATUS
// ═══════════════════════════════════════════════════════════════

export interface RailLiquidity {
  rail: PaymentRail;
  
  // Internal ledger balance (what we think we have)
  internalBalanceNgwee: Ngwee;
  
  // External actual balance (what API reports)
  externalBalanceNgwee: Ngwee;
  
  // Reconciliation
  discrepancyNgwee: Ngwee;
  
  // Liquidity state
  availableNgwee: Ngwee; // What we can actually spend
  reservedNgwee: Ngwee; // Pending payouts
  
  // Safety buffers
  reversalBufferNgwee: Ngwee; // Hold for potential reversals
  minimumBalanceNgwee: Ngwee; // Never go below this
  
  // Status
  status: RailStatus;
  lastReconciled: Date;
}

// ═══════════════════════════════════════════════════════════════
// TREASURY STATE
// ═══════════════════════════════════════════════════════════════

export interface TreasuryState {
  // Total internal position
  totalInternalNgwee: Ngwee;
  
  // Total external (sum of all rails)
  totalExternalNgwee: Ngwee;
  
  // Discrepancy
  totalDiscrepancyNgwee: Ngwee;
  
  // Per-rail liquidity
  rails: Map<PaymentRail, RailLiquidity>;
  
  // Reserve balances
  feeReserveNgwee: Ngwee;
  insuranceReserveNgwee: Ngwee;
  operationalReserveNgwee: Ngwee;
  
  // System health
  isBalanced: boolean;
  canPayout: boolean;
  lastReconciliation: Date;
}

// ═══════════════════════════════════════════════════════════════
// INBOUND FLOW (Buyer pays)
// ═══════════════════════════════════════════════════════════════

export interface InboundPayment {
  paymentId: string;
  rail: PaymentRail;
  externalReference: string; // MTN transaction ID, etc.
  
  amountNgwee: Ngwee;
  buyerId: string;
  
  confirmedAt: Date;
  internallySettled: boolean; // Has it hit internal ledger?
  
  // Reversal risk
  reversalWindowEndsAt: Date;
  reversalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ═══════════════════════════════════════════════════════════════
// OUTBOUND FLOW (Contributor payout)
// ═══════════════════════════════════════════════════════════════

export interface OutboundPayout {
  payoutId: string;
  rail: PaymentRail;
  
  amountNgwee: Ngwee;
  contributorId: string;
  destinationAccount: string; // Phone number, IBAN, wallet address
  
  status: PayoutStatus;
  
  initiatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  
  externalReference?: string; // Set when confirmed by rail
  errorMessage?: string;
}

export enum PayoutStatus {
  RESERVED = 'RESERVED', // Liquidity reserved, not sent yet
  INITIATED = 'INITIATED', // Sent to rail API
  PENDING = 'PENDING', // Waiting for rail confirmation
  COMPLETED = 'COMPLETED', // Confirmed by rail
  FAILED = 'FAILED', // Rail rejected
  REVERSED = 'REVERSED' // Was completed, then reversed
}

// ═══════════════════════════════════════════════════════════════
// RECONCILIATION REPORT
// ═══════════════════════════════════════════════════════════════

export interface ReconciliationReport {
  timestamp: Date;
  
  // Per-rail reconciliation
  railReports: {
    rail: PaymentRail;
    internalBalance: Ngwee;
    externalBalance: Ngwee;
    discrepancy: Ngwee;
    status: 'BALANCED' | 'MINOR_DRIFT' | 'MAJOR_DISCREPANCY';
  }[];
  
  // Overall status
  totalDiscrepancy: Ngwee;
  systemBalanced: boolean;
  
  // Actions taken
  actions: string[];
  
  // Alerts
  alerts: {
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════
// LIQUIDITY GUARD RESULT
// ═══════════════════════════════════════════════════════════════

export interface LiquidityCheckResult {
  canPayout: boolean;
  rail: PaymentRail;
  requestedNgwee: Ngwee;
  availableNgwee: Ngwee;
  
  // If canPayout = false
  insufficientBy?: Ngwee;
  reason?: string;
  
  // Suggested actions
  suggestedRail?: PaymentRail; // Alternative rail with liquidity
  canRetryAt?: Date;
}

// ═══════════════════════════════════════════════════════════════
// TREASURY OPERATION
// ═══════════════════════════════════════════════════════════════

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

export enum TreasuryOperationType {
  INBOUND_SETTLEMENT = 'INBOUND_SETTLEMENT', // External → Internal
  OUTBOUND_PAYOUT = 'OUTBOUND_PAYOUT', // Internal → External
  RAIL_REBALANCE = 'RAIL_REBALANCE', // Between external rails
  RESERVE_ALLOCATION = 'RESERVE_ALLOCATION', // To reserves
  RESERVE_RELEASE = 'RESERVE_RELEASE' // From reserves
}