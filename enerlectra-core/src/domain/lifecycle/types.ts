// src/domain/lifecycle/types.ts

/**
 * LifecycleState
 *
 * Canonical lifecycle for energy clusters / projects.
 * Must stay in sync with:
 * - MARKETPLACE_INVARIANTS and MARKETPLACE_STATE_RULES
 * - ClusterRepository lifecycle_state usage
 */

export type LifecycleState =
  | 'PLANNING'    // initial idea / draft, accepts contributions
  | 'FUNDING'     // open for funding
  | 'FUNDED'      // reached 100% funding, pre-installation
  | 'INSTALLING'  // hardware being installed
  | 'OPERATIONAL' // system live and generating
  | 'FINALIZED'   // fully closed out, no more actions
  | 'CANCELLED'   // funding failed or project cancelled
  | 'FAILED';     // project failed after going live