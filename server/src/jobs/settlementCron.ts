import cron from 'node-cron';
import { supabase } from '../lib/supabase.js';
import { ClusterSettlementEngine } from '../services/clusterSettlementEngine.js';
import { processBatchPayouts } from '../services/batchPayoutProcessor.js';

const settlementEngine = new ClusterSettlementEngine({ supabase });
const SETTLEMENT_CRON_EXPR = process.env.SETTLEMENT_CRON_EXPR || '0 2 1 * *';
const SETTLEMENT_TIMEZONE = process.env.SETTLEMENT_TIMEZONE || 'Africa/Lusaka';

function getPreviousMonthPeriod(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getActiveClusters(): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from('clusters')
    .select('id')
    .in('status', ['active', 'operational', 'ACTIVE', 'OPERATIONAL']);

  if (error) throw error;
  return data ?? [];
}

export async function runMonthlySettlement(referenceDate = new Date()): Promise<{
  period: string;
  clustersProcessed: number;
  successes: number;
  failures: number;
  payoutBatch: { processed: number; succeeded: number; failed: number; skipped: number };
}> {
  const period = getPreviousMonthPeriod(referenceDate);
  const clusters = await getActiveClusters();

  let successes = 0;
  let failures = 0;

  for (const cluster of clusters) {
    try {
      await settlementEngine.runClusterSettlement(cluster.id, period);
      successes += 1;
    } catch (error) {
      failures += 1;
      console.error(`[SETTLEMENT CRON] Cluster ${cluster.id} failed for ${period}:`, error);
    }
  }

  const payoutBatch = await processBatchPayouts();
  return { period, clustersProcessed: clusters.length, successes, failures, payoutBatch };
}

export function startSettlementCron(): void {
  if (!cron.validate(SETTLEMENT_CRON_EXPR)) {
    throw new Error(`Invalid SETTLEMENT_CRON_EXPR: ${SETTLEMENT_CRON_EXPR}`);
  }

  cron.schedule(SETTLEMENT_CRON_EXPR, async () => {
    try {
      const result = await runMonthlySettlement(new Date());
      console.log('[SETTLEMENT CRON] Completed', result);
    } catch (error) {
      console.error('[SETTLEMENT CRON] Failed to run settlement job:', error);
    }
  }, { timezone: SETTLEMENT_TIMEZONE });
}

