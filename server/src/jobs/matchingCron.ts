// server/src/jobs/matchingCron.ts
import cron from 'node-cron';
import { supabase } from '../lib/supabase.js';
import { runMatchingForCluster } from '../services/matchingEngine.js';

const MATCHING_CRON_EXPR = process.env.MATCHING_CRON_EXPR || '*/10 * * * *';
const MATCHING_TIMEZONE = process.env.MATCHING_TIMEZONE || 'Africa/Lusaka';

async function getActiveClusters(): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from('clusters')
    .select('id')
    .in('status', ['active', 'operational', 'ACTIVE', 'OPERATIONAL']);

  if (error) throw error;
  return data ?? [];
}

export async function runMatchingCycle(): Promise<{
  clustersProcessed: number;
  matchesExecuted: number;
}> {
  const clusters = await getActiveClusters();
  let matchesExecuted = 0;

  for (const cluster of clusters) {
    try {
      matchesExecuted += await runMatchingForCluster(cluster.id);
    } catch (error) {
      console.error(`[MATCHING CRON] Cluster ${cluster.id} failed:`, error);
    }
  }

  return { clustersProcessed: clusters.length, matchesExecuted };
}

export function startMatchingCron(): void {
  if (!cron.validate(MATCHING_CRON_EXPR)) {
    throw new Error(`Invalid MATCHING_CRON_EXPR: ${MATCHING_CRON_EXPR}`);
  }

  cron.schedule(
    MATCHING_CRON_EXPR,
    async () => {
      try {
        const result = await runMatchingCycle();
        console.log('[MATCHING CRON] Completed', result);
      } catch (error) {
        console.error('[MATCHING CRON] Failed:', error);
      }
    },
    { timezone: MATCHING_TIMEZONE }
  );

  console.log(`[MATCHING CRON] Scheduled (${MATCHING_CRON_EXPR})`);
}
