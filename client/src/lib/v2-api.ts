import { supabaseV2 } from './supabase-v2';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabaseV2.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error ?? 'Enerlectra API request failed');
  }

  return body;
}

export type OperationalIssueInput = {
  title: string;
  summary: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  workType: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  observationType: string;
  observationValue: Record<string, unknown>;
  source: 'WEB' | 'WHATSAPP' | 'API' | 'SYSTEM';
  customerId?: string;
  siteId?: string;
  assetId?: string;
  assignedActorId?: string;
  idempotencyKey: string;
};

export function createOperationalIssue(input: OperationalIssueInput) {
  return authorizedFetch('/api/operational-issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
