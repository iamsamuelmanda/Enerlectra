import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';
import { recordAudit } from '../services/audit.js';

function bearer(req: Request): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()))];
}

export function createOrganizationContextRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

  async function tenant(req: Request) {
    return resolver.resolve({
      accessToken: bearer(req),
      organizationId: req.header('x-organization-id') || undefined,
      correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
      requestId: req.header('x-request-id') || crypto.randomUUID(),
      source: 'api',
    });
  }

  router.get('/', async (req: Request, res: Response) => {
    try {
      const t = await tenant(req);
      return res.json({
        organizationId: t.organizationId,
        canManage: t.permissions.includes('organization.manage'),
        permissions: t.permissions,
        operatingContext: t.operatingContext,
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: 'Failed to load organization context' });
    }
  });

  router.put('/', async (req: Request, res: Response) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('organization.manage')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION', permission: 'organization.manage' });
      }

      const body = req.body ?? {};
      const profileConfiguration = objectValue(body.profileConfiguration);
      const profileName = typeof body.profileName === 'string' && body.profileName.trim()
        ? body.profileName.trim()
        : 'Operating profile';

      const businessModels = stringArray(body.businessModels);
      const capabilities = Array.isArray(body.capabilities)
        ? body.capabilities
            .filter((x) => typeof x === 'object' && x !== null && typeof (x as any).key === 'string')
            .map((x: any) => ({
              key: x.key.trim(),
              status: x.status === 'DISABLED' ? 'DISABLED' : x.status === 'CONFIGURED' ? 'CONFIGURED' : 'ENABLED',
              configuration: objectValue(x.configuration),
            }))
        : [];

      const policies = Array.isArray(body.policies)
        ? body.policies
            .filter((x) => typeof x === 'object' && x !== null && typeof (x as any).key === 'string')
            .map((x: any) => ({
              key: x.key.trim(),
              value: objectValue(x.value),
            }))
        : [];

      const { data: profile, error: profileError } = await db
        .from('operating_model_profiles')
        .upsert({
          organization_id: t.organizationId,
          name: profileName,
          status: 'ACTIVE',
          configuration: profileConfiguration,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' })
        .select('id,name,status,configuration')
        .single();
      if (profileError) throw profileError;

      const { error: clearModelsError } = await db
        .from('operating_model_business_models')
        .delete()
        .eq('operating_model_profile_id', profile.id);
      if (clearModelsError) throw clearModelsError;

      if (businessModels.length) {
        const { error } = await db.from('operating_model_business_models').insert(
          businessModels.map((businessModelKey, index) => ({
            operating_model_profile_id: profile.id,
            business_model_key: businessModelKey,
            is_primary: index === 0,
          })),
        );
        if (error) throw error;
      }

      const { error: capabilityError } = await db
        .from('organization_capabilities')
        .upsert(
          capabilities.map((capability) => ({
            organization_id: t.organizationId,
            capability_key: capability.key,
            status: capability.status,
            configuration: capability.configuration,
            disabled_at: capability.status === 'DISABLED' ? new Date().toISOString() : null,
            enabled_at: capability.status === 'DISABLED' ? undefined : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'organization_id,capability_key' },
        );
      if (capabilityError) throw capabilityError;

      for (const policy of policies) {
        const { data: existing, error: existingError } = await db
          .from('organization_policies')
          .select('id')
          .eq('organization_id', t.organizationId)
          .eq('policy_key', policy.key)
          .eq('status', 'ACTIVE')
          .is('effective_to', null)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existing) {
          const { error } = await db.from('organization_policies')
            .update({ value: policy.value, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .eq('organization_id', t.organizationId);
          if (error) throw error;
        } else {
          const { error } = await db.from('organization_policies').insert({
            organization_id: t.organizationId,
            policy_key: policy.key,
            value: policy.value,
            status: 'ACTIVE',
          });
          if (error) throw error;
        }
      }

      await recordAudit(db, {
        organizationId: t.organizationId,
        actorId: t.actorId,
        action: 'ORGANIZATION_CONTEXT_UPDATED',
        resourceType: 'OPERATING_MODEL_PROFILE',
        resourceId: profile.id,
        outcome: 'SUCCESS',
        correlationId: t.correlationId,
        metadata: {
          businessModels,
          capabilities: capabilities.filter((c) => c.status !== 'DISABLED').map((c) => c.key),
          policyKeys: policies.map((p) => p.key),
        },
      });

      return res.json({
        success: true,
        organizationId: t.organizationId,
        operatingContext: {
          profileId: profile.id,
          profileName: profile.name,
          profileConfiguration,
          businessModels,
          capabilities: capabilities.filter((c) => c.status !== 'DISABLED').map((c) => c.key),
          capabilityConfiguration: Object.fromEntries(capabilities.filter((c) => c.status !== 'DISABLED').map((c) => [c.key, c.configuration])),
          policies: Object.fromEntries(policies.map((p) => [p.key, p.value])),
        },
        permissions: t.permissions,
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update organization context' });
    }
  });

  return router;
}
export default createOrganizationContextRouter;
