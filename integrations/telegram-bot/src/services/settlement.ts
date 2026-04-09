// services/settlement.ts
import { supabase } from '../lib/supabase';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

// ====================== CONFIGURATION ======================
const LENCO_API_URL = 'https://api.lenco.co/v1';
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY!;

// ====================== TYPES ======================
export interface PayoutRequest {
  userId: string;           // Supabase UUID
  clusterId: string;
  readingId?: string;       // Optional link to meter_readings.id
  amount: number;           // ZMW
  phoneNumber: string;      // +260XXXXXXXXX
  narration?: string;
  idempotencyKey?: string;
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

// ====================== MAIN FUNCTION ======================
export async function requestLencoPayout(
  params: PayoutRequest,
  logger: Logger
): Promise<PayoutResult> {
  const log = logger.child({ userId: params.userId, amount: params.amount });

  // 1. Validate inputs
  if (!validatePhoneNumber(params.phoneNumber)) {
    throw new Error('Invalid phone number format. Must be +260XXXXXXXXX.');
  }

  if (params.amount <= 0) {
    throw new Error('Amount must be positive.');
  }

  // 2. Generate reference and idempotency key
  const reference = `ENR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const idempotencyKey = params.idempotencyKey || crypto.randomUUID();

  // 3. Insert pending record in our DB
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
    log.error({ error: dbError }, 'Failed to create settlement record');
    throw new Error('Database error');
  }

  // 4. Call Lenco API
  try {
    const response = await fetch(`${LENCO_API_URL}/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: 'ZMW',
        accountNumber: params.phoneNumber,
        accountName: 'Enerlectra User',
        narration: params.narration || 'Enerlectra energy credit settlement',
        reference,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      // Update DB with failure
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

    // 5. Update DB with provider reference
    await supabase
      .from('settlement_payouts')
      .update({
        status: 'processing',
        provider_ref: result.data.providerRef,
      })
      .eq('reference', reference);

    log.info({ reference, providerRef: result.data.providerRef }, 'Lenco payout initiated');

    return {
      reference,
      status: 'processing',
      providerRef: result.data.providerRef,
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