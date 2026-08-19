// operator.service.ts
// Core service for operator-specific operations.

import { supabase } from 'enerlectra-core/src/infrastructure/supabase.js';
import { redis } from 'enerlectra-core/src/infrastructure/redis.js';
import { logger } from 'enerlectra-core/src/core/services/logger.js';
import { logMetric, trackTransactionInvestigation } from 'enerlectra-core/src/core/services/metrics.js';

interface Transaction {
  id: string;
  status: string;
  amount: number;
  meter_number: string;
  customer_phone: string;
  created_at: string;
  token?: string;
  failure_reason?: string;
  organisation_id?: string;
}

export class OperatorService {
  async getTransactions(orgId?: string): Promise<Transaction[] | null> {
    const query = supabase.from('transactions').select('*');
    if (orgId) query.eq('organisation_id', orgId);
    query.order('created_at', { ascending: false }).limit(10);

    const { data: txns, error } = await query;

    if (error) {
      logger.error({ error }, 'Transaction dashboard query failed');
      return null;
    }

    return txns;
  }

  async getFailedTransactions(orgId?: string): Promise<Transaction[] | null> {
    const query = supabase.from('transactions').select('*').eq('status', 'FAILED');
    if (orgId) query.eq('organisation_id', orgId);
    query.order('created_at', { ascending: false });

    const { data: failed, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed transactions query failed');
      return null;
    }

    return failed;
  }

  async getTransactionDetail(txnId: string): Promise<Transaction | null> {
    const { data: txn, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', txnId)
      .single();

    if (error || !txn) {
      logger.error({ error }, 'Transaction detail query failed');
      return null;
    }

    return txn;
  }

  async startSearch(telegramId: string): Promise<void> {
    await redis.del(`demo_state:${telegramId}`);
    await redis.set(`demo_state:${telegramId}`, 'search', { ex: 120 });
  }

  async startCustomerView(telegramId: string): Promise<void> {
    await redis.del(`demo_state:${telegramId}`);
    await redis.set(`demo_state:${telegramId}`, 'meter_lookup', { ex: 120 });
  }

  async logTransactionDashboardView(userId: string, orgId?: string): Promise<void> {
    await logMetric('transaction_dashboard_view', userId, orgId);
  }

  async logFailedTransactionsViewed(userId: string, orgId?: string): Promise<void> {
    await logMetric('failed_transactions_viewed', userId, orgId);
  }

  async logRecentActivityViewed(userId: string, orgId?: string): Promise<void> {
    await logMetric('recent_activity_viewed', userId, orgId);
  }

  async trackTransactionInvestigation(userId: string, orgId: string, txnId: string): Promise<void> {
    await trackTransactionInvestigation(userId, orgId, txnId);
  }
}