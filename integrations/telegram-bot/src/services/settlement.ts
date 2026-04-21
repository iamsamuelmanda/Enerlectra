import { createClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LENCO_API_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2';
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY!;
const LENCO_ACCOUNT_ID = process.env.LENCO_ACCOUNT_ID!;

export interface PayoutRequest {
  userId: string;
  clusterId: string;
  readingId?: string;
  amount: number;
  phoneNumber: string;
  narration?: string;
  idempotencyKey?: string;
  reference?: string;
}

export interface PayoutResult {
  reference: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  providerRef?: string;
  errorMessage?: string;
}

function validatePhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return /^260\d{9}$/.test(digits) || /^0\d{9}$/.test(digits) || /^\d{9}$/.test(digits);
}

function detectOperator(phone: string): 'mtn' | 'airtel' | 'zamtel' {
  const local = phone.replace(/\D/g, '').slice(-9);
  if (/^(96|76|77)/.test(local)) return 'mtn';
  if (/^(97)/.test(local)) return 'airtel';
  if (/^(95|75)/.test(local)) return 'zamtel';
  return 'mtn';
}

function formatPhoneForLenco(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9);
}

export async function createPendingRedemption(params: PayoutRequest, logger: Logger): Promise<PayoutResult> {
  const log = logger.child({ userId: params.userId, amount: params.amount, clusterId: params.clusterId });

  if (!validatePhoneNumber(params.phoneNumber)) {
    throw new Error('Invalid phone number. Use +260XXXXXXXXX or 097XXXXXXX.');
  }
  if (params.amount <= 0) {
    throw new Error('Amount must be positive.');
  }
  if (!LENCO_ACCOUNT_ID) {
    throw new Error('LENCO_ACCOUNT_ID is not configured.');
  }

  const reference = params.reference || `ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const idempotencyKey = params.idempotencyKey || reference;

  const { data: existing } = await supabase
    .from('settlement_payouts')
    .select('reference, status, provider_ref, error_message')
    .eq('reference', reference)
    .maybeSingle();

  if (existing) {
    return {
      reference: existing.reference,
      status: existing.status as PayoutResult['status'],
      providerRef: existing.provider_ref,
      errorMessage: existing.error_message,
    };
  }

  const { error: dbError } = await supabase
    .from('settlement_payouts')
    .insert({
      user_id: params.userId,
      cluster_id: params.clusterId,
      reading_id: params.readingId || null,
      amount_zmw: params.amount,
      phone_number: params.phoneNumber,
      status: 'pending',
      reference,
      narration: params.narration || 'Enerlectra energy credit settlement',
    });

  if (dbError) {
    if ((dbError as any).code === '23505') {
      const { data } = await supabase
        .from('settlement_payouts')
        .select('reference, status, provider_ref, error_message')
        .eq('reference', reference)
        .single();
      if (data) {
        return {
          reference: data.reference,
          status: data.status as PayoutResult['status'],
          providerRef: data.provider_ref,
          errorMessage: data.error_message,
        };
      }
    }
    log.error({ error: dbError }, 'Failed to create settlement record');
    throw new Error('Database error creating settlement record');
  }

  try {
    const formattedPhone = formatPhoneForLenco(params.phoneNumber);
    const operator = detectOperator(params.phoneNumber);

    log.info({ formattedPhone, operator }, 'Sending payout request to Lenco');

    const response = await fetch(`${LENCO_API_URL}/transfers/mobile-money`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        accountId: LENCO_ACCOUNT_ID,
        amount: params.amount,
        reference,
        narration: params.narration || 'Enerlectra energy credit settlement',
        phone: formattedPhone,
        operator,
        country: 'zm',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      await supabase
        .from('settlement_payouts')
        .update({ status: 'failed', error_message: result.message || 'Lenco API error' })
        .eq('reference', reference);

      log.error({ status: response.status, result }, 'Lenco payout failed');
      throw new Error(result.message || 'Payout failed');
    }

    const providerRef = result.data?.lencoReference || result.data?.id;

    await supabase
      .from('settlement_payouts')
      .update({ status: 'processing', provider_ref: providerRef })
      .eq('reference', reference);

    log.info({ reference, providerRef }, 'Lenco payout initiated');
    return { reference, status: 'processing', providerRef };
  } catch (error: any) {
    log.error({ error }, 'Lenco payout exception');
    throw error;
  }
}

export async function requestLencoPayout(params: PayoutRequest, logger: Logger): Promise<PayoutResult> {
  return createPendingRedemption(params, logger);
}

export async function getPayoutStatus(reference: string): Promise<PayoutResult> {
  const { data, error } = await supabase
    .from('settlement_payouts')
    .select('status, provider_ref, error_message')
    .eq('reference', reference)
    .single();

  if (error || !data) throw new Error('Payout not found');

  return {
    reference,
    status: data.status as PayoutResult['status'],
    providerRef: data.provider_ref,
    errorMessage: data.error_message,
  };
}