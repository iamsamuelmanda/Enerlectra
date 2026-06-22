/**
 * Matching Engine
 *
 * Matches clusters with suppliers and handles overflow routing.
 * Uses deterministic scoring for repeatability.
 */
import { ClusterSnapshot } from './SnapshotEngine';
export interface Supplier {
    id: string;
    name: string;
    rating: number;
    completedProjects: number;
    minCapacityKw: number;
    maxCapacityKw: number;
    locations: string[];
    specializations: ('solar' | 'battery' | 'wind' | 'grid-tie')[];
    avgInstallDays: number;
    pricePerKw: number;
    verified: boolean;
}
export interface SupplierMatch {
    supplier: Supplier;
    matchScore: number;
    scoreBreakdown: {
        ratingScore: number;
        experienceScore: number;
        speedScore: number;
        priceScore: number;
        certificationScore: number;
    };
    reasons: string[];
    estimatedCost: number;
    estimatedDays: number;
}
export interface OverflowRecommendation {
    alternativeClusters: ClusterSnapshot[];
    routingStrategy: 'SPLIT' | 'REDIRECT' | 'QUEUE';
    explanation: string;
}
/**
 * Matching Engine
 */
export declare class MatchingEngine {
    /**
     * Match suppliers to cluster
     */
    static matchSuppliers(cluster: ClusterSnapshot, suppliers: Supplier[], capacityKw: number, location: string): SupplierMatch[];
    /**
     * Check if supplier is eligible
     */
    private static isSupplierEligible;
    /**
     * Score supplier match
     */
    private static scoreSupplier;
    private static calculateRatingScore;
    private static calculateExperienceScore;
    private static calculateSpeedScore;
    private static calculatePriceScore;
    private static generateMatchReasons;
    /**
     * Route overflow contribution
     */
    static routeOverflow(overflowUSD: number, originalCluster: ClusterSnapshot, availableClusters: ClusterSnapshot[]): OverflowRecommendation;
    private static scoreClusterMatch;
}

