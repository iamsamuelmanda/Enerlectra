import crypto from 'node:crypto';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { askEllieStructured } from 'enerlectra-core';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';
import { buildCanonicalEllieContext } from '../platform/intelligence/ellie-context-builder.js';
import {
  loadTenantEllieMemories,
  recordEllieLearningEvent,
  reinforceTenantMemory,
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

export function createEllieRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

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

      const queue = await loadQueue(db, tenant.organizationId);
      const memories = await loadTenantEllieMemories(db, tenant.organizationId, message);
      const context = buildCanonicalEllieContext(tenant, queue, memories);
      const inference = await askEllieStructured(message, JSON.stringify(context));

      const situationId = context.situations[0]?.id;
      if (!situationId) {
        return res.json({
          recommendation: null,
          inference,
          memoryCount: memories.length,
          organizationId: tenant.organizationId,
          note: 'No open situation was present, so no persistent recommendation was created.',
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
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Ellie inference failed' });
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
          .select('id,organization_id,situation_id')
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
        details: {
          result: req.body?.result ?? null,
        },
      });

      const nextStatus = ['VERIFIED', 'ACCEPTED'].includes(outcome)\n        ? 'ACCEPTED'\n        : ['FAILED', 'REJECTED'].includes(outcome)\n          ? 'REJECTED'\n          : 'EXPIRED';
      const { error: updateError } = await db
        .from('recommendations')
        .update({ status: nextStatus })
        .eq('id', recommendation.id)
        .eq('organization_id', tenant.organizationId);
      if (updateError) throw updateError;

      if (outcome === 'VERIFIED' || outcome === 'FAILED') {
        const snapshot = (recommendation.context_snapshot ?? {}) as Record<string, unknown>;
        const signal = typeof snapshot.learningSignal === 'string' ? snapshot.learningSignal.trim() : '';
        if (signal) {
          const confidence = Number(recommendation.confidence ?? 0.5);
          const outcomeStatement = outcome === 'VERIFIED'
            ? signal
            : `The previously suggested pattern was not verified: ${signal}`;
          await reinforceTenantMemory(db, {
            organizationId: tenant.organizationId,
            scopeKey: `recommendation:${String(recommendation.summary).slice(0, 120)}`,
            statement: outcomeStatement,
            evidenceRefs: [recommendation.id, ...(verificationId ? [verificationId] : [])],
            confidence: outcome === 'VERIFIED' ? confidence : Math.min(confidence, 0.35),
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
