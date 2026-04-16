/**
 * Ledger Hash
 * Cryptographic hash computation for ledger entries
 * Uses SHA-256 for institutional-grade auditability
 */
/**
 * Compute SHA-256 hash of data
 */
export declare function sha256(data: string): string;
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
export declare function computeEntryHash(entry: {
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
}): string;
/**
 * Verify an entry's hash matches its content
 */
export declare function verifyEntryHash(entry: {
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
}): boolean;
/**
 * Compute hash for a settlement cycle
 * This creates a tamper-evident seal for the entire cycle
 */
export declare function computeCycleHash(cycle: {
    settlement_cycle_id: string;
    kwh_verified: number;
    price_per_kwh: number;
    total_value: number;
    state: string;
    ledger_root_hash: string;
    previous_cycle_hash?: string;
}): string;
/**
 * Compute Merkle root of ledger entries
 * Used for cycle hash computation
 */
export declare function computeLedgerMerkleRoot(entryHashes: string[]): string;
