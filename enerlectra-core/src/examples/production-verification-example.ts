/**
 * Production Verification Example
 * Shows how to verify production reports before settlement
 */

import { createClient } from '@supabase/supabase-js';
import {
  ProductionVerifier,
  ProductionAggregate,
  runDailySettlement,
  type ProductionReport,
  type ClusterCapacity
} from '../src';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function main() {
  console.log('🔍 Production Verification Example\n');

  // ═══════════════════════════════════════════════════════════
  // SETUP: Define cluster capacity
  // ═══════════════════════════════════════════════════════════

  const cluster_capacity: ClusterCapacity = {
    cluster_id: 'test-cluster',
    rated_capacity_kw: 5, // 5 kW solar array
    max_daily_kwh: 5 * 24, // Theoretical max: 120 kWh/day
    expected_daily_kwh: 5 * 4.5 * 1.0 // Expected: ~22.5 kWh/day (4.5 peak sun hours)
  };

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 1: Valid Production Report
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 1: Valid Production Report\n');

  const valid_report: ProductionReport = {
    cluster_id: 'test-cluster',
    settlement_date: '2026-02-25',
    kwh_reported: 22.5,
    kwh_verified: 22.0, // 2.2% loss (typical)
    meter_reading_start: 1000,
    meter_reading_end: 1022.5,
    meter_id: 'METER-001',
    timestamp: new Date()
  };

  const verifier = new ProductionVerifier();
  const result1 = verifier.verify(valid_report, cluster_capacity, 23.0);

  console.log('Validation Result:');
  console.log(`  Valid: ${result1.valid}`);
  console.log(`  Verified kWh: ${result1.verified_kwh}`);
  console.log(`  Errors: ${result1.errors.length}`);
  console.log(`  Warnings: ${result1.warnings.length}`);

  if (result1.valid) {
    console.log('  ✅ Report passed validation\n');
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 2: Suspicious Report (Too High)
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 2: Suspicious Report (Too High)\n');

  const suspicious_report: ProductionReport = {
    cluster_id: 'test-cluster',
    settlement_date: '2026-02-26',
    kwh_reported: 150, // 150 kWh from a 5 kW system? Impossible!
    kwh_verified: 150,
    timestamp: new Date()
  };

  const result2 = verifier.verify(suspicious_report, cluster_capacity, 23.0);

  console.log('Validation Result:');
  console.log(`  Valid: ${result2.valid}`);
  console.log(`  Errors:`);
  result2.errors.forEach(err => console.log(`    - ${err}`));
  console.log(`  ❌ Report FAILED validation\n`);

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 3: Auto-Verification with Confidence
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 3: Auto-Verification\n');

  const auto_result = verifier.autoVerify(
    valid_report,
    cluster_capacity,
    23.0,
    0.9 // 90% confidence threshold
  );

  console.log('Auto-Verification Result:');
  console.log(`  Auto-approved: ${auto_result.auto_approved}`);
  console.log(`  Confidence: ${(auto_result.confidence * 100).toFixed(0)}%`);
  console.log(`  Requires manual review: ${auto_result.requires_manual_review}`);

  if (auto_result.auto_approved) {
    console.log(`  ✅ Automatically approved for settlement\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 4: Historical Analysis & Aggregation
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 4: Historical Analysis\n');

  // Simulate 30 days of production
  const historical_reports: ProductionReport[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date('2026-02-01');
    date.setDate(date.getDate() + i);
    
    // Simulate realistic daily variation
    const base_production = 22;
    const variation = (Math.random() - 0.5) * 8; // ±4 kWh variation
    const kwh = Math.max(10, base_production + variation);

    historical_reports.push({
      cluster_id: 'test-cluster',
      settlement_date: date.toISOString().split('T')[0],
      kwh_reported: kwh,
      kwh_verified: kwh * 0.98, // 2% loss
      timestamp: date
    });
  }

  const aggregate = new ProductionAggregate();
  const stats = aggregate.calculateStats(
    'test-cluster',
    historical_reports,
    cluster_capacity.rated_capacity_kw
  );

  console.log('30-Day Production Statistics:');
  console.log(`  Total kWh: ${stats.total_kwh.toFixed(1)}`);
  console.log(`  Avg kWh/day: ${stats.avg_kwh_per_day.toFixed(1)}`);
  console.log(`  Max kWh (single day): ${stats.max_kwh_day.toFixed(1)}`);
  console.log(`  Avg capacity factor: ${(stats.avg_capacity_factor * 100).toFixed(1)}%`);
  console.log(`  Uptime: ${stats.uptime_percentage.toFixed(1)}%\n`);

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 5: Anomaly Detection
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 5: Anomaly Detection\n');

  const anomaly_result = verifier.detectAnomalies(
    historical_reports,
    cluster_capacity
  );

  console.log('Anomaly Detection:');
  console.log(`  Anomaly score: ${(anomaly_result.anomaly_score * 100).toFixed(0)}%`);
  console.log(`  Suspicious patterns found: ${anomaly_result.suspicious_patterns.length}`);

  if (anomaly_result.suspicious_patterns.length > 0) {
    console.log('  Patterns:');
    anomaly_result.suspicious_patterns.forEach(p => console.log(`    - ${p}`));
  } else {
    console.log('  ✅ No suspicious patterns detected');
  }

  console.log('\n');

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 6: Full Settlement Flow with Verification
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 6: Complete Settlement with Verification\n');

  // Step 1: Verify production
  const today_report: ProductionReport = {
    cluster_id: 'test-cluster',
    settlement_date: '2026-03-01',
    kwh_reported: 24.5,
    kwh_verified: 24.0,
    timestamp: new Date()
  };

  const verification = verifier.autoVerify(
    today_report,
    cluster_capacity,
    stats.avg_kwh_per_day,
    0.9
  );

  console.log('Step 1: Verify production');
  console.log(`  Confidence: ${(verification.confidence * 100).toFixed(0)}%`);
  console.log(`  Auto-approved: ${verification.auto_approved}`);

  if (verification.auto_approved) {
    console.log('  ✅ Proceeding to settlement\n');

    // Step 2: Run settlement with verified data
    console.log('Step 2: Execute settlement');

    const settlement_result = await runDailySettlement(supabase, {
      cluster_id: 'test-cluster',
      settlement_date: '2026-03-01',
      production_report: {
        kwh_reported: today_report.kwh_reported,
        kwh_verified: verification.verified_kwh,
        price_per_kwh: 0.50
      },
      contributor_allocations: [
        { contributor_id: 'user-1', kwh_share: 12, value_share: 6.0 },
        { contributor_id: 'user-2', kwh_share: 12, value_share: 6.0 }
      ]
    });

    if (settlement_result.success) {
      console.log('  ✅ Settlement completed');
      console.log(`  Cycle ID: ${settlement_result.settlement_cycle_id}`);
      console.log(`  State: ${settlement_result.final_state}\n`);
    }
  } else {
    console.log(`  ❌ Verification failed: ${verification.reason}\n`);
    console.log('  Action: Flagged for manual review\n');
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 7: Weekly & Monthly Aggregates
  // ═══════════════════════════════════════════════════════════

  console.log('📊 SCENARIO 7: Time-based Aggregation\n');

  const daily = aggregate.aggregateDaily(
    historical_reports,
    cluster_capacity.rated_capacity_kw
  );

  const weekly = aggregate.aggregateWeekly(daily);
  const monthly = aggregate.aggregateMonthly(daily);

  console.log(`Weekly Aggregates (${weekly.length} weeks):`);
  weekly.forEach(w => {
    console.log(`  ${w.week_start} to ${w.week_end}:`);
    console.log(`    Total: ${w.total_kwh.toFixed(1)} kWh`);
    console.log(`    Avg/day: ${w.avg_daily_kwh.toFixed(1)} kWh`);
    console.log(`    Capacity factor: ${(w.avg_capacity_factor * 100).toFixed(1)}%`);
  });

  console.log(`\nMonthly Aggregates (${monthly.length} months):`);
  monthly.forEach(m => {
    console.log(`  ${m.month}:`);
    console.log(`    Total: ${m.total_kwh.toFixed(1)} kWh`);
    console.log(`    Avg/day: ${m.avg_daily_kwh.toFixed(1)} kWh`);
    console.log(`    Peak day: ${m.peak_day_kwh.toFixed(1)} kWh on ${m.peak_day_date}`);
    console.log(`    Capacity factor: ${(m.avg_capacity_factor * 100).toFixed(1)}%`);
  });

  console.log('\n✨ Example complete!\n');
}

main().catch(console.error);