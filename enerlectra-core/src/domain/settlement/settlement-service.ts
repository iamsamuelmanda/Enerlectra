/**
 * Settlement Service
 * The Enerlectra Engine (EE) - orchestrates settlement state machine
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EEState } from './settlement-state.enum';
import { SettlementCycle, createSettlementCycle, computeSettlementCycleId } from './settlement-cycle';
import { transitionState, assertValueComputation } from './settlement-transitions';
import { FinalityDetector } from './finality-detector';
import { AccountService } from '../accounts/account-service';
import { LedgerService } from '../accounts/ledger-service';
import { AccountInvariants } from '../accounts/invariants';
import { AccountReconciliation } from '../accounts/reconciliation';
import { AccountUnit } from '../accounts/account';

export interface ProductionReport {
  cluster_id: string;
  settlement_date: string;
  kwh_reported: number;
  kwh_verified: number;
  price_per_kwh: number;
}

export interface ContributorAllocation {
  contributor_id: string;
  kwh_share: number;
  value_share: number;
}

export class SettlementService {
  private accountService: AccountService;
  private ledgerService: LedgerService;
  private invariants: AccountInvariants;
  private reconciliation: AccountReconciliation;
  private finalityDetector: FinalityDetector;

  constructor(private supabase: SupabaseClient) {
    this.accountService = new AccountService(supabase);
    this.ledgerService = new LedgerService(supabase);
    this.invariants = new AccountInvariants(supabase);
    this.reconciliation = new AccountReconciliation(supabase);
    this.finalityDetector = new FinalityDetector(supabase);
  }

  /**
   * Create or get settlement cycle
   */
  async getOrCreateCycle(
    cluster_id: string,
    settlement_date: string
  ): Promise<SettlementCycle> {
    const cycle_id = computeSettlementCycleId(cluster_id, settlement_date);

    // Try to get existing
    const { data, error } = await this.supabase
      .from('settlement_cycles')
      .select('*')
      .eq('settlement_cycle_id', cycle_id)
      .single();

    if (data) {
      return this.mapCycle(data);
    }

    // Create new
    const new_cycle = createSettlementCycle(cluster_id, settlement_date);
    
    const { error: insert_error } = await this.supabase
      .from('settlement_cycles')
      .insert(this.serializeCycle(new_cycle));

    if (insert_error) throw new Error(`Failed to create cycle: ${insert_error.message}`);
    
    return new_cycle;
  }

  /**
   * STEP 1: Report Production
   * Transitions: OPERATIONAL → PRODUCTION_REPORTED
   */
  async reportProduction(report: ProductionReport): Promise<SettlementCycle> {
    let cycle = await this.getOrCreateCycle(report.cluster_id, report.settlement_date);

    if (cycle.state !== EEState.OPERATIONAL) {
      throw new Error(`Cannot report production in state ${cycle.state}`);
    }

    // Update cycle with production data
    cycle.kwh_reported = report.kwh_reported;
    cycle.kwh_verified = report.kwh_verified;
    cycle.price_per_kwh = report.price_per_kwh;

    // Transition state
    cycle = transitionState(cycle, EEState.PRODUCTION_REPORTED);

    // Persist
    await this.updateCycle(cycle);

    return cycle;
  }

  /**
   * STEP 2: Compute Value
   * Transitions: PRODUCTION_REPORTED → VALUE_COMPUTED
   * Creates ledger entries: SYSTEM → CLUSTER_POOL
   */
  async computeValue(settlement_cycle_id: string): Promise<SettlementCycle> {
    let cycle = await this.getCycle(settlement_cycle_id);

    if (cycle.state !== EEState.PRODUCTION_REPORTED) {
      throw new Error(`Cannot compute value in state ${cycle.state}`);
    }

    // Compute total value
    cycle.total_value = cycle.kwh_verified * cycle.price_per_kwh;

    // Credit cluster pool from SYSTEM (energy enters the system)
    const system_kwh = await this.accountService.getSystemAccount(AccountUnit.KWH);
    const pool_kwh = await this.accountService.getClusterPoolAccount(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.KWH
    );

    await this.ledgerService.transfer({
      from_account_id: system_kwh,
      to_account_id: pool_kwh,
      amount: cycle.kwh_verified,
      settlement_cycle_id: cycle.settlement_cycle_id,
      operation_type: 'PRODUCTION_CREDIT',
      description: `Production ${cycle.kwh_verified} kWh credited to pool`
    });

    // Also credit ZMW value
    const system_zmw = await this.accountService.getSystemAccount(AccountUnit.ZMW);
    const pool_zmw = await this.accountService.getClusterPoolAccount(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.ZMW
    );

    await this.ledgerService.transfer({
      from_account_id: system_zmw,
      to_account_id: pool_zmw,
      amount: cycle.total_value,
      settlement_cycle_id: cycle.settlement_cycle_id,
      operation_type: 'VALUE_CREDIT',
      description: `Value ${cycle.total_value} ZMW credited to pool`
    });

    // Transition state
    cycle = transitionState(cycle, EEState.VALUE_COMPUTED);

    // Assert invariant
    assertValueComputation(cycle);

    // Persist
    await this.updateCycle(cycle);

    return cycle;
  }

  /**
   * STEP 3: Allocate Entitlements
   * Transitions: VALUE_COMPUTED → ENTITLEMENTS_ALLOCATED
   * Creates ledger entries: CLUSTER_POOL → CONTRIBUTOR accounts
   */
  async allocateEntitlements(
    settlement_cycle_id: string,
    allocations: ContributorAllocation[]
  ): Promise<SettlementCycle> {
    let cycle = await this.getCycle(settlement_cycle_id);

    if (cycle.state !== EEState.VALUE_COMPUTED) {
      throw new Error(`Cannot allocate entitlements in state ${cycle.state}`);
    }

    // Get pool accounts
    const pool_kwh = await this.accountService.getClusterPoolAccount(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.KWH
    );

    const pool_zmw = await this.accountService.getClusterPoolAccount(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.ZMW
    );

    // Transfer to each contributor
    for (const allocation of allocations) {
      // Get/create contributor accounts
      const contributor_kwh = await this.accountService.getContributorAccount(
        allocation.contributor_id,
        AccountUnit.KWH
      );

      const contributor_zmw = await this.accountService.getContributorAccount(
        allocation.contributor_id,
        AccountUnit.ZMW
      );

      // Transfer kWh
      await this.ledgerService.transfer({
        from_account_id: pool_kwh,
        to_account_id: contributor_kwh,
        amount: allocation.kwh_share,
        settlement_cycle_id: cycle.settlement_cycle_id,
        operation_type: 'ENTITLEMENT_ALLOCATION',
        description: `Allocated ${allocation.kwh_share} kWh to contributor`
      });

      // Transfer ZMW
      await this.ledgerService.transfer({
        from_account_id: pool_zmw,
        to_account_id: contributor_zmw,
        amount: allocation.value_share,
        settlement_cycle_id: cycle.settlement_cycle_id,
        operation_type: 'ENTITLEMENT_ALLOCATION',
        description: `Allocated ${allocation.value_share} ZMW to contributor`
      });
    }

    // Transition state
    cycle = transitionState(cycle, EEState.ENTITLEMENTS_ALLOCATED);

    // Persist
    await this.updateCycle(cycle);

    return cycle;
  }

  /**
   * STEP 4: Reconcile Balances
   * Transitions: ENTITLEMENTS_ALLOCATED → BALANCES_NETTED → RECONCILIATION_COMPLETE
   * Handles any pool remainders
   */
  async reconcileBalances(settlement_cycle_id: string): Promise<SettlementCycle> {
    let cycle = await this.getCycle(settlement_cycle_id);

    if (cycle.state !== EEState.ENTITLEMENTS_ALLOCATED) {
      throw new Error(`Cannot reconcile in state ${cycle.state}`);
    }

    // Transition to SETTLEMENT_COMPUTED first
    cycle = transitionState(cycle, EEState.SETTLEMENT_COMPUTED);
    await this.updateCycle(cycle);

    // Reconcile pool accounts (move remainder to reserve or imbalance)
    await this.reconciliation.reconcileClusterPool(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.KWH
    );

    await this.reconciliation.reconcileClusterPool(
      cycle.cluster_id,
      cycle.settlement_cycle_id,
      AccountUnit.ZMW
    );

    // Transition to BALANCES_NETTED
    cycle = transitionState(cycle, EEState.BALANCES_NETTED);
    await this.updateCycle(cycle);

    // Assert cycle balanced
    await this.invariants.assertCycleBalanced(cycle.settlement_cycle_id, AccountUnit.KWH);
    await this.invariants.assertCycleBalanced(cycle.settlement_cycle_id, AccountUnit.ZMW);

    // Transition to RECONCILIATION_COMPLETE
    cycle = transitionState(cycle, EEState.RECONCILIATION_COMPLETE);
    await this.updateCycle(cycle);

    return cycle;
  }

  /**
   * STEP 5: Enter Finality Window
   * Transitions: RECONCILIATION_COMPLETE → FINALITY_PENDING
   */
  async enterFinalityWindow(settlement_cycle_id: string): Promise<SettlementCycle> {
    let cycle = await this.getCycle(settlement_cycle_id);

    if (cycle.state !== EEState.RECONCILIATION_COMPLETE) {
      throw new Error(`Cannot enter finality window in state ${cycle.state}`);
    }

    // Transition state (automatically sets challenge_window_end)
    cycle = transitionState(cycle, EEState.FINALITY_PENDING);

    // Persist
    await this.updateCycle(cycle);

    return cycle;
  }

  /**
   * STEP 6: Finalize Settlement
   * Transitions: FINALITY_PENDING → SETTLEMENT_FINALIZED
   * Only if challenge window passed and no pending challenges
   */
  async finalizeSettlement(settlement_cycle_id: string): Promise<SettlementCycle> {
    let cycle = await this.getCycle(settlement_cycle_id);

    if (cycle.state !== EEState.FINALITY_PENDING) {
      throw new Error(`Cannot finalize in state ${cycle.state}`);
    }

    // Check if can finalize
    const can_finalize = await this.finalityDetector.attemptFinalization(
      settlement_cycle_id,
      cycle
    );

    if (!can_finalize) {
      throw new Error(`Settlement not ready for finalization`);
    }

    // Transition to final state
    cycle = transitionState(cycle, EEState.SETTLEMENT_FINALIZED);

    // Persist
    await this.updateCycle(cycle);

    // TODO: Emit event for payout executor
    // eventBus.emit('settlement_finalized', { settlement_cycle_id });

    return cycle;
  }

  /**
   * Get settlement cycle
   */
  private async getCycle(settlement_cycle_id: string): Promise<SettlementCycle> {
    const { data, error } = await this.supabase
      .from('settlement_cycles')
      .select('*')
      .eq('settlement_cycle_id', settlement_cycle_id)
      .single();

    if (error) throw new Error(`Cycle not found: ${settlement_cycle_id}`);
    return this.mapCycle(data);
  }

  /**
   * Update settlement cycle
   */
  private async updateCycle(cycle: SettlementCycle): Promise<void> {
    const { error } = await this.supabase
      .from('settlement_cycles')
      .update(this.serializeCycle(cycle))
      .eq('settlement_cycle_id', cycle.settlement_cycle_id);

    if (error) throw new Error(`Failed to update cycle: ${error.message}`);
  }

  private mapCycle(data: any): SettlementCycle {
    return {
      settlement_cycle_id: data.settlement_cycle_id,
      cluster_id: data.cluster_id,
      settlement_date: data.settlement_date,
      state: data.state as EEState,
      kwh_reported: parseFloat(data.kwh_reported),
      kwh_verified: parseFloat(data.kwh_verified),
      price_per_kwh: parseFloat(data.price_per_kwh),
      total_value: parseFloat(data.total_value),
      production_reported_at: data.production_reported_at ? new Date(data.production_reported_at) : undefined,
      reconciliation_complete_at: data.reconciliation_complete_at ? new Date(data.reconciliation_complete_at) : undefined,
      finality_pending_at: data.finality_pending_at ? new Date(data.finality_pending_at) : undefined,
      finalized_at: data.finalized_at ? new Date(data.finalized_at) : undefined,
      challenge_window_end: data.challenge_window_end ? new Date(data.challenge_window_end) : undefined,
      entitlements_hash: data.entitlements_hash,
      ledger_hash: data.ledger_hash,
      state_hash: data.state_hash,
      previous_cycle_hash: data.previous_cycle_hash
    };
  }

  private serializeCycle(cycle: SettlementCycle): any {
    return {
      settlement_cycle_id: cycle.settlement_cycle_id,
      cluster_id: cycle.cluster_id,
      settlement_date: cycle.settlement_date,
      state: cycle.state,
      kwh_reported: cycle.kwh_reported,
      kwh_verified: cycle.kwh_verified,
      price_per_kwh: cycle.price_per_kwh,
      total_value: cycle.total_value,
      production_reported_at: cycle.production_reported_at?.toISOString(),
      reconciliation_complete_at: cycle.reconciliation_complete_at?.toISOString(),
      finality_pending_at: cycle.finality_pending_at?.toISOString(),
      finalized_at: cycle.finalized_at?.toISOString(),
      challenge_window_end: cycle.challenge_window_end?.toISOString(),
      entitlements_hash: cycle.entitlements_hash,
      ledger_hash: cycle.ledger_hash,
      state_hash: cycle.state_hash,
      previous_cycle_hash: cycle.previous_cycle_hash
    };
  }
}