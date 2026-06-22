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
    max_daily_kwh: number;
    expected_daily_kwh: number;
}
export declare class ProductionVerifier {
    /**
     * Verify a production report
     * Checks for anomalies, validates ranges, ensures data integrity
     */
    verify(report: ProductionReport, capacity: ClusterCapacity, historical_avg?: number): ProductionValidationResult;
    /**
     * Auto-verify production report with confidence score
     * Returns verified kWh if confidence is high, otherwise flags for manual review
     */
    autoVerify(report: ProductionReport, capacity: ClusterCapacity, historical_avg?: number, confidence_threshold?: number): {
        auto_approved: boolean;
        verified_kwh: number;
        confidence: number;
        requires_manual_review: boolean;
        reason?: string;
    };
    /**
     * Detect anomalies in a series of production reports
     * Useful for catching systematic issues or fraud
     */
    detectAnomalies(reports: ProductionReport[], capacity: ClusterCapacity): {
        suspicious_patterns: string[];
        anomaly_score: number;
    };
}

