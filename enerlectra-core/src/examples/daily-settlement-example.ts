/**
 * Daily Settlement Example
 * Shows complete settlement lifecycle
 */

import { createClient } from '@supabase/supabase-js';
import {
  runDailySettlement,
  attemptFinalization,
  replayCycle,
  type RunSettlementRequest
} from '../src';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function main() {
  console.log('🚀 Enerlectra Core - Daily Settlement Example\n');

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Run Daily Settlement
  // ═══════════════════════════════════════════════════════════

  const request: RunSettlementRequest = {
    cluster_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    settlement_date: '2026-02-25',
    production_report: {
      kwh_reported: 150,
      kwh_verified: 145,  // 5 kWh lost to meter error
      price_per_kwh: 0.50 // ZMW per kWh
    },
    contributor_allocations: [
      {
        contributor_id: 'user-1',
        kwh_share: 72.5,
        value_share: 36.25
      },
      {
        contributor_id: 'user-2',
        kwh_share: 50,
        value_share: 25.00
      },
      {
        contributor_id: 'user-3',
        kwh_share: 22.5,
        value_share: 11.25
      }
    ]
  };

  console.log('📊 Running settlement for:', request.settlement_date);
  console.log(`   Cluster: ${request.cluster_id}`);
  console.log(`   Production: ${request.production_report.kwh_verified} kWh`);
  console.log(`   Contributors: ${request.contributor_allocations.length}\n`);

  const result = await runDailySettlement(supabase, request);

  if (result.success) {
    console.log('✅ Settlement completed successfully!\n');
    console.log(`   Cycle ID: ${result.settlement_cycle_id}`);
    console.log(`   Final State: ${result.final_state}\n`);
    
    console.log('Operations performed:');
    result.operations_completed.forEach(op => console.log(`   ${op}`));
    console.log('\n');
  } else {
    console.error('❌ Settlement failed:', result.error);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Verify Settlement (Replay)
  // ═══════════════════════════════════════════════════════════

  console.log('🔍 Verifying settlement integrity...\n');

  const verification = await replayCycle(supabase, result.settlement_cycle_id);

  console.log(`   Ledger entries: ${verification.entry_count}`);
  console.log(`   Balance verified: ${verification.balance_verified ? '✅' : '❌'}`);
  console.log(`   Hash verified: ${verification.hash_verified ? '✅' : '❌'}`);

  if (verification.issues.length > 0) {
    console.log(`\n⚠️  Issues detected:`);
    verification.issues.forEach(issue => console.log(`   - ${issue}`));
  } else {
    console.log(`\n✅ Settlement integrity verified!`);
  }

  console.log('\n');

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Challenge Window Status
  // ═══════════════════════════════════════════════════════════

  console.log('⏰ Challenge Window Status:\n');
  console.log('   Status: FINALITY_PENDING');
  console.log('   Duration: 24 hours');
  console.log('   Can finalize: After challenge window expires');
  console.log('   \n   💡 Tip: Call attemptFinalization() after 24 hours\n');

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Finalization (After 24 hours)
  // ═══════════════════════════════════════════════════════════

  // NOTE: In production, this would be called by a worker after 24 hours
  // For this example, we just show the code

  console.log('📌 After 24 hours, finalize with:\n');
  console.log('```typescript');
  console.log('const finalization = await attemptFinalization(');
  console.log('  supabase,');
  console.log(`  '${result.settlement_cycle_id}'`);
  console.log(');');
  console.log('```\n');

  // Example (would fail because challenge window hasn't passed):
  // const finalization = await attemptFinalization(
  //   supabase,
  //   result.settlement_cycle_id
  // );

  console.log('✨ Example complete!\n');
}

main().catch(console.error);