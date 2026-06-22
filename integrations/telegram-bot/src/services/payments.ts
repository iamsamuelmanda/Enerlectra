// services/payments.ts
// Production‑ready – calls Lenco API for collections and subscriptions

import { supabase } from '../lib/supabase';
import { logger } from './logger';

const LENCO_API_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co';
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY!;

// ─── Invoices ──────────────────────────────────────────────────────────
export async function getInvoices(orgId: string, limit = 10) {
  // Assumes an invoices table exists. Run the migration below if not.
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch invoices');
    return [];
  }
  return data || [];
}

// ─── Payment Request (Lenco Collections) ──────────────────────────────
export async function createPaymentRequest(
  orgId: string,
  amount: number,
  phone: string,
  description: string
) {
  if (!LENCO_SECRET_KEY) {
    throw new Error('LENCO_SECRET_KEY is not configured');
  }

  const reference = `PAY-${Date.now()}`;
  const payload = {
    phone,
    amount: amount.toFixed(2),
    currency: 'ZMW',
    reference,
    description,
  };

  try {
    const response = await fetch(`${LENCO_API_URL}/v1/collections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error(
        { status: response.status, result, orgId, amount, phone },
        'Lenco collection request failed'
      );
      return {
        success: false,
        reference,
        message: result.message || 'Payment request failed',
      };
    }

    // Store a minimal invoice record in Supabase
    try {
      await supabase.from('invoices').insert({
        organisation_id: orgId,
        amount,
        description,
        reference: result.data?.reference || reference,
        status: 'pending',
      });
    } catch (dbErr) {
      logger.warn({ dbErr, orgId, reference }, 'Failed to store invoice, but payment request succeeded');
    }

    logger.info({ orgId, amount, phone, reference, result }, 'Payment request succeeded');
    return {
      success: true,
      reference: result.data?.reference || reference,
      message: result.message || 'Payment request sent. Complete the payment on your mobile money prompt.',
    };
  } catch (err: any) {
    logger.error({ err, orgId, amount, phone }, 'Network error calling Lenco collections');
    return {
      success: false,
      reference,
      message: 'Unable to reach payment provider. Please try again.',
    };
  }
}

// ─── Tenant Subscription (Lenco Recurring) ────────────────────────────
export async function subscribeTenantToPlan(
  tenantUserId: string,
  planId: string,
  phone: string
) {
  if (!LENCO_SECRET_KEY) {
    throw new Error('LENCO_SECRET_KEY is not configured');
  }

  // Fetch plan details from your plans table
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (planError || !plan) {
    logger.error({ planError, planId }, 'Plan not found');
    return { success: false, message: 'Subscription plan not found.' };
  }

  const payload = {
    phone,
    amount: plan.price.toFixed(2),
    currency: 'ZMW',
    reference: `SUB-${Date.now()}-${tenantUserId.slice(0, 8)}`,
    plan_name: plan.name,
    frequency: 'monthly', // adjust if your plan defines different period
  };

  try {
    const response = await fetch(`${LENCO_API_URL}/v1/recurring`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LENCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error(
        { status: response.status, result, tenantUserId, planId },
        'Lenco recurring subscription failed'
      );
      return {
        success: false,
        message: result.message || 'Subscription setup failed.',
      };
    }

    // Store subscription record locally
    try {
      await supabase.from('subscriptions').insert({
        user_id: tenantUserId,
        plan_id: planId,
        phone,
        reference: result.data?.reference || payload.reference,
        status: 'active',
      });
    } catch (dbErr) {
      logger.warn({ dbErr, tenantUserId, planId }, 'Failed to store subscription record');
    }

    logger.info({ tenantUserId, planId, phone }, 'Subscription activated');
    return {
      success: true,
      message: 'Subscription activated. You will be charged monthly.',
    };
  } catch (err: any) {
    logger.error({ err, tenantUserId, planId }, 'Network error calling Lenco recurring');
    return {
      success: false,
      message: 'Unable to reach payment provider. Please try again.',
    };
  }
}

