import { apiGet, apiPost, apiPut } from './api';

export type OrganizationOperatingContext = {
  profileId: string;
  profileName: string;
  profileConfiguration: Record<string, unknown>;
  businessModels: string[];
  capabilities: string[];
  capabilityConfiguration: Record<string, Record<string, unknown>>;
  policies: Record<string, unknown>;
};

export type Customer = {
  id: string;
  organization_id: string;
  external_ref: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
};

export type Site = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  metadata?: Record<string, unknown>;
};

export type Asset = {
  id: string;
  organization_id: string;
  site_id: string | null;
  customer_id: string | null;
  asset_type: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  status: string;
  installed_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type OperationalAction = {
  id: string;
  work_item_id: string;
  action_type: string;
  consequence_class: string;
  status: string;
  attempts: Array<{
    id: string;
    attempt_number: number;
    status: string;
    result_code?: string | null;
    result_summary?: string | null;
  }>;
};

export type OperationalQueueItem = {
  id: string;
  situation_type: string;
  status: string;
  severity: string;
  title: string;
  summary?: string | null;
  customer_id?: string | null;
  site_id?: string | null;
  asset_id?: string | null;
  opened_at?: string | null;
  workItems: Array<{
    id: string;
    situation_id?: string | null;
    work_type: string;
    status: string;
    priority: string;
    title?: string | null;
    assigned_actor_id?: string | null;
    due_at?: string | null;
    actions: OperationalAction[];
  }>;
  recommendations: Array<{
    id: string;
    status: string;
    recommendation_type: string;
    summary: string;
    rationale?: string | null;
    confidence?: number | null;
  }>;
};

export async function getOrganizationContext() {
  return apiGet<{
    organizationId: string;
    canManage: boolean;
    permissions: string[];
    operatingContext: OrganizationOperatingContext;
  }>('/organization/context');
}

export async function updateOrganizationContext(body: {
  profileName: string;
  profileConfiguration: Record<string, unknown>;
  businessModels: string[];
  capabilities: Array<{ key: string; status: string; configuration: Record<string, unknown> }>;
  policies?: Array<{ key: string; value: Record<string, unknown> }>;
}) {
  return apiPut<{
    success: boolean;
    organizationId: string;
    operatingContext: OrganizationOperatingContext;
    permissions: string[];
  }>('/organization/context', body);
}

export async function listCustomers() {
  return apiGet<{ customers: Customer[]; organizationId: string; canWrite: boolean }>('/resources/customers');
}

export async function createCustomer(body: { name: string; externalRef?: string; phone?: string; email?: string }) {
  return apiPost<{ success: boolean; customer: Customer; organizationId: string }>('/resources/customers', body);
}

export async function listSites() {
  return apiGet<{ sites: Site[]; organizationId: string; canWrite: boolean }>('/resources/sites');
}

export async function createSite(body: { name: string; customerId?: string; address?: string; latitude?: number; longitude?: number }) {
  return apiPost<{ success: boolean; site: Site; organizationId: string }>('/resources/sites', body);
}

export async function listAssets() {
  return apiGet<{ assets: Asset[]; organizationId: string; canWrite: boolean }>('/resources/assets');
}

export async function createAsset(body: {
  assetType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installedAt?: string;
  customerId?: string;
  siteId?: string;
}) {
  return apiPost<{ success: boolean; asset: Asset; organizationId: string }>('/resources/assets', body);
}

export async function createOperationalIssue(body: {
  title: string;
  summary?: string;
  severity: string;
  priority: string;
  workType: string;
  observationType: string;
  observationValue: Record<string, unknown>;
  source: string;
  customerId?: string;
  siteId?: string;
  assetId?: string;
  assignedActorId?: string;
  idempotencyKey?: string;
}) {
  return apiPost<{ success: boolean; situationId: string; workItemId: string; organizationId: string }>(
    '/operational-issues',
    body,
  );
}

export async function getOperationalQueue() {
  return apiGet<{
    situations: OperationalQueueItem[];
    metrics: {
      openSituations: number;
      criticalSituations: number;
      highPriorityWork: number;
      unassignedWork: number;
      overdueWork: number;
      oldestOpenAt: string | null;
    };
    organizationId: string;
    permissions: string[];
  }>('/operations/queue');
}

export async function createAction(body: {
  workItemId: string;
  actionType: string;
  consequenceClass: string;
  target?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  return apiPost<{ success: boolean; action: OperationalAction; actorId: string; organizationId: string }>(
    '/actions',
    body,
  );
}

export async function authorizeAction(id: string) {
  return apiPost<{ success: boolean; action: OperationalAction }>(`/actions/${id}/authorize`, {});
}

export async function transitionAction(id: string, status: string) {
  return apiPost<{ success: boolean; action: OperationalAction }>(`/actions/${id}/transition`, { status });
}

export async function createActionAttempt(id: string, attemptNumber: number, executionIdempotencyKey = crypto.randomUUID()) {
  return apiPost<{ success: boolean; attempt: OperationalAction['attempts'][number] }>(
    `/actions/${id}/attempts`,
    { attemptNumber, executionIdempotencyKey },
  );
}

export async function transitionActionAttempt(id: string, attemptId: string, status: string, result?: Record<string, unknown>) {
  return apiPost<{ success: boolean; attempt: OperationalAction['attempts'][number] }>(
    `/actions/${id}/attempts/${attemptId}/transition`,
    { status, result },
  );
}

export async function createVerification(body: {
  situationId?: string;
  workItemId?: string;
  actionId?: string;
  verificationType: string;
  status: string;
  result: Record<string, unknown>;
  observationId?: string;
  eventId?: string;
}) {
  return apiPost<{
    success: boolean;
    verification: {
      verification_id: string;
      situation_id?: string | null;
      verification_status: string;
      verification_type: string;
    };
  }>('/verifications', body);
}
