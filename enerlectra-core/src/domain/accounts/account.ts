/**
 * Account Domain Model
 * Core types for double-entry ledger system
 */

export enum AccountType {
    CONTRIBUTOR = 'CONTRIBUTOR',
    CLUSTER_POOL = 'CLUSTER_POOL',
    RESERVE = 'RESERVE',
    IMBALANCE = 'IMBALANCE',
    SYSTEM = 'SYSTEM'
  }
  
  export enum AccountUnit {
    KWH = 'KWH',
    ZMW = 'ZMW'
  }
  
  export interface Account {
    account_id: string;
    account_type: AccountType;
    unit: AccountUnit;
    
    // Ownership/scope references
    contributor_id?: string;
    cluster_id?: string;
    settlement_cycle_id?: string;
    
    // Metadata
    label?: string;
    created_at: Date;
  }
  
  export interface LedgerEntry {
    ledger_entry_id: string;
    account_id: string;
    settlement_cycle_id: string;
    
    debit_amount: number;
    credit_amount: number;
    unit: AccountUnit;
    
    transaction_id: string;
    operation_type: string;
    description?: string;
    
    created_at: Date;
  }
  
  export interface AccountBalance {
    account_id: string;
    account_type: AccountType;
    unit: AccountUnit;
    balance: number;
    entry_count: number;
    last_entry_at?: Date;
  }
  
  export interface CreateAccountRequest {
    account_type: AccountType;
    unit: AccountUnit;
    contributor_id?: string;
    cluster_id?: string;
    settlement_cycle_id?: string;
    label?: string;
  }
  
  export interface TransferRequest {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    settlement_cycle_id: string;
    operation_type: string;
    description?: string;
  }