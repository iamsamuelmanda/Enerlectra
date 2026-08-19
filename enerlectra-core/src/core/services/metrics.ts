// services/metrics.ts
// Production‑ready event tracking for the Enerlectra Energy Operations Layer

import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';

// ─── Generic event logger ────────────────────────────────────────────
export async function logMetric(
  event: string,
  userId: string,
  orgId?: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('events').insert({
      organisation_id: orgId ?? null,
      category: 'metric',
      event_type: event,
      payload: { userId, ...payload },
    });
  } catch (error) {
    // Swallow errors in metric logging – never break the user flow
    logger.warn({ error, event, userId }, 'Failed to log metric');
  }
}

// ─── Operator Engagement ─────────────────────────────────────────────
/**
 * Log once per operator per day when they open the console.
 * Call this in sendOperatorHome() or equivalent entry point.
 */
export async function trackOperatorLogin(userId: string, orgId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data } = await supabase
      .from('events')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('category', 'metric')
      .eq('event_type', 'operator_login')
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`)
      .eq('payload->>userId', userId)
      .limit(1);

    if (!data || data.length === 0) {
      await logMetric('operator_login', userId, orgId, { date: today });
    }
  } catch (error) {
    logger.warn({ error, userId, orgId }, 'Failed to track operator login');
  }
}

// ─── Support Workload ────────────────────────────────────────────────
/** Record that an operator drilled into a transaction detail. */
export async function trackTransactionInvestigation(
  userId: string,
  orgId: string,
  transactionId: string
): Promise<void> {
  await logMetric('transaction_investigated', userId, orgId, { transactionId });
}

/** Record when a support ticket is created (manual or automatic). */
export async function trackTicketCreated(
  userId: string,
  orgId: string,
  ticketId: string
): Promise<void> {
  await logMetric('ticket_created', userId, orgId, { ticketId });
}

/** Record when a ticket is closed. */
export async function trackTicketResolved(
  userId: string,
  orgId: string,
  ticketId: string
): Promise<void> {
  await logMetric('ticket_resolved', userId, orgId, { ticketId });
}

// ─── Alert Lifecycle ─────────────────────────────────────────────────
/** Record that an operator viewed the alert list. */
export async function trackAlertsViewed(userId: string, orgId: string): Promise<void> {
  await logMetric('alerts_viewed', userId, orgId);
}

/** Record that an alert was resolved (call after status change). */
export async function trackAlertResolved(
  userId: string,
  orgId: string,
  alertId: string
): Promise<void> {
  await logMetric('alert_resolved', userId, orgId, { alertId });
}

// ─── Data Operations ─────────────────────────────────────────────────
/** Track when a customer import is performed (via API or bot). */
export async function trackCustomerImport(
  userId: string,
  orgId: string,
  count: number
): Promise<void> {
  await logMetric('customer_import', userId, orgId, { count });
}

// ─── Reporting Helpers ───────────────────────────────────────────────
/**
 * Count events of a specific type for an organisation since a given date.
 * Example: getEventCount(orgId, 'operator_login', '2026-06-01')
 */
export async function getEventCount(
  orgId: string,
  eventType: string,
  since: string // ISO date string, e.g., '2026-06-01T00:00:00Z'
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('event_type', eventType)
      .gte('created_at', since);

    if (error) {
      logger.warn({ error, orgId, eventType }, 'Failed to count events');
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    logger.warn({ error, orgId, eventType }, 'Unexpected error counting events');
    return 0;
  }
}

/**
 * Return number of distinct operators who logged in on a specific day.
 * @param orgId - Organisation ID
 * @param date - 'YYYY-MM-DD'
 */
export async function getDailyActiveOperators(orgId: string, date: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('events')
      .select('payload->>userId', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('event_type', 'operator_login')
      .gte('created_at', `${date}T00:00:00Z`)
      .lte('created_at', `${date}T23:59:59Z`);

    if (error) {
      logger.warn({ error, orgId, date }, 'Failed to count daily active operators');
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    logger.warn({ error, orgId, date }, 'Unexpected error counting DAO');
    return 0;
  }
}

/**
 * Get a snapshot of key metrics for an organisation over a time range.
 * Returns an object with counts for common events.
 */
export async function getMetricsSnapshot(
  orgId: string,
  since: string,
  until?: string // optional, defaults to now
): Promise<{
  operatorLogins: number;
  transactionInvestigations: number;
  ticketsCreated: number;
  ticketsResolved: number;
  alertsViewed: number;
  alertsResolved: number;
  customerImports: number;
}> {
  const end = until ?? new Date().toISOString();

  const queries = [
    getEventCount(orgId, 'operator_login', since),
    getEventCount(orgId, 'transaction_investigated', since),
    getEventCount(orgId, 'ticket_created', since),
    getEventCount(orgId, 'ticket_resolved', since),
    getEventCount(orgId, 'alerts_viewed', since),
    getEventCount(orgId, 'alert_resolved', since),
    getEventCount(orgId, 'customer_import', since),
  ];

  const [operatorLogins, txInvest, ticketsCreated, ticketsResolved, alertsViewed, alertsResolved, imports] =
    await Promise.all(queries);

  return {
    operatorLogins,
    transactionInvestigations: txInvest,
    ticketsCreated,
    ticketsResolved,
    alertsViewed,
    alertsResolved,
    customerImports: imports,
  };
}

