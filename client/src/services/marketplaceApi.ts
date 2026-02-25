/**
 * Marketplace API Service
 * Calls backend API for marketplace operations
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
   // For cookie-based auth
});

// Request interceptor (add auth token if needed)
api.interceptors.request.use((config) => {
  // Add any auth headers here if needed
  return config;
});

// Response interceptor (handle errors globally)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export interface ContributionValidation {
  allowed: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: {
    projectedOwnershipPct?: number;
    maxAllowedUSD?: number;
    overflowUSD?: number;
    currentClass?: string;
    nextClass?: string;
  };
}

export interface Contribution {
  id: string;
  userId: string;
  clusterId: string;
  amountUSD: number;
  amountZMW: number;
  pcus: number;
  status: string;
  projectedOwnershipPct: number;
  createdAt: string;
}

export interface ClusterParticipant {
  userId: string;
  userName: string;
  pcus: number;
  ownershipPct: number;
  kwhPerMonth: number;
  contributionCount: number;
  firstContributionAt: string;
}

export const marketplaceApi = {
  // Exchange rate
  async getExchangeRate(): Promise<number> {
    try {
      const response = await api.get('/exchange-rate/USD/ZMW');
      return response.data.rate || 27.5;
    } catch (error) {
      console.warn('Using fallback exchange rate:', 27.5);
      return 27.5;
    }
  },

  // Validate contribution
  async validateContribution(data: {
    userId: string;
    clusterId: string;
    amountUSD: number;
  }): Promise<ContributionValidation> {
    const response = await api.post('/contributions/validate', data);
    return response.data.data;
  },

  // Create contribution
  async createContribution(data: {
    userId: string;
    clusterId: string;
    amountUSD: number;
    paymentMethod: string;
  }): Promise<Contribution> {
    const response = await api.post('/contributions', data);
    return response.data.data;
  },

  // Get user contributions
  async getUserContributions(userId: string): Promise<Contribution[]> {
    const response = await api.get(`/contributions?userId=${userId}`);
    return response.data.data || [];
  },

  // Get cluster contributions
  async getClusterContributions(clusterId: string): Promise<Contribution[]> {
    const response = await api.get(`/contributions?clusterId=${clusterId}`);
    return response.data.data || [];
  },

  // Get cluster participants
  async getClusterParticipants(clusterId: string): Promise<ClusterParticipant[]> {
    const response = await api.get(`/clusters/${clusterId}/participants`);
    return response.data.data || [];
  },

  // Get clusters (from backend if needed, otherwise use Supabase)
  async getClusters() {
    const response = await api.get('/clusters');
    return response.data.data || [];
  },
};

export default api;
