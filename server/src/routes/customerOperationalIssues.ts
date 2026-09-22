import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCustomerOperationalIssue } from '../services/customerOperationalIssues.js';
import {
  createTenantContextResolver,
  TenantContextError,
} from '../platform/tenant/resolver.js';

type RouteRequest = Request & {
  requestId?: string;
};

const ISSUE_PERMISSIONS = {
  create: 'situation.manage',
  assign: 'work.assign',
} as const;

export function createCustomerOperationalIssuesRouter(db: SupabaseClient): Router {
  const router = Router();
  const tenantResolver = createTenantContextResolver(db);

  router.post('/', async (req: RouteRequest, res: Response) => {
    const requestId =
      req.requestId ??
      (typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : crypto.randomUUID());

    const authorization = req.headers.authorization;
    const accessToken =
      authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    try {
      const tenant = await tenantResolver.resolve({
        accessToken,
        organizationId:
          typeof req.headers['x-organization-id'] === 'string'
            ? req.headers['x-organization-id']
            : undefined,
        correlationId:
          typeof req.headers['x-correlation-id'] === 'string'
            ? req.headers['x-correlation-id']
            : crypto.randomUUID(),
        requestId,
        source: 'api',
      });

      if (\n        !tenant.permissions.includes(ISSUE_PERMISSIONS.create) ||\n        !tenant.permissions.includes(ISSUE_PERMISSIONS.execute)\n      ) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'MISSING_PERMISSION',
          permission: ISSUE_PERMISSIONS.create,
        });
      }

      const body = req.body ?? {};
      if (
        typeof body.title !== 'string' ||
        body.title.trim().length === 0 ||
        !body.observationValue ||
        typeof body.observationValue !== 'object' ||
        Array.isArray(body.observationValue)
      ) {
        return res.status(400).json({
          error: 'title and observationValue are required',
        });
      }

      if (
        body.assignedActorId != null &&
        !tenant.permissions.includes(ISSUE_PERMISSIONS.assign)
      ) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'MISSING_PERMISSION',
          permission: ISSUE_PERMISSIONS.assign,
        });
      }

      const result = await createCustomerOperationalIssue(db, tenant, {
        title: body.title.trim(),
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        severity: body.severity,
        customerId: body.customerId,
        siteId: body.siteId,
        assetId: body.assetId,
        observationType: body.observationType,
        observationValue: body.observationValue,
        source: typeof body.source === 'string' ? body.source : 'customer_report',
        workType: body.workType,
        priority: body.priority,
        assignedActorId: body.assignedActorId,
        idempotencyKey:
          typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
        correlationId: tenant.correlationId,
      });

      return res.status(201).json({
        success: true,
        ...result,
        organizationId: tenant.organizationId,
        actorId: tenant.actorId,
        correlationId: tenant.correlationId,
        requestId: tenant.requestId,
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        const status =
          error.code === 'UNAUTHENTICATED' ? 401 :
          error.code === 'MEMBERSHIP_NOT_FOUND' ||
          error.code === 'ACTOR_NOT_FOUND' ||
          error.code === 'ACTOR_INACTIVE' ||
          error.code === 'ORGANIZATION_NOT_FOUND' ||
          error.code === 'ORGANIZATION_INACTIVE' ||
          error.code === 'AMBIGUOUS_ORGANIZATION' ||
          error.code === 'ROLE_NOT_FOUND'
            ? 403
            : 401;

        return res.status(status).json({
          error: error.message,
          code: error.code,
        });
      }

      return res.status(500).json({
        error: 'Failed to create customer operational issue',
        code: 'CUSTOMER_OPERATIONAL_ISSUE_FAILED',
      });
    }
  });

  return router;
}
