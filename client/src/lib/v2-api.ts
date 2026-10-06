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
    const error = new Error(body?.error ?? 'Enerlectra API request failed') as Error & { code?: string; permission?: string };
    error.code = body?.code;
    error.permission = body?.permission;
    throw error;
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

export type ActionAttempt = {
  id: string;
  action_id: string;
  attempt_number: number;
  status: string;
  executor_type: string;
  executor_actor_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_code: string | null;
  result_summary: string | null;
  error_code: string | null;
  error_summary: string | null;
  created_at: string;
};

export type OperationalAction = {
  id: string;
  work_item_id: string;
  action_type: string;
  consequence_class: string;
  status: string;
  requested_by_actor_id: string;
  authorized_by_actor_id: string | null;
  requested_at: string;
  authorized_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  attempts: ActionAttempt[];
};

export type OperationalQueueItem = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  severity: string;
  priority?: string;
  customer_id: string | null;
  site_id: string | null;
  asset_id: string | null;
  opened_at: string;
  updated_at: string;
  workItems: Array<{
    id: string;
    work_type: string;
    status: string;
    priority: string;
    title: string;
    assigned_actor_id: string | null;
    due_at: string | null;
    actions: OperationalAction[];
  }>;
  recommendations: Array<{
    id: string;
    status: string;
    recommendation_type: string;
    summary: string;
    rationale: string | null;
    confidence: number | null;
  }>;
};

export type OperationalQueueMetrics = {
  openSituations: number;
  criticalSituations: number;
  highPriorityWork: number;
  unassignedWork: number;
  overdueWork: number;
  oldestOpenAt: string | null;
};

export async function getOperationalQueue(): Promise<{
  situations: OperationalQueueItem[];
  metrics: OperationalQueueMetrics;
  organizationId: string;
  permissions: string[];
}> {
  return authorizedFetch('/api/operations/queue');
}

export function createAction(input: {
  workItemId: string;
  actionType: string;
  consequenceClass: 'OBSERVATIONAL' | 'COMMUNICATION' | 'OPERATIONAL' | 'FINANCIAL' | 'PHYSICAL' | 'EXTERNAL_SYSTEM';
  target?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return authorizedFetch('/api/actions', {
    method: 'POST',
    body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
  });
}

export function authorizeAction(actionId: string) {
  return authorizedFetch(`/api/actions/${actionId}/authorize`, { method: 'POST', body: JSON.stringify({}) });
}

export function transitionAction(actionId: string, status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'EXECUTION_UNKNOWN' | 'CANCELLED') {
  return authorizedFetch(`/api/actions/${actionId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function createActionAttempt(actionId: string, attemptNumber: number) {
  return authorizedFetch(`/api/actions/${actionId}/attempts`, {
    method: 'POST',
    body: JSON.stringify({
      attemptNumber,
      executionIdempotencyKey: crypto.randomUUID(),
    }),
  });
}

export function transitionActionAttempt(
  actionId: string,
  attemptId: string,
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'EXECUTION_UNKNOWN' | 'CANCELLED',
  result?: Record<string, unknown>,
) {
  return authorizedFetch(`/api/actions/${actionId}/attempts/${attemptId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status, result }),
  });
}

export async function createVerification(input: {
  situationId?: string;
  workItemId?: string;
  actionId?: string;
  verificationType: string;
  status: 'VERIFIED' | 'PARTIAL' | 'FAILED' | 'REOPENED';
  result: Record<string, unknown>;
  observationId?: string;
  eventId?: string;
}) {
  return authorizedFetch('/api/verifications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type OrganizationOperatingContext = {
  profileId: string | null;
  profileName: string | null;
  profileConfiguration: Record<string, unknown>;
  businessModels: string[];
  capabilities: string[];
  capabilityConfiguration: Record<string, Record<string, unknown>>;
  policies: Record<string, unknown>;
};

export async function getOrganizationContext(): Promise<{
  organizationId: string;
  canManage: boolean;
  permissions: string[];
  operatingContext: OrganizationOperatingContext;
}> {
  return authorizedFetch('/api/organization/context');
}

export async function updateOrganizationContext(input: {
  profileName?: string;
  profileConfiguration?: Record<string, unknown>;
  businessModels?: string[];
  capabilities?: Array<{
    key: string;
    status?: 'ENABLED' | 'DISABLED' | 'CONFIGURED';
    configuration?: Record<string, unknown>;
  }>;
  policies?: Array<{ key: string; value: Record<string, unknown> }>;
}) {
  return authorizedFetch('/api/organization/context', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export type Customer = {
  id: string;
  organization_id: string;
  name: string;
  external_ref: string | null;
  phone: string | null;
  email: string | null;
  status: string;
};

export type Site = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  name: string;
  address: string | null;
  status: string;
};

export type Asset = {
  id: string;
  organization_id: string;
  site_id: string | null;
  customer_id: string | null;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
};

export async function listCustomers() { return authorizedFetch('/api/resources/customers'); }
export async function listSites() { return authorizedFetch('/api/resources/sites'); }
export async function listAssets() { return authorizedFetch('/api/resources/assets'); }
export async function createCustomer(input: { name: string; externalRef?: string; phone?: string; email?: string }) {
  return authorizedFetch('/api/resources/customers', { method: 'POST', body: JSON.stringify(input) });
}
export async function createSite(input: { name: string; customerId?: string; address?: string }) {
  return authorizedFetch('/api/resources/sites', { method: 'POST', body: JSON.stringify(input) });
}
export async function createAsset(input: { assetType: string; customerId?: string; siteId?: string; manufacturer?: string; model?: string; serialNumber?: string }) {
  return authorizedFetch('/api/resources/assets', { method: 'POST', body: JSON.stringify(input) });
}
