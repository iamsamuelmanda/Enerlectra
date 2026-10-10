import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '../platform/tenant/context.js';

export type CreateActionInput = {
  workItemId: string;
  actionType: string;
  consequenceClass:
    | 'OBSERVATIONAL'
    | 'COMMUNICATION'
    | 'OPERATIONAL'
    | 'FINANCIAL'
    | 'PHYSICAL'
    | 'EXTERNAL_SYSTEM';
  target?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

const ACTION_TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const ACTION_TRANSITIONS: Record<string, readonly string[]> = {
  PROPOSED: ['AUTHORIZED', 'CANCELLED'],
  AUTHORIZED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['SUCCEEDED', 'FAILED', 'EXECUTION_UNKNOWN', 'CANCELLED'],
  EXECUTION_UNKNOWN: ['EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
};

const ATTEMPT_TRANSITIONS: Record<string, readonly string[]> = {
  CREATED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['SUCCEEDED', 'FAILED', 'EXECUTION_UNKNOWN', 'CANCELLED'],
  EXECUTION_UNKNOWN: ['EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
};

async function loadTenantWorkItem(db: SupabaseClient, tenant: TenantContext, workItemId: string) {
  const { data, error } = await db
    .from('work_items')
    .select('id,organization_id,status,assigned_actor_id')
    .eq('id', workItemId)
    .eq('organization_id', tenant.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('WORK_ITEM_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
    throw new Error('WORK_ITEM_TERMINAL');
  }
  if (data.assigned_actor_id && data.assigned_actor_id !== tenant.actorId) {
    throw new Error('WORK_ITEM_RESPONSIBILITY_SCOPE_REQUIRED');
  }
  return data;
}

async function loadTenantAction(db: SupabaseClient, tenant: TenantContext, actionId: string) {
  const { data, error } = await db
    .from('actions')
    .select('id,organization_id,work_item_id,status,requested_by_actor_id,authorized_by_actor_id,consequence_class')
    .eq('id', actionId)
    .eq('organization_id', tenant.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('ACTION_NOT_FOUND');
  return data;
}

export async function createAction(
  db: SupabaseClient,
  tenant: TenantContext,
  input: CreateActionInput,
) {
  await loadTenantWorkItem(db, tenant, input.workItemId);

  const { data, error } = await db
    .from('actions')
    .insert({
      organization_id: tenant.organizationId,
      work_item_id: input.workItemId,
      action_type: input.actionType.trim(),
      consequence_class: input.consequenceClass,
      requested_by_actor_id: tenant.actorId,
      target: input.target ?? {},
      metadata: input.metadata ?? {},
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('id,status,organization_id,work_item_id,requested_by_actor_id,created_at')
    .single();

  if (error) {
    if (error.code === '23505' && input.idempotencyKey) {
      const existing = await db
        .from('actions')
        .select('id,status,organization_id,work_item_id,requested_by_actor_id,created_at')
        .eq('organization_id', tenant.organizationId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      if (existing.error || !existing.data) throw new Error(error.message);
      return existing.data;
    }
    throw new Error(error.message);
  }
  return data;
}

export async function authorizeAction(db: SupabaseClient, tenant: TenantContext, actionId: string) {
  const action = await loadTenantAction(db, tenant, actionId);
  if (action.status !== 'PROPOSED') throw new Error('ACTION_NOT_AUTHORIZABLE');

  const { data, error } = await db
    .from('actions')
    .update({
      status: 'AUTHORIZED',
      authorized_by_actor_id: tenant.actorId,
    })
    .eq('id', actionId)
    .eq('organization_id', tenant.organizationId)
    .eq('status', 'PROPOSED')
    .select('id,status,authorized_by_actor_id,authorized_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function transitionAction(
  db: SupabaseClient,
  tenant: TenantContext,
  actionId: string,
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'EXECUTION_UNKNOWN' | 'CANCELLED',
) {
  const action = await loadTenantAction(db, tenant, actionId);
  if (ACTION_TERMINAL.has(action.status)) throw new Error('ACTION_TERMINAL_IMMUTABLE');
  if (!ACTION_TRANSITIONS[action.status]?.includes(status)) {
    throw new Error('INVALID_ACTION_TRANSITION');
  }

  const { data, error } = await db
    .from('actions')
    .update({ status })
    .eq('id', actionId)
    .eq('organization_id', tenant.organizationId)
    .eq('status', action.status)
    .select('id,status,started_at,completed_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export type CreateAttemptInput = {
  actionId: string;
  attemptNumber: number;
  executionIdempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export async function createHumanAttempt(
  db: SupabaseClient,
  tenant: TenantContext,
  input: CreateAttemptInput,
) {
  const action = await loadTenantAction(db, tenant, input.actionId);
  if (!['AUTHORIZED', 'EXECUTING', 'EXECUTION_UNKNOWN'].includes(action.status)) {
    throw new Error('ACTION_NOT_EXECUTABLE');
  }

  const { data, error } = await db
    .from('action_attempts')
    .insert({
      organization_id: tenant.organizationId,
      action_id: input.actionId,
      attempt_number: input.attemptNumber,
      status: 'CREATED',
      executor_type: 'HUMAN',
      executor_actor_id: tenant.actorId,
      execution_idempotency_key: input.executionIdempotencyKey,
      metadata: input.metadata ?? {},
    })
    .select('id,status,attempt_number,executor_type,executor_actor_id,created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await db
        .from('action_attempts')
        .select('id,status,attempt_number,executor_type,executor_actor_id,created_at')
        .eq('organization_id', tenant.organizationId)
        .eq('action_id', input.actionId)
        .eq('execution_idempotency_key', input.executionIdempotencyKey)
        .maybeSingle();
      if (existing.error || !existing.data) throw new Error(error.message);
      return existing.data;
    }
    throw new Error(error.message);
  }
  return data;
}

export async function transitionAttempt(
  db: SupabaseClient,
  tenant: TenantContext,
  attemptId: string,
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'EXECUTION_UNKNOWN' | 'CANCELLED',
  result?: {
    resultCode?: string;
    resultSummary?: string;
    errorCode?: string;
    errorSummary?: string;
  },
) {
  const { data: attempt, error: loadError } = await db
    .from('action_attempts')
    .select('id,organization_id,action_id,status,executor_actor_id')
    .eq('id', attemptId)
    .eq('organization_id', tenant.organizationId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!attempt) throw new Error('ATTEMPT_NOT_FOUND');
  if (attempt.executor_actor_id && attempt.executor_actor_id !== tenant.actorId) {
    throw new Error('HUMAN_EXECUTOR_MUST_BE_CURRENT_ACTOR');
  }
  if (!ATTEMPT_TRANSITIONS[attempt.status]?.includes(status)) {
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(attempt.status)) {
      throw new Error('ATTEMPT_TERMINAL_IMMUTABLE');
    }
    throw new Error('INVALID_ATTEMPT_TRANSITION');
  }

  const { data, error } = await db
    .from('action_attempts')
    .update({
      status,
      ...(result?.resultCode !== undefined ? { result_code: result.resultCode } : {}),
      ...(result?.resultSummary !== undefined ? { result_summary: result.resultSummary } : {}),
      ...(result?.errorCode !== undefined ? { error_code: result.errorCode } : {}),
      ...(result?.errorSummary !== undefined ? { error_summary: result.errorSummary } : {}),
    })
    .eq('id', attemptId)
    .eq('organization_id', tenant.organizationId)
    .eq('status', attempt.status)
    .select('id,status,attempt_number,started_at,finished_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}
