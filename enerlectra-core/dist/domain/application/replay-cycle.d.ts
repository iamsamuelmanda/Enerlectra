/**
 * Replay Cycle (UPGRADED with Hash Verification)
 * Deterministic replay of settlement cycle from ledger entries
 * NOW WITH: Cryptographic hash chain verification
 */
import type { SupabaseClient } from '@supabase/supabase-js';
export interface ReplayResult {
    settlement_cycle_id: string;
    entry_count: number;
    balance_verified: boolean;
    hash_verified: boolean;
    hash_chain_intact: boolean;
    cryptographic_integrity: boolean;
    issues: string[];
}
/**
 * Replay and verify a settlement cycle with cryptographic proof
 * This is now a full audit function
 */
export declare function replayCycle(supabase: SupabaseClient, settlement_cycle_id: string): Promise<ReplayResult>;
/**
 * Verify all cycles in a date range
 */
export declare function verifyDateRange(supabase: SupabaseClient, start_date: string, end_date: string): Promise<ReplayResult[]>;
/**
 * Verify entire ledger hash chain (all entries)
 * This is the ultimate audit function
 */
export declare function verifyEntireLedger(supabase: SupabaseClient): Promise<{
    total_entries: number;
    verified_entries: number;
    corrupted_entries: number;
    broken_links: number;
    integrity_percentage: number;
    cryptographically_sound: boolean;
    errors: string[];
}>;
