/**
 * Production Verifier
 * Validates production reports before they enter the settlement cycle
 */

export interface ProductionReport {
    cluster_id: string;
    settlement_date: string;
    kwh_reported: number;
    kwh_verified: number;
    meter_reading_start?: number;
    meter_reading_end?: number;
    meter_id?: string;
    timestamp: Date;
  }
  
  export interface ProductionValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    verified_kwh: number;
  }
  
  export interface ClusterCapacity {
    cluster_id: string;
    rated_capacity_kw: number;
    max_daily_kwh: number; // Theoretical maximum
    expected_daily_kwh: number; // Average expected
  }
  
  export class ProductionVerifier {
    
    /**
     * Verify a production report
     * Checks for anomalies, validates ranges, ensures data integrity
     */
    verify(
      report: ProductionReport,
      capacity: ClusterCapacity,
      historical_avg?: number
    ): ProductionValidationResult {
      const errors: string[] = [];
      const warnings: string[] = [];
      let verified_kwh = report.kwh_reported;
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 1: Basic sanity checks
      // ═══════════════════════════════════════════════════════════
  
      if (report.kwh_reported < 0) {
        errors.push('Reported kWh cannot be negative');
      }
  
      if (report.kwh_verified < 0) {
        errors.push('Verified kWh cannot be negative');
      }
  
      if (report.kwh_verified > report.kwh_reported) {
        errors.push('Verified kWh cannot exceed reported kWh');
      }
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 2: Capacity checks
      // ═══════════════════════════════════════════════════════════
  
      // Check against theoretical maximum (24 hours * capacity)
      if (report.kwh_reported > capacity.max_daily_kwh * 1.1) {
        errors.push(
          `Reported ${report.kwh_reported} kWh exceeds theoretical maximum ` +
          `${capacity.max_daily_kwh} kWh by >10%. Possible meter error.`
        );
      }
  
      // Check against rated capacity (should be physically impossible to exceed significantly)
      if (report.kwh_reported > capacity.max_daily_kwh * 1.5) {
        errors.push(
          `Reported ${report.kwh_reported} kWh is 50% above theoretical maximum. ` +
          `This is physically impossible. Meter malfunction suspected.`
        );
      }
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 3: Historical comparison
      // ═══════════════════════════════════════════════════════════
  
      if (historical_avg !== undefined && historical_avg > 0) {
        const deviation = Math.abs(report.kwh_reported - historical_avg) / historical_avg;
  
        // Warn if deviation > 50%
        if (deviation > 0.5) {
          warnings.push(
            `Production deviates ${(deviation * 100).toFixed(0)}% from historical average ` +
            `(${historical_avg.toFixed(1)} kWh). Weather event or equipment issue?`
          );
        }
  
        // Error if deviation > 200% (3x normal)
        if (deviation > 2.0) {
          errors.push(
            `Production is ${(deviation * 100).toFixed(0)}% above/below historical average. ` +
            `This is highly anomalous. Requires manual review.`
          );
        }
      }
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 4: Meter reading consistency
      // ═══════════════════════════════════════════════════════════
  
      if (
        report.meter_reading_start !== undefined &&
        report.meter_reading_end !== undefined
      ) {
        const meter_diff = report.meter_reading_end - report.meter_reading_start;
  
        // Check meter readings are increasing
        if (meter_diff < 0) {
          errors.push(
            `Meter reading end (${report.meter_reading_end}) is less than start ` +
            `(${report.meter_reading_start}). Meter may have been reset or replaced.`
          );
        }
  
        // Check meter difference matches reported kWh
        if (Math.abs(meter_diff - report.kwh_reported) > 0.1) {
          errors.push(
            `Meter reading difference (${meter_diff} kWh) does not match ` +
            `reported kWh (${report.kwh_reported} kWh). Data inconsistency detected.`
          );
        }
      }
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 5: Verification delta
      // ═══════════════════════════════════════════════════════════
  
      const verification_loss = report.kwh_reported - report.kwh_verified;
      const loss_pct = (verification_loss / report.kwh_reported) * 100;
  
      // Warn if loss > 5%
      if (loss_pct > 5 && loss_pct < 15) {
        warnings.push(
          `Verification loss is ${loss_pct.toFixed(1)}% ` +
          `(${verification_loss.toFixed(1)} kWh). Higher than typical 2-3%.`
        );
      }
  
      // Error if loss > 15%
      if (loss_pct > 15) {
        errors.push(
          `Verification loss is ${loss_pct.toFixed(1)}% ` +
          `(${verification_loss.toFixed(1)} kWh). This is excessive. ` +
          `Possible metering error or theft.`
        );
      }
  
      // ═══════════════════════════════════════════════════════════
      // VALIDATION 6: Zero production check
      // ═══════════════════════════════════════════════════════════
  
      if (report.kwh_reported === 0) {
        warnings.push(
          'Zero production reported. System outage, maintenance, or nighttime period?'
        );
      }
  
      // ═══════════════════════════════════════════════════════════
      // FINAL RESULT
      // ═══════════════════════════════════════════════════════════
  
      // If errors exist, use reported kWh (don't auto-correct)
      // Manual review required
      if (errors.length > 0) {
        verified_kwh = 0; // Force manual review
      } else {
        verified_kwh = report.kwh_verified;
      }
  
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        verified_kwh
      };
    }
  
    /**
     * Auto-verify production report with confidence score
     * Returns verified kWh if confidence is high, otherwise flags for manual review
     */
    autoVerify(
      report: ProductionReport,
      capacity: ClusterCapacity,
      historical_avg?: number,
      confidence_threshold: number = 0.9
    ): {
      auto_approved: boolean;
      verified_kwh: number;
      confidence: number;
      requires_manual_review: boolean;
      reason?: string;
    } {
      const validation = this.verify(report, capacity, historical_avg);
  
      // Calculate confidence score
      let confidence = 1.0;
  
      // Reduce confidence for each error
      confidence -= validation.errors.length * 0.4;
  
      // Reduce confidence for each warning
      confidence -= validation.warnings.length * 0.1;
  
      // Reduce confidence if no historical data
      if (historical_avg === undefined) {
        confidence -= 0.2;
      }
  
      confidence = Math.max(0, confidence);
  
      const auto_approved = confidence >= confidence_threshold && validation.errors.length === 0;
      const requires_manual_review = !auto_approved;
  
      return {
        auto_approved,
        verified_kwh: auto_approved ? validation.verified_kwh : 0,
        confidence,
        requires_manual_review,
        reason: requires_manual_review
          ? `Confidence ${(confidence * 100).toFixed(0)}% below threshold. ` +
            `Errors: ${validation.errors.length}, Warnings: ${validation.warnings.length}`
          : undefined
      };
    }
  
    /**
     * Detect anomalies in a series of production reports
     * Useful for catching systematic issues or fraud
     */
    detectAnomalies(
      reports: ProductionReport[],
      capacity: ClusterCapacity
    ): {
      suspicious_patterns: string[];
      anomaly_score: number; // 0-1, higher = more suspicious
    } {
      const suspicious_patterns: string[] = [];
      let anomaly_score = 0;
  
      if (reports.length < 7) {
        // Need at least a week of data
        return { suspicious_patterns: [], anomaly_score: 0 };
      }
  
      // Sort by date
      const sorted = [...reports].sort(
        (a, b) => new Date(a.settlement_date).getTime() - new Date(b.settlement_date).getTime()
      );
  
      // Check 1: Suspiciously consistent production
      const values = sorted.map(r => r.kwh_reported);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std_dev = Math.sqrt(variance);
      const coefficient_of_variation = std_dev / mean;
  
      if (coefficient_of_variation < 0.05 && mean > 0) {
        suspicious_patterns.push(
          'Production is suspiciously consistent across days. ' +
          'Real solar production varies 15-30% daily. Possible fake data.'
        );
        anomaly_score += 0.4;
      }
  
      // Check 2: Always exactly at capacity
      const at_capacity_count = sorted.filter(
        r => Math.abs(r.kwh_reported - capacity.max_daily_kwh) < 0.01
      ).length;
  
      if (at_capacity_count > sorted.length * 0.7) {
        suspicious_patterns.push(
          `${at_capacity_count}/${sorted.length} days report exactly max capacity. ` +
          'Real systems rarely hit theoretical maximum. Possible fabricated data.'
        );
        anomaly_score += 0.5;
      }
  
      // Check 3: No weekday/weekend variation
      // Real solar has weather patterns, but fabricated data might not
      const weekday_avg = sorted
        .filter(r => {
          const day = new Date(r.settlement_date).getDay();
          return day >= 1 && day <= 5; // Mon-Fri
        })
        .reduce((sum, r) => sum + r.kwh_reported, 0) / sorted.filter(r => {
          const day = new Date(r.settlement_date).getDay();
          return day >= 1 && day <= 5;
        }).length;
  
      const weekend_avg = sorted
        .filter(r => {
          const day = new Date(r.settlement_date).getDay();
          return day === 0 || day === 6; // Sat-Sun
        })
        .reduce((sum, r) => sum + r.kwh_reported, 0) / sorted.filter(r => {
          const day = new Date(r.settlement_date).getDay();
          return day === 0 || day === 6;
        }).length;
  
      if (Math.abs(weekday_avg - weekend_avg) < 0.01 && weekday_avg > 0) {
        suspicious_patterns.push(
          'Weekday and weekend production are identical. ' +
          'Real solar varies due to weather patterns. Possible fabricated data.'
        );
        anomaly_score += 0.3;
      }
  
      anomaly_score = Math.min(1.0, anomaly_score);
  
      return {
        suspicious_patterns,
        anomaly_score
      };
    }
  }