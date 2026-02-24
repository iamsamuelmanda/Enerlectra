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
  transactionReference?: string;
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
}

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
  };
}

/**
 * Create new contribution (PENDING)
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
      pcus: params.amountUSD, // PCUs = USD (1:1) – adjust if needed
      status: 'PENDING',
      payment_method: params.paymentMethod,
      projected_ownership_pct: params.projectedOwnershipPct,
      early_investor_bonus: params.earlyInvestorBonus,
      grace_period_expires_at: gracePeriodExpiresAt.toISOString(),
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
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
 * Mark contribution as COMPLETED (only from PENDING)
 */
export async function markContributionCompleted(
  contributionId: string,
  transactionReference: string,
): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      transaction_reference: transactionReference,
    })
    .eq('id', contributionId)
    .eq('status', 'PENDING')
    .select('*')
    .single();

  if (error || !data) {
    console.error('markContributionCompleted error', error);
    throw new Error(
      `Cannot mark contribution ${contributionId} as completed`,
    );
  }

  return mapRow(data);
}

/**
 * Mark contribution as FAILED + audit log entry
 */
export async function markContributionFailed(
  contributionId: string,
  reason: string,
): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      status: 'FAILED',
    })
    .eq('id', contributionId)
    .eq('status', 'PENDING')
    .select('*')
    .single();

  if (error || !data) {
    console.error('markContributionFailed error', error);
    throw new Error(`Cannot mark contribution ${contributionId} as failed`);
  }

  // Audit log
  const { error: auditError } = await supabase.from('audit_log').insert({
    event_type: 'VALIDATION_FAILED',
    contribution_id: contributionId,
    event_data: { reason },
  });

  if (auditError) {
    console.error('audit_log insert error', auditError);
  }

  return mapRow(data);
}

/**
 * Lock contribution (after grace period)
 */
export async function lockContribution(
  contributionId: string,
): Promise<ContributionRecord> {
  const { data, error } = await supabase
    .from('contributions')
    .update({
      is_locked: true,
      locked_at: new Date().toISOString(),
      status: 'LOCKED',
    })
    .eq('id', contributionId)
    .eq('status', 'COMPLETED')
    .eq('is_locked', false)
    .lt('grace_period_expires_at', new Date().toISOString())
    .select('*')
    .single();

  if (error || !data) {
    console.error('lockContribution error', error);
    throw new Error(`Cannot lock contribution ${contributionId}`);
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

  if (error) {
    console.error('getContributionById error', error);
    throw error;
  }

  if (!data) return null;
  return mapRow(data);
}

/**
 * Get all user contributions across clusters
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

  if (error) {
    console.error('getUserContributions error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

/**
 * Get cluster contributions (ordered by creation)
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

  if (error) {
    console.error('getClusterContributions error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

/**
 * Check if contribution can be withdrawn
 * (mirrors canWithdraw logic)
 */
export async function canWithdrawContribution(
  contributionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('contributions')
    .select(
      `
      status,
      is_locked,
      grace_period_expires_at,
      clusters!inner (
        funding_pct
      )
    `,
    )
    .eq('id', contributionId)
    .maybeSingle();

  if (error || !data) {
    console.error('canWithdrawContribution error', error);
    return false;
  }

  const row = data as any;

  if (row.is_locked || row.status === 'LOCKED') {
    return false;
  }

  if (new Date() > new Date(row.grace_period_expires_at)) {
    return false;
  }

  const fundingPct =
    row.clusters && row.clusters.funding_pct != null
      ? Number(row.clusters.funding_pct)
      : 0;

  if (fundingPct >= 80) {
    return false;
  }

  return true;
}
