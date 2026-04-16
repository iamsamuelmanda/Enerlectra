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
    timestamp: string;
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
export declare class StateMachineIntegration {
    /**
     * Attempt state transition based on marketplace event
     */
    static transitionState(currentState: LifecycleState, trigger: keyof typeof MARKETPLACE_TRIGGERS, conditionData: Record<string, any>): Promise<TransitionResult>;
    /**
     * Check if contribution should trigger state transition
     */
    static checkContributionTrigger(currentState: LifecycleState, newFundingPct: number): Promise<TransitionResult>;
    /**
     * Record state transition event (for audit log)
     */
    static createTransitionEvent(trigger: keyof typeof MARKETPLACE_TRIGGERS, fromState: LifecycleState, toState: LifecycleState, metadata: Record<string, any>): StateTransitionEvent;
}
