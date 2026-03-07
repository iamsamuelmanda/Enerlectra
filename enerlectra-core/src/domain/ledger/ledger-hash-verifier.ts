/**
 * Ledger Hash Verifier
 * Verifies cryptographic integrity of the ledger hash chain
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeEntryHash, verifyEntryHash } from './ledger-hash';
import { isGenesisHash } from './ledger-genesis';

export interface HashChainVerificationResult {
  valid: boolean;
  total_entries: number;
  verified_entries: number;
  corrupted_entries: number;
  broken_links: number;
  first_corruption_at?: number; // entry_sequence
  first_broken_link_at?: number; // entry_sequence
  errors: string[];
}

export class LedgerHashVerifier {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Verify entire hash chain
   * This is the primary audit function
   */
  async verifyHashChain(
    from_sequence?: number,
    to_sequence?: number
  ): Promise<HashChainVerificationResult> {
    const errors: string[] = [];
    let total_entries = 0;
    let verified_entries = 0;
    let corrupted_entries = 0;
    let broken_links = 0;
    let first_corruption_at: number | undefined;
    let first_broken_link_at: number | undefined;

    // Get entries in sequence order
    let query = this.supabase
      .from('ledger_entries')
      .select('*')
      .order('entry_sequence', { ascending: true });

    if (from_sequence !== undefined) {
      query = query.gte('entry_sequence', from_sequence);
    }

    if (to_sequence !== undefined) {
      query = query.lte('entry_sequence', to_sequence);
    }

    const { data: entries, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch ledger entries: ${error.message}`);
    }

    if (!entries || entries.length === 0) {
      return {
        valid: true,
        total_entries: 0,
        verified_entries: 0,
        corrupted_entries: 0,
        broken_links: 0,
        errors: []
      };
    }

    let previous_hash: string | null = null;

    for (const entry of entries) {
      total_entries++;

      // ═══════════════════════════════════════════════════════
      // CHECK 1: Entry hash matches content
      // ═══════════════════════════════════════════════════════

      const hash_valid = verifyEntryHash({
        ledger_entry_id: entry.ledger_entry_id,
        account_id: entry.account_id,
        settlement_cycle_id: entry.settlement_cycle_id,
        debit_amount: parseFloat(entry.debit_amount),
        credit_amount: parseFloat(entry.credit_amount),
        unit: entry.unit,
        transaction_id: entry.transaction_id,
        operation_type: entry.operation_type,
        created_at: new Date(entry.created_at),
        previous_hash: entry.previous_hash,
        entry_hash: entry.entry_hash
      });

      if (!hash_valid) {
        corrupted_entries++;
        if (first_corruption_at === undefined) {
          first_corruption_at = entry.entry_sequence;
        }
        errors.push(
          `Entry ${entry.entry_sequence} (${entry.ledger_entry_id}): ` +
          `Hash mismatch - entry has been tampered with`
        );
      } else {
        verified_entries++;
      }

      // ═══════════════════════════════════════════════════════
      // CHECK 2: Previous hash linkage
      // ═══════════════════════════════════════════════════════

      if (entry.entry_sequence === 1) {
        // First entry must link to genesis
        if (!isGenesisHash(entry.previous_hash)) {
          broken_links++;
          if (first_broken_link_at === undefined) {
            first_broken_link_at = entry.entry_sequence;
          }
          errors.push(
            `Entry 1: Previous hash must be GENESIS_HASH, ` +
            `got ${entry.previous_hash}`
          );
        }
      } else if (previous_hash !== null) {
        // Subsequent entries must link to previous entry
        if (entry.previous_hash !== previous_hash) {
          broken_links++;
          if (first_broken_link_at === undefined) {
            first_broken_link_at = entry.entry_sequence;
          }
          errors.push(
            `Entry ${entry.entry_sequence}: Chain broken - ` +
            `expected previous_hash ${previous_hash}, ` +
            `got ${entry.previous_hash}`
          );
        }
      }

      // Store this entry's hash for next iteration
      previous_hash = entry.entry_hash;
    }

    const valid = corrupted_entries === 0 && broken_links === 0;

    return {
      valid,
      total_entries,
      verified_entries,
      corrupted_entries,
      broken_links,
      first_corruption_at,
      first_broken_link_at,
      errors
    };
  }

  /**
   * Verify a single settlement cycle's ledger entries
   */
  async verifyCycleHashChain(
    settlement_cycle_id: string
  ): Promise<HashChainVerificationResult> {
    // Get all entries for this cycle
    const { data: entries, error } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('settlement_cycle_id', settlement_cycle_id)
      .order('entry_sequence', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch cycle entries: ${error.message}`);
    }

    if (!entries || entries.length === 0) {
      return {
        valid: true,
        total_entries: 0,
        verified_entries: 0,
        corrupted_entries: 0,
        broken_links: 0,
        errors: []
      };
    }

    // Verify hashes (but not cross-cycle linkage)
    const errors: string[] = [];
    let verified = 0;
    let corrupted = 0;

    for (const entry of entries) {
      const hash_valid = verifyEntryHash({
        ledger_entry_id: entry.ledger_entry_id,
        account_id: entry.account_id,
        settlement_cycle_id: entry.settlement_cycle_id,
        debit_amount: parseFloat(entry.debit_amount),
        credit_amount: parseFloat(entry.credit_amount),
        unit: entry.unit,
        transaction_id: entry.transaction_id,
        operation_type: entry.operation_type,
        created_at: new Date(entry.created_at),
        previous_hash: entry.previous_hash,
        entry_hash: entry.entry_hash
      });

      if (hash_valid) {
        verified++;
      } else {
        corrupted++;
        errors.push(
          `Entry ${entry.entry_sequence}: Hash verification failed`
        );
      }
    }

    return {
      valid: corrupted === 0,
      total_entries: entries.length,
      verified_entries: verified,
      corrupted_entries: corrupted,
      broken_links: 0, // Not checking cross-cycle linkage here
      errors
    };
  }

  /**
   * Get hash chain status summary
   */
  async getHashChainStatus(): Promise<{
    total_entries: number;
    first_sequence: number;
    last_sequence: number;
    missing_hashes: number;
    last_entry_hash: string | null;
  }> {
    const { data, error } = await this.supabase
      .from('ledger_hash_chain_status')
      .select('*')
      .single();

    if (error) throw new Error(`Failed to get status: ${error.message}`);

    // Get last entry hash
    const { data: last_entry } = await this.supabase
      .from('ledger_entries')
      .select('entry_hash')
      .order('entry_sequence', { ascending: false })
      .limit(1)
      .single();

    return {
      total_entries: data.total_entries || 0,
      first_sequence: data.first_sequence || 0,
      last_sequence: data.last_sequence || 0,
      missing_hashes: data.missing_hashes || 0,
      last_entry_hash: last_entry?.entry_hash || null
    };
  }

  /**
   * Quick corruption check (database function)
   * Faster than full verification for monitoring
   */
  async quickCorruptionCheck(): Promise<{
    total_entries: number;
    broken_links: number;
    first_break_at: number | null;
  }> {
    const { data, error } = await this.supabase.rpc('verify_hash_chain');

    if (error) throw new Error(`Corruption check failed: ${error.message}`);

    return {
      total_entries: data[0]?.total_entries || 0,
      broken_links: data[0]?.broken_links || 0,
      first_break_at: data[0]?.first_break_at || null
    };
  }
}