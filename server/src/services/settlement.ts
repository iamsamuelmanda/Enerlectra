// server/src/services/settlement.ts
import { supabase } from '../../../enerlectra-core/src/lib/supabase';
import type { Logger } from 'pino';
import crypto from 'node:crypto';


// ====================== CONFIGURATION ======================
const LENCO_API_URL =
  process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2';
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
}

export interface PayoutResult {
  reference: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  providerRef?: string;
  errorMessage?: string;
}


// ====================== VALIDATION ======================
function validatePhoneNumber(phone: string): boolean {
  // Accept common Zambian formats users may enter:
  // +260966860393, 0966860393, 966860393, 260966860393
  const digits = phone.replace(/\D/g, '');

  // Valid if:
  // - starts with 260 and has 12 digits, or
  // - starts with 0 and has 10 digits, or
  // - has exactly 9 digits (local)
  if (/^260\d{9}$/.test(digits)) return true;
  if (/^0\d{9}$/.test(digits)) return true;
  if (/^\d{9}$/.test(digits)) return true;

  return false;
}


// ====================== OPERATOR DETECTION & PHONE FORMATTING ======================
/**
 * Detects the mobile network operator based on Zambian phone number prefix.
 * Returns the operator identifier expected by the Lenco API (lowercase).
 */
function detectOperator(phone: string): 'mtn' | 'airtel' | 'zamtel' {
  const local = phone.replace(/\D/g, '').slice(-9); // e.g. "966860393"

  // MTN prefixes: 096, 076, 077 → local: 96/76/77
  if (/^(96|76|77)/.test(local)) return 'mtn';

  // Airtel prefixes: 097
  if (/^(97)/.test(local)) return 'airtel';

  // Zamtel prefixes: 095, 075
  if (/^(95|75)/.test(local)) return 'zamtel';

  // Fallback to mtn for unrecognized prefixes
  return 'mtn';
}

/**
 * Formats the phone number for Lenco API.
 * Normalizes to MSISDN: "260" + 9-digit local number, e.g. "260966860393".
 */
function formatPhoneForLenco(phone: string): string {
  const digits = phone.replace(/\D/g, ''); // keep only digits

  // Always work from the last 9 digits as the local number
  const local9 = digits.slice(-9); // e.g. "966860393"

  // Prepend Zambia country code without plus → "260966860393"
  return '260' + local9;
}


// ====================== MAIN FUNCTION ======================
export async function requestLencoPayout(
  params: PayoutRequest,
  logger: Logger,
): Promise<PayoutResult> {
  const log = logger.child({ userId: params.userId, amount: params.amount });

  // 1. Validate inputs
  if (!validatePhoneNumber(params.phoneNumber)) {
    throw new Error(
      'Invalid phone number format. Use a valid Zambian number (e.g. +260966860393 or 0966860393).',
    );
  }

  if (params.amount <= 0) {
    throw new Error('Amount must be positive.');
  }

  if (!LENCO_ACCOUNT_ID) {
    throw new Error('LENCO_ACCOUNT_ID is not configured.');
  }

  // 2. Generate reference and idempotency key
  const reference = `ENR-${crypto
    .randomBytes(6)
    .toString('hex')
    .toUpperCase()}`;
  const idempotencyKey = params.idempotencyKey || crypto.randomUUID();

  // 3. Insert pending record in our database
  const { error: dbError } = await supabase.from('settlement_payouts').insert({
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

  // 4. Call Lenco v2 Mobile Money Collection endpoint
  try {
    // Format phone and detect operator
    const formattedPhone = formatPhoneForLenco(params.phoneNumber);
    const operator = detectOperator(params.phoneNumber);

    log.info(
      { formattedPhone, operator },
      'Sending payout request to Lenco',
    );

    const response = await fetch(
      `${LENCO_API_URL}/collections/mobile-money`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LENCO_SECRET_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          accountId: LENCO_ACCOUNT_ID,
          amount: params.amount.toFixed(2),
          currency: 'ZMW',
          mobileMoneyDetails: {
            country: 'ZM',          // ISO code, uppercase
            phone: formattedPhone,  // e.g. "260966860393"
            operator: operator,     // "mtn" | "airtel" | "zamtel"
          },
          narration:
            params.narration ||
            'Enerlectra energy credit settlement',
          reference,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      await supabase
        .from('settlement_payouts')
        .update({
          status: 'failed',
          error_message: result.message || 'Lenco API error',
        })
        .eq('reference', reference);

      log.error(
        { status: response.status, result },
        'Lenco payout failed',
      );
      throw new Error(result.message || 'Payout failed');
    }

    // 5. Update DB with provider reference
    const providerRef = result.data?.reference || result.data?.providerRef;
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
export async function getPayoutStatus(
  reference: string,
): Promise<PayoutResult> {
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