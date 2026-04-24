// integrations/telegram-bot/src/services/settlement.ts
import { supabase } from '../lib/supabase';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

// ====================== CONFIGURATION ======================
const LENCO_API_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2';
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY!;
const LENCO_ACCOUNT_ID = process.env.LENCO_ACCOUNT_ID!;

// ====================== TYPES ======================
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

// ====================== VALIDATION ======================
function validatePhoneNumber(phone: string): boolean {
  return /^\+260\d{9}$/.test(phone);
}

// ====================== OPERATOR DETECTION ======================
function detectOperator(phone: string): 'mtn' | 'airtel' | 'zamtel' {
  const local = phone.replace(/[+\s]/g, '').slice(-9);
  if (/^(96|76|77)/.test(local)) return 'mtn';
  if (/^(97)/.test(local))               return 'airtel';
  if (/^(95|75)/.test(local))            return 'zamtel';
  return 'mtn';
}

// ====================== PHONE FORMATTING ======================
function formatPhoneForLenco(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0'))  return '260' + digits.slice(1);
  if (digits.startsWith('260')) return digits;
  return '260' + digits;
}

// ====================== REDEMPTION INTENT (PRE-PAYOUT) ======================
export async function createPendingRedemption(
  params: {
    userId: string;
    clusterId: string;
    amountPcu: number;
    phone: string;
    reference?: string;
    idempotencyKey?: string;
  },
  logger: Logger
): Promise<void> {
  const log = logger.child({ userId: params.userId, reference: params.reference });

  // --- FIX: removed `metadata` and `reference` columns; use `tx_reference` ---
  const { error } = await supabase
    .from('pending_settlement_payouts')
    .insert({
      user_id: params.userId,
      cluster_id: params.clusterId,
      period: new Date().toISOString().slice(0, 7),
      amount_zmw: 0,                // calculated later when payout triggers
      phone_number: params.phone,
      status: 'PENDING',
      tx_reference: params.reference,
    });

  if (error) {
    log.error({ error }, 'Failed to create pending redemption');
    throw new Error('Database error');
  }

  log.info('Pending redemption recorded');
}

// ====================== REAL PAYOUT (LENCO TRANSFERS) ======================
export async function requestLencoPayout(
  params: PayoutRequest,
  logger: Logger
): Promise<PayoutResult> {
  const log = logger.child({ userId: params.userId, amount: params.amount });

  // 1. Validate
  if (!validatePhoneNumber(params.phoneNumber)) {
    throw new Error('Invalid phone number format. Must be +260XXXXXXXXX.');
  }
  if (params.amount <= 0) {
    throw new Error('Amount must be positive.');
  }
  if (!LENCO_ACCOUNT_ID) {
    throw new Error('LENCO_ACCOUNT_ID is not configured.');
  }

  // 2. Generate reference & idempotency key
  const reference = params.reference || `ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const idempotencyKey = params.idempotencyKey || reference;

  // 3. Idempotency: return existing record if already processed
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

  // 4. Insert pending record into settlement_payouts
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
    throw new Error('Database error');
  }

  // 5. Call Lenco **payout** endpoint
  try {
    const formattedPhone = formatPhoneForLenco(params.phoneNumber);
    const operator = detectOperator(params.phoneNumber);

    log.info({ formattedPhone, operator, reference }, 'Calling Lenco transfers endpoint');

    const response = await fetch(`${LENCO_API_URL}/transfers/mobile-money`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        accountId: LENCO_ACCOUNT_ID,
        amount: params.amount.toFixed(2),
        currency: 'ZMW',
        phone: formattedPhone,
        operator: operator,
        country: 'zm',
        narration: params.narration || 'Enerlectra energy credit settlement',
        reference,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      await supabase
        .from('settlement_payouts')
        .update({
          status: 'failed',
          error_message: result.message || 'Lenco API error',
        })
        .eq('reference', reference);

      log.error({ status: response.status, result }, 'Lenco payout failed');
      throw new Error(result.message || 'Payout failed');
    }

    // 6. Update DB with provider reference
    const providerRef = result.data?.lencoReference || result.data?.reference || result.data?.id;
    await supabase
      .from('settlement_payouts')
      .update({
        status: 'processing',
        provider_ref: providerRef,
      })
      .eq('reference', reference);

    log.info({ reference, providerRef }, 'Lenco payout initiated');

    return {
      reference,
      status: 'processing',
      providerRef,
    };

  } catch (error: any) {
    log.error({ error }, 'Lenco payout exception');
    throw error;
  }
}

// ====================== STATUS QUERY ======================
export async function getPayoutStatus(reference: string): Promise<PayoutResult> {
  const { data, error } = await supabase
    .from('settlement_payouts')
    .select('status, provider_ref, error_message')
    .eq('reference', reference)
    .single();

  if (error || !data) {
    throw new Error('Payout not found');
  }

  return {
    reference,
    status: data.status as PayoutResult['status'],
    providerRef: data.provider_ref,
    errorMessage: data.error_message,
  };
}