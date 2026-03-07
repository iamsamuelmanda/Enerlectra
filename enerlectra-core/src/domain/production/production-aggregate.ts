/**
 * Production Aggregate
 * Aggregates and analyzes production data over time
 */

import type { ProductionReport } from './production-verifier';

export interface DailyProduction {
  settlement_date: string;
  kwh_produced: number;
  kwh_verified: number;
  capacity_factor: number; // 0-1
}

export interface WeeklyAggregate {
  week_start: string;
  week_end: string;
  total_kwh: number;
  avg_daily_kwh: number;
  days_reported: number;
  avg_capacity_factor: number;
}

export interface MonthlyAggregate {
  month: string; // YYYY-MM
  total_kwh: number;
  avg_daily_kwh: number;
  days_reported: number;
  peak_day_kwh: number;
  peak_day_date: string;
  lowest_day_kwh: number;
  lowest_day_date: string;
  avg_capacity_factor: number;
}

export interface ProductionStats {
  cluster_id: string;
  period_start: string;
  period_end: string;
  total_kwh: number;
  avg_kwh_per_day: number;
  max_kwh_day: number;
  min_kwh_day: number;
  avg_capacity_factor: number;
  uptime_days: number;
  total_days: number;
  uptime_percentage: number;
}

export class ProductionAggregate {

  /**
   * Calculate daily capacity factor
   * Capacity factor = actual production / theoretical maximum
   */
  calculateCapacityFactor(
    kwh_produced: number,
    rated_capacity_kw: number
  ): number {
    const theoretical_max = rated_capacity_kw * 24; // 24 hours
    return kwh_produced / theoretical_max;
  }

  /**
   * Aggregate daily production reports
   */
  aggregateDaily(
    reports: ProductionReport[],
    rated_capacity_kw: number
  ): DailyProduction[] {
    return reports.map(r => ({
      settlement_date: r.settlement_date,
      kwh_produced: r.kwh_reported,
      kwh_verified: r.kwh_verified,
      capacity_factor: this.calculateCapacityFactor(r.kwh_verified, rated_capacity_kw)
    }));
  }

  /**
   * Aggregate to weekly summaries
   */
  aggregateWeekly(
    daily_data: DailyProduction[]
  ): WeeklyAggregate[] {
    // Group by week (ISO week starting Monday)
    const weeks = new Map<string, DailyProduction[]>();

    for (const day of daily_data) {
      const date = new Date(day.settlement_date);
      const week_start = this.getWeekStart(date);
      const week_key = week_start.toISOString().split('T')[0];

      if (!weeks.has(week_key)) {
        weeks.set(week_key, []);
      }
      weeks.get(week_key)!.push(day);
    }

    // Compute weekly aggregates
    const aggregates: WeeklyAggregate[] = [];

    for (const [week_start, days] of weeks.entries()) {
      const week_start_date = new Date(week_start);
      const week_end_date = new Date(week_start_date);
      week_end_date.setDate(week_end_date.getDate() + 6);

      const total_kwh = days.reduce((sum, d) => sum + d.kwh_verified, 0);
      const avg_capacity_factor = days.reduce((sum, d) => sum + d.capacity_factor, 0) / days.length;

      aggregates.push({
        week_start,
        week_end: week_end_date.toISOString().split('T')[0],
        total_kwh,
        avg_daily_kwh: total_kwh / days.length,
        days_reported: days.length,
        avg_capacity_factor
      });
    }

    return aggregates.sort((a, b) => a.week_start.localeCompare(b.week_start));
  }

