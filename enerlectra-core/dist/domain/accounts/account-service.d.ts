/**
 * Account Service
 * Handles all account operations (create, query, balance)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Account, AccountUnit, AccountBalance, CreateAccountRequest } from './account';
export declare class AccountService {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Find or create an account
     * Uses database function for atomicity
     */
    findOrCreateAccount(request: CreateAccountRequest): Promise<string>;
    /**
     * Get account by ID
     */
    getAccount(account_id: string): Promise<Account | null>;
    /**
     * Get account balance (computed from ledger)
     */
    getBalance(account_id: string): Promise<number>;
    /**
     * Get account balance details
     */
    getBalanceDetails(account_id: string): Promise<AccountBalance | null>;
    /**
     * Get cluster pool account for a settlement cycle
     */
    getClusterPoolAccount(cluster_id: string, settlement_cycle_id: string, unit: AccountUnit): Promise<string>;
    /**
     * Get reserve account for a cluster
     */
    getReserveAccount(cluster_id: string, unit: AccountUnit): Promise<string>;
    /**
     * Get imbalance account for a settlement cycle
     */
    getImbalanceAccount(settlement_cycle_id: string, unit: AccountUnit): Promise<string>;
    /**
     * Get system account
     */
    getSystemAccount(unit: AccountUnit): Promise<string>;
    /**
     * Get contributor account
     */
    getContributorAccount(contributor_id: string, unit: AccountUnit): Promise<string>;
    /**
     * List all contributor accounts for a cluster
     */
    getClusterContributors(cluster_id: string): Promise<string[]>;
    private mapAccount;
}
