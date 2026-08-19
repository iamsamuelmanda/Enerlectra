// server/src/services/settlement.ts
// Sends mobile money payouts TO users using Lenco v2 transfers API.
// /transfers/mobile-money = disbursement (you pay them)
// /collections/mobile-money = collection (they pay you) ← WRONG for payouts

import { supabase } from '../../../enerlectra-core/src/lib/supabase.js';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

// ====================== CONFIGURATION ======================
const LENCO_API_URL   = process.env.LENCO_BASE_URL  || 'https://api.lenco.co/access/v2';
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY!;
const LENCO_ACCOUNT_ID = process.env.LENCO_ACCOUNT_ID!; // 36-char UUID from Lenco dashboard

// ====================== TYPES ======================
export interface PayoutRequest {
  userId:          string;
  clusterId:       string;
  readingId?:      string;
  amount:          number;
  phoneNumber:     string;
  narration?:      string;
  idempotencyKey?: string;
  reference?:      string;
}

export interface PayoutResult {
  reference:      string;
  status:         'pending' | 'processing' | 'completed' | 'failed';
  providerRef?:   string;
  errorMessage?:  string;
}

// ====================== VALIDATION ======================
function validatePhoneNumber(phone: string): boolean {
  return /^\+260\d{9}$/.test(phone);
}

// ====================== OPERATOR DETECTION ======================
// Returns lowercase operator string as expected by Lenco transfers API
function detectOperator(phone: string): 'mtn' | 'airtel' | 'zamtel' {
  const local = phone.replace(/[+\s]/g, '').slice(-9);
  if (/^(96|76|77)/.test(local)) return 'mtn';
  if (/^(97)/.test(local))       return 'airtel';
  if (/^(95|75)/.test(local))    return 'zamtel';
  return 'mtn'; // default
}

// ====================== PHONE FORMATTING ======================
// Lenco transfers/mobile-money expects 9-digit local format: "966860393"
function formatPhoneForLenco(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9);
}

// ====================== MAIN FUNCTION ======================
export async function requestLencoPayout(
  params: PayoutRequest,
  logger: Logger
): Promise<PayoutResult> {
  const log = logger.child({ userId: params.userId, amount: params.amount });

  // Validate
  if (!validatePhoneNumber(params.phoneNumber)) {
    throw new Error('Invalid phone number format. Must be +260XXXXXXXXX.');
  }
  if (params.amount <= 0) {
    throw new Error('Amount must be positive.');
  }
  if (!LENCO_ACCOUNT_ID) {
    throw new Error('LENCO_ACCOUNT_ID is not configured.');
  }

  const reference      = params.reference || `ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const idempotencyKey = params.idempotencyKey || crypto.randomUUID();

  // Record pending payout in DB
  const { error: dbError } = await supabase
    .from('settlement_payouts')
    .insert({
      user_id:      params.userId,
      cluster_id:   params.clusterId,
      reading_id:   params.readingId || null,
      amount_zmw:   params.amount,
      phone_number: params.phoneNumber,
      status:       'pending',
      reference,
      narration:    params.narration || 'Enerlectra energy credit settlement',
    });

  if (dbError) {
    log.error({ error: dbError }, 'Failed to create settlement record');
    throw new Error('Database error creating settlement record');
  }

  // Call Lenco v2 transfers/mobile-money (disbursement — sends TO user)
  try {
    const formattedPhone = formatPhoneForLenco(params.phoneNumber);
    const operator       = detectOperator(params.phoneNumber);

    log.info({ formattedPhone, operator }, 'Sending payout request to Lenco');

    const response = await fetch(`${LENCO_API_URL}/transfers/mobile-money`, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type':   'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        accountId: LENCO_ACCOUNT_ID,       // your Lenco account to debit
        amount:    params.amount,           // ZMW amount as number
        reference,                          // unique ENR-XXXXXX reference
        narration: params.narration || 'Enerlectra energy credit settlement',
        phone:     formattedPhone,          // 9-digit local: "966860393"
        operator,                           // 'mtn' | 'airtel' | 'zamtel'
        country:   'zm',                    // Zambia
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

// ====================== STATUS QUERY ======================
export async function getPayoutStatus(reference: string): Promise<PayoutResult> {
  const { data, error } = await supabase
    .from('settlement_payouts')
    .select('status, provider_ref, error_message')
    .eq('reference', reference)
    .single();

  if (error || !data) throw new Error('Payout not found');

  return {
    reference,
    status:       data.status as PayoutResult['status'],
    providerRef:  data.provider_ref,
    errorMessage: data.error_message,
  };
}
