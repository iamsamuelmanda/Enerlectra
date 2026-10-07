import crypto from 'node:crypto';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { askEllieStructured } from 'enerlectra-core/src/ai/ellie.js';
import type { EllieOperationalDigest } from 'enerlectra-core/src/domain/intelligence/ellie-context.js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';
import { buildCanonicalEllieContext } from '../platform/intelligence/ellie-context-builder.js';
import { loadOrganizationSnapshot } from '../platform/intelligence/organization-snapshot.js';
import {
  loadTenantEllieMemories,
  recordEllieLearningEvent,
  recordEllieCounterEvidence,
  reinforceTenantMemory,
  promoteTenantMemoryToPattern,
} from '../platform/intelligence/ellie-learning.js';

function bearer(req: any): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function loadQueue(db: SupabaseClient, organizationId: string) {
  const { data: situations, error } = await db
    .from('situations')
    .select('id,organization_id,situation_type,status,severity,title,summary,customer_id,site_id,asset_id,opened_at,resolved_at,updated_at')
    .eq('organization_id', organizationId)
    .in('status', ['OPEN', 'INVESTIGATING'])
    .order('opened_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const ids = (situations ?? []).map((s: any) => s.id);
  if (!ids.length) return { situations: [] };

  const [{ data: work, error: workError }, { data: recommendations, error: recError }] = await Promise.all([
    db.from('work_items')
      .select('id,situation_id,work_type,status,priority,title,assigned_actor_id,due_at,created_at,updated_at')
      .eq('organization_id', organizationId).in('situation_id', ids),
    db.from('recommendations')
      .select('id,situation_id,status,recommendation_type,summary,rationale,confidence,created_at,expires_at')
      .eq('organization_id', organizationId).in('situation_id', ids),
  ]);
  if (workError) throw workError;
  if (recError) throw recError;

  const workIds = (work ?? []).map((item: any) => item.id);
  const { data: actions, error: actionsError } = workIds.length
    ? await db.from('actions')
        .select('id,work_item_id,action_type,consequence_class,status,requested_by_actor_id,authorized_by_actor_id,requested_at,authorized_at,started_at,completed_at,created_at,updated_at')
        .eq('organization_id', organizationId).in('work_item_id', workIds)
    : { data: [], error: null };
  if (actionsError) throw actionsError;

  const actionIds = (actions ?? []).map((a: any) => a.id);
  const { data: attempts, error: attemptsError } = actionIds.length
    ? await db.from('action_attempts')
        .select('id,action_id,attempt_number,status,executor_type,executor_actor_id,started_at,finished_at,result_code,result_summary,error_code,error_summary')
        .eq('organization_id', organizationId).in('action_id', actionIds)
    : { data: [], error: null };
  if (attemptsError) throw attemptsError;

  return {
    situations: (situations ?? []).map((s: any) => ({
      ...s,
      workItems: (work ?? []).filter((w: any) => w.situation_id === s.id).map((w: any) => ({
        ...w,
        actions: (actions ?? []).filter((a: any) => a.work_item_id === w.id).map((a: any) => ({
          ...a,
          attempts: (attempts ?? []).filter((attempt: any) => attempt.action_id === a.id),
        })),
      })),
      recommendations: (recommendations ?? []).filter((r: any) => r.situation_id === s.id),
    })),
  };
}

async function loadOperationalDigest(
  db: SupabaseClient,
  organizationId: string,
  permissions: readonly string[],
): Promise<EllieOperationalDigest> {
  const can = (permission: string) => permissions.includes(permission);
  const [customers, sites, assets, situations, attempts] = await Promise.all([
    can('customer.read')
      ? db.from('customers')
          .select('id,external_ref,name,status,metadata,created_at,updated_at')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    can('site.read')
      ? db.from('sites')
          .select('id,customer_id,name,address,status,metadata,created_at,updated_at')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    can('asset.read')
      ? db.from('assets')
          .select('id,site_id,customer_id,asset_type,manufacturer,model,status,installed_at,metadata,created_at,updated_at')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(75)
      : Promise.resolve({ data: [], error: null }),
    can('situation.read')
      ? db.from('situations')
          .select('id,situation_type,status,severity,title,summary,customer_id,site_id,asset_id,opened_at,updated_at')
          .eq('organization_id', organizationId)
          .in('status', ['OPEN','INVESTIGATING'])
          .order('updated_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    can('work.read')
      ? db.from('action_attempts')
          .select('id,action_id,attempt_number,status,executor_type,executor_actor_id,started_at,finished_at,result_code,result_summary,error_code,error_summary')
          .eq('organization_id', organizationId)
          .order('finished_at', { ascending: false, nullsFirst: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customers.error) throw customers.error;
  if (sites.error) throw sites.error;
  if (assets.error) throw assets.error;
  if (situations.error) throw situations.error;
  if (attempts.error) throw attempts.error;

  const activeExceptions = (situations.data ?? []).map((s: any) => ({
    id: s.id,
    type: s.situation_type,
    status: s.status,
    title: s.title,
    severity: s.severity,
    resourceId: s.asset_id ?? s.site_id ?? s.customer_id ?? undefined,
    metadata: {
      summary: s.summary,
      customerId: s.customer_id,
      siteId: s.site_id,
      assetId: s.asset_id,
      openedAt: s.opened_at,
      updatedAt: s.updated_at,
    },
  }));

  const recentEvidence = (attempts.data ?? []).map((a: any) => ({
    id: a.id,
    type: 'ACTION_ATTEMPT_RESULT',
    summary: a.result_summary ?? a.error_summary ?? undefined,
    occurredAt: a.finished_at ?? a.started_at ?? undefined,
    metadata: {
      actionId: a.action_id,
      attemptNumber: a.attempt_number,
      status: a.status,
      executorType: a.executor_type,
      executorActorId: a.executor_actor_id,
      resultCode: a.result_code,
      errorCode: a.error_code,
    },
  }));

  return {
    customers: customers.data ?? [],
    sites: sites.data ?? [],
    assets: assets.data ?? [],
    activeExceptions,
    recentEvidence,
    operationalHistory: recentEvidence,
    availableResourceTypes: [
      ...(can('customer.read') ? ['CUSTOMER'] : []),
      ...(can('site.read') ? ['SITE'] : []),
      ...(can('asset.read') ? ['ASSET'] : []),
      'SITUATION',
      'WORK',
      'ACTION',
      'VERIFICATION',
    ],
  };
}

function validateInferenceAgainstContext(
  inference: Awaited<ReturnType<typeof askEllieStructured>>,
  context: ReturnType<typeof buildCanonicalEllieContext>,
) {
  const validEvidenceIds = new Set<string>([
    ...context.evidence.map((item) => item.id),
    ...context.situations.map((item) => item.id),
    ...context.memories.map((item) => item.id),
  ]);
  const invalidEvidence = inference.evidenceUsed.filter((id) => !validEvidenceIds.has(id));
  if (invalidEvidence.length) throw new Error('ELLIE_EVIDENCE_REFERENCE_INVALID');

  if (inference.targetSituationId && !context.situations.some((s) => s.id === inference.targetSituationId)) {
    throw new Error('ELLIE_TARGET_SITUATION_INVALID');
  }

  if (inference.summary.length < 1 || inference.summary.length > 2000 ||
      inference.rationale.length < 1 || inference.rationale.length > 4000) {
    throw new Error('ELLIE_INFERENCE_TEXT_INVALID');
  }

  if (inference.proposedWorkType && inference.proposedWorkType.length > 120) {
    throw new Error('ELLIE_WORK_TYPE_INVALID');
  }

  if (inference.learningSignal && inference.learningSignal.length > 2000) {
    throw new Error('ELLIE_LEARNING_SIGNAL_INVALID');
  }

  if (inference.learningSignal && !inference.targetSituationId) {
    throw new Error('ELLIE_LEARNING_TARGET_REQUIRED');
  }

  const validResourceIds = new Set<string>([
    ...context.situations.flatMap((s) => s.resourceId ? [s.resourceId] : []),
    ...context.evidence.flatMap((e) => e.resourceId ? [e.resourceId] : []),
    ...context.memories.flatMap((m) => m.resourceRefs.map(String)),
    ...(context.operationalDigest?.customers ?? []).map((r) => String(r.id)),
    ...(context.operationalDigest?.sites ?? []).map((r) => String(r.id)),
    ...(context.operationalDigest?.assets ?? []).map((r) => String(r.id)),
  ]);
  const invalidResources = inference.targetResourceIds.filter((id) => !validResourceIds.has(id));
  if (invalidResources.length) throw new Error('ELLIE_TARGET_RESOURCE_INVALID');
}

export function createEllieRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

  router.get('/ellie/brief', async (req: any, res) => {
    try {
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });

      if (!tenant.permissions.includes('recommendation.read')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION' });
      }

      const [queue, snapshot] = await Promise.all([
        loadQueue(db, tenant.organizationId),
        loadOrganizationSnapshot(db, tenant.organizationId),
      ]);

      const situations = (queue.situations ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        severity: s.severity,
        status: s.status,
        customerId: s.customer_id ?? null,
        siteId: s.site_id ?? null,
        assetId: s.asset_id ?? null,
        openedAt: s.opened_at ?? null,
        workItemCount: (s.workItems ?? []).length,
        unassignedWorkItemCount: (s.workItems ?? []).filter((w: any) => !w.assigned_actor_id).length,
        overdueWorkItemCount: (s.workItems ?? []).filter((w: any) =>
          w.due_at && new Date(w.due_at).getTime() < Date.now() &&
          !['COMPLETED','CANCELLED','VERIFIED'].includes(String(w.status).toUpperCase())
        ).length,
      })).sort((a: any, b: any) => {
        const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
          || (b.overdueWorkItemCount - a.overdueWorkItemCount)
          || (new Date(a.openedAt ?? 0).getTime() - new Date(b.openedAt ?? 0).getTime());
      });

      const attentionItems = situations.slice(0, 10);
      return res.json({
        organizationId: tenant.organizationId,
        summary: {
          openSituations: snapshot.openSituationCount,
          highSeverity: snapshot.unresolvedHighSeverityCount ?? 0,
          overdueWork: snapshot.overdueWorkItemCount ?? 0,
          unassignedWork: snapshot.unassignedWorkItemCount ?? 0,
          activeActions: snapshot.activeActionCount,
        },
        attentionItems,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build Ellie brief' });
    }
  });

  router.post('/ellie', async (req: any, res) => {
    try {
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });

      if (!tenant.permissions.includes('recommendation.read')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION' });
      }

      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!message) return res.status(400).json({ error: 'message is required', code: 'MESSAGE_REQUIRED' });

      const [queue, memories, organizationSnapshot, operationalDigest] = await Promise.all([
        loadQueue(db, tenant.organizationId),
        loadTenantEllieMemories(db, tenant.organizationId, message),
        loadOrganizationSnapshot(db, tenant.organizationId),
        loadOperationalDigest(db, tenant.organizationId, tenant.permissions),
      ]);
      const context = buildCanonicalEllieContext(
        tenant,
        queue,
        memories,
        organizationSnapshot,
        operationalDigest,
      );
      const inference = await askEllieStructured(message, JSON.stringify(context));
      validateInferenceAgainstContext(inference, context);

      const situationId = inference.targetSituationId ?? null;
      if (!situationId) {
        return res.json({
          recommendation: null,
          inference,
          memoryCount: memories.length,
          organizationId: tenant.organizationId,
          note: 'Ellie did not identify a specific open situation. No recommendation was attached to an unrelated situation.',
        });
      }

      const { data: recommendation, error } = await db
        .from('recommendations')
        .insert({
          organization_id: tenant.organizationId,
          situation_id: situationId,
          generated_by: 'ELLIE',
          status: 'PROPOSED',
          recommendation_type: inference.recommendationType,
          summary: inference.summary,
          rationale: inference.rationale,
          confidence: inference.confidence,
          context_snapshot: {
            source: 'canonical',
            actorId: tenant.actorId,
            operatingContext: tenant.operatingContext,
            evidenceUsed: inference.evidenceUsed,
            targetSituationId: situationId,
            targetResourceIds: inference.targetResourceIds,
            learningSignal: inference.learningSignal ?? null,
            memoryIds: memories.map((m) => m.id),
            generatedAt: new Date().toISOString(),
          },
        })
        .select('id,organization_id,situation_id,generated_by,status,recommendation_type,summary,rationale,confidence,created_at')
        .single();

      if (error) throw error;

      return res.json({
        recommendation,
        inference,
        memoryCount: memories.length,
        organizationId: tenant.organizationId,
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      const message = error instanceof Error ? error.message : 'Ellie inference failed';
      if (message.startsWith('ELLIE_')) {
        return res.status(502).json({ error: 'Ellie produced an inference that failed canonical validation', code: message });
      }
      return res.status(500).json({ error: message });
    }
  });

  router.post('/ellie/memories/:memoryId/promote-pattern', async (req: any, res) => {
    try {
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });

      if (!tenant.permissions.includes('organization.manage')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION' });
      }

      await promoteTenantMemoryToPattern(db, {
        organizationId: tenant.organizationId,
        memoryId: String(req.params.memoryId),
      });

      return res.json({
        ok: true,
        memoryId: String(req.params.memoryId),
        knowledgeType: 'PATTERN',
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      const message = error instanceof Error ? error.message : 'Failed to promote Ellie memory';
      const known = new Set([
        'ELLIE_MEMORY_NOT_FOUND',
        'ELLIE_MEMORY_NOT_ACTIVE',
        'ELLIE_MEMORY_ALREADY_CLASSIFIED',
        'ELLIE_PATTERN_EVIDENCE_INSUFFICIENT',
        'ELLIE_PATTERN_CONTRADICTED',
        'ELLIE_PATTERN_EVIDENCE_WEAK',
        'ELLIE_PATTERN_PROVENANCE_INSUFFICIENT',
      ]);
      if (known.has(message)) return res.status(409).json({ error: message, code: message });
      return res.status(500).json({ error: message, code: 'ELLIE_MEMORY_PROMOTION_FAILED' });
    }
  });

  router.post('/ellie/:recommendationId/feedback', async (req: any, res) => {
    try {
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });

      if (!tenant.permissions.includes('verification.write')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION' });
      }

      const outcome = String(req.body?.outcome ?? '').toUpperCase();
      if (!['ACCEPTED','REJECTED','VERIFIED','FAILED','SUPERSEDED'].includes(outcome)) {
        return res.status(400).json({ error: 'Invalid learning outcome', code: 'INVALID_OUTCOME' });
      }

      const { data: recommendation, error: recommendationError } = await db
        .from('recommendations')
        .select('id,organization_id,situation_id,summary,rationale,confidence,context_snapshot')
        .eq('id', req.params.recommendationId)
        .eq('organization_id', tenant.organizationId)
        .maybeSingle();
      if (recommendationError) throw recommendationError;
      if (!recommendation) return res.status(404).json({ error: 'Recommendation not found', code: 'RECOMMENDATION_NOT_FOUND' });

      const verificationId = req.body?.verificationId ? String(req.body.verificationId) : null;
      if ((outcome === 'VERIFIED' || outcome === 'FAILED') && !verificationId) {
        return res.status(400).json({
          error: 'A verificationId is required for verified learning outcomes',
          code: 'VERIFICATION_REQUIRED',
        });
      }

      if (verificationId) {
        const { data: verification, error: verificationError } = await db
          .from('verifications')
          .select('id,organization_id,situation_id,verification_type,verification_status')
          .eq('id', verificationId)
          .eq('organization_id', tenant.organizationId)
          .maybeSingle();
        if (verificationError) throw verificationError;
        if (!verification || verification.situation_id !== recommendation.situation_id) {
          return res.status(403).json({
            error: 'Verification does not belong to this recommendation tenant/situation',
            code: 'VERIFICATION_SCOPE_MISMATCH',
          });
        }
      }

      await recordEllieLearningEvent(db, {
        organizationId: tenant.organizationId,
        actorId: tenant.actorId,
        recommendationId: recommendation.id,
        verificationId: verificationId ?? undefined,
        outcome: outcome as any,
        details: { result: req.body?.result ?? null },
      });

      const nextStatus = ['VERIFIED', 'ACCEPTED'].includes(outcome)
        ? 'ACCEPTED'
        : ['FAILED', 'REJECTED'].includes(outcome)
          ? 'REJECTED'
          : 'EXPIRED';
      const { error: updateError } = await db
        .from('recommendations')
        .update({ status: nextStatus })
        .eq('id', recommendation.id)
        .eq('organization_id', tenant.organizationId);
      if (updateError) throw updateError;

      const snapshot = (recommendation.context_snapshot ?? {}) as Record<string, unknown>;
      const signal = typeof snapshot.learningSignal === 'string' ? snapshot.learningSignal.trim() : '';
      const resourceRefs = Array.isArray(snapshot.targetResourceIds)
        ? snapshot.targetResourceIds.map(String)
        : [];
      const snapshotEvidence = Array.isArray(snapshot.evidenceUsed)
        ? snapshot.evidenceUsed.map(String).filter(Boolean)
        : [];
      const evidenceRefs = [...new Set([
        ...snapshotEvidence,
        ...(verificationId ? [verificationId] : []),
      ])];

      if (signal && (outcome === 'VERIFIED' || outcome === 'FAILED')) {
        const scopeKey = [
          'recommendation-outcome',
          recommendation.situation_id ?? 'organization',
          ...resourceRefs.sort(),
        ].join(':');

        if (outcome === 'VERIFIED') {
          await reinforceTenantMemory(db, {
            organizationId: tenant.organizationId,
            scopeKey,
            statement: signal,
            evidenceRefs,
            resourceRefs,
            confidence: Number(recommendation.confidence ?? 0.5),
            evidenceStrength: verificationId ? 0.9 : 0.6,
          });
        } else {
          await recordEllieCounterEvidence(db, {
            organizationId: tenant.organizationId,
            scopeKey,
            statement: signal,
            evidenceRefs,
          });
        }
      }

      return res.json({ ok: true, recommendationId: recommendation.id, outcome });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to record Ellie feedback' });
    }
  });

  return router;
}

export default createEllieRouter;
