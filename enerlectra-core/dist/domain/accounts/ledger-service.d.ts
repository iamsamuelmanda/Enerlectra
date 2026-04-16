/**
 * Ledger Service (UPGRADED with Hash Chain)
 * Handles all double-entry ledger operations
 * NOW WITH: Cryptographic hash chain for tamper-evident audit trail
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LedgerEntry, AccountUnit, TransferRequest } from './account';
export declare class LedgerService {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Credit an account (with hash chain)
     */
    credit(account_id: string, amount: number, unit: AccountUnit, settlement_cycle_id: string, operation_type: string, description?: string, transaction_id?: string): Promise<string>;
    /**
     * Debit an account (with hash chain)
     */
    debit(account_id: string, amount: number, unit: AccountUnit, settlement_cycle_id: string, operation_type: string, description?: string, transaction_id?: string): Promise<string>;
    /**
     * Transfer between accounts (atomic double-entry with hash chain)
     * CRITICAL: This must be atomic - both debit and credit succeed or both fail
     */
    transfer(request: TransferRequest): Promise<string>;
    /**
     * Get last entry hash (for chain linkage)
     */
    private getLastEntryHash;
    /**
     * Get ledger entries for an account
     */
    getEntries(account_id: string, limit?: number): Promise<LedgerEntry[]>;
    /**
     * Get all ledger entries for a settlement cycle
     */
    getCycleEntries(settlement_cycle_id: string): Promise<LedgerEntry[]>;
    /**
     * Get entries by transaction ID (for atomic operations)
     */
    getTransactionEntries(transaction_id: string): Promise<LedgerEntry[]>;
    private getAccountUnit;
    private mapEntry;
}
