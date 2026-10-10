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
      if (!ids.length) {
        return res.json({
          situations: [],
          metrics: { openSituations: 0, criticalSituations: 0, highPriorityWork: 0, unassignedWork: 0, overdueWork: 0, oldestOpenAt: null },
          organizationId: tenant.organizationId,
          permissions: tenant.permissions,
        });
      }

      const [{ data: work, error: workError }, { data: recommendations, error: recError }] = await Promise.all([
        db.from('work_items').select('id,situation_id,work_type,status,priority,title,assigned_actor_id,due_at,created_at,updated_at').eq('organization_id', tenant.organizationId).in('situation_id', ids).order('created_at', { ascending: false }),
        db.from('recommendations').select('id,situation_id,status,recommendation_type,summary,rationale,confidence,created_at,expires_at').eq('organization_id', tenant.organizationId).in('situation_id', ids).order('created_at', { ascending: false }),
      ]);
      if (workError) throw workError;
      if (recError) throw recError;

      const workIds = (work ?? []).map((item: any) => item.id);
      const { data: actions, error: actionsError } = workIds.length
        ? await db.from('actions')
            .select('id,work_item_id,action_type,consequence_class,status,requested_by_actor_id,authorized_by_actor_id,requested_at,authorized_at,started_at,completed_at,created_at,updated_at')
            .eq('organization_id', tenant.organizationId)
            .in('work_item_id', workIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (actionsError) throw actionsError;

      const actionIds = (actions ?? []).map((action: any) => action.id);
      const { data: attempts, error: attemptsError } = actionIds.length
        ? await db.from('action_attempts')
            .select('id,action_id,attempt_number,status,executor_type,executor_actor_id,started_at,finished_at,result_code,result_summary,error_code,error_summary,created_at')
            .eq('organization_id', tenant.organizationId)
            .in('action_id', actionIds)
            .order('attempt_number', { ascending: true })
        : { data: [], error: null };
      if (attemptsError) throw attemptsError;

      const openSituations = situations ?? [];
      const workItems = work ?? [];
      const now = Date.now();
      const metrics = {
        openSituations: openSituations.length,
        criticalSituations: openSituations.filter((s: any) => s.severity === 'CRITICAL').length,
        highPriorityWork: workItems.filter((w: any) => ['HIGH', 'URGENT'].includes(w.priority) && !['COMPLETED', 'CANCELLED'].includes(w.status)).length,
        unassignedWork: workItems.filter((w: any) => !w.assigned_actor_id && !['COMPLETED', 'CANCELLED'].includes(w.status)).length,
        overdueWork: workItems.filter((w: any) => w.due_at && new Date(w.due_at).getTime() < now && !['COMPLETED', 'CANCELLED'].includes(w.status)).length,
        oldestOpenAt: openSituations.length
          ? openSituations.reduce((oldest: string, current: any) => current.opened_at < oldest ? current.opened_at : oldest, openSituations[0].opened_at)
          : null,
      };

      return res.json({
        situations: openSituations.map((s: any) => ({
          ...s,
          workItems: workItems.filter((w: any) => w.situation_id === s.id).map((w: any) => ({
            ...w,
            actions: (actions ?? []).filter((a: any) => a.work_item_id === w.id).map((a: any) => ({
              ...a,
              attempts: (attempts ?? []).filter((attempt: any) => attempt.action_id === a.id),
            })),
          })),
          recommendations: (recommendations ?? []).filter((r: any) => r.situation_id === s.id),
        })),
        metrics,
        organizationId: tenant.organizationId,
        permissions: tenant.permissions,
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
