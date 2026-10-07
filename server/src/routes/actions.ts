import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorizeAction,
  createAction,
  createHumanAttempt,
  transitionAction,
  transitionAttempt,
} from '../services/actions.js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';
import { createRequestScopedSupabaseClient } from '../platform/supabase/request-client.js';

type RouteRequest = Request & { requestId?: string };

const PERMISSIONS = {
  create: 'action.create',
  authorize: 'action.authorize',
  execute: 'work.execute',
} as const;

function accessToken(req: Request): string {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function scopedClient(req: Request): SupabaseClient {
  const url = process.env.V2_SUPABASE_URL;
  const anonKey = process.env.V2_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('V2 Supabase public configuration is unavailable');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken(req)}` } },
  });
}

function requirePermission(permissions: readonly string[], permission: string) {
  if (!permissions.includes(permission)) {
    const error = new Error(`MISSING_PERMISSION:${permission}`);
    error.name = 'AuthorizationError';
    throw error;
  }
}

function handleError(error: unknown, res: Response, fallback: string) {
  if (error instanceof TenantContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : 403;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('MISSING_PERMISSION:')) {
    return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION', permission: message.slice(18) });
  }
  const known = [
    'ACTION_CREATE_PERMISSION_REQUIRED',
    'ACTION_AUTHORIZE_PERMISSION_REQUIRED',
    'WORK_EXECUTE_PERMISSION_REQUIRED',
    'ACTIVE_ACTOR_REQUIRED',
    'ACTION_REQUESTER_MUST_BE_CURRENT_ACTOR',
    'AUTHORIZED_BY_MUST_BE_CURRENT_ACTOR',
    'AUTHORIZED_ACTION_FIELDS_IMMUTABLE',
    'ACTION_TERMINAL_IMMUTABLE',
    'INVALID_ACTION_TRANSITION',
    'ACTION_NOT_EXECUTABLE',
    'HUMAN_EXECUTOR_MUST_BE_CURRENT_ACTOR',
    'ATTEMPT_IDENTITY_IMMUTABLE',
    'ATTEMPT_TERMINAL_IMMUTABLE',
    'INVALID_ATTEMPT_TRANSITION',
  ];
  const code = known.find((value) => message.includes(value));
  if (code) return res.status(403).json({ error: 'Forbidden', code });
  return res.status(500).json({ error: fallback, code: 'ACTION_BOUNDARY_FAILED' });
}

export function createActionsRouter(authDb: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(authDb);

  async function tenant(req: RouteRequest) {
    return resolver.resolve({
      accessToken: accessToken(req),
      organizationId:
        typeof req.headers['x-organization-id'] === 'string'
          ? req.headers['x-organization-id']
          : undefined,
      correlationId:
        typeof req.headers['x-correlation-id'] === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.headers['x-correlation-id'])
          ? req.headers['x-correlation-id']
          : crypto.randomUUID(),
      requestId: req.requestId ?? crypto.randomUUID(),
      source: 'api',
    });
  }

  router.post('/', async (req: RouteRequest, res: Response) => {
    try {
      const t = await tenant(req);
      requirePermission(t.permissions, PERMISSIONS.create);
      const b = req.body ?? {};
      if (typeof b.workItemId !== 'string' || typeof b.actionType !== 'string' || typeof b.consequenceClass !== 'string') {
        return res.status(400).json({ error: 'workItemId, actionType and consequenceClass are required' });
      }
      const data = await createAction(scopedClient(req), t, {
        workItemId: b.workItemId,
        actionType: b.actionType,
        consequenceClass: b.consequenceClass,
        target: b.target,
        metadata: b.metadata,
        idempotencyKey: b.idempotencyKey,
      });
      return res.status(201).json({ success: true, action: data, actorId: t.actorId, organizationId: t.organizationId, correlationId: t.correlationId });
    } catch (e) {
      return handleError(e, res, 'Failed to create Action');
    }
  });

  router.post('/:id/authorize', async (req: RouteRequest, res: Response) => {
    try {
      const t = await tenant(req);
      requirePermission(t.permissions, PERMISSIONS.authorize);
      const data = await authorizeAction(scopedClient(req), t, req.params.id);
      return res.json({ success: true, action: data, actorId: t.actorId, organizationId: t.organizationId });
    } catch (e) {
      return handleError(e, res, 'Failed to authorize Action');
    }
  });

  router.post('/:id/transition', async (req: RouteRequest, res: Response) => {
    try {
      const t = await tenant(req);
      requirePermission(t.permissions, PERMISSIONS.execute);
      const status = req.body?.status;
      if (!['EXECUTING', 'SUCCEEDED', 'FAILED', 'EXECUTION_UNKNOWN', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid Action transition status' });
      }
      const data = await transitionAction(scopedClient(req), t, req.params.id, status);
      return res.json({ success: true, action: data, actorId: t.actorId, organizationId: t.organizationId });
    } catch (e) {
      return handleError(e, res, 'Failed to transition Action');
    }
  });

  router.post('/:id/attempts', async (req: RouteRequest, res: Response) => {
    try {
      const t = await tenant(req);
      requirePermission(t.permissions, PERMISSIONS.execute);
      const b = req.body ?? {};
      if (!Number.isInteger(b.attemptNumber) || b.attemptNumber < 1 || typeof b.executionIdempotencyKey !== 'string') {
        return res.status(400).json({ error: 'attemptNumber and executionIdempotencyKey are required' });
      }
      const data = await createHumanAttempt(scopedClient(req), t, {
        actionId: req.params.id,
        attemptNumber: b.attemptNumber,
        executionIdempotencyKey: b.executionIdempotencyKey,
        metadata: b.metadata,
      });
      return res.status(201).json({ success: true, attempt: data, actorId: t.actorId, organizationId: t.organizationId });
    } catch (e) {
      return handleError(e, res, 'Failed to create Action attempt');
    }
  });

  router.post('/:id/attempts/:attemptId/transition', async (req: RouteRequest, res: Response) => {
    try {
      const t = await tenant(req);
      requirePermission(t.permissions, PERMISSIONS.execute);
      const status = req.body?.status;
      if (!['EXECUTING', 'SUCCEEDED', 'FAILED', 'EXECUTION_UNKNOWN', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid Attempt transition status' });
      }
      const data = await transitionAttempt(scopedClient(req), t, req.params.attemptId, status, req.body?.result);
      return res.json({ success: true, attempt: data, actorId: t.actorId, organizationId: t.organizationId });
    } catch (e) {
      return handleError(e, res, 'Failed to transition Action attempt');
    }
  });

  return router;
}
