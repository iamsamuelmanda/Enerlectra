import type { TenantContext } from '../platform/tenant/context.js';
import type {
  EllieContext,
  EllieEvidence,
  EllieRecommendation,
  EllieSituation,
  EllieWorkItem,
} from '../../../../enerlectra-core/src/domain/intelligence/ellie-context.js';

type OperationalQueue = {
  situations?: Array<{
    id: string;
    status: string;
    title?: string;
    summary?: string;
    severity?: string;
    customer_id?: string | null;
    site_id?: string | null;
    asset_id?: string | null;
    opened_at?: string | null;
    updated_at?: string | null;
    workItems?: Array<{
      id: string;
      situation_id?: string | null;
      status: string;
      work_type?: string;
      title?: string;
      priority?: string;
      assigned_actor_id?: string | null;
      due_at?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      actions?: Array<{
        id: string;
        action_type: string;
        consequence_class: string;
        status: string;
        requested_by_actor_id?: string | null;
        authorized_by_actor_id?: string | null;
        requested_at?: string | null;
        authorized_at?: string | null;
        started_at?: string | null;
        completed_at?: string | null;
        attempts?: Array<{
          id: string;
          action_id: string;
          attempt_number: number;
          status: string;
          executor_type?: string | null;
          executor_actor_id?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          result_code?: string | null;
          result_summary?: string | null;
          error_code?: string | null;
          error_summary?: string | null;
        }>;
      }>;
    }>;
    recommendations?: Array<{
      id: string;
      situation_id?: string | null;
      status: string;
      recommendation_type?: string;
      summary?: string;
      rationale?: string;
      confidence?: number | null;
      created_at?: string | null;
      expires_at?: string | null;
    }>;
  }>;
};

export function buildCanonicalEllieContext(
  tenant: TenantContext,
  queue: OperationalQueue
): EllieContext {
  const situations: EllieSituation[] = [];
  const work: EllieWorkItem[] = [];
  const recommendations: EllieRecommendation[] = [];
  const evidence: EllieEvidence[] = [];

  for (const situation of queue.situations ?? []) {
    situations.push({
      id: situation.id,
      status: situation.status,
      title: situation.title,
      severity: situation.severity,
      resourceId: situation.asset_id ?? situation.site_id ?? situation.customer_id ?? undefined,
      metadata: {
        summary: situation.summary,
        customerId: situation.customer_id,
        siteId: situation.site_id,
        assetId: situation.asset_id,
        openedAt: situation.opened_at,
        updatedAt: situation.updated_at,
      },
    });

    for (const item of situation.workItems ?? []) {
      work.push({
        id: item.id,
        situationId: item.situation_id ?? situation.id,
        status: item.status,
        type: item.work_type,
        metadata: {
          title: item.title,
          priority: item.priority,
          assignedActorId: item.assigned_actor_id,
          dueAt: item.due_at,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          actions: (item.actions ?? []).map((action) => ({
            id: action.id,
            type: action.action_type,
            consequenceClass: action.consequence_class,
            status: action.status,
            requestedByActorId: action.requested_by_actor_id,
            authorizedByActorId: action.authorized_by_actor_id,
            requestedAt: action.requested_at,
            authorizedAt: action.authorized_at,
            startedAt: action.started_at,
            completedAt: action.completed_at,
            attempts: action.attempts ?? [],
          })),
        },
      });

      for (const action of item.actions ?? []) {
        for (const attempt of action.attempts ?? []) {
          evidence.push({
            id: attempt.id,
            type: 'ACTION_ATTEMPT_RESULT',
            summary: attempt.result_summary ?? attempt.error_summary ?? undefined,
            occurredAt: attempt.finished_at ?? attempt.started_at ?? undefined,
            metadata: {
              actionId: action.id,
              attemptNumber: attempt.attempt_number,
              status: attempt.status,
              executorType: attempt.executor_type,
              executorActorId: attempt.executor_actor_id,
              resultCode: attempt.result_code,
              errorCode: attempt.error_code,
            },
          });
        }
      }
    }

    for (const recommendation of situation.recommendations ?? []) {
      recommendations.push({
        id: recommendation.id,
        situationId: recommendation.situation_id ?? situation.id,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        metadata: {
          status: recommendation.status,
          recommendationType: recommendation.recommendation_type,
          confidence: recommendation.confidence,
          createdAt: recommendation.created_at,
          expiresAt: recommendation.expires_at,
        },
      });
    }
  }

  return {
    actorId: tenant.actorId,
    organizationId: tenant.organizationId,
    permissions: [...tenant.permissions],
    operatingContext: tenant.operatingContext,
    capabilities: {
      enabled: [...tenant.operatingContext.capabilities],
      configuration: tenant.operatingContext.capabilityConfiguration,
    },
    policies: tenant.operatingContext.policies,
    evidence,
    situations,
    recommendations,
    work,
    source: 'canonical',
  };
}
