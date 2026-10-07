import type { SupabaseClient } from '@supabase/supabase-js';
import type { EllieOrganizationSnapshot } from 'enerlectra-core';

async function countRows(
  db: SupabaseClient,
  table: string,
  organizationId: string,
  extra?: (query: any) => any,
): Promise<number> {
  let query = db.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
  if (extra) query = extra(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function loadOrganizationSnapshot(
  db: SupabaseClient,
  organizationId: string,
): Promise<EllieOrganizationSnapshot> {
  const now = new Date().toISOString();
  const [
    customerCount,
    siteCount,
    assetCount,
    openSituationCount,
    openWorkItemCount,
    activeActionCount,
    unresolvedHighSeverityCount,
    overdueWorkItemCount,
    unassignedWorkItemCount,
    oldestOpenSituation,
  ] = await Promise.all([
    countRows(db, 'customers', organizationId),
    countRows(db, 'sites', organizationId),
    countRows(db, 'assets', organizationId),
    countRows(db, 'situations', organizationId, (q) => q.in('status', ['OPEN', 'INVESTIGATING'])),
    countRows(db, 'work_items', organizationId, (q) => q.in('status', ['PROPOSED', 'READY', 'IN_PROGRESS', 'EXECUTING'])),
    countRows(db, 'actions', organizationId, (q) => q.in('status', ['PROPOSED', 'AUTHORIZED', 'EXECUTING'])),
    countRows(db, 'situations', organizationId, (q) => q.in('status', ['OPEN', 'INVESTIGATING']).in('severity', ['HIGH', 'CRITICAL'])),
    countRows(db, 'work_items', organizationId, (q) => q.in('status', ['PROPOSED', 'READY', 'IN_PROGRESS', 'EXECUTING']).lt('due_at', now)),
    countRows(db, 'work_items', organizationId, (q) => q.in('status', ['PROPOSED', 'READY', 'IN_PROGRESS', 'EXECUTING']).is('assigned_actor_id', null)),
    db.from('situations')
      .select('opened_at')
      .eq('organization_id', organizationId)
      .in('status', ['OPEN', 'INVESTIGATING'])
      .order('opened_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.opened_at ?? null;
      }),
  ]);

  return {
    customerCount,
    siteCount,
    assetCount,
    openSituationCount,
    openWorkItemCount,
    activeActionCount,
    unresolvedHighSeverityCount,
    overdueWorkItemCount,
    unassignedWorkItemCount,
    oldestOpenSituationAt: oldestOpenSituation,
  };
}
