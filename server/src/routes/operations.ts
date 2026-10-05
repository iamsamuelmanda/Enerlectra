import crypto from 'node:crypto';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';

function bearer(req: any): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function createOperationsRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

  router.get('/queue', async (req: any, res) => {
    try {
      const tenant = await resolver.resolve({
        accessToken: bearer(req),
        organizationId: req.header('x-organization-id') || undefined,
        correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
        requestId: req.id || crypto.randomUUID(),
        source: 'api',
      });
      if (!tenant.permissions.includes('situation.read') || !tenant.permissions.includes('work.read')) {
        return res.status(403).json({ error: 'Forbidden', code: 'MISSING_PERMISSION' });
      }

      const { data: situations, error } = await db
        .from('situations')
        .select('id,organization_id,situation_type,status,severity,title,summary,customer_id,site_id,asset_id,opened_at,resolved_at,updated_at')
        .eq('organization_id', tenant.organizationId)
        .in('status', ['OPEN', 'INVESTIGATING'])
        .order('opened_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      const ids = (situations ?? []).map((s: any) => s.id);
      if (!ids.length) return res.json({ situations: [] });

      const [{ data: work, error: workError }, { data: recommendations, error: recError }] = await Promise.all([
        db.from('work_items').select('id,situation_id,work_type,status,priority,title,assigned_actor_id,due_at,created_at,updated_at').eq('organization_id', tenant.organizationId).in('situation_id', ids).order('created_at', { ascending: false }),
        db.from('recommendations').select('id,situation_id,status,recommendation_type,summary,rationale,confidence,created_at,expires_at').eq('organization_id', tenant.organizationId).in('situation_id', ids).order('created_at', { ascending: false }),
      ]);
      if (workError) throw workError;
      if (recError) throw recError;

      return res.json({
        situations: (situations ?? []).map((s: any) => ({
          ...s,
          workItems: (work ?? []).filter((w: any) => w.situation_id === s.id),
          recommendations: (recommendations ?? []).filter((r: any) => r.situation_id === s.id),
        })),
        organizationId: tenant.organizationId,
      });
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load operational queue' });
    }
  });

  return router;
}
export default createOperationsRouter;