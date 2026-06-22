/**
 * Finality Detector
 * Manages challenge window and finality determination
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EEState } from './settlement-state.enum';
export interface ChallengeWindow {
    settlement_cycle_id: string;
    challenge_window_start: Date;
    challenge_window_end: Date;
    finalized_at?: Date;
    challenges_count: number;
}
export declare class FinalityDetector {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Check if finality window has passed
     */
    checkFinalityWindow(cycle: {
        state: EEState;
        challenge_window_end?: Date;
    }): boolean;
    /**
     * Get challenge window status
     */
    getChallengeWindow(settlement_cycle_id: string): Promise<ChallengeWindow | null>;
    /**
     * Check if there are pending challenges
     */
    hasPendingChallenges(settlement_cycle_id: string): Promise<boolean>;
    /**
     * Attempt to finalize a settlement cycle
     * Returns true if finalization succeeded, false if blocked by challenges
     */
    attemptFinalization(settlement_cycle_id: string, cycle: {
        state: EEState;
        challenge_window_end?: Date;
    }): Promise<boolean>;
}

