/**
 * Finality Proof
 * Generates cryptographic proof of settlement finality
 */
import { sha256, computeLedgerMerkleRoot } from '../ledger/ledger-hash';
import { LedgerService } from '../accounts/ledger-service';
/**
 * Generate finality proof for a settlement cycle
 * This creates a tamper-evident seal
 */
export async function generateFinalityProof(supabase, settlement_cycle_id) {
    // Get settlement cycle
    const { data: cycle, error: cycle_error } = await supabase
        .from('settlement_cycles')
        .select('*')
        .eq('settlement_cycle_id', settlement_cycle_id)
        .single();
    if (cycle_error || !cycle) {
        throw new Error(`Settlement cycle not found: ${settlement_cycle_id}`);
    }
    if (cycle.state !== 'SETTLEMENT_FINALIZED') {
        throw new Error(`Cannot generate finality proof for non-finalized cycle. ` +
            `Current state: ${cycle.state}`);
    }
    // Get all ledger entries for this cycle
    const ledgerService = new LedgerService(supabase);
    const entries = await ledgerService.getCycleEntries(settlement_cycle_id);
    // Compute Merkle root of ledger entries
    const entry_hashes = entries.map(e => {
        // Assuming entries have entry_hash property after upgrade
        return e.entry_hash || sha256(e.ledger_entry_id);
    });
    const ledger_root_hash = computeLedgerMerkleRoot(entry_hashes);
    // Compute cycle hash
    const cycle_hash = sha256([
        cycle.settlement_cycle_id,
        cycle.kwh_verified,
        cycle.total_value,
        cycle.state,
        ledger_root_hash,
        cycle.previous_cycle_hash || 'GENESIS'
    ].join('|'));
    // Create finality proof
    const proof = {
        settlement_cycle_id: cycle.settlement_cycle_id,
        finalized_at: cycle.finalized_at,
        kwh_verified: parseFloat(cycle.kwh_verified),
        total_value: parseFloat(cycle.total_value),
        state: cycle.state,
        cycle_hash,
        ledger_root_hash,
        entry_count: entries.length,
        previous_cycle_hash: cycle.previous_cycle_hash,
        proof_hash: '' // Will be computed below
    };
    // Compute proof hash (hash of the proof itself)
    proof.proof_hash = sha256(JSON.stringify(proof));
    return proof;
}
/**
 * Verify a finality proof
 */
export async function verifyFinalityProof(supabase, proof) {
    const errors = [];
    // Recompute proof hash
    const proof_copy = { ...proof };
    const stored_proof_hash = proof_copy.proof_hash;
    proof_copy.proof_hash = '';
    const recomputed_proof_hash = sha256(JSON.stringify(proof_copy));
    if (recomputed_proof_hash !== stored_proof_hash) {
        errors.push('Proof hash mismatch - proof has been tampered with');
    }
    // Verify cycle still exists and is finalized
    const { data: cycle } = await supabase
        .from('settlement_cycles')
        .select('state, kwh_verified, total_value')
        .eq('settlement_cycle_id', proof.settlement_cycle_id)
        .single();
    if (!cycle) {
        errors.push('Settlement cycle no longer exists');
    }
    else {
        if (cycle.state !== 'SETTLEMENT_FINALIZED') {
            errors.push(`Cycle state changed to ${cycle.state}`);
        }
        if (parseFloat(cycle.kwh_verified) !== proof.kwh_verified) {
            errors.push('kWh value changed after finalization');
        }
        if (parseFloat(cycle.total_value) !== proof.total_value) {
            errors.push('Total value changed after finalization');
        }
    }
    // Verify ledger entry count
    const ledgerService = new LedgerService(supabase);
    const entries = await ledgerService.getCycleEntries(proof.settlement_cycle_id);
    if (entries.length !== proof.entry_count) {
        errors.push(`Entry count mismatch: expected ${proof.entry_count}, got ${entries.length}`);
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
/**
 * Export finality proof as JSON
 * Can be stored off-chain or anchored on-chain
 */
export function exportFinalityProof(proof) {
    return JSON.stringify(proof, null, 2);
}
/**
 * Import finality proof from JSON
 */
export function importFinalityProof(json) {
    return JSON.parse(json);
}
