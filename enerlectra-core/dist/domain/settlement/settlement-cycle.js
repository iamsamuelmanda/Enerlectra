/**
 * Settlement Cycle Domain Model
 * Represents a single daily settlement for a cluster
 */
import crypto from 'crypto';
import { EEState } from './settlement-state.enum';
/**
 * Compute deterministic settlement cycle ID
 */
export function computeSettlementCycleId(cluster_id, settlement_date) {
    return crypto
        .createHash('sha256')
        .update(`${cluster_id}:${settlement_date}`)
        .digest('hex');
}
/**
 * Compute state hash for integrity verification
 */
export function computeStateHash(cycle) {
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
export function createSettlementCycle(cluster_id, settlement_date) {
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
