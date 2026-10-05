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
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
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

      const { data, error } = await db.rpc('record_operational_verification', {
        p_organization_id: tenant.organizationId,
        p_actor_id: tenant.actorId,
        p_situation_id: b.situationId ?? null,
        p_work_item_id: b.workItemId ?? null,
        p_action_id: b.actionId ?? null,
        p_verification_type: b.verificationType,
        p_status: b.status,
        p_result: typeof b.result === 'object' && b.result !== null ? b.result : { summary: String(b.result ?? '') },
        p_observation_id: b.observationId ?? null,
        p_event_id: b.eventId ?? null,
      });

      if (error) {
        const code = error.message.match(/(ACTOR_NOT_ACTIVE_MEMBER|VERIFICATION_WRITE_PERMISSION_REQUIRED|VERIFICATION_TARGET_REQUIRED|SITUATION_NOT_FOUND|WORK_ITEM_NOT_FOUND|ACTION_NOT_FOUND|ACTION_WORK_TARGET_MISMATCH|ACTION_SITUATION_TARGET_MISMATCH|INVALID_VERIFICATION_TYPE|INVALID_VERIFICATION_STATUS)/)?.[1];
        return res.status(403).json({ error: code ? 'Forbidden' : 'Failed to record verification', code: code ?? 'VERIFICATION_FAILED' });
      }

      const verification = Array.isArray(data) ? data[0] : data;
      return res.status(201).json({
        success: true,
        verification,
        actorId: tenant.actorId,
        organizationId: tenant.organizationId,
      });
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
