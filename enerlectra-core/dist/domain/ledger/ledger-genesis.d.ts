/**
 * Ledger Genesis
 * Defines the genesis block for the hash chain
 */
/**
 * Genesis hash - the root of the hash chain
 * All hash chains start from this fixed value
 */
export declare const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
/**
 * Check if a hash is the genesis hash
 */
export declare function isGenesisHash(hash: string): boolean;
/**
 * Get previous hash for a new entry
 * Returns GENESIS_HASH if no previous entry exists
 */
export declare function getPreviousHash(lastEntryHash: string | null): string;
/**
 * Verify genesis entry
 * The first entry in the chain must have previous_hash = GENESIS_HASH
 */
export declare function verifyGenesisEntry(entry: {
    entry_sequence: number;
    previous_hash: string;
}): boolean;

