// server/src/services/batchPayoutProcessor.ts
import { supabase } from '../lib/supabase.js';
import { requestLencoPayout } from './settlement.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const BATCH_SIZE = Number(process.env.PAYOUT_BATCH_SIZE || 10);
const MIN_PAYOUT_THRESHOLD_ZMW = Number(process.env.MIN_PAYOUT_THRESHOLD_ZMW || 1);
const MAX_RETRY_COUNT = Number(process.env.MAX_PAYOUT_RETRY_COUNT || 3);

interface PendingPayout {
  id: string;
  user_id: string;
  cluster_id: string;
  period: string;
  amount_zmw: number;
  phone_number: string | null;
  retry_count: number;
}

async function fetchPendingPayouts(limit: number): Promise<PendingPayout[]> {
  const { data, error } = await supabase
    .from('pending_settlement_payouts')
    .select('id,user_id,cluster_id,period,amount_zmw,phone_number,retry_count')
    .eq('status', 'PENDING')
    .lt('retry_count', MAX_RETRY_COUNT)
    .gte('amount_zmw', MIN_PAYOUT_THRESHOLD_ZMW)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PendingPayout[];
}

async function markProcessing(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_settlement_payouts')
    .update({
      status: 'PROCESSING',
      processing_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function markPaid(id: string, txReference: string): Promise<void> {
  const { error } = await supabase
    .from('pending_settlement_payouts')
    .update({
      status: 'PAID',
      tx_reference: txReference,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

async function markFailed(id: string, currentRetryCount: number, errorMessage: string): Promise<void> {
  const nextRetryCount = currentRetryCount + 1;
  const nextStatus = nextRetryCount >= MAX_RETRY_COUNT ? 'FAILED' : 'PENDING';

  const { error } = await supabase
    .from('pending_settlement_payouts')
    .update({
      retry_count: nextRetryCount,
      status: nextStatus,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

async function processPayout(payout: PendingPayout): Promise<'paid' | 'failed' | 'skipped'> {
  if (!payout.phone_number) {
    await markFailed(payout.id, payout.retry_count, 'Missing phone number');
    return 'failed';
  }

  const locked = await markProcessing(payout.id);
  if (!locked) return 'skipped';

  try {
    const result = await requestLencoPayout(
      {
        userId: payout.user_id,
        clusterId: payout.cluster_id,
        amount: payout.amount_zmw,
        phoneNumber: payout.phone_number,
        narration: `Enerlectra settlement – period ${payout.period}`,
      },
      logger
    );

    await markPaid(payout.id, result.reference);
    logger.info({ id: payout.id, user_id: payout.user_id, reference: result.reference }, 'Payout completed');
    return 'paid';
  } catch (err: any) {
    await markFailed(payout.id, payout.retry_count, err?.message || 'Payout failed');
    logger.error({ err, id: payout.id, user_id: payout.user_id }, 'Payout failed');
    return 'failed';
  }
}

export async function processBatchPayouts(): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  logger.info({ batchSize: BATCH_SIZE }, 'Starting batch payout processing');

  const payouts = await fetchPendingPayouts(BATCH_SIZE);
  if (payouts.length === 0) {
    logger.info('No pending payouts to process');
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const payout of payouts) {
    const result = await processPayout(payout);
    if (result === 'paid') succeeded += 1;
    else if (result === 'failed') failed += 1;
    else skipped += 1;
  }

  logger.info({ processed: payouts.length, succeeded, failed, skipped }, 'Batch payout processing completed');
  return { processed: payouts.length, succeeded, failed, skipped };
}