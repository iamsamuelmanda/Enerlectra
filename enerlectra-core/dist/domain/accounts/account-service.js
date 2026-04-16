/**
 * Account Service
 * Handles all account operations (create, query, balance)
 */
import { AccountType } from './account';
export class AccountService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Find or create an account
     * Uses database function for atomicity
     */
    async findOrCreateAccount(request) {
        const { data, error } = await this.supabase.rpc('find_or_create_account', {
            p_account_type: request.account_type,
            p_unit: request.unit,
            p_contributor_id: request.contributor_id || null,
            p_cluster_id: request.cluster_id || null,
            p_settlement_cycle_id: request.settlement_cycle_id || null,
            p_label: request.label || null
        });
        if (error)
            throw new Error(`Failed to find/create account: ${error.message}`);
        return data;
    }
    /**
     * Get account by ID
     */
    async getAccount(account_id) {
        const { data, error } = await this.supabase
            .from('accounts')
            .select('*')
            .eq('account_id', account_id)
            .single();
        if (error) {
            if (error.code === 'PGRST116')
                return null; // Not found
            throw new Error(`Failed to get account: ${error.message}`);
        }
        return this.mapAccount(data);
    }
    /**
     * Get account balance (computed from ledger)
     */
    async getBalance(account_id) {
        const { data, error } = await this.supabase.rpc('get_account_balance', {
            p_account_id: account_id
        });
        if (error)
            throw new Error(`Failed to get balance: ${error.message}`);
        return data;
    }
    /**
     * Get account balance details
     */
    async getBalanceDetails(account_id) {
        const { data, error } = await this.supabase
            .from('account_balances')
            .select('*')
            .eq('account_id', account_id)
            .single();
        if (error) {
            if (error.code === 'PGRST116')
                return null;
            throw new Error(`Failed to get balance details: ${error.message}`);
        }
        return {
            account_id: data.account_id,
            account_type: data.account_type,
            unit: data.unit,
            balance: parseFloat(data.balance),
            entry_count: data.entry_count,
            last_entry_at: data.last_entry_at ? new Date(data.last_entry_at) : undefined
        };
    }
    /**
     * Get cluster pool account for a settlement cycle
     */
    async getClusterPoolAccount(cluster_id, settlement_cycle_id, unit) {
        return this.findOrCreateAccount({
            account_type: AccountType.CLUSTER_POOL,
            unit,
            cluster_id,
            settlement_cycle_id,
            label: `Pool ${cluster_id.substring(0, 8)} ${settlement_cycle_id}`
        });
    }
    /**
     * Get reserve account for a cluster
     */
    async getReserveAccount(cluster_id, unit) {
        return this.findOrCreateAccount({
            account_type: AccountType.RESERVE,
            unit,
            cluster_id,
            label: `Reserve ${cluster_id.substring(0, 8)} ${unit}`
        });
    }
    /**
     * Get imbalance account for a settlement cycle
     */
    async getImbalanceAccount(settlement_cycle_id, unit) {
        return this.findOrCreateAccount({
            account_type: AccountType.IMBALANCE,
            unit,
            settlement_cycle_id,
            label: `Imbalance ${settlement_cycle_id}`
        });
    }
    /**
     * Get system account
     */
    async getSystemAccount(unit) {
        const { data, error } = await this.supabase
            .from('accounts')
            .select('account_id')
            .eq('account_type', AccountType.SYSTEM)
            .eq('unit', unit)
            .single();
        if (error)
            throw new Error(`System account not found for unit ${unit}`);
        return data.account_id;
    }
    /**
     * Get contributor account
     */
    async getContributorAccount(contributor_id, unit) {
        return this.findOrCreateAccount({
            account_type: AccountType.CONTRIBUTOR,
            unit,
            contributor_id,
            label: `Contributor ${contributor_id.substring(0, 8)} ${unit}`
        });
    }
    /**
     * List all contributor accounts for a cluster
     */
    async getClusterContributors(cluster_id) {
        // This requires joining with contributions or other source of truth
        // For now, returning empty array - implement based on your contribution tracking
        return [];
    }
    mapAccount(data) {
        return {
            account_id: data.account_id,
            account_type: data.account_type,
            unit: data.unit,
            contributor_id: data.contributor_id,
            cluster_id: data.cluster_id,
            settlement_cycle_id: data.settlement_cycle_id,
            label: data.label,
            created_at: new Date(data.created_at)
        };
    }
}
