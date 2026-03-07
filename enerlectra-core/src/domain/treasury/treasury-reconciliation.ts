/**
 * Treasury Reconciliation
 * Daily verification of internal ledger vs external balances
 * CRITICAL: Prevents insolvency drift
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Ngwee,
  ngwee,
  addNgwee,
  subtractNgwee,
  ZERO_NGWEE,
  formatNgwee
} from '../settlement/settlement-types';
import {
  PaymentRail,
  ReconciliationReport,
  TreasuryState
} from './treasury-types';
import { TreasuryService, TreasuryConfig } from './treasury-service';

// ═══════════════════════════════════════════════════════════════
// RECONCILIATION ENGINE
// ═══════════════════════════════════════════════════════════════

export class TreasuryReconciliation {
  constructor(
    private supabase: SupabaseClient,
    private treasuryService: TreasuryService,
    private config: TreasuryConfig
  ) {}

  /**
   * Run daily reconciliation
   * CRITICAL: Call this every day at 2 AM
   */
  async runDailyReconciliation(): Promise<ReconciliationReport> {
    const timestamp = new Date();
    const actions: string[] = [];
    const alerts: ReconciliationReport['alerts'] = [];

    actions.push('Starting daily reconciliation...');

    // Get current treasury state
    const state = await this.treasuryService.getTreasuryState();

    // Reconcile each rail
    const railReports: ReconciliationReport['railReports'] = [];

    for (const [rail, liquidity] of state.rails) {
      actions.push(`Reconciling ${rail}...`);

      const discrepancy = liquidity.discrepancyNgwee;
      const absDiscrepancy = discrepancy < 0n ? discrepancy * -1n : discrepancy;

      let status: 'BALANCED' | 'MINOR_DRIFT' | 'MAJOR_DISCREPANCY';

      if (absDiscrepancy <= this.config.reconciliationToleranceNgwee) {
        status = 'BALANCED';
        actions.push(`✅ ${rail}: Balanced (discrepancy: ${formatNgwee(discrepancy)})`);
      } else if (absDiscrepancy < this.config.criticalDiscrepancyThreshold) {
        status = 'MINOR_DRIFT';
        actions.push(`⚠️  ${rail}: Minor drift (discrepancy: ${formatNgwee(discrepancy)})`);
        alerts.push({
          severity: 'WARNING',
          message: `${rail} has minor drift: ${formatNgwee(discrepancy)}`
        });
      } else {
        status = 'MAJOR_DISCREPANCY';
        actions.push(`❌ ${rail}: MAJOR DISCREPANCY (${formatNgwee(discrepancy)})`);
        alerts.push({
          severity: 'CRITICAL',
          message: `${rail} has major discrepancy: ${formatNgwee(discrepancy)}. PAYOUTS FROZEN.`
        });
      }

      railReports.push({
        rail,
        internalBalance: liquidity.internalBalanceNgwee,
        externalBalance: liquidity.externalBalanceNgwee,
        discrepancy,
        status
      });
    }

    // Calculate overall discrepancy
    const totalDiscrepancy = state.totalDiscrepancyNgwee;
    const systemBalanced = state.isBalanced;

    // Take actions based on findings
    if (!systemBalanced) {
      actions.push('⚠️  SYSTEM NOT BALANCED');
      
      if (totalDiscrepancy >= this.config.criticalDiscrepancyThreshold) {
        actions.push('🚨 CRITICAL THRESHOLD EXCEEDED - FREEZING PAYOUTS');
        await this.freezePayouts();
        
        alerts.push({
          severity: 'CRITICAL',
          message: `Total discrepancy ${formatNgwee(totalDiscrepancy)} exceeds critical threshold. All payouts frozen. Manual intervention required.`
        });
      } else {
        actions.push('⚠️  Minor drift detected - monitoring');
        alerts.push({
          severity: 'WARNING',
          message: `Total discrepancy: ${formatNgwee(totalDiscrepancy)}. Within tolerance but requires attention.`
        });
      }
    } else {
      actions.push('✅ System balanced');
      actions.push('✅ Payouts allowed');
    }

    // Log reconciliation to database
    await this.logReconciliation({
      timestamp,
      railReports,
      totalDiscrepancy,
      systemBalanced,
      actions,
      alerts
    });

    // Return report
    return {
      timestamp,
      railReports,
      totalDiscrepancy,
      systemBalanced,
      actions,
      alerts
    };
  }

  /**
   * Freeze all payouts (critical discrepancy detected)
   */
  private async freezePayouts(): Promise<void> {
    await this.supabase
      .from('treasury_config')
      .update({
        payouts_frozen: true,
        frozen_at: new Date().toISOString(),
        freeze_reason: 'Critical treasury discrepancy'
      })
      .eq('active', true);
  }

  /**
   * Unfreeze payouts (after manual resolution)
   */
  async unfreezePayouts(approvedBy: string, notes: string): Promise<void> {
    await this.supabase
      .from('treasury_config')
      .update({
        payouts_frozen: false,
        unfrozen_at: new Date().toISOString(),
        unfrozen_by: approvedBy,
        unfreeze_notes: notes
      })
      .eq('active', true);
  }

  /**
   * Check if payouts are currently frozen
   */
  async arePayoutsFrozen(): Promise<boolean> {
    const { data } = await this.supabase
      .from('treasury_config')
      .select('payouts_frozen')
      .eq('active', true)
      .single();

    return data?.payouts_frozen || false;
  }

  /**
   * Get reconciliation history
   */
  async getReconciliationHistory(
    startDate: Date,
    endDate: Date
  ): Promise<ReconciliationReport[]> {
    const { data, error } = await this.supabase
      .from('treasury_reconciliations')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return data.map(r => ({
      timestamp: new Date(r.timestamp),
      railReports: r.rail_reports,
      totalDiscrepancy: ngwee(BigInt(r.total_discrepancy_ngwee)),
      systemBalanced: r.system_balanced,
      actions: r.actions,
      alerts: r.alerts
    }));
  }

  /**
   * Log reconciliation to database
   */
  private async logReconciliation(report: ReconciliationReport): Promise<void> {
    await this.supabase
      .from('treasury_reconciliations')
      .insert({
        timestamp: report.timestamp.toISOString(),
        rail_reports: report.railReports,
        total_discrepancy_ngwee: report.totalDiscrepancy.toString(),
        system_balanced: report.systemBalanced,
        actions: report.actions,
        alerts: report.alerts
      });
  }

  /**
   * Generate reconciliation report for regulators
   */
  async generateRegulatoryReport(
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const history = await this.getReconciliationHistory(startDate, endDate);
    
    let report = `TREASURY RECONCILIATION REPORT\n`;
    report += `Period: ${startDate.toISOString()} to ${endDate.toISOString()}\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `\n`;
    report += `═══════════════════════════════════════════════════════════\n`;
    report += `\n`;

    for (const rec of history) {
      report += `Date: ${rec.timestamp.toISOString()}\n`;
      report += `System Balanced: ${rec.systemBalanced ? 'YES' : 'NO'}\n`;
      report += `Total Discrepancy: ${formatNgwee(rec.totalDiscrepancy)}\n`;
      report += `\n`;
      report += `Rail Status:\n`;
      
      for (const railReport of rec.railReports) {
        report += `  ${railReport.rail}:\n`;
        report += `    Internal: ${formatNgwee(railReport.internalBalance)}\n`;
        report += `    External: ${formatNgwee(railReport.externalBalance)}\n`;
        report += `    Discrepancy: ${formatNgwee(railReport.discrepancy)}\n`;
        report += `    Status: ${railReport.status}\n`;
      }
      
      report += `\n`;
      
      if (rec.alerts.length > 0) {
        report += `Alerts:\n`;
        for (const alert of rec.alerts) {
          report += `  [${alert.severity}] ${alert.message}\n`;
        }
        report += `\n`;
      }
      
      report += `───────────────────────────────────────────────────────────\n`;
      report += `\n`;
    }

    return report;
  }

  /**
   * Calculate average daily drift (for trending)
   */
  async calculateAverageDrift(days: number = 30): Promise<{
    averageDriftNgwee: Ngwee;
    maxDriftNgwee: Ngwee;
    daysOutOfBalance: number;
    trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const history = await this.getReconciliationHistory(startDate, endDate);

    if (history.length === 0) {
      return {
        averageDriftNgwee: ZERO_NGWEE,
        maxDriftNgwee: ZERO_NGWEE,
        daysOutOfBalance: 0,
        trend: 'STABLE'
      };
    }

    // Calculate metrics
    const drifts = history.map(h => {
      const abs = h.totalDiscrepancy < 0n 
        ? h.totalDiscrepancy * -1n 
        : h.totalDiscrepancy;
      return abs;
    });

    const totalDrift = drifts.reduce((sum, d) => addNgwee(sum, d), ZERO_NGWEE);
    const averageDriftNgwee = ngwee(totalDrift / BigInt(drifts.length));
    const maxDriftNgwee = drifts.reduce((max, d) => d > max ? d : max, ZERO_NGWEE);
    
    const daysOutOfBalance = history.filter(h => !h.systemBalanced).length;

    // Calculate trend (first half vs second half)
    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);

    const avgFirstHalf = this.calculateAverage(
      firstHalf.map(h => {
        const abs = h.totalDiscrepancy < 0n ? h.totalDiscrepancy * -1n : h.totalDiscrepancy;
        return abs;
      })
    );

    const avgSecondHalf = this.calculateAverage(
      secondHalf.map(h => {
        const abs = h.totalDiscrepancy < 0n ? h.totalDiscrepancy * -1n : h.totalDiscrepancy;
        return abs;
      })
    );

    let trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    const change = Number(avgSecondHalf - avgFirstHalf);
    
    if (change < -500) { // Improving by > 5 ZMW
      trend = 'IMPROVING';
    } else if (change > 500) { // Degrading by > 5 ZMW
      trend = 'DEGRADING';
    } else {
      trend = 'STABLE';
    }

    return {
      averageDriftNgwee,
      maxDriftNgwee,
      daysOutOfBalance,
      trend
    };
  }

  private calculateAverage(values: Ngwee[]): Ngwee {
    if (values.length === 0) return ZERO_NGWEE;
    const sum = values.reduce((s, v) => addNgwee(s, v), ZERO_NGWEE);
    return ngwee(sum / BigInt(values.length));
  }
}