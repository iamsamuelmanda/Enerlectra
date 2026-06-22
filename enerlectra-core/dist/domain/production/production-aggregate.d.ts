/**
 * Production Aggregate
 * Aggregates and analyzes production data over time
 */
import type { ProductionReport } from './production-verifier';
export interface DailyProduction {
    settlement_date: string;
    kwh_produced: number;
    kwh_verified: number;
    capacity_factor: number;
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
    month: string;
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
export declare class ProductionAggregate {
    /**
     * Calculate daily capacity factor
     * Capacity factor = actual production / theoretical maximum
     */
    calculateCapacityFactor(kwh_produced: number, rated_capacity_kw: number): number;
    /**
     * Aggregate daily production reports
     */
    aggregateDaily(reports: ProductionReport[], rated_capacity_kw: number): DailyProduction[];
    /**
     * Aggregate to weekly summaries
     */
    aggregateWeekly(daily_data: DailyProduction[]): WeeklyAggregate[];
    /**
     * Aggregate to monthly summaries
     */
    aggregateMonthly(daily_data: DailyProduction[]): MonthlyAggregate[];
    /**
     * Calculate comprehensive production statistics
     */
    calculateStats(cluster_id: string, reports: ProductionReport[], rated_capacity_kw: number): ProductionStats;
    /**
     * Calculate rolling average for anomaly detection
     */
    calculateRollingAverage(reports: ProductionReport[], window_days?: number): Map<string, number>;
    /**
     * Predict expected production based on historical data
     * Simple moving average predictor
     */
    predictProduction(historical_reports: ProductionReport[], forecast_days?: number): {
        date: string;
        predicted_kwh: number;
        confidence: number;
    }[];
    /**
     * Compare cluster performance against target
     */
    compareToTarget(actual_stats: ProductionStats, target_annual_kwh: number): {
        on_track: boolean;
        projected_annual_kwh: number;
        vs_target_percentage: number;
        days_ahead_or_behind: number;
    };
    /**
     * Helper: Get Monday of the ISO week
     */
    private getWeekStart;
}

