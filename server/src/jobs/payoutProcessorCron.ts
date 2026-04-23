// server/src/jobs/payoutProcessorCron.ts
import cron from 'node-cron';
import { processBatchPayouts } from '../services/batchPayoutProcessor.js';

const PAYOUT_CRON_EXPR = process.env.PAYOUT_CRON_EXPR || '*/15 * * * *';
const PAYOUT_TIMEZONE = process.env.PAYOUT_TIMEZONE || 'Africa/Lusaka';

function startPayoutProcessorCron(): void {
  if (!cron.validate(PAYOUT_CRON_EXPR)) {
    throw new Error(`Invalid PAYOUT_CRON_EXPR: ${PAYOUT_CRON_EXPR}`);
  }

  cron.schedule(
    PAYOUT_CRON_EXPR,
    async () => {
      try {
        const result = await processBatchPayouts();
        console.log('[PAYOUT CRON] Completed', result);
      } catch (err) {
        console.error('[PAYOUT CRON] Failed:', err);
      }
    },
    { timezone: PAYOUT_TIMEZONE }
  );

  console.log(`[PAYOUT CRON] Scheduled (${PAYOUT_CRON_EXPR})`);
}

// Auto‑start the cron when this module is imported (side‑effect import in index.ts)
startPayoutProcessorCron();