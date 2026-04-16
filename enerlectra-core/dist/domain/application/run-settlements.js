/**
 * Run Settlement
 * Application layer orchestration for full daily settlement
 */
import { SettlementService } from '../domain/settlement/settlement-service';
/**
 * Run complete daily settlement for a cluster
 * This is the main entry point for settlement execution
 */
export async function runDailySettlement(supabase, request) {
    const service = new SettlementService(supabase);
    const operations = [];
    try {
        // STEP 1: Report Production
        operations.push('Reporting production...');
        let cycle = await service.reportProduction({
            cluster_id: request.cluster_id,
            settlement_date: request.settlement_date,
            kwh_reported: request.production_report.kwh_reported,
            kwh_verified: request.production_report.kwh_verified,
            price_per_kwh: request.production_report.price_per_kwh
        });
        operations.push(`✓ Production reported: ${cycle.kwh_verified} kWh @ ${cycle.price_per_kwh} ZMW/kWh`);
        // STEP 2: Compute Value
        operations.push('Computing value...');
        cycle = await service.computeValue(cycle.settlement_cycle_id);
        operations.push(`✓ Value computed: ${cycle.total_value} ZMW`);
        // STEP 3: Allocate Entitlements
        operations.push('Allocating entitlements...');
        cycle = await service.allocateEntitlements(cycle.settlement_cycle_id, request.contributor_allocations);
        operations.push(`✓ Entitlements allocated to ${request.contributor_allocations.length} contributors`);
        // STEP 4: Reconcile Balances
        operations.push('Reconciling balances...');
        cycle = await service.reconcileBalances(cycle.settlement_cycle_id);
        operations.push('✓ Balances reconciled, cycle balanced');
        // STEP 5: Enter Finality Window
        operations.push('Entering finality window...');
        cycle = await service.enterFinalityWindow(cycle.settlement_cycle_id);
        operations.push(`✓ Finality window started (ends: ${cycle.challenge_window_end?.toISOString()})`);
        return {
            success: true,
            settlement_cycle_id: cycle.settlement_cycle_id,
            final_state: cycle.state,
            operations_completed: operations
        };
    }
    catch (error) {
        return {
            success: false,
            settlement_cycle_id: request.cluster_id + ':' + request.settlement_date,
            final_state: 'ERROR',
            operations_completed: operations,
            error: error.message
        };
    }
}
/**
 * Attempt to finalize a settlement (after challenge window)
 * Call this 24 hours after entering finality window
 */
export async function attemptFinalization(supabase, settlement_cycle_id) {
    const service = new SettlementService(supabase);
    const operations = [];
    try {
        operations.push('Attempting finalization...');
        const cycle = await service.finalizeSettlement(settlement_cycle_id);
        operations.push(`✓ Settlement finalized at ${cycle.finalized_at?.toISOString()}`);
        return {
            success: true,
            settlement_cycle_id,
            final_state: cycle.state,
            operations_completed: operations
        };
    }
    catch (error) {
        return {
            success: false,
            settlement_cycle_id,
            final_state: 'FINALIZATION_FAILED',
            operations_completed: operations,
            error: error.message
        };
    }
}
