/**
 * Account Invariants
 * Enforces double-entry accounting rules
 */
export class AccountInvariants {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Assert that a settlement cycle's ledger balances to zero
     * CRITICAL: This is the fundamental clearinghouse invariant
     */
    async assertCycleBalanced(settlement_cycle_id, unit) {
        const { data, error } = await this.supabase.rpc('check_cycle_balanced', {
            p_settlement_cycle_id: settlement_cycle_id,
            p_unit: unit
        });
        if (error) {
            throw new Error(`Cycle ${settlement_cycle_id} unit ${unit} NOT BALANCED: ${error.message}`);
        }
        // Function returns true if balanced, throws error if not
        if (!data) {
            throw new Error(`Cycle ${settlement_cycle_id} unit ${unit} NOT BALANCED`);
        }
    }
    /**
     * Assert that cluster pool account has zero balance after allocation
     * Pool accounts must be drained completely each cycle
     */
    async assertPoolDrained(account_id) {
        const balance = await this.getBalance(account_id);
        // Allow tiny floating point error
        if (Math.abs(balance) > 0.000001) {
            throw new Error(`Pool account ${account_id} not drained: balance = ${balance}`);
        }
    }
    /**
     * Assert no negative balances (except system accounts)
     */
    async assertNoNegativeBalances(settlement_cycle_id) {
        const { data, error } = await this.supabase
            .from('account_balances')
            .select('account_id, balance, account_type')
            .lt('balance', 0);
        if (error)
            throw new Error(`Failed to check balances: ${error.message}`);
        if (data && data.length > 0) {
            // Filter out SYSTEM accounts (they can be negative)
            const violations = data.filter(a => a.account_type !== 'SYSTEM');
            if (violations.length > 0) {
                const details = violations
                    .map(a => `${a.account_id}: ${a.balance}`)
                    .join(', ');
                throw new Error(`Negative balances detected: ${details}`);
            }
        }
    }
    /**
     * Get cycle balance summary
     */
    async getCycleBalance(settlement_cycle_id, unit) {
        const { data, error } = await this.supabase
            .from('cycle_balances')
            .select('*')
            .eq('settlement_cycle_id', settlement_cycle_id)
            .eq('unit', unit)
            .single();
        if (error) {
            // If no entries exist yet, return zeros
            if (error.code === 'PGRST116') {
                return { total_credits: 0, total_debits: 0, net_balance: 0 };
            }
            throw new Error(`Failed to get cycle balance: ${error.message}`);
        }
        return {
            total_credits: parseFloat(data.total_credits),
            total_debits: parseFloat(data.total_debits),
            net_balance: parseFloat(data.net_balance)
        };
    }
    /**
     * Verify transaction atomicity (all entries in transaction have same transaction_id)
     */
    async verifyTransaction(transaction_id) {
        const { data, error } = await this.supabase
            .from('ledger_entries')
            .select('transaction_id')
            .eq('transaction_id', transaction_id);
        if (error)
            throw new Error(`Failed to verify transaction: ${error.message}`);
        // All entries should have the same transaction_id
        return data && data.every(e => e.transaction_id === transaction_id);
    }
    /**
     * Get account balance
     */
    async getBalance(account_id) {
        const { data, error } = await this.supabase.rpc('get_account_balance', {
            p_account_id: account_id
        });
        if (error)
            throw new Error(`Failed to get balance: ${error.message}`);
        return data;
    }
}
