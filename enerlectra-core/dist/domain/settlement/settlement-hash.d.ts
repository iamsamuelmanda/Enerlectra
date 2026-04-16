/**
 * Settlement Hash (Production-Grade)
 * Canonical hash computation with deterministic BigInt serialization
 * Infrastructure-grade tamper detection
 */
import { SettlementCycle } from './settlement-cycle-hardened';
/**
 * Compute SHA-256 hash of canonical cycle representation
 *
 * This hash is:
 * - Deterministic (same cycle → same hash, always)
 * - Tamper-evident (any change breaks hash)
 * - Suitable for blockchain anchoring
 */
export declare function computeCycleHash(cycle: SettlementCycle): string;
/**
 * Verify cycle hash matches its content
 */
export declare function verifyCycleHash(cycle: SettlementCycle): boolean;
/**
 * Compute hash with explicit previous hash
 * Used during hash chain construction
 */
export declare function computeCycleHashWithPrevious(cycle: SettlementCycle, previousHash: string | undefined): string;
/**
 * Verify hash chain linkage between cycles
 */
export declare function verifyHashChainLink(currentCycle: SettlementCycle, previousCycle: SettlementCycle | null): boolean;
/**
 * Compute Merkle root of all obligations + entitlements
 * Used for compact cycle verification
 */
export declare function computeObligationsMerkleRoot(cycle: SettlementCycle): string;
/**
 * Generate short fingerprint for cycle (first 8 chars of hash)
 * Useful for logs and UI display
 */
export declare function getCycleFingerprint(cycle: SettlementCycle): string;
/**
 * Verify two cycles are identical by hash
 */
export declare function cyclesEqual(a: SettlementCycle, b: SettlementCycle): boolean;
