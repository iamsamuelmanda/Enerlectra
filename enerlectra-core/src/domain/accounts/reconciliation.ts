/**
 * Account Reconciliation
 * Handles imbalances, surpluses, and shortfalls
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountUnit } from './account';
import { AccountService } from './account-service';
import { LedgerService } from './ledger-service';
import { AccountInvariants } from './invariants';

export interface ReconciliationResult {
  settlement_cycle_id: string;
  unit: AccountUnit;
  pool_balance_before: number;
  imbalance_amount: number;
  reconciled: boolean;
  operations: string[];
}

export class AccountReconciliation {
  private accountService: AccountService;
  private ledgerService: LedgerService;
  private invariants: AccountInvariants;

  constructor(private supabase: SupabaseClient) {
    this.accountService = new AccountService(supabase);
    this.ledgerService = new LedgerService(supabase);
    this.invariants = new AccountInvariants(supabase);
  }

  /**
   * Reconcile cluster pool after entitlement allocation
   * Moves any remaining balance to either reserve (surplus) or imbalance (shortfall)
   */
  async reconcileClusterPool(
    cluster_id: string,
    settlement_cycle_id: string,
    unit: AccountUnit
  ): Promise<ReconciliationResult> {
    const operations: string[] = [];

    // Get pool account
    const pool_account_id = await this.accountService.getClusterPoolAccount(
      cluster_id,
      settlement_cycle_id,
      unit
    );

    // Get pool balance
    const pool_balance = await this.accountService.getBalance(pool_account_id);
    operations.push(`Pool balance: ${pool_balance} ${unit}`);

    if (Math.abs(pool_balance) < 0.000001) {
      // Perfect balance - no reconciliation needed
      operations.push('Pool perfectly balanced - no reconciliation needed');
      return {
        settlement_cycle_id,
        unit,
        pool_balance_before: pool_balance,
        imbalance_amount: 0,
        reconciled: true,
        operations
      };
    }

    if (pool_balance > 0) {
      // SURPLUS: Move to reserve
      const reserve_account_id = await this.accountService.getReserveAccount(
        cluster_id,
        unit
      );

      await this.ledgerService.transfer({
        from_account_id: pool_account_id,
        to_account_id: reserve_account_id,
        amount: pool_balance,
        settlement_cycle_id,
        operation_type: 'SURPLUS_TO_RESERVE',
        description: `Surplus ${pool_balance} ${unit} to reserve`
      });

      operations.push(`Moved surplus ${pool_balance} ${unit} to reserve`);
    } else {
      // SHORTFALL: Record in imbalance
      const imbalance_account_id = await this.accountService.getImbalanceAccount(
        settlement_cycle_id,
        unit
      );

      const shortfall = Math.abs(pool_balance);

      // Credit pool (bring to zero), debit imbalance
      await this.ledgerService.transfer({
        from_account_id: imbalance_account_id,
        to_account_id: pool_account_id,
        amount: shortfall,
        settlement_cycle_id,
        operation_type: 'SHORTFALL_TO_IMBALANCE',
        description: `Shortfall ${shortfall} ${unit} recorded in imbalance`
      });

      operations.push(`Recorded shortfall ${shortfall} ${unit} in imbalance account`);
    }

    // Verify pool is now at zero
    await this.invariants.assertPoolDrained(pool_account_id);
    operations.push('Pool drained to zero ✓');

    return {
      settlement_cycle_id,
      unit,
      pool_balance_before: pool_balance,
      imbalance_amount: pool_balance < 0 ? Math.abs(pool_balance) : 0,
      reconciled: true,
      operations
    };
  }

  /**
   * Get reconciliation report for a settlement cycle
   */
  async getReconciliationReport(
    settlement_cycle_id: string
  ): Promise<{
    cycle_id: string;
    balanced: boolean;
    units: {
      unit: AccountUnit;
      total_credits: number;
      total_debits: number;
      net_balance: number;
    }[];
  }> {
    const units: AccountUnit[] = [AccountUnit.KWH, AccountUnit.ZMW];
    const unit_results = [];

    for (const unit of units) {
      const balance = await this.invariants.getCycleBalance(settlement_cycle_id, unit);
      unit_results.push({
        unit,
        ...balance
      });
    }

    // Check if all units are balanced
    const balanced = unit_results.every(
      u => Math.abs(u.net_balance) < 0.000001
    );

    return {
      cycle_id: settlement_cycle_id,
      balanced,
      units: unit_results
    };
  }

  /**
   * Verify full cycle reconciliation
   */
  async verifyCycleReconciled(settlement_cycle_id: string): Promise<boolean> {
    try {
      // Check both units
      await this.invariants.assertCycleBalanced(settlement_cycle_id, AccountUnit.KWH);
      await this.invariants.assertCycleBalanced(settlement_cycle_id, AccountUnit.ZMW);
      
      // Check no negative balances
      await this.invariants.assertNoNegativeBalances(settlement_cycle_id);
      
      return true;
    } catch (error) {
      console.error('Cycle reconciliation verification failed:', error);
      return false;
    }
  }
}