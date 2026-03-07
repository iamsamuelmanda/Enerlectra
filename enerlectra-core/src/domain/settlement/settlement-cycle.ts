/**
 * Settlement Cycle Domain Model
 * Represents a single daily settlement for a cluster
 */

import crypto from 'crypto';
import { EEState } from './settlement-state.enum';

export interface SettlementCycle {
  settlement_cycle_id: string;
  cluster_id: string;
  settlement_date: string; // ISO YYYY-MM-DD

  state: EEState;

  // Production data
  kwh_reported: number;
  kwh_verified: number;

  // Pricing
  price_per_kwh: number;
  total_value: number;

  // Timestamps
  production_reported_at?: Date;
  reconciliation_complete_at?: Date;
  finality_pending_at?: Date;
  finalized_at?: Date;

  // Challenge window
  challenge_window_end?: Date;

  // Integrity hashes
  entitlements_hash?: string;
  ledger_hash?: string;
  state_hash?: string;
  previous_cycle_hash?: string;
}

/**
 * Compute deterministic settlement cycle ID
 */
export function computeSettlementCycleId(
  cluster_id: string,
  settlement_date: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${cluster_id}:${settlement_date}`)
    .digest('hex');
}

/**
 * Compute state hash for integrity verification
 */
export function computeStateHash(cycle: SettlementCycle): string {
  const payload = {
    settlement_cycle_id: cycle.settlement_cycle_id,
    kwh_verified: cycle.kwh_verified,
    price_per_kwh: cycle.price_per_kwh,
    total_value: cycle.total_value,
    entitlements_hash: cycle.entitlements_hash || '',
    ledger_hash: cycle.ledger_hash || '',
    previous_cycle_hash: cycle.previous_cycle_hash || ''
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Create initial settlement cycle
 */
export function createSettlementCycle(
  cluster_id: string,
  settlement_date: string
): SettlementCycle {
  const settlement_cycle_id = computeSettlementCycleId(cluster_id, settlement_date);

  return {
    settlement_cycle_id,
    cluster_id,
    settlement_date,
    state: EEState.OPERATIONAL,
    kwh_reported: 0,
    kwh_verified: 0,
    price_per_kwh: 0,
    total_value: 0
  };
}