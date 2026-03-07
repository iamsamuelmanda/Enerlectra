/**
 * Ledger Hash
 * Cryptographic hash computation for ledger entries
 * Uses SHA-256 for institutional-grade auditability
 */

import { createHash } from 'crypto';

/**
 * Compute SHA-256 hash of data
 */
export function sha256(data: string): string {
  return createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Compute deterministic hash for a ledger entry
 * 
 * Hash input includes:
 * - Entry ID
 * - Account ID
 * - Settlement cycle ID
 * - Amounts (debit + credit)
 * - Unit
 * - Transaction ID
 * - Operation type
 * - Timestamp
 * - Previous hash (chain linkage)
 * 
 * Order matters. Do not change without migration.
 */
export function computeEntryHash(entry: {
  ledger_entry_id: string;
  account_id: string;
  settlement_cycle_id: string;
  debit_amount: number;
  credit_amount: number;
  unit: string;
  transaction_id: string;
  operation_type: string;
  created_at: Date;
  previous_hash: string;
}): string {
  // Canonical string representation
  // Order is critical for deterministic replay
  const canonical = [
    entry.ledger_entry_id,
    entry.account_id,
    entry.settlement_cycle_id,
    entry.debit_amount.toFixed(6), // Fixed precision
    entry.credit_amount.toFixed(6),
    entry.unit,
    entry.transaction_id,
    entry.operation_type,
    entry.created_at.toISOString(),
    entry.previous_hash
  ].join('|');

  return sha256(canonical);
}

/**
 * Verify an entry's hash matches its content
 */
export function verifyEntryHash(
  entry: {
    ledger_entry_id: string;
    account_id: string;
    settlement_cycle_id: string;
    debit_amount: number;
    credit_amount: number;
    unit: string;
    transaction_id: string;
    operation_type: string;
    created_at: Date;
    previous_hash: string;
    entry_hash: string;
  }
): boolean {
  const computed = computeEntryHash(entry);
  return computed === entry.entry_hash;
}

/**
 * Compute hash for a settlement cycle
 * This creates a tamper-evident seal for the entire cycle
 */
export function computeCycleHash(cycle: {
  settlement_cycle_id: string;
  kwh_verified: number;
  price_per_kwh: number;
  total_value: number;
  state: string;
  ledger_root_hash: string; // Hash of all ledger entries in cycle
  previous_cycle_hash?: string;
}): string {
  const canonical = [
    cycle.settlement_cycle_id,
    cycle.kwh_verified.toFixed(6),
    cycle.price_per_kwh.toFixed(6),
    cycle.total_value.toFixed(6),
    cycle.state,
    cycle.ledger_root_hash,
    cycle.previous_cycle_hash || 'GENESIS'
  ].join('|');

  return sha256(canonical);
}

/**
 * Compute Merkle root of ledger entries
 * Used for cycle hash computation
 */
export function computeLedgerMerkleRoot(entryHashes: string[]): string {
  if (entryHashes.length === 0) {
    return sha256('EMPTY_LEDGER');
  }

  if (entryHashes.length === 1) {
    return entryHashes[0];
  }

  // Simple concatenation hash (not full Merkle tree)
  // For production Merkle tree, use recursive pairing
  const concatenated = entryHashes.join('');
  return sha256(concatenated);
}