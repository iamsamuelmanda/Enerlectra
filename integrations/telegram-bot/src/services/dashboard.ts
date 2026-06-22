// services/dashboard.ts
import { supabase } from '../lib/supabase';
import { logger } from './logger';

interface DashboardContext {
  userId: string;
  orgId: string;
  role: string;
}

export async function getOperatorDashboard(ctx: DashboardContext): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [txns, alerts] = await Promise.all([
      supabase
        .from('transactions')
        .select('status', { count: 'exact' })
        .eq('organisation_id', ctx.orgId)
        .gte('created_at', `${today}T00:00:00Z`),
      supabase
        .from('alerts')
        .select('id', { count: 'exact' })
        .eq('organisation_id', ctx.orgId)
        .eq('status', 'open'),
    ]);

    const total = txns.count ?? 0;
    const openAlerts = alerts.count ?? 0;
    return (
      `*Operator Console*\n\n` +
      `📊 Today: ${total} transactions\n` +
      `🚨 Open alerts: ${openAlerts}\n\n` +
      `What would you like to do?`
    );
  } catch (err) {
    logger.error({ err, ctx }, 'Failed to build operator dashboard');
    return '*Operator Console*\n\nUnable to load live data.';
  }
}

export async function getTenantDashboard(ctx: DashboardContext): Promise<string> {
  try {
    const [balanceRes, lastReadingRes] = await Promise.all([
      supabase.from('pcu_balances').select('balance_pcu').eq('user_id', ctx.userId).maybeSingle(),
      supabase.from('meter_readings').select('reading_kwh, captured_at').eq('user_id', ctx.userId).order('captured_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const pcu = balanceRes.data?.balance_pcu ?? 0;
    const readingText = lastReadingRes.data
      ? `${lastReadingRes.data.reading_kwh} kWh on ${new Date(lastReadingRes.data.captured_at).toLocaleDateString('en-GB')}`
      : 'No readings yet';

    return (
      `*Your Energy*\n\n` +
      `💰 PCU Balance: ${pcu}\n` +
      `⚡ Last Reading: ${readingText}\n\n` +
      `What would you like to do?`
    );
  } catch (err) {
    logger.error({ err, ctx }, 'Failed to build tenant dashboard');
    return '*Your Energy*\n\nUnable to load live data.';
  }
}

export async function getInstallerDashboard(ctx: DashboardContext): Promise<string> {
  try {
    const [installs, faults] = await Promise.all([
      supabase.from('assets').select('id', { count: 'exact' }).eq('organisation_id', ctx.orgId),
      supabase.from('events').select('id', { count: 'exact' }).eq('organisation_id', ctx.orgId).in('event_type', ['fault_reported', 'battery_fault', 'overload']),
    ]);

    const installCount = installs.count ?? 0;
    const faultCount = faults.count ?? 0;

    return (
      `*Installer Console*\n\n` +
      `🔧 Installs: ${installCount}\n` +
      `⚠️ Open faults: ${faultCount}\n\n` +
      `Log meter readings, reset baselines, and report installation faults.`
    );
  } catch (err) {
    logger.error({ err, ctx }, 'Failed to build installer dashboard');
    return '*Installer Console*\n\nUnable to load live data.';
  }
}

export async function getPropertyOwnerDashboard(ctx: DashboardContext): Promise<string> {
  try {
    const [tenants, missedPayments] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact' }).eq('organisation_id', ctx.orgId),
      supabase.from('events').select('id', { count: 'exact' }).eq('organisation_id', ctx.orgId).eq('event_type', 'missed'),
    ]);

    const tenantCount = tenants.count ?? 0;
    const missedCount = missedPayments.count ?? 0;

    return (
      `*Property Manager Console*\n\n` +
      `🏠 Tenants: ${tenantCount}\n` +
      `⚠️ Missed payments: ${missedCount}\n\n` +
      `Manage your property and tenants.`
    );
  } catch (err) {
    logger.error({ err, ctx }, 'Failed to build property owner dashboard');
    return '*Property Manager Console*\n\nUnable to load live data.';
  }
}

