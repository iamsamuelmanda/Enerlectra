/**
 * Finality Detector
 * Manages challenge window and finality determination
 */
import { EEState } from './settlement-state.enum';
export class FinalityDetector {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Check if finality window has passed
     */
    checkFinalityWindow(cycle) {
        if (cycle.state !== EEState.FINALITY_PENDING)
            return false;
        if (!cycle.challenge_window_end)
            return false;
        return Date.now() >= cycle.challenge_window_end.getTime();
    }
    /**
     * Get challenge window status
     */
    async getChallengeWindow(settlement_cycle_id) {
        // This would query a challenges table if you implement one
        // For now, return null
        return null;
    }
    /**
     * Check if there are pending challenges
     */
    async hasPendingChallenges(settlement_cycle_id) {
        // Query challenges table for open challenges
        // Return false for now (no challenges implementation yet)
        return false;
    }
    /**
     * Attempt to finalize a settlement cycle
     * Returns true if finalization succeeded, false if blocked by challenges
     */
    async attemptFinalization(settlement_cycle_id, cycle) {
        // Check finality window passed
        if (!this.checkFinalityWindow(cycle)) {
            return false;
        }
        // Check for pending challenges
        const has_challenges = await this.hasPendingChallenges(settlement_cycle_id);
        if (has_challenges) {
            console.log(`Settlement ${settlement_cycle_id} has pending challenges - finalization blocked`);
            return false;
        }
        // Can finalize
        return true;
    }
}
