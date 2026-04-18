/**
 * Execute Transition
 * Low-level API for executing individual state transitions
 * Use this when you need manual control over the settlement flow
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EEState } from '../settlement/settlement-state.enum';
export interface TransitionRequest {
    settlement_cycle_id: string;
    target_state: EEState;
    data?: any;
}
export interface TransitionResult {
    success: boolean;
    previous_state: EEState;
    current_state: EEState;
    timestamp: string;
    error?: string;
}
/**
 * Execute a single state transition
 * Lower-level API than runDailySettlement
 */
export declare function executeTransition(supabase: SupabaseClient, request: TransitionRequest): Promise<TransitionResult>;
/**
 * Get current state of a settlement cycle
 */
export declare function getCycleState(supabase: SupabaseClient, settlement_cycle_id: string): Promise<EEState | null>;
/**
 * Check if a transition is allowed from current state
 */
export declare function canTransitionTo(supabase: SupabaseClient, settlement_cycle_id: string, target_state: EEState): Promise<boolean>;
/**
 * Get transition history for a settlement cycle
 */
export declare function getTransitionHistory(supabase: SupabaseClient, settlement_cycle_id: string): Promise<{
    settlement_cycle_id: string;
    current_state: EEState;
    transitions: {
        state: EEState;
        timestamp: Date;
    }[];
}>;
