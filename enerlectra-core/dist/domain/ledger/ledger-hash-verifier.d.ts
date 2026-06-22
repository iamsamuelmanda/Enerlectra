/**
 * Ledger Hash Verifier
 * Verifies cryptographic integrity of the ledger hash chain
 */
import type { SupabaseClient } from '@supabase/supabase-js';
export interface HashChainVerificationResult {
    valid: boolean;
    total_entries: number;
    verified_entries: number;
    corrupted_entries: number;
    broken_links: number;
    first_corruption_at?: number;
    first_broken_link_at?: number;
    errors: string[];
}
export declare class LedgerHashVerifier {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Verify entire hash chain
     * This is the primary audit function
     */
    verifyHashChain(from_sequence?: number, to_sequence?: number): Promise<HashChainVerificationResult>;
    /**
     * Verify a single settlement cycle's ledger entries
     */
    verifyCycleHashChain(settlement_cycle_id: string): Promise<HashChainVerificationResult>;
    /**
     * Get hash chain status summary
     */
    getHashChainStatus(): Promise<{
        total_entries: number;
        first_sequence: number;
        last_sequence: number;
        missing_hashes: number;
        last_entry_hash: string | null;
    }>;
    /**
     * Quick corruption check (database function)
     * Faster than full verification for monitoring
     */
    quickCorruptionCheck(): Promise<{
        total_entries: number;
        broken_links: number;
        first_break_at: number | null;
    }>;
}

