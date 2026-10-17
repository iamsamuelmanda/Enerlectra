import type { SupabaseClient } from '@supabase/supabase-js';

export async function recordAudit(
  db: SupabaseClient,
  input: {
    organizationId: string | null;
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: string;
    reason?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await db.from('audit_records').insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      outcome: input.outcome,
      reason: input.reason ?? null,
      correlation_id: input.correlationId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      // Audit must never mutate or block the authoritative operational result.
      console.warn('Audit record write failed', { error: error.message, action: input.action });
    }
  } catch (error) {
    console.warn('Audit record write threw', {
      error: error instanceof Error ? error.message : String(error),
      action: input.action,
    });
  }
}
