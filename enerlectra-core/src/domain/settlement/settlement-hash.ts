/**
 * Settlement Hash (Production-Grade)
 * Canonical hash computation with deterministic BigInt serialization
 * Infrastructure-grade tamper detection
 */

import { createHash } from 'crypto';
import { SettlementCycle } from './settlement-cycle-hardened';

// ═══════════════════════════════════════════════════════════════
// CANONICAL SERIALIZATION (Critical for deterministic hashing)
// ═══════════════════════════════════════════════════════════════

/**
 * Canonicalize settlement cycle for hashing
 * 
 * CRITICAL REQUIREMENTS:
 * 1. BigInt values MUST be converted to strings
 * 2. Arrays MUST be sorted deterministically
 * 3. Order of fields MUST be consistent
 * 4. No whitespace differences
 * 
 * This ensures hash(cycle) is identical across:
 * - Different machines
 * - Different Node versions
 * - Different architectures
 * - Replay verification
 */
function canonicalizeSettlementCycle(cycle: SettlementCycle): string {
  // Sort buyer obligations by buyerId (deterministic order)
  const sortedBuyers = [...cycle.buyerObligations]
    .sort((a, b) => a.buyerId.localeCompare(b.buyerId))
    .map(buyer => ({
      buyerId: buyer.buyerId,
      energyWh: buyer.energyWh.toString(),
      grossAmountNgwee: buyer.grossAmountNgwee.toString(),
      feesNgwee: buyer.feesNgwee.toString(),
      netPayableNgwee: buyer.netPayableNgwee.toString()
    }));

  // Sort contributor entitlements by contributorId (deterministic order)
  const sortedContributors = [...cycle.contributorEntitlements]
    .sort((a, b) => a.contributorId.localeCompare(b.contributorId))
    .map(contributor => ({
      contributorId: contributor.contributorId,
      energyWh: contributor.energyWh.toString(),
      grossAmountNgwee: contributor.grossAmountNgwee.toString(),
      feesNgwee: contributor.feesNgwee.toString(),
      netReceivableNgwee: contributor.netReceivableNgwee.toString()
    }));

  // Sort netted transfers (deterministic order)
  const sortedTransfers = [...cycle.nettedTransfers]
    .sort((a, b) => {
      const cmp = a.fromAccountId.localeCompare(b.fromAccountId);
      if (cmp !== 0) return cmp;
      return a.toAccountId.localeCompare(b.toAccountId);
    })
    .map(transfer => ({
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amountNgwee: transfer.amountNgwee.toString()
    }));

  // Create canonical object (field order matters)
  const canonical = {
    // Cycle identity
    id: cycle.id,
    clusterId: cycle.clusterId,
    startTimestamp: cycle.startTimestamp,
    endTimestamp: cycle.endTimestamp,
    state: cycle.state,

    // Obligations (sorted)
    buyerObligations: sortedBuyers,
    contributorEntitlements: sortedContributors,

    // Totals (BigInt → string)
    totalBuyerGrossNgwee: cycle.totalBuyerGrossNgwee.toString(),
    totalContributorGrossNgwee: cycle.totalContributorGrossNgwee.toString(),
    totalFeesNgwee: cycle.totalFeesNgwee.toString(),
    totalEnergyWh: cycle.totalEnergyWh.toString(),

    // Transfers (sorted)
    nettedTransfers: sortedTransfers,

    // Hash chain linkage
    previousCycleHash: cycle.previousCycleHash || null
  };

  // JSON.stringify with no whitespace for compactness
  return JSON.stringify(canonical);
}

// ═══════════════════════════════════════════════════════════════
// HASH COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute SHA-256 hash of canonical cycle representation
 * 
 * This hash is:
 * - Deterministic (same cycle → same hash, always)
 * - Tamper-evident (any change breaks hash)
 * - Suitable for blockchain anchoring
 */
export function computeCycleHash(cycle: SettlementCycle): string {
  const canonical = canonicalizeSettlementCycle(cycle);
  
  return createHash('sha256')
    .update(canonical)
    .digest('hex');
}

