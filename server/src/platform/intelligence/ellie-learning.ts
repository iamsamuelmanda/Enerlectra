import type { SupabaseClient } from '@supabase/supabase-js';

export type EllieMemory = {
  id: string;
  memoryType: string;
  scopeKey: string;
  statement: string;
  evidenceRefs: unknown[];
  confidence: number;
  occurrenceCount: number;
  lastConfirmedAt: string;
};

export async function loadTenantEllieMemories(
  db: SupabaseClient,
  organizationId: string,
  queryText: string,
  limit = 8,
): Promise<EllieMemory[]> {
  const { data, error } = await db
    .from('intelligence_memories')
    .select('id,memory_type,scope_key,statement,evidence_refs,confidence,occurrence_count,last_confirmed_at')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .order('last_confirmed_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const tokens = new Set(
    queryText.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length >= 3),
  );

  return (data ?? [])
    .map((memory: any) => {
      const haystack = `${memory.scope_key} ${memory.statement}`.toLowerCase();
      const overlap = [...tokens].filter((token) => haystack.includes(token)).length;
      const score = overlap * 10 + Number(memory.confidence || 0) + Number(memory.occurrence_count || 0) * 0.01;
      return {
        id: memory.id,
        memoryType: memory.memory_type,
        scopeKey: memory.scope_key,
        statement: memory.statement,
        evidenceRefs: Array.isArray(memory.evidence_refs) ? memory.evidence_refs : [],
        confidence: Number(memory.confidence),
        occurrenceCount: Number(memory.occurrence_count),
        lastConfirmedAt: memory.last_confirmed_at,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...memory }) => memory);
}

export async function recordEllieLearningEvent(
  db: SupabaseClient,
  input: {
    organizationId: string;
    actorId?: string;
    recommendationId?: string;
    verificationId?: string;
    outcome: 'ACCEPTED' | 'REJECTED' | 'VERIFIED' | 'FAILED' | 'SUPERSEDED';
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from('intelligence_learning_events').insert({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    recommendation_id: input.recommendationId ?? null,
    verification_id: input.verificationId ?? null,
    outcome: input.outcome,
    details: input.details ?? {},
  });
  if (error) throw error;
}

export async function reinforceTenantMemory(
  db: SupabaseClient,
  input: {
    organizationId: string;
    scopeKey: string;
    statement: string;
    evidenceRefs: string[];
    confidence: number;
  },
): Promise<void> {
  const boundedConfidence = Math.max(0, Math.min(1, input.confidence));
  const { data: existing, error: lookupError } = await db
    .from('intelligence_memories')
    .select('id,confidence,occurrence_count')
    .eq('organization_id', input.organizationId)
    .eq('scope_key', input.scopeKey)
    .eq('statement', input.statement)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (!existing) {
    const { error } = await db.from('intelligence_memories').insert({
      organization_id: input.organizationId,
      memory_type: 'OUTCOME_PATTERN',
      scope_key: input.scopeKey,
      statement: input.statement,
      evidence_refs: input.evidenceRefs,
      confidence: boundedConfidence,
    });
    if (error) throw error;
    return;
  }

  const nextConfidence = Math.min(1, Math.max(Number(existing.confidence), boundedConfidence) + 0.05);
  const { error } = await db
    .from('intelligence_memories')
    .update({
      confidence: nextConfidence,
      occurrence_count: Number(existing.occurrence_count) + 1,
      evidence_refs: input.evidenceRefs,
      last_confirmed_at: new Date().toISOString(),
      status: 'ACTIVE',
    })
    .eq('id', existing.id)
    .eq('organization_id', input.organizationId);

  if (error) throw error;
}
