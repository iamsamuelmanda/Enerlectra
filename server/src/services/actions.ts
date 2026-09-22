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

export async function createAction(
  db: SupabaseClient,
  tenant: TenantContext,
  input: CreateActionInput,
) {
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

  if (error) throw new Error(error.message);
  return data;
}

export async function authorizeAction(db: SupabaseClient, tenant: TenantContext, actionId: string) {
  const { data, error } = await db
    .from('actions')
    .update({
      status: 'AUTHORIZED',
      authorized_by_actor_id: tenant.actorId,
    })
    .eq('id', actionId)
    .eq('organization_id', tenant.organizationId)
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
  const { data, error } = await db
    .from('actions')
    .update({ status })
    .eq('id', actionId)
    .eq('organization_id', tenant.organizationId)
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

  if (error) throw new Error(error.message);
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
    .select('id,status,attempt_number,started_at,finished_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}