  /**
   * Aggregate to monthly summaries
   */
  aggregateMonthly(
    daily_data: DailyProduction[]
  ): MonthlyAggregate[] {
    // Group by month (YYYY-MM)
    const months = new Map<string, DailyProduction[]>();

    for (const day of daily_data) {
      const month_key = day.settlement_date.substring(0, 7); // YYYY-MM

      if (!months.has(month_key)) {
        months.set(month_key, []);
      }
      months.get(month_key)!.push(day);
    }

    // Compute monthly aggregates
    const aggregates: MonthlyAggregate[] = [];

    for (const [month, days] of months.entries()) {
      const total_kwh = days.reduce((sum, d) => sum + d.kwh_verified, 0);
      const avg_capacity_factor = days.reduce((sum, d) => sum + d.capacity_factor, 0) / days.length;

      // Find peak and lowest days
      const sorted_by_kwh = [...days].sort((a, b) => b.kwh_verified - a.kwh_verified);
      const peak_day = sorted_by_kwh[0];
      const lowest_day = sorted_by_kwh[sorted_by_kwh.length - 1];

      aggregates.push({
        month,
        total_kwh,
        avg_daily_kwh: total_kwh / days.length,
        days_reported: days.length,
        peak_day_kwh: peak_day.kwh_verified,
        peak_day_date: peak_day.settlement_date,
        lowest_day_kwh: lowest_day.kwh_verified,
        lowest_day_date: lowest_day.settlement_date,
        avg_capacity_factor
      });
    }

    return aggregates.sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Calculate comprehensive production statistics
   */
  calculateStats(
    cluster_id: string,
    reports: ProductionReport[],
    rated_capacity_kw: number
  ): ProductionStats {
    if (reports.length === 0) {
      return {
        cluster_id,
        period_start: '',
        period_end: '',
        total_kwh: 0,
        avg_kwh_per_day: 0,
        max_kwh_day: 0,
        min_kwh_day: 0,
        avg_capacity_factor: 0,
        uptime_days: 0,
        total_days: 0,
        uptime_percentage: 0
      };
    }

    // Sort by date
    const sorted = [...reports].sort(
      (a, b) => new Date(a.settlement_date).getTime() - new Date(b.settlement_date).getTime()
    );

    const period_start = sorted[0].settlement_date;
    const period_end = sorted[sorted.length - 1].settlement_date;

    const total_kwh = sorted.reduce((sum, r) => sum + r.kwh_verified, 0);
    const max_kwh_day = Math.max(...sorted.map(r => r.kwh_verified));
    const min_kwh_day = Math.min(...sorted.map(r => r.kwh_verified));

    const capacity_factors = sorted.map(r =>
      this.calculateCapacityFactor(r.kwh_verified, rated_capacity_kw)
    );
    const avg_capacity_factor = capacity_factors.reduce((a, b) => a + b, 0) / capacity_factors.length;

    // Calculate uptime (days with production > 0)
    const uptime_days = sorted.filter(r => r.kwh_verified > 0).length;
    const total_days = sorted.length;

    return {
      cluster_id,
      period_start,
      period_end,
      total_kwh,
      avg_kwh_per_day: total_kwh / total_days,
      max_kwh_day,
      min_kwh_day,
      avg_capacity_factor,
      uptime_days,
      total_days,
      uptime_percentage: (uptime_days / total_days) * 100
    };
  }

  /**
   * Calculate rolling average for anomaly detection
   */
  calculateRollingAverage(
    reports: ProductionReport[],
    window_days: number = 7
  ): Map<string, number> {
    const sorted = [...reports].sort(
      (a, b) => new Date(a.settlement_date).getTime() - new Date(b.settlement_date).getTime()
    );

    const rolling_avg = new Map<string, number>();

    for (let i = 0; i < sorted.length; i++) {
      const start_idx = Math.max(0, i - window_days + 1);
      const window = sorted.slice(start_idx, i + 1);
      const avg = window.reduce((sum, r) => sum + r.kwh_verified, 0) / window.length;

      rolling_avg.set(sorted[i].settlement_date, avg);
    }

    return rolling_avg;
  }

  /**
   * Predict expected production based on historical data
   * Simple moving average predictor
   */
  predictProduction(
    historical_reports: ProductionReport[],
    forecast_days: number = 7
  ): {
    date: string;
    predicted_kwh: number;
    confidence: number; // 0-1
  }[] {
    if (historical_reports.length < 7) {
      return []; // Need at least a week of data
    }

    const sorted = [...historical_reports].sort(
      (a, b) => new Date(a.settlement_date).getTime() - new Date(b.settlement_date).getTime()
    );

    // Calculate average of last 14 days
    const recent = sorted.slice(-14);
    const avg_kwh = recent.reduce((sum, r) => sum + r.kwh_verified, 0) / recent.length;

    // Calculate standard deviation for confidence
    const variance = recent.reduce(
      (sum, r) => sum + Math.pow(r.kwh_verified - avg_kwh, 2),
      0
    ) / recent.length;
    const std_dev = Math.sqrt(variance);
    const confidence = Math.max(0, 1 - (std_dev / avg_kwh)); // Lower std_dev = higher confidence

    // Generate forecasts
    const forecasts = [];
    const last_date = new Date(sorted[sorted.length - 1].settlement_date);

    for (let i = 1; i <= forecast_days; i++) {
      const forecast_date = new Date(last_date);
      forecast_date.setDate(forecast_date.getDate() + i);

      forecasts.push({
        date: forecast_date.toISOString().split('T')[0],
        predicted_kwh: avg_kwh,
        confidence
      });
    }

    return forecasts;
  }

  /**
   * Compare cluster performance against target
   */
  compareToTarget(
    actual_stats: ProductionStats,
    target_annual_kwh: number
  ): {
    on_track: boolean;
    projected_annual_kwh: number;
    vs_target_percentage: number;
    days_ahead_or_behind: number;
  } {
    const days_elapsed = actual_stats.total_days;
    const days_per_year = 365;

    // Project to annual based on current rate
    const projected_annual_kwh = (actual_stats.total_kwh / days_elapsed) * days_per_year;

    const vs_target_percentage = (projected_annual_kwh / target_annual_kwh) * 100;

    // Calculate how many days ahead/behind target pace
    const expected_at_this_point = (target_annual_kwh / days_per_year) * days_elapsed;
    const difference = actual_stats.total_kwh - expected_at_this_point;
    const days_ahead_or_behind = (difference / (target_annual_kwh / days_per_year));

    return {
      on_track: vs_target_percentage >= 95, // Within 5% is "on track"
      projected_annual_kwh,
      vs_target_percentage,
      days_ahead_or_behind
    };
  }

  /**
   * Helper: Get Monday of the ISO week
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}