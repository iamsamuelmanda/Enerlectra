export type ContributionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CRYPTO' | 'OTHER';

export interface Contribution {
  id: string;
  user_id: string;
  cluster_id: string;
  amount_usd: number;
  amount_zmw: number;
  exchange_rate: number;
  pcus: number;
  status: ContributionStatus;
  payment_method: PaymentMethod;
  projected_ownership_pct: number;
  early_investor_bonus: number;
  ip_address?: string;
  user_agent?: string;
  transaction_reference?: string;
  is_locked: boolean;
  locked_at?: string;
  grace_period_expires_at: string;
  created_at: string;
  completed_at?: string;
}