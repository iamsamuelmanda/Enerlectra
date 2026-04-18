/**
 * State Machine Integration
 *
 * Handles lifecycle transitions triggered by marketplace events.
 */
import { MARKETPLACE_TRIGGERS } from '../rules/MarketplaceInvariants';
/**
 * State Machine Integration Engine
 */
export class StateMachineIntegration {
    /**
     * Attempt state transition based on marketplace event
     */
    static async transitionState(currentState, trigger, conditionData) {
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
    static async checkContributionTrigger(currentState, newFundingPct) {
        if (currentState === 'FUNDING' && newFundingPct >= 100) {
            return this.transitionState(currentState, 'FULL_FUNDING', {
                fundingPct: newFundingPct,
            });
        }
        return { allowed: false };
    }
    /**
     * Record state transition event (for audit log)
     */
    static createTransitionEvent(trigger, fromState, toState, metadata) {
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
