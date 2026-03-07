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
export function isGenesisHash(hash: string): boolean {
  return hash === GENESIS_HASH;
}

/**
 * Get previous hash for a new entry
 * Returns GENESIS_HASH if no previous entry exists
 */
export function getPreviousHash(lastEntryHash: string | null): string {
  return lastEntryHash || GENESIS_HASH;
}

/**
 * Verify genesis entry
 * The first entry in the chain must have previous_hash = GENESIS_HASH
 */
export function verifyGenesisEntry(entry: {
  entry_sequence: number;
  previous_hash: string;
}): boolean {
  if (entry.entry_sequence === 1) {
    return isGenesisHash(entry.previous_hash);
  }
  return true; // Non-genesis entries don't need this check
}