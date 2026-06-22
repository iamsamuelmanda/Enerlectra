/**
 * Finality Proof
 * Generates cryptographic proof of settlement finality
 */
import type { SupabaseClient } from '@supabase/supabase-js';
export interface FinalityProof {
    settlement_cycle_id: string;
    finalized_at: string;
    kwh_verified: number;
    total_value: number;
    state: string;
    cycle_hash: string;
    ledger_root_hash: string;
    entry_count: number;
    previous_cycle_hash?: string;
    proof_hash: string;
}
/**
 * Generate finality proof for a settlement cycle
 * This creates a tamper-evident seal
 */
export declare function generateFinalityProof(supabase: SupabaseClient, settlement_cycle_id: string): Promise<FinalityProof>;
/**
 * Verify a finality proof
 */
export declare function verifyFinalityProof(supabase: SupabaseClient, proof: FinalityProof): Promise<{
    valid: boolean;
    errors: string[];
}>;
/**
 * Export finality proof as JSON
 * Can be stored off-chain or anchored on-chain
 */
export declare function exportFinalityProof(proof: FinalityProof): string;
/**
 * Import finality proof from JSON
 */
export declare function importFinalityProof(json: string): FinalityProof;

