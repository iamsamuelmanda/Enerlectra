/**
 * State Machine Integration
 * 
 * Handles lifecycle transitions triggered by marketplace events.
 */

import { LifecycleState } from '../../lifecycle/types';
import { MARKETPLACE_TRIGGERS } from '../rules/MarketplaceInvariants';

export interface StateTransitionEvent {
  trigger: keyof typeof MARKETPLACE_TRIGGERS;
  fromState: LifecycleState;
  toState: LifecycleState;
  timestamp: string; // ISO 8601
  metadata: Record<string, any>;
  requiresSnapshot: boolean;
}

export interface TransitionResult {
  allowed: boolean;
  newState?: LifecycleState;
  requiresSnapshot?: boolean;
  errorMessage?: string;
}

/**
 * State Machine Integration Engine
 */
export class StateMachineIntegration {
  /**
   * Attempt state transition based on marketplace event
   */
  static async transitionState(
    currentState: LifecycleState,
    trigger: keyof typeof MARKETPLACE_TRIGGERS,
    conditionData: Record<string, any>,
  ): Promise<TransitionResult> {
    const transitionRule = MARKETPLACE_TRIGGERS[trigger];

    // Check if transition is valid from current state
    if (currentState !== transitionRule.fromState) {
      return {
        allowed: false,
        errorMessage: `Cannot apply trigger ${trigger} from state ${currentState}`,
      };
    }

    // Evaluate condition
    const conditionMet = transitionRule.condition(...Object.values(conditionData));

    if (!conditionMet) {
      return {
        allowed: false,
        errorMessage: `Condition not met for transition ${trigger}`,
      };
    }

    // Transition allowed
    return {
      allowed: true,
      newState: transitionRule.toState,
      requiresSnapshot: transitionRule.requiresSnapshot,
    };
  }

  /**
   * Check if contribution should trigger state transition
   */
  static async checkContributionTrigger(
    currentState: LifecycleState,
    newFundingPct: number,
  ): Promise<TransitionResult> {
    if (currentState === 'FUNDING' && newFundingPct >= 100) {
      return this.transitionState(
        currentState,
        'FULL_FUNDING',
        { fundingPct: newFundingPct },
      );
    }

    return { allowed: false };
  }

  /**
   * Record state transition event (for audit log)
   */
  static createTransitionEvent(
    trigger: keyof typeof MARKETPLACE_TRIGGERS,
    fromState: LifecycleState,
    toState: LifecycleState,
    metadata: Record<string, any>,
  ): StateTransitionEvent {
    return {
      trigger,
      fromState,
      toState,
      timestamp: new Date().toISOString(),
      metadata,
      requiresSnapshot: MARKETPLACE_TRIGGERS[trigger].requiresSnapshot,
    };
  }
}