/**
 * Verify cycle hash matches its content
 */
export function verifyCycleHash(cycle: SettlementCycle): boolean {
  if (!cycle.cycleHash) {
    return false; // No hash to verify
  }

  const computed = computeCycleHash(cycle);
  return computed === cycle.cycleHash;
}

/**
 * Compute hash with explicit previous hash
 * Used during hash chain construction
 */
export function computeCycleHashWithPrevious(
  cycle: SettlementCycle,
  previousHash: string | undefined
): string {
  const cycleWithPrevious = {
    ...cycle,
    previousCycleHash: previousHash
  };

  return computeCycleHash(cycleWithPrevious);
}

// ═══════════════════════════════════════════════════════════════
// HASH CHAIN VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Verify hash chain linkage between cycles
 */
export function verifyHashChainLink(
  currentCycle: SettlementCycle,
  previousCycle: SettlementCycle | null
): boolean {
  if (!currentCycle.cycleHash) {
    return false; // Current cycle has no hash
  }

  if (previousCycle === null) {
    // First cycle - should have no previous hash
    return currentCycle.previousCycleHash === undefined ||
           currentCycle.previousCycleHash === null;
  }

  if (!previousCycle.cycleHash) {
    return false; // Previous cycle has no hash
  }

  // Current cycle should link to previous cycle's hash
  return currentCycle.previousCycleHash === previousCycle.cycleHash;
}

// ═══════════════════════════════════════════════════════════════
// MERKLE ROOT (For cycle anchoring)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute Merkle root of all obligations + entitlements
 * Used for compact cycle verification
 */
export function computeObligationsMerkleRoot(cycle: SettlementCycle): string {
  const hashes: string[] = [];

  // Hash each buyer obligation
  for (const buyer of cycle.buyerObligations) {
    const buyerCanonical = JSON.stringify({
      buyerId: buyer.buyerId,
      energyWh: buyer.energyWh.toString(),
      grossAmountNgwee: buyer.grossAmountNgwee.toString(),
      feesNgwee: buyer.feesNgwee.toString(),
      netPayableNgwee: buyer.netPayableNgwee.toString()
    });
    
    hashes.push(
      createHash('sha256')
        .update(buyerCanonical)
        .digest('hex')
    );
  }

  // Hash each contributor entitlement
  for (const contributor of cycle.contributorEntitlements) {
    const contributorCanonical = JSON.stringify({
      contributorId: contributor.contributorId,
      energyWh: contributor.energyWh.toString(),
      grossAmountNgwee: contributor.grossAmountNgwee.toString(),
      feesNgwee: contributor.feesNgwee.toString(),
      netReceivableNgwee: contributor.netReceivableNgwee.toString()
    });
    
    hashes.push(
      createHash('sha256')
        .update(contributorCanonical)
        .digest('hex')
    );
  }

  // If no obligations/entitlements, return hash of empty string
  if (hashes.length === 0) {
    return createHash('sha256')
      .update('EMPTY_CYCLE')
      .digest('hex');
  }

  // Sort hashes for determinism
  hashes.sort();

  // Compute Merkle root (simple concatenation hash)
  // For production Merkle tree, use recursive pairing
  const concatenated = hashes.join('');
  return createHash('sha256')
    .update(concatenated)
    .digest('hex');
}

// ═══════════════════════════════════════════════════════════════
// CYCLE FINGERPRINT (Short identifier for logs/UI)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate short fingerprint for cycle (first 8 chars of hash)
 * Useful for logs and UI display
 */
export function getCycleFingerprint(cycle: SettlementCycle): string {
  const hash = cycle.cycleHash || computeCycleHash(cycle);
  return hash.substring(0, 8);
}

/**
 * Verify two cycles are identical by hash
 */
export function cyclesEqual(a: SettlementCycle, b: SettlementCycle): boolean {
  const hashA = a.cycleHash || computeCycleHash(a);
  const hashB = b.cycleHash || computeCycleHash(b);
  return hashA === hashB;
}