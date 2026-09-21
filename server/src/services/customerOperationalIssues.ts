import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '../platform/tenant/context.js';

export type CustomerOperationalIssueInput = {
  title: string;
  summary?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  customerId?: string;
  siteId?: string;
  assetId?: string;
  observationType?: string;
  observationValue: Record<string, unknown>;
  source?: string;
  workType?: 'INVESTIGATE' | 'CONTACT_CUSTOMER' | 'VISIT_SITE' | 'RECONCILE_PAYMENT' | 'ESCALATE_EXTERNAL';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignedActorId?: string;
  idempotencyKey?: string;
  correlationId?: string;
};

export type CustomerOperationalIssueResult = {
  observationId: string;
  eventId: string;
  situationId: string;
  workItemId: string;
};

/**
 * Creates the first operational slice:
 *
 * customer/system signal -> observation -> event -> situation -> work item.
 *
 * This service deliberately stops before Action authorization/execution.
 * Consequential actions remain behind the existing Action contract.
 *
 * The caller must provide an authenticated Supabase client scoped to the
 * requesting actor. TenantContext is used as the authorization boundary;
 * organization_id is never accepted from the request body.
 */
export async function createCustomerOperationalIssue(
  db: SupabaseClient,
  tenant: TenantContext,
  input: CustomerOperationalIssueInput,
): Promise<CustomerOperationalIssueResult> {
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const source = input.source ?? 'customer_report';
  const observationType = input.observationType ?? 'CUSTOMER_OPERATIONAL_ISSUE';
  const severity = input.severity ?? 'MEDIUM';
  const priority = input.priority ?? 'NORMAL';
  const workType = input.workType ?? 'INVESTIGATE';

  const observation = await db
    .from('observations')
    .insert({
      organization_id: tenant.organizationId,
      actor_id: tenant.actorId,
      source,
      observation_type: observationType,
      observed_at: now,
      received_at: now,
      customer_id: input.customerId ?? null,
      site_id: input.siteId ?? null,
      asset_id: input.assetId ?? null,
      value: input.observationValue,
      provenance: {
        kind: 'customer_operational_issue',
        actor_id: tenant.actorId,
        source,
        verified: false,
      },
      correlation_id: correlationId,
    })
    .select('id')
    .single();

  if (observation.error || !observation.data) {
    throw new Error(`Failed to record operational issue evidence: ${observation.error?.message ?? 'unknown error'}`);
  }

  const event = await db
    .from('events')
    .insert({
      organization_id: tenant.organizationId,
      actor_id: tenant.actorId,
      event_type: 'CUSTOMER_OPERATIONAL_ISSUE_REPORTED',
      occurred_at: now,
      recorded_at: now,
      source,
      customer_id: input.customerId ?? null,
      site_id: input.siteId ?? null,
      asset_id: input.assetId ?? null,
      source_observation_id: observation.data.id,
      payload: {
        title: input.title,
        summary: input.summary ?? null,
      },
      provenance: {
        kind: 'observation_derived',
        observation_id: observation.data.id,
      },
      correlation_id: correlationId,
    })
    .select('id')
    .single();

  if (event.error || !event.data) {
    throw new Error(`Failed to record operational issue event: ${event.error?.message ?? 'unknown error'}`);
  }

  const situation = await db
    .from('situations')
    .insert({
      organization_id: tenant.organizationId,
      situation_type: 'CUSTOMER_OPERATIONAL_ISSUE',
      status: 'OPEN',
      severity,
      title: input.title,
      summary: input.summary ?? null,
      customer_id: input.customerId ?? null,
      site_id: input.siteId ?? null,
      asset_id: input.assetId ?? null,
      opened_at: now,
      last_observed_at: now,
      metadata: {
        source_event_id: event.data.id,
        source_observation_id: observation.data.id,
        evidence_verified: false,
      },
    })
    .select('id')
    .single();

  if (situation.error || !situation.data) {
    throw new Error(`Failed to create operational situation: ${situation.error?.message ?? 'unknown error'}`);
  }

  const work = await db
    .from('work_items')
    .insert({
      organization_id: tenant.organizationId,
      situation_id: situation.data.id,
      work_type: workType,
      status: input.assignedActorId ? 'ASSIGNED' : 'OPEN',
      priority,
      title: input.title,
      description: input.summary ?? null,
      customer_id: input.customerId ?? null,
      site_id: input.siteId ?? null,
      asset_id: input.assetId ?? null,
      assigned_actor_id: input.assignedActorId ?? null,
      assigned_at: input.assignedActorId ? now : null,
      created_by_actor_id: tenant.actorId,
      correlation_id: correlationId,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('id')
    .single();

  if (work.error || !work.data) {
    throw new Error(`Failed to create operational work item: ${work.error?.message ?? 'unknown error'}`);
  }

  return {
    observationId: observation.data.id,
    eventId: event.data.id,
    situationId: situation.data.id,
    workItemId: work.data.id,
  };
}
