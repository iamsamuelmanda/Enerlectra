
import { ensureStoreDir, STORE_DIR } from './engines/storePath'

ensureStoreDir()

console.log(\[STORE] Using canonical store at \\)

/**
 * Enerlectra Core
 * The Economic Engine for fair energy ownership
 */

// Domain - Accounts
export * from './domain/accounts/account';
export { AccountService } from './domain/accounts/account-service';
export { LedgerService } from './domain/accounts/ledger-service';
export { AccountInvariants } from './domain/accounts/invariants';
export { AccountReconciliation } from './domain/accounts/reconciliation';

// Domain - Settlement
export * from './domain/settlement/settlement-state.enum';
export * from './domain/settlement/settlement-cycle';
export * from './domain/settlement/settlement-transitions';
export { SettlementService } from './domain/settlement/settlement-service';
export { FinalityDetector } from './domain/settlement/finality-detector';

// Domain - Production
export { ProductionVerifier } from './domain/production/production-verifier';
export { ProductionAggregate } from './domain/production/production-aggregate';
export type { 
  ProductionReport,
  ProductionValidationResult,
  ClusterCapacity
} from './domain/production/production-verifier';
export type {
  DailyProduction,
  WeeklyAggregate,
  MonthlyAggregate,
  ProductionStats
} from './domain/production/production-aggregate';

// Application
export { runDailySettlement, attemptFinalization } from './application/run-settlement';
export { replayCycle, verifyDateRange } from './application/replay-cycle';
export { 
  executeTransition, 
  getCycleState, 
  canTransitionTo,
  getTransitionHistory
} from './application/execute-transition';

// Re-export types
export type { RunSettlementRequest, RunSettlementResult } from './application/run-settlement';
export type { ReplayResult } from './application/replay-cycle';
export type { TransitionRequest, TransitionResult } from './application/execute-transition';

// Hash Chain (add to existing exports)
export { sha256, computeEntryHash } from './domain/ledger/ledger-hash';
export { GENESIS_HASH } from './domain/ledger/ledger-genesis';
export { LedgerHashVerifier } from './domain/ledger/ledger-hash-verifier';
export { 
  generateFinalityProof, 
  verifyFinalityProof,
  exportFinalityProof
} from './domain/settlement/finality-proof';
export type { FinalityProof } from './domain/settlement/finality-proof';
export { verifyEntireLedger } from './application/replay-cycle';

// Settlement Cycle (Production-Grade BigInt)
export * from './domain/settlement/settlement-types';
export * from './domain/settlement/settlement-cycle-hardened';
export * from './domain/settlement/settlement-invariants';
export * from './domain/settlement/settlement-hash';
export * from './domain/settlement/settlement-finalization';

export * from './domain/treasury/treasury-types';
export * from './domain/treasury/treasury-service';
export * from './domain/treasury/treasury-reconciliation';

export * from './domain/payment/payment-intent-types';
export * from './domain/payment/payment-intent-service';
export * from './domain/payment/payment-orchestrator';


export * from './adapters/mobile-money/mtn-adapter';
export * from './adapters/mobile-money/airtel-adapter';
export * from './adapters/webhooks/webhook-handler';
export * from './infrastructure/background-jobs';