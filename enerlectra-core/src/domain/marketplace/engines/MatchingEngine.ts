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
export class MatchingEngine {
  /**
   * Match suppliers to cluster
   */
  static matchSuppliers(
    cluster: ClusterSnapshot,
    suppliers: Supplier[],
    capacityKw: number,
    location: string,
  ): SupplierMatch[] {
    // Filter eligible suppliers
    const eligible = suppliers.filter(s => 
      this.isSupplierEligible(s, capacityKw, location)
    );
    
    // Score each supplier
    const matches = eligible.map(supplier => 
      this.scoreSupplier(supplier, capacityKw)
    );
    
    // Sort by score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }
  
  /**
   * Check if supplier is eligible
   */
  private static isSupplierEligible(
    supplier: Supplier,
    capacityKw: number,
    location: string,
  ): boolean {
    // Check capacity range
    if (capacityKw < supplier.minCapacityKw || capacityKw > supplier.maxCapacityKw) {
      return false;
    }
    
    // Check location
    if (!supplier.locations.includes(location)) {
      return false;
    }
    
    // Check verification
    if (!supplier.verified) {
      return false;
    }
    
    // Check minimum rating
    if (supplier.rating < 4.0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Score supplier match
   */
  private static scoreSupplier(
    supplier: Supplier,
    capacityKw: number,
  ): SupplierMatch {
    const scoreBreakdown = {
      ratingScore: this.calculateRatingScore(supplier.rating),
      experienceScore: this.calculateExperienceScore(supplier.completedProjects),
      speedScore: this.calculateSpeedScore(supplier.avgInstallDays),
      priceScore: this.calculatePriceScore(supplier.pricePerKw),
      certificationScore: supplier.verified ? 10 : 0,
    };
    
    const matchScore = Object.values(scoreBreakdown).reduce((sum, val) => sum + val, 0);
    
    const reasons = this.generateMatchReasons(supplier, scoreBreakdown);
    
    const estimatedCost = capacityKw * supplier.pricePerKw;
    const estimatedDays = supplier.avgInstallDays;
    
    return {
      supplier,
      matchScore,
      scoreBreakdown,
      reasons,
      estimatedCost,
      estimatedDays,
    };
  }
  
  private static calculateRatingScore(rating: number): number {
    return ((rating - 4.0) / 1.0) * 30;
  }
  
  private static calculateExperienceScore(projects: number): number {
    return Math.min(projects / 50, 1) * 25;
  }
  
  private static calculateSpeedScore(days: number): number {
    return ((40 - Math.min(days, 40)) / 40) * 20;
  }
  
  private static calculatePriceScore(pricePerKw: number): number {
    const avgPrice = 1200;
    return ((avgPrice - pricePerKw) / avgPrice) * 15 + 7.5;
  }
  
  private static generateMatchReasons(
    supplier: Supplier,
    scores: SupplierMatch['scoreBreakdown'],
  ): string[] {
    const reasons: string[] = [];
    
    if (scores.ratingScore > 20) {
      reasons.push(`⭐ Excellent rating: ${supplier.rating}/5.0`);
    }
    
    if (scores.experienceScore > 15) {
      reasons.push(`✅ Experienced: ${supplier.completedProjects} projects`);
    }
    
    if (scores.speedScore > 12) {
      reasons.push(`⚡ Fast installation: ${supplier.avgInstallDays} days avg`);
    }
    
    if (scores.priceScore > 10) {
      reasons.push(`💰 Competitive pricing: $${supplier.pricePerKw}/kW`);
    }
    
    if (supplier.verified) {
      reasons.push(`🏆 Verified supplier`);
    }
    
    return reasons;
  }
  
  /**
   * Route overflow contribution
   */
  static routeOverflow(
    overflowUSD: number,
    originalCluster: ClusterSnapshot,
    availableClusters: ClusterSnapshot[],
  ): OverflowRecommendation {
    // Filter suitable clusters
    const suitable = availableClusters.filter(c => 
      c.id !== originalCluster.clusterId &&
      c.lifecycleState === 'FUNDING' &&
      (c.targetUSD - c.currentUSD) >= overflowUSD
    );
    
    if (suitable.length === 0) {
      return {
        alternativeClusters: [],
        routingStrategy: 'QUEUE',
        explanation: 'No suitable clusters available. Contribution will be queued for next cluster.',
      };
    }
    
    // Sort by best match
    const scored = suitable.map(cluster => ({
      cluster,
      score: this.scoreClusterMatch(cluster, originalCluster, overflowUSD),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return {
      alternativeClusters: scored.slice(0, 3).map(s => s.cluster),
      routingStrategy: 'REDIRECT',
      explanation: `Recommended clusters based on location, size, and funding progress.`,
    };
  }
  
  private static scoreClusterMatch(
    cluster: ClusterSnapshot,
    original: ClusterSnapshot,
    amountUSD: number,
  ): number {
    let score = 0;
    
    // Prefer clusters in same location
    // (assuming clusters have location metadata)
    // score += 30 if same location
    
    // Prefer clusters with similar progress
    const progressDiff = Math.abs(cluster.fundingPct - original.fundingPct);
    score += (100 - progressDiff) / 100 * 20;
    
    // Prefer clusters close to funding
    if (cluster.fundingPct >= 70) {
      score += 25;
    }
    
    return score;
  }
}