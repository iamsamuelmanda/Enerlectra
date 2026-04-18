/**
 * Execute Transition
 * Low-level API for executing individual state transitions
 * Use this when you need manual control over the settlement flow
 */
// NOTE: path fixed – from ../domain/settlement/... to ../settlement/...
import { EEState } from '../settlement/settlement-state.enum';
import { SettlementService } from '../settlement/settlement-service';
/**
 * Execute a single state transition
 * Lower-level API than runDailySettlement
 */
export async function executeTransition(supabase, request) {
    const service = new SettlementService(supabase);
    const timestamp = new Date().toISOString();
    try {
        // Get current cycle
        const { data: cycle_data, error } = await supabase
            .from('settlement_cycles')
            .select('*')
            .eq('settlement_cycle_id', request.settlement_cycle_id)
            .single();
        if (error || !cycle_data) {
            throw new Error(`Cycle not found: ${request.settlement_cycle_id}`);
        }
        const previous_state = cycle_data.state;
        // Execute transition based on target state
        let updated_cycle;
        switch (request.target_state) {
            case EEState.PRODUCTION_REPORTED:
                if (!request.data?.production_report) {
                    throw new Error('production_report required for PRODUCTION_REPORTED');
                }
                updated_cycle = await service.reportProduction({
                    cluster_id: cycle_data.cluster_id,
                    settlement_date: cycle_data.settlement_date,
                    ...request.data.production_report,
                });
                break;
            case EEState.VALUE_COMPUTED:
                updated_cycle = await service.computeValue(request.settlement_cycle_id);
                break;
            case EEState.ENTITLEMENTS_ALLOCATED:
                if (!request.data?.contributor_allocations) {
                    throw new Error('contributor_allocations required for ENTITLEMENTS_ALLOCATED');
                }
                updated_cycle = await service.allocateEntitlements(request.settlement_cycle_id, request.data.contributor_allocations);
                break;
            case EEState.RECONCILIATION_COMPLETE:
                updated_cycle = await service.reconcileBalances(request.settlement_cycle_id);
                break;
            case EEState.FINALITY_PENDING:
                updated_cycle = await service.enterFinalityWindow(request.settlement_cycle_id);
                break;
            case EEState.SETTLEMENT_FINALIZED:
                updated_cycle = await service.finalizeSettlement(request.settlement_cycle_id);
                break;
            default:
                throw new Error(`Unsupported target state: ${request.target_state}`);
        }
        return {
            success: true,
            previous_state,
            current_state: updated_cycle.state,
            timestamp,
        };
    }
    catch (error) {
        return {
            success: false,
            previous_state: EEState.OPERATIONAL,
            current_state: EEState.OPERATIONAL,
            timestamp,
            error: error.message,
        };
    }
}
/**
 * Get current state of a settlement cycle
 */
export async function getCycleState(supabase, settlement_cycle_id) {
    const { data, error } = await supabase
        .from('settlement_cycles')
        .select('state')
        .eq('settlement_cycle_id', settlement_cycle_id)
        .single();
    if (error || !data)
        return null;
    return data.state;
}
/**
 * Check if a transition is allowed from current state
 */
export async function canTransitionTo(supabase, settlement_cycle_id, target_state) {
    const current_state = await getCycleState(supabase, settlement_cycle_id);
    if (!current_state)
        return false;
    // NOTE: dynamic import path fixed to match the static one above
    const { ALLOWED_TRANSITIONS } = await import('../settlement/settlement-state.enum');
    const allowed = ALLOWED_TRANSITIONS[current_state] || [];
    return allowed.includes(target_state);
}
/**
 * Get transition history for a settlement cycle
 */
export async function getTransitionHistory(supabase, settlement_cycle_id) {
    const { data, error } = await supabase
        .from('settlement_cycles')
        .select('*')
        .eq('settlement_cycle_id', settlement_cycle_id)
        .single();
    if (error || !data) {
        throw new Error(`Cycle not found: ${settlement_cycle_id}`);
    }
    // Build transition history from timestamps
    const transitions = [];
    if (data.production_reported_at) {
        transitions.push({
            state: EEState.PRODUCTION_REPORTED,
            timestamp: new Date(data.production_reported_at),
        });
    }
    if (data.reconciliation_complete_at) {
        transitions.push({
            state: EEState.RECONCILIATION_COMPLETE,
            timestamp: new Date(data.reconciliation_complete_at),
        });
    }
    if (data.finality_pending_at) {
        transitions.push({
            state: EEState.FINALITY_PENDING,
            timestamp: new Date(data.finality_pending_at),
        });
    }
    if (data.finalized_at) {
        transitions.push({
            state: EEState.SETTLEMENT_FINALIZED,
            timestamp: new Date(data.finalized_at),
        });
    }
    return {
        settlement_cycle_id,
        current_state: data.state,
        transitions,
    };
}
