import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';

const VERIFICATION_TYPES = [
  'OPERATOR_CONFIRMATION',
  'TECHNICIAN_CONFIRMATION',
  'CUSTOMER_CONFIRMATION',
  'TELEMETRY',
  'METER_READING',
  'PAYMENT_CONFIRMATION',
  'SYSTEM_STATE',
] as const;

const STATUSES = ['VERIFIED', 'PARTIAL', 'FAILED', 'REOPENED'] as const;

function bearer(req: Request): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function createVerificationsRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

  router.post('/', async (req: any, res: Response) => {
    try {
      const accessToken = bearer(req);
      const organizationId = req.header('x-organization-id');
      const tenant = await resolver.resolve({
        accessToken,
        organizationId: organizationId || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });

      if (!tenant.permissions.includes('verification.write')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION', permission: 'verification.write' });
      }

      const b = req.body ?? {};
      if (!VERIFICATION_TYPES.includes(b.verificationType)) {
        return res.status(400).json({ error: 'Invalid verificationType' });
      }
      if (!STATUSES.includes(b.status)) {
        return res.status(400).json({ error: 'Invalid verification status' });
      }
      if (!b.situationId && !b.workItemId && !b.actionId) {
        return res.status(400).json({ error: 'situationId, workItemId or actionId is required' });
      }

      const scoped = db;
      let situationId: string | null = b.situationId ?? null;
      let workItemId: string | null = b.workItemId ?? null;
      let actionId: string | null = b.actionId ?? null;

      if (situationId) {
        const { data, error } = await scoped.from('situations').select('id').eq('id', situationId).eq('organization_id', tenant.organizationId).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Situation not found in organization' });
      }
      if (workItemId) {
        const { data, error } = await scoped.from('work_items').select('id, situation_id').eq('id', workItemId).eq('organization_id', tenant.organizationId).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Work item not found in organization' });
        if (!situationId) situationId = data.situation_id;
      }
      if (actionId) {
        const { data, error } = await scoped.from('actions').select('id, work_item_id').eq('id', actionId).eq('organization_id', tenant.organizationId).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Action not found in organization' });
        if (!workItemId) workItemId = data.work_item_id;
      }

      const { data, error } = await scoped.from('verifications').insert({
        organization_id: tenant.organizationId,
        situation_id: situationId,
        work_item_id: workItemId,
        action_id: actionId,
        verification_type: b.verificationType,
        status: b.status,
        verified_by_actor_id: tenant.actorId,
        verified_at: new Date().toISOString(),
        result: typeof b.result === 'object' && b.result !== null ? b.result : { summary: String(b.result ?? '') },
        observation_id: b.observationId ?? null,
        event_id: b.eventId ?? null,
      }).select('id,organization_id,situation_id,work_item_id,action_id,verification_type,status,verified_by_actor_id,verified_at,result,created_at').single();

      if (error) throw error;

      if (situationId) {
        const patch = b.status === 'VERIFIED'
          ? { status: 'RESOLVED', resolved_at: new Date().toISOString(), resolution_summary: typeof b.result?.summary === 'string' ? b.result.summary : 'Operational outcome verified.' }
          : b.status === 'REOPENED'
            ? { status: 'OPEN', resolved_at: null }
            : { status: 'INVESTIGATING', resolved_at: null };

        const { error: situationError } = await scoped.from('situations')
          .update(patch)
          .eq('id', situationId)
          .eq('organization_id', tenant.organizationId);
        if (situationError) throw situationError;
      }

      return res.status(201).json({ success: true, verification: data, actorId: tenant.actorId, organizationId: tenant.organizationId });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to record verification' });
    }
  });

  return router;
}
export default createVerificationsRouter;
