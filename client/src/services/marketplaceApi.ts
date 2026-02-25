import axios from 'axios';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com/api/v1';
const api = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } });
api.interceptors.response.use(r => r, error => { console.error('API Error:', error.response?.data || error.message); return Promise.reject(error); });
export interface ContributionValidation { allowed: boolean; errorCode?: string; errorMessage?: string; details?: { projectedOwnershipPct?: number; maxAllowedUSD?: number; }; }
export interface Contribution { id: string; userId: string; clusterId: string; amountUSD: number; amountZMW: number; pcus: number; status: string; projectedOwnershipPct: number; createdAt: string; }
export interface ClusterParticipant { userId: string; userName: string; pcus: number; ownershipPct: number; kwhPerMonth: number; contributionCount: number; firstContributionAt: string; }
export const marketplaceApi = {
  async getExchangeRate(): Promise<number> { try { const r = await api.get('/exchange-rate/USD/ZMW'); return r.data.rate || 27.5; } catch { return 27.5; } },
  async validateContribution(data: { userId: string; clusterId: string; amountUSD: number; }): Promise<ContributionValidation> { const r = await api.post('/contributions/validate', data); return r.data.data; },
  async createContribution(data: { userId: string; clusterId: string; amountUSD: number; paymentMethod: string; }): Promise<Contribution> { const r = await api.post(`/clusters/${data.clusterId}/join`, { userId: data.userId, pcus: data.amountUSD * 100 }); return r.data.data; },
  async getUserContributions(userId: string): Promise<Contribution[]> { const r = await api.get(`/contributions?userId=${userId}`); return r.data.data || []; },
  async getClusterContributions(clusterId: string): Promise<Contribution[]> { const r = await api.get(`/contributions?clusterId=${clusterId}`); return r.data.data || []; },
  async getClusterParticipants(clusterId: string): Promise<ClusterParticipant[]> { const r = await api.get(`/clusters/${clusterId}/participants`); return r.data.data?.participants ?? r.data.data ?? []; },
  async getClusters() { const r = await api.get('/clusters'); return r.data.data?.clusters ?? r.data.data ?? r.data ?? []; },
};
export default api;
