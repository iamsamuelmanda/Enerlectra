import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '../platform/tenant/context.js';
import { deriveOperationalRecommendation } from './operationalRecommendation.js';
import { recordAudit } from './audit.js';

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
 * Atomically creates the first operational slice:
 *
 * customer/system signal -> observation -> event -> situation -> work item.
 *
 * The database function owns the transaction boundary and reuses the
 * existing Work Item/Situation integrity triggers. This service deliberately
 * stops before Action authorization/execution.
 *
 * The caller must provide the authenticated server context. TenantContext is
 * the authorization boundary; organization_id is never accepted from the
 * request body.
 */
export async function createCustomerOperationalIssue(
  db: SupabaseClient,
  tenant: TenantContext,
  input: CustomerOperationalIssueInput,
): Promise<CustomerOperationalIssueResult> {
  const correlationId = input.correlationId ?? randomUUID();
  const recommendation = deriveOperationalRecommendation(tenant, input);

  const { data, error } = await db.rpc('create_customer_operational_issue', {
    p_organization_id: tenant.organizationId,
    p_actor_id: tenant.actorId,
    p_title: input.title.trim(),
    p_summary: input.summary ?? null,
    p_severity: input.severity ?? 'MEDIUM',
    p_customer_id: input.customerId ?? null,
    p_site_id: input.siteId ?? null,
    p_asset_id: input.assetId ?? null,
    p_observation_type: input.observationType ?? 'CUSTOMER_OPERATIONAL_ISSUE',
    p_observation_value: input.observationValue,
    p_source: input.source ?? 'customer_report',
    p_work_type: input.workType ?? 'INVESTIGATE',
    p_priority: input.priority ?? 'NORMAL',
    p_assigned_actor_id: input.assignedActorId ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_correlation_id: correlationId,
    p_recommendation_type: recommendation.recommendationType,
    p_recommendation_summary: recommendation.summary,
    p_recommendation_rationale: recommendation.rationale,
    p_recommendation_confidence: recommendation.confidence,
    p_recommendation_context: recommendation.contextSnapshot,
  });

  if (error) {
    throw new Error(`Failed to create customer operational issue: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.observation_id || !row?.event_id || !row?.situation_id || !row?.work_item_id) {
    throw new Error('Customer operational issue transaction returned an invalid result');
  }

  await recordAudit(db, {
    organizationId: tenant.organizationId,
    actorId: tenant.actorId,
    action: 'OPERATIONAL_ISSUE_CREATED',
    resourceType: 'SITUATION',
    resourceId: row.situation_id,
    outcome: 'SUCCESS',
    correlationId,
    metadata: {
      eventId: row.event_id,
      observationId: row.observation_id,
      workItemId: row.work_item_id,
      recommendationType: recommendation.recommendationType,
      capabilityContext: recommendation.contextSnapshot.capabilities,
    },
  });

  return {
    observationId: row.observation_id,
    eventId: row.event_id,
    situationId: row.situation_id,
    workItemId: row.work_item_id,
  };
}
