// server/services/contributionsMarketplaceSupabase.ts
import { supabase } from '../lib/supabase';

export type ContributionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSED'
  | 'LOCKED';

export interface ContributionRecord {
  id: string;
  userId: string;
  clusterId: string;
  amountUSD: number;
  amountZMW: number;
  exchangeRate: number;
  pcus: number;
  status: ContributionStatus;
  paymentMethod: 'MTN_MOBILE_MONEY' | 'AIRTEL_MONEY' | 'BANK_TRANSFER' | 'CARD';
  projectedOwnershipPct: number;
  earlyInvestorBonus: number;
  isLocked: boolean;
  lockedAt: Date | null;
  gracePeriodExpiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
  transactionReference?: string;        // ← Important for Lenco
  paymentResponse?: any;                // ← Stores full Lenco response
}

export interface CreateContributionParams {
  userId: string;
  clusterId: string;
  amountUSD: number;
  amountZMW: number;
  exchangeRate: number;
  paymentMethod: string;
  projectedOwnershipPct: number;
  earlyInvestorBonus: number;
  ipAddress?: string;
  userAgent?: string;
  transactionReference?: string;        // ← New from Lenco
}

/** Map Supabase row to clean TypeScript object */
function mapRow(row: any): ContributionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    clusterId: row.cluster_id,
    amountUSD: Number(row.amount_usd),
    amountZMW: Number(row.amount_zmw),
    exchangeRate: Number(row.exchange_rate),
    pcus: Number(row.pcus),
    status: row.status,
    paymentMethod: row.payment_method,
    projectedOwnershipPct: Number(row.projected_ownership_pct),
    earlyInvestorBonus: Number(row.early_investor_bonus),
    isLocked: row.is_locked,
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
    gracePeriodExpiresAt: new Date(row.grace_period_expires_at),
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    transactionReference: row.transaction_reference ?? undefined,
    paymentResponse: row.payment_response ?? undefined,
  };
}

/**
 * Create new contribution (starts as PENDING)
 */
export async function createContribution(
  params: CreateContributionParams,
): Promise<ContributionRecord> {
  const gracePeriodExpiresAt = new Date();
  gracePeriodExpiresAt.setHours(gracePeriodExpiresAt.getHours() + 24);

  const { data, error } = await supabase
    .from('contributions')
    .insert({
      user_id: params.userId,
      cluster_id: params.clusterId,
      amount_usd: params.amountUSD,
      amount_zmw: params.amountZMW,
      exchange_rate: params.exchangeRate,
      pcus: params.amountUSD,
      status: 'PENDING',
      payment_method: params.paymentMethod,
      projected_ownership_pct: params.projectedOwnershipPct,
      early_investor_bonus: params.earlyInvestorBonus,
      grace_period_expires_at: gracePeriodExpiresAt.toISOString(),
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      transaction_reference: params.transactionReference,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createContribution error', error);
    throw error;
  }

  return mapRow(data);
}

/**
 * Mark contribution as COMPLETED (called by webhook)
 */
export async function markContributionCompleted(
  contributionId: string,
  transactionReference: string,
  paymentResponse?: any
): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      transaction_reference: transactionReference,
      payment_response: paymentResponse,
    })
    .eq('id', contributionId)
    .eq('status', 'PENDING')
    .select('*')
    .single();

  if (error || !data) {
    console.error('markContributionCompleted error', error);
    throw new Error(`Cannot mark contribution ${contributionId} as completed`);
  }

  return mapRow(data);
}

/**
 * Mark contribution as FAILED
 */
export async function markContributionFailed(
  contributionId: string,
  reason: string,
  paymentResponse?: any
): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      status: 'FAILED',
      payment_response: paymentResponse,
    })
    .eq('id', contributionId)
    .eq('status', 'PENDING')
    .select('*')
    .single();

  if (error || !data) {
    console.error('markContributionFailed error', error);
    throw new Error(`Cannot mark contribution ${contributionId} as failed`);
  }

  return mapRow(data);
}

/**
 * Get contribution by ID
 */
export async function getContributionById(
  contributionId: string,
): Promise<ContributionRecord | null> {
  const { data, error } = await supabase
    .from('contributions')
    .select('*')
    .eq('id', contributionId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

/**
 * Get all user contributions
 */
export async function getUserContributions(
  userId: string,
): Promise<ContributionRecord[]> {
  const { data, error } = await supabase
    .from('contributions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['COMPLETED', 'LOCKED'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapRow);
}

/**
 * Get cluster contributions
 */
export async function getClusterContributions(
  clusterId: string,
): Promise<ContributionRecord[]> {
  const { data, error } = await supabase
    .from('contributions')
    .select('*')
    .eq('cluster_id', clusterId)
    .in('status', ['COMPLETED', 'LOCKED'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRow);
}

/**
 * Check if contribution can be withdrawn
 */
export async function canWithdrawContribution(
  contributionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('contributions')
    .select(`
      status,
      is_locked,
      grace_period_expires_at,
      clusters!inner(funding_pct)
    `)
    .eq('id', contributionId)
    .maybeSingle();

  if (error || !data) return false;

  const row = data as any;

  if (row.is_locked || row.status === 'LOCKED') return false;
  if (new Date() > new Date(row.grace_period_expires_at)) return false;

  const fundingPct = row.clusters?.funding_pct != null 
    ? Number(row.clusters.funding_pct) 
    : 0;

  return fundingPct < 80;
}