/**
 * Account Invariants
 * Enforces double-entry accounting rules
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountUnit } from './account';
export declare class AccountInvariants {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Assert that a settlement cycle's ledger balances to zero
     * CRITICAL: This is the fundamental clearinghouse invariant
     */
    assertCycleBalanced(settlement_cycle_id: string, unit: AccountUnit): Promise<void>;
    /**
     * Assert that cluster pool account has zero balance after allocation
     * Pool accounts must be drained completely each cycle
     */
    assertPoolDrained(account_id: string): Promise<void>;
    /**
     * Assert no negative balances (except system accounts)
     */
    assertNoNegativeBalances(settlement_cycle_id: string): Promise<void>;
    /**
     * Get cycle balance summary
     */
    getCycleBalance(settlement_cycle_id: string, unit: AccountUnit): Promise<{
        total_credits: number;
        total_debits: number;
        net_balance: number;
    }>;
    /**
     * Verify transaction atomicity (all entries in transaction have same transaction_id)
     */
    verifyTransaction(transaction_id: string): Promise<boolean>;
    /**
     * Get account balance
     */
    private getBalance;
}
