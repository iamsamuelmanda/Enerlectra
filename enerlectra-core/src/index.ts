import { ensureStoreDir, STORE_DIR } from './engines/storePath';

ensureStoreDir();

console.log(`[STORE] Using canonical store at ${STORE_DIR}`);

/**
 * Enerlectra Core
 * The Economic Engine for fair energy ownership
 */

export { reconcileEnergyAllocation } from './engines/reconciliation.js';

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
  ClusterCapacity,
} from './domain/production/production-verifier';
export type {
  DailyProduction,
  WeeklyAggregate,
  MonthlyAggregate,
  ProductionStats,
} from './domain/production/production-aggregate';

// Application
export {
  runDailySettlement,
  attemptFinalization,
} from './domain/application/run-settlements';
export {
  replayCycle,
  verifyDateRange,
  verifyEntireLedger,
} from './domain/application/replay-cycle';
export {
  executeTransition,
  getCycleState,
  canTransitionTo,
  getTransitionHistory,
} from './domain/application/execute-transition';

// Re-export types
export type {
  RunSettlementRequest,
  RunSettlementResult,
} from './domain/application/run-settlements';
export type { ReplayResult } from './domain/application/replay-cycle';
export type {
  TransitionRequest,
  TransitionResult,
} from './domain/application/execute-transition';

// Hash Chain
export { sha256, computeEntryHash } from './domain/ledger/ledger-hash';
export { GENESIS_HASH } from './domain/ledger/ledger-genesis';
export { LedgerHashVerifier } from './domain/ledger/ledger-hash-verifier';
export {
  generateFinalityProof,
  verifyFinalityProof,
  exportFinalityProof,
} from './domain/settlement/finality-proof';
export type { FinalityProof } from './domain/settlement/finality-proof';

// Settlement Cycle (Production-Grade BigInt)
export * from './domain/settlement/settlement-types';
export {
  SettlementCycle,
  createSettlementCycle,
} from './domain/settlement/settlement-cycle-hardened';
export * from './domain/settlement/settlement-invariants';
export * from './domain/settlement/settlement-hash';
export {
  finalizeSettlementCycle,
} from './domain/settlement/settlement-finalization';

// Treasury
export * from './domain/treasury/treasury-types';
export * from './domain/treasury/treasury-service';
export * from './domain/treasury/treasury-reconciliation';

// Payments
export type {
  PaymentIntentState,
  PaymentIntent,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResult,
  PaymentConfirmation,
  PaymentIntentFilter,
  PaymentIntentStats,
} from './domain/payment/payment-intent-types';
export {
  isTerminalState as isPaymentIntentTerminalState,
  isSuccessState as isPaymentIntentSuccessState,
  isFailureState as isPaymentIntentFailureState,
  canTransitionTo as canPaymentIntentTransitionTo,
} from './domain/payment/payment-intent-types';
export { PaymentIntentService } from './domain/payment/payment-intent-service';
export { PaymentOrchestrator } from './domain/payment/payment-orchestrator';

// Adapters & background jobs
export * from './adapters/mobile-money/mtn-adapter';
export * from './adapters/mobile-money/airtel-adapter';
export * from './adapters/webhooks/webhook-handler';
export * from './infrastructure/background-jobs';

// Persistence layer exports
export {
  Database,
  DatabaseConfig,
  createDatabaseFromEnv,
} from './persistence/database';
export {
  ContributionRepository,
} from './persistence/repositories/ContributionRepository';
export {
  SnapshotRepository,
} from './persistence/repositories/SnapshotRepository';
export {
  SettlementRepository,
} from './persistence/repositories/SettlementRepository';
export {
  ClusterRepository,
} from './persistence/repositories/ClusterRepository';
export {
  UserRepository,
} from './persistence/repositories/UserRepository';

// Supabase client (backend)
export { supabase } from './lib/supabase';