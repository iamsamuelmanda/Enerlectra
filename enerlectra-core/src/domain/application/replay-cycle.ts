/**
 * Replay Cycle (UPGRADED with Hash Verification)
 * Deterministic replay of settlement cycle from ledger entries
 * NOW WITH: Cryptographic hash chain verification
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LedgerService } from '../domain/accounts/ledger-service';
import { AccountInvariants } from '../domain/accounts/invariants';
import { AccountUnit } from '../domain/accounts/account';
import { computeStateHash } from '../domain/settlement/settlement-cycle';
import { LedgerHashVerifier } from '../domain/ledger/ledger-hash-verifier';

export interface ReplayResult {
  settlement_cycle_id: string;
  entry_count: number;
  balance_verified: boolean;
  hash_verified: boolean;
  hash_chain_intact: boolean; // NEW
  cryptographic_integrity: boolean; // NEW
  issues: string[];
}

/**
 * Replay and verify a settlement cycle with cryptographic proof
 * This is now a full audit function
 */
export async function replayCycle(
  supabase: SupabaseClient,
  settlement_cycle_id: string
): Promise<ReplayResult> {
  const ledgerService = new LedgerService(supabase);
  const invariants = new AccountInvariants(supabase);
  const hashVerifier = new LedgerHashVerifier(supabase);
  const issues: string[] = [];

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Verify Ledger Hash Chain
  // ═══════════════════════════════════════════════════════════

  const hashVerification = await hashVerifier.verifyCycleHashChain(
    settlement_cycle_id
  );

  const hash_chain_intact = hashVerification.valid;

  if (!hash_chain_intact) {
    issues.push(
      `Hash chain verification failed: ${hashVerification.corrupted_entries} corrupted entries`
    );
    hashVerification.errors.forEach(err => issues.push(err));
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Get All Ledger Entries
  // ═══════════════════════════════════════════════════════════

  const entries = await ledgerService.getCycleEntries(settlement_cycle_id);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Verify Balance for Each Unit
  // ═══════════════════════════════════════════════════════════

  let balance_verified = true;

  try {
    await invariants.assertCycleBalanced(settlement_cycle_id, AccountUnit.KWH);
  } catch (error: any) {
    balance_verified = false;
    issues.push(`KWH balance failed: ${error.message}`);
  }

  try {
    await invariants.assertCycleBalanced(settlement_cycle_id, AccountUnit.ZMW);
  } catch (error: any) {
    balance_verified = false;
    issues.push(`ZMW balance failed: ${error.message}`);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Verify Settlement Cycle State Hash
  // ═══════════════════════════════════════════════════════════

  const { data: cycle_data } = await supabase
    .from('settlement_cycles')
    .select('*')
    .eq('settlement_cycle_id', settlement_cycle_id)
    .single();

  let hash_verified = false;
  if (cycle_data && cycle_data.state_hash) {
    const computed_hash = computeStateHash({
      settlement_cycle_id: cycle_data.settlement_cycle_id,
      cluster_id: cycle_data.cluster_id,
      settlement_date: cycle_data.settlement_date,
      state: cycle_data.state,
      kwh_reported: parseFloat(cycle_data.kwh_reported),
      kwh_verified: parseFloat(cycle_data.kwh_verified),
      price_per_kwh: parseFloat(cycle_data.price_per_kwh),
      total_value: parseFloat(cycle_data.total_value),
      entitlements_hash: cycle_data.entitlements_hash,
      ledger_hash: cycle_data.ledger_hash,
      previous_cycle_hash: cycle_data.previous_cycle_hash
    });

    hash_verified = computed_hash === cycle_data.state_hash;
    
    if (!hash_verified) {
      issues.push(
        `State hash mismatch: computed=${computed_hash}, stored=${cycle_data.state_hash}`
      );
    }
  } else {
    issues.push('No state hash found');
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Overall Cryptographic Integrity
  // ═══════════════════════════════════════════════════════════

  const cryptographic_integrity = hash_chain_intact && hash_verified && balance_verified;

  return {
    settlement_cycle_id,
    entry_count: entries.length,
    balance_verified,
    hash_verified,
    hash_chain_intact,
    cryptographic_integrity,
    issues
  };
}

/**
 * Verify all cycles in a date range
 */
export async function verifyDateRange(
  supabase: SupabaseClient,
  start_date: string,
  end_date: string
): Promise<ReplayResult[]> {
  const { data: cycles } = await supabase
    .from('settlement_cycles')
    .select('settlement_cycle_id')
    .gte('settlement_date', start_date)
    .lte('settlement_date', end_date);

  if (!cycles) return [];

  const results: ReplayResult[] = [];
  for (const cycle of cycles) {
    const result = await replayCycle(supabase, cycle.settlement_cycle_id);
    results.push(result);
  }

  return results;
}

/**
 * Verify entire ledger hash chain (all entries)
 * This is the ultimate audit function
 */
export async function verifyEntireLedger(
  supabase: SupabaseClient
): Promise<{
  total_entries: number;
  verified_entries: number;
  corrupted_entries: number;
  broken_links: number;
  integrity_percentage: number;
  cryptographically_sound: boolean;
  errors: string[];
}> {
  const hashVerifier = new LedgerHashVerifier(supabase);
  
  const verification = await hashVerifier.verifyHashChain();

  const integrity_percentage = verification.total_entries > 0
    ? (verification.verified_entries / verification.total_entries) * 100
    : 100;

  const cryptographically_sound = verification.valid && integrity_percentage === 100;

  return {
    total_entries: verification.total_entries,
    verified_entries: verification.verified_entries,
    corrupted_entries: verification.corrupted_entries,
    broken_links: verification.broken_links,
    integrity_percentage,
    cryptographically_sound,
    errors: verification.errors
  };
}