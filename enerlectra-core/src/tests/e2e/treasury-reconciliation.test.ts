/**
 * Treasury Reconciliation Tests
 * Validate daily reconciliation process
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { TreasuryService } from '../../src/domain/treasury/treasury-service';
import { TreasuryReconciliation } from '../../src/domain/treasury/treasury-reconciliation';
import { ngwee } from '../../src/domain/settlement/settlement-types';
import { PaymentRail } from '../../src/domain/treasury/treasury-types';

describe('Treasury Reconciliation', () => {
  let supabase: any;
  let treasury: TreasuryService;
  let reconciliation: TreasuryReconciliation;

  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    treasury = new TreasuryService(supabase);
    reconciliation = new TreasuryReconciliation(
      supabase,
      treasury,
      {
        mtnReversalBufferHours: 48,
        airtelReversalBufferHours: 48,
        bankReversalBufferHours: 72,
        stablecoinReversalBufferHours: 1,
        mtnMinimumBalanceNgwee: ngwee(100_00n),
        airtelMinimumBalanceNgwee: ngwee(100_00n),
        bankMinimumBalanceNgwee: ngwee(500_00n),
        stablecoinMinimumBalanceNgwee: ngwee(50_00n),
        reconciliationToleranceNgwee: ngwee(10_00n),
        criticalDiscrepancyThreshold: ngwee(1000_00n),
        autoRebalanceEnabled: false,
        targetRailDistribution: new Map()
      }
    );
  });

  test('Run daily reconciliation', async () => {
    console.log('🔄 Running daily reconciliation...');

    const report = await reconciliation.runDailyReconciliation();

    expect(report).toBeDefined();
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report.railReports).toBeInstanceOf(Array);
    expect(report.actions).toBeInstanceOf(Array);

    console.log('📊 Reconciliation Report:');
    console.log('  Timestamp:', report.timestamp.toISOString());
    console.log('  System Balanced:', report.systemBalanced);
    console.log('  Total Discrepancy:', report.totalDiscrepancy.toString(), 'ngwee');
    console.log('  Rail Reports:', report.railReports.length);

    for (const railReport of report.railReports) {
      console.log(`\n  ${railReport.rail}:`);
      console.log(`    Status: ${railReport.status}`);
      console.log(`    Internal: ${railReport.internalBalance.toString()} ngwee`);
      console.log(`    External: ${railReport.externalBalance.toString()} ngwee`);
      console.log(`    Discrepancy: ${railReport.discrepancy.toString()} ngwee`);
    }

    if (report.alerts.length > 0) {
      console.log('\n⚠️  Alerts:');
      for (const alert of report.alerts) {
        console.log(`  [${alert.severity}] ${alert.message}`);
      }
    }

    console.log('\n✅ Reconciliation complete');
  });

  test('Get reconciliation history', async () => {
    console.log('📜 Fetching reconciliation history...');

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const history = await reconciliation.getReconciliationHistory(startDate, endDate);

    console.log(`Found ${history.length} reconciliation reports`);

    expect(history).toBeInstanceOf(Array);

    if (history.length > 0) {
      console.log('\n Recent reconciliations:');
      for (const report of history.slice(0, 5)) {
        console.log(`  ${report.timestamp.toISOString()}: Balanced=${report.systemBalanced}`);
      }
    }

    console.log('✅ History retrieved');
  });

  test('Calculate average drift', async () => {
    console.log('📈 Calculating average drift...');

    const drift = await reconciliation.calculateAverageDrift(30);

    console.log('Drift Statistics (30 days):');
    console.log('  Average Drift:', drift.averageDriftNgwee.toString(), 'ngwee');
    console.log('  Max Drift:', drift.maxDriftNgwee.toString(), 'ngwee');
    console.log('  Days Out of Balance:', drift.daysOutOfBalance);
    console.log('  Trend:', drift.trend);

    expect(drift.trend).toMatch(/IMPROVING|STABLE|DEGRADING/);

    console.log('✅ Drift analysis complete');
  });

  test('Treasury state snapshot', async () => {
    console.log('📸 Getting treasury state...');

    const state = await treasury.getTreasuryState();

    console.log('Treasury State:');
    console.log('  Total Internal:', state.totalInternalNgwee.toString(), 'ngwee');
    console.log('  Total External:', state.totalExternalNgwee.toString(), 'ngwee');
    console.log('  Total Discrepancy:', state.totalDiscrepancyNgwee.toString(), 'ngwee');
    console.log('  Is Balanced:', state.isBalanced);
    console.log('  Can Payout:', state.canPayout);

    console.log('\n  Rail Liquidity:');
    for (const [rail, liquidity] of state.rails) {
      console.log(`    ${rail}:`);
      console.log(`      Available: ${liquidity.availableNgwee.toString()} ngwee`);
      console.log(`      Reserved: ${liquidity.reservedNgwee.toString()} ngwee`);
      console.log(`      Status: ${liquidity.status}`);
    }

    expect(state.rails.size).toBeGreaterThan(0);

    console.log('✅ Treasury state retrieved');
  });

  test('Liquidity check for payout', async () => {
    console.log('💰 Testing liquidity check...');

    const check = await treasury.checkLiquidity(
      PaymentRail.MTN,
      ngwee(100_00n) // 100 ZMW
    );

    console.log('Liquidity Check Result:');
    console.log('  Can Payout:', check.canPayout);
    console.log('  Rail:', check.rail);
    console.log('  Requested:', check.requestedNgwee.toString(), 'ngwee');
    console.log('  Available:', check.availableNgwee.toString(), 'ngwee');

    if (!check.canPayout) {
      console.log('  Reason:', check.reason);
      if (check.suggestedRail) {
        console.log('  Suggested Rail:', check.suggestedRail);
      }
    }

    expect(check).toHaveProperty('canPayout');
    expect(check).toHaveProperty('availableNgwee');

    console.log('✅ Liquidity check complete');
  });
});