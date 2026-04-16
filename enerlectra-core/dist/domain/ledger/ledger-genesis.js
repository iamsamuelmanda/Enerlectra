/**
 * Ledger Genesis
 * Defines the genesis block for the hash chain
 */
/**
 * Genesis hash - the root of the hash chain
 * All hash chains start from this fixed value
 */
export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
/**
 * Check if a hash is the genesis hash
 */
export function isGenesisHash(hash) {
    return hash === GENESIS_HASH;
}
/**
 * Get previous hash for a new entry
 * Returns GENESIS_HASH if no previous entry exists
 */
export function getPreviousHash(lastEntryHash) {
    return lastEntryHash || GENESIS_HASH;
}
/**
 * Verify genesis entry
 * The first entry in the chain must have previous_hash = GENESIS_HASH
 */
export function verifyGenesisEntry(entry) {
    if (entry.entry_sequence === 1) {
        return isGenesisHash(entry.previous_hash);
    }
    return true; // Non-genesis entries don't need this check
}
