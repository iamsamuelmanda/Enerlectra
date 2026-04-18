/**
 * LifecycleState
 *
 * Canonical lifecycle for energy clusters / projects.
 * Must stay in sync with:
 * - MARKETPLACE_INVARIANTS and MARKETPLACE_STATE_RULES
 * - ClusterRepository lifecycle_state usage
 */
export type LifecycleState = 'PLANNING' | 'FUNDING' | 'FUNDED' | 'INSTALLING' | 'OPERATIONAL' | 'FINALIZED' | 'CANCELLED' | 'FAILED';
