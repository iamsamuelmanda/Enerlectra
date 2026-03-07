/**
 * Ledger Service (UPGRADED with Hash Chain)
 * Handles all double-entry ledger operations
 * NOW WITH: Cryptographic hash chain for tamper-evident audit trail
 */

import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LedgerEntry, AccountUnit, TransferRequest } from './account';
import { computeEntryHash } from '../ledger/ledger-hash';
import { getPreviousHash } from '../ledger/ledger-genesis';

export class LedgerService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Credit an account (with hash chain)
   */
  async credit(
    account_id: string,
    amount: number,
    unit: AccountUnit,
    settlement_cycle_id: string,
    operation_type: string,
    description?: string,
    transaction_id?: string
  ): Promise<string> {
    const entry_id = uuidv4();
    const tx_id = transaction_id || uuidv4();
    const created_at = new Date();

    // Get previous hash
    const previous_hash = await this.getLastEntryHash();

    // Compute entry hash
    const entry_hash = computeEntryHash({
      ledger_entry_id: entry_id,
      account_id,
      settlement_cycle_id,
      debit_amount: 0,
      credit_amount: amount,
      unit,
      transaction_id: tx_id,
      operation_type,
      created_at,
      previous_hash
    });

    // Insert with hash
    const { error } = await this.supabase
      .from('ledger_entries')
      .insert({
        ledger_entry_id: entry_id,
        account_id,
        settlement_cycle_id,
        debit_amount: 0,
        credit_amount: amount,
        unit,
        transaction_id: tx_id,
        operation_type,
        description,
        created_at: created_at.toISOString(),
        previous_hash,
        entry_hash
      });

    if (error) throw new Error(`Credit failed: ${error.message}`);
    return entry_id;
  }

  /**
   * Debit an account (with hash chain)
   */
  async debit(
    account_id: string,
    amount: number,
    unit: AccountUnit,
    settlement_cycle_id: string,
    operation_type: string,
    description?: string,
    transaction_id?: string
  ): Promise<string> {
    const entry_id = uuidv4();
    const tx_id = transaction_id || uuidv4();
    const created_at = new Date();

    // Get previous hash
    const previous_hash = await this.getLastEntryHash();

    // Compute entry hash
    const entry_hash = computeEntryHash({
      ledger_entry_id: entry_id,
      account_id,
      settlement_cycle_id,
      debit_amount: amount,
      credit_amount: 0,
      unit,
      transaction_id: tx_id,
      operation_type,
      created_at,
      previous_hash
    });

    // Insert with hash
    const { error } = await this.supabase
      .from('ledger_entries')
      .insert({
        ledger_entry_id: entry_id,
        account_id,
        settlement_cycle_id,
        debit_amount: amount,
        credit_amount: 0,
        unit,
        transaction_id: tx_id,
        operation_type,
        description,
        created_at: created_at.toISOString(),
        previous_hash,
        entry_hash
      });

    if (error) throw new Error(`Debit failed: ${error.message}`);
    return entry_id;
  }

  /**
   * Transfer between accounts (atomic double-entry with hash chain)
   * CRITICAL: This must be atomic - both debit and credit succeed or both fail
   */
  async transfer(request: TransferRequest): Promise<string> {
    const transaction_id = uuidv4();

    // Verify accounts exist and have same unit
    const from_account = await this.getAccountUnit(request.from_account_id);
    const to_account = await this.getAccountUnit(request.to_account_id);

    if (from_account !== to_account) {
      throw new Error(`Unit mismatch: ${from_account} != ${to_account}`);
    }

    const created_at = new Date();

    // Get previous hash (for first entry)
    const previous_hash_1 = await this.getLastEntryHash();

    // Compute hash for debit entry
    const debit_entry_id = uuidv4();
    const debit_entry_hash = computeEntryHash({
      ledger_entry_id: debit_entry_id,
      account_id: request.from_account_id,
      settlement_cycle_id: request.settlement_cycle_id,
      debit_amount: request.amount,
      credit_amount: 0,
      unit: from_account,
      transaction_id,
      operation_type: request.operation_type,
      created_at,
      previous_hash: previous_hash_1
    });

    // Compute hash for credit entry (links to debit entry)
    const credit_entry_id = uuidv4();
    const credit_entry_hash = computeEntryHash({
      ledger_entry_id: credit_entry_id,
      account_id: request.to_account_id,
      settlement_cycle_id: request.settlement_cycle_id,
      debit_amount: 0,
      credit_amount: request.amount,
      unit: to_account,
      transaction_id,
      operation_type: request.operation_type,
      created_at,
      previous_hash: debit_entry_hash // Links to previous entry
    });

    // Create both entries atomically
    const entries = [
      {
        ledger_entry_id: debit_entry_id,
        account_id: request.from_account_id,
        settlement_cycle_id: request.settlement_cycle_id,
        debit_amount: request.amount,
        credit_amount: 0,
        unit: from_account,
        transaction_id,
        operation_type: request.operation_type,
        description: request.description || `Transfer to ${request.to_account_id.substring(0, 8)}`,
        created_at: created_at.toISOString(),
        previous_hash: previous_hash_1,
        entry_hash: debit_entry_hash
      },
      {
        ledger_entry_id: credit_entry_id,
        account_id: request.to_account_id,
        settlement_cycle_id: request.settlement_cycle_id,
        debit_amount: 0,
        credit_amount: request.amount,
        unit: to_account,
        transaction_id,
        operation_type: request.operation_type,
        description: request.description || `Transfer from ${request.from_account_id.substring(0, 8)}`,
        created_at: created_at.toISOString(),
        previous_hash: debit_entry_hash,
        entry_hash: credit_entry_hash
      }
    ];

    const { error } = await this.supabase
      .from('ledger_entries')
      .insert(entries);

    if (error) throw new Error(`Transfer failed: ${error.message}`);
    return transaction_id;
  }

  /**
   * Get last entry hash (for chain linkage)
   */
  private async getLastEntryHash(): Promise<string> {
    const { data, error } = await this.supabase.rpc('get_last_entry_hash');

    if (error) {
      // If function fails, fall back to query
      const { data: last_entry } = await this.supabase
        .from('ledger_entries')
        .select('entry_hash')
        .order('entry_sequence', { ascending: false })
        .limit(1)
        .single();

      return getPreviousHash(last_entry?.entry_hash || null);
    }

    return getPreviousHash(data);
  }

  /**
   * Get ledger entries for an account
   */
  async getEntries(account_id: string, limit?: number): Promise<LedgerEntry[]> {
    let query = this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('account_id', account_id)
      .order('created_at', { ascending: false });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to get entries: ${error.message}`);
    return (data || []).map(this.mapEntry);
  }

  /**
   * Get all ledger entries for a settlement cycle
   */
  async getCycleEntries(settlement_cycle_id: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('settlement_cycle_id', settlement_cycle_id)
      .order('entry_sequence', { ascending: true });

    if (error) throw new Error(`Failed to get cycle entries: ${error.message}`);
    return (data || []).map(this.mapEntry);
  }

  /**
   * Get entries by transaction ID (for atomic operations)
   */
  async getTransactionEntries(transaction_id: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('transaction_id', transaction_id)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to get transaction entries: ${error.message}`);
    return (data || []).map(this.mapEntry);
  }

  private async getAccountUnit(account_id: string): Promise<AccountUnit> {
    const { data, error } = await this.supabase
      .from('accounts')
      .select('unit')
      .eq('account_id', account_id)
      .single();

    if (error) throw new Error(`Account not found: ${account_id}`);
    return data.unit as AccountUnit;
  }

  private mapEntry(data: any): LedgerEntry {
    return {
      ledger_entry_id: data.ledger_entry_id,
      account_id: data.account_id,
      settlement_cycle_id: data.settlement_cycle_id,
      debit_amount: parseFloat(data.debit_amount),
      credit_amount: parseFloat(data.credit_amount),
      unit: data.unit as AccountUnit,
      transaction_id: data.transaction_id,
      operation_type: data.operation_type,
      description: data.description,
      created_at: new Date(data.created_at)
    };
  }
}