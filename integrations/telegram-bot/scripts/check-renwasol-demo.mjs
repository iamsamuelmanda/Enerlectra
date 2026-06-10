import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(rootDir, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('FAIL: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in integrations/telegram-bot/.env');
  process.exit(1);
}

let host = 'unknown';
try {
  host = new URL(supabaseUrl).host;
} catch {
  console.error('FAIL: SUPABASE_URL is not a valid URL');
  process.exit(1);
}

console.log(`Checking Supabase project: ${host}`);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let result;
try {
  result = await supabase
    .from('transactions')
    .select('meter_number, status, amount', { count: 'exact' })
    .limit(5);
} catch (err) {
  const cause = err?.cause;
  console.error('FAIL: network error —', err?.message || err);
  if (cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || /certificate/i.test(String(cause?.message || ''))) {
    console.error('\nThis is a local Windows SSL issue (not a missing table).');
    console.error('Your migration may still have worked. Verify in Supabase SQL Editor:');
    console.error('  SELECT meter_number, status, amount FROM public.transactions;');
    console.error('\nThe bot on Render is unaffected — redeploy and test /renwasol in Telegram.');
  }
  process.exit(1);
}

const { data, error, count } = result;

if (error) {
  console.error('FAIL:', error.code || 'error', error.message || error);
  if (/fetch failed/i.test(String(error.message || ''))) {
    console.error('\nLikely a local Windows SSL/certificate issue — not proof the table is missing.');
    console.error('Verify in Supabase → SQL Editor:');
    console.error('  SELECT meter_number, status, amount FROM public.transactions;');
    console.error('Expected: 3 rows. Then redeploy the bot on Render and test /renwasol in Telegram.');
  } else if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
    console.error('\n→ Fix: Supabase → SQL Editor → run:');
    console.error('  supabase/migrations/008_renwasol_transactions.sql');
  }
  process.exit(1);
}

console.log('OK: transactions table reachable');
console.log('rows:', count ?? data?.length ?? 0);
if (data?.length) {
  for (const row of data) {
    console.log(`  - meter ${row.meter_number} | ${row.status} | K${row.amount}`);
  }
} else {
  console.warn('WARN: table exists but has no rows — re-run the INSERT section of migration 008');
  process.exit(2);
}
