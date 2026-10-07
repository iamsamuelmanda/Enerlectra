// Core Infrastructure & Shared Services
export { supabase } from './infrastructure/supabase.js';
export { logger } from './core/services/logger.js';
export { redis, REDIS_KEY_PREFIX, PENDING_TTL_SECONDS } from './infrastructure/redis.js';
export * from './core/services/installer.service.js';
export * from './core/services/operator.service.js';

// User & Cluster Identity Services
export { resolveUserId, getPhoneNumber, resolveCluster } from './core/services/resolve-user.js';

// Extracted Handlers & Kernel Core
export { kernel } from './core/kernel.js';
export { createKernel } from './bootstrap/create-kernel.js';
export type { EnerlectraKernel } from './bootstrap/create-kernel.js';

// Ledger & Reconciliation
export { LedgerService } from './domain/accounts/ledger-service.js';
export { reconcileEnergyAllocation } from './engines/reconciliation.js';

export { getUserBalance, getUserAvailableBalance } from './core/services/balance.service.js';
export { getUserHistory } from './core/services/history.service.js';
export { WithdrawalWorkflow } from './core/workflow/withdrawal-workflow.js';
export { getUserClusters } from './core/services/cluster.service.js';
export { checkUserHasPhone } from './core/services/bot-state.js';
export { SubmitManualReadingHandler as handleRead } from './core/handlers/handlers/commands/read.handler.js';
export { StartSessionHandler as handleStart } from './core/handlers/handlers/commands/start.handler.js';
export { SupportHandler as handleSupport } from './core/handlers/handlers/commands/support.handler.js';
export { LinkOrganizationHandler } from './core/handlers/handlers/commands/link-organization.handler.js';
export { StartResetMeterHandler, SelectResetMeterTypeHandler, ConfirmResetMeterHandler } from './core/handlers/handlers/commands/resetmeter.handler.js';
export type {
  EllieContext,
  EllieEvidence,
  EllieOperationalDigest,
  EllieKnowledgeType,
  EllieRecommendation,
  EllieSituation,
  EllieWorkItem,
  EllieMemory,
  EllieOrganizationSnapshot,
} from './domain/intelligence/ellie-context.js';

export { askEllie, askEllieStructured } from './ai/ellie.js';
export type { EllieInference } from './ai/ellie.js';
