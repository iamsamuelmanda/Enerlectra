import type { SupabaseClient } from '@supabase/supabase-js';
import type { EllieKnowledgeType } from 'enerlectra-core';

export type EllieMemory = {
  id: string;
  memoryType: string;
  knowledgeType: EllieKnowledgeType;
  scopeKey: string;
  statement: string;
  evidenceRefs: unknown[];
  resourceRefs: unknown[];
  confidence: number;
  evidenceStrength: number;
  occurrenceCount: number;
  contradictionCount: number;
  lastConfirmedAt: string;
  validFrom?: string;
  validUntil?: string;
  status?: string;
};

const KNOWLEDGE_WEIGHT: Record<EllieKnowledgeType, number> = {
  FACT: 1.15,
  PROCEDURE: 1.1,
  POLICY: 1.2,
  PATTERN: 1.15,
  PREFERENCE: 1,
  OUTCOME: 0.85,
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeTokens(queryText: string) {
  return [...new Set(
    queryText.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length >= 3),
  )];
}

export async function loadTenantEllieMemories(
  db: SupabaseClient,
  organizationId: string,
  queryText: string,
  limit = 8,
): Promise<EllieMemory[]> {
  const tokens = normalizeTokens(queryText);
  let query = db
    .from('intelligence_memories')
    .select(
      'id,memory_type,knowledge_type,scope_key,statement,evidence_refs,resource_refs,confidence,evidence_strength,occurrence_count,contradiction_count,last_confirmed_at,valid_from,valid_until,status',
    )
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .order('last_confirmed_at', { ascending: false })
    .limit(Math.max(50, limit * 6));

  // Structured retrieval comes before ranking: tenant + lifecycle + temporal validity +
  // full-text relevance. We deliberately do not require vector infrastructure yet.
  if (tokens.length) {
    query = query.textSearch('search_document', tokens.join(' & '), { type: 'plain', config: 'simple' });
  }

  const { data, error } = await query;
  if (error) throw error;

  const now = Date.now();
  return (data ?? [])
    .filter((memory: any) => {
      const from = memory.valid_from ? new Date(memory.valid_from).getTime() : 0;
      const until = memory.valid_until ? new Date(memory.valid_until).getTime() : Number.POSITIVE_INFINITY;
      return from <= now && until >= now;
    })
    .map((memory: any) => {
      const haystack = `${memory.scope_key} ${memory.statement}`.toLowerCase();
      const lexicalOverlap = tokens.length
        ? tokens.filter((token) => haystack.includes(token)).length / tokens.length
        : 0;
      const contradictionPenalty = Math.min(0.5, Number(memory.contradiction_count || 0) * 0.08);
      const recencyDays = Math.max(
        0,
        (now - new Date(memory.last_confirmed_at).getTime()) / 86_400_000,
      );
      const recencyScore = Math.max(0, 1 - recencyDays / 180);
      const score =
        lexicalOverlap * 3 +
        Number(memory.evidence_strength || 0) * 2 +
        Number(memory.confidence || 0) * 2 +
        recencyScore +
        (KNOWLEDGE_WEIGHT[memory.knowledge_type as EllieKnowledgeType] ?? 0.8) -
        contradictionPenalty;

      return {
        id: memory.id,
        memoryType: memory.memory_type,
        knowledgeType: (memory.knowledge_type ?? 'OUTCOME') as EllieKnowledgeType,
        scopeKey: memory.scope_key,
        statement: memory.statement,
        evidenceRefs: Array.isArray(memory.evidence_refs) ? memory.evidence_refs : [],
        resourceRefs: Array.isArray(memory.resource_refs) ? memory.resource_refs : [],
        confidence: Number(memory.confidence),
        evidenceStrength: Number(memory.evidence_strength ?? 0.5),
        occurrenceCount: Number(memory.occurrence_count),
        contradictionCount: Number(memory.contradiction_count ?? 0),
        lastConfirmedAt: memory.last_confirmed_at,
        validFrom: memory.valid_from ?? undefined,
        validUntil: memory.valid_until ?? undefined,
        status: memory.status ?? 'ACTIVE',
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
    resourceRefs?: string[];
    confidence: number;
    evidenceStrength?: number;
  },
): Promise<void> {
  if (!input.evidenceRefs.length) throw new Error('Learning memory requires evidence references');

  const boundedConfidence = clamp(input.confidence);
  const evidenceStrength = clamp(input.evidenceStrength ?? 0.75);
  const { data: existing, error: lookupError } = await db
    .from('intelligence_memories')
    .select(
      'id,memory_type,knowledge_type,confidence,evidence_strength,occurrence_count,contradiction_count,evidence_refs,resource_refs,status,valid_from,valid_until',
    )
    .eq('organization_id', input.organizationId)
    .eq('scope_key', input.scopeKey)
    .eq('statement', input.statement)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (!existing) {
    const { error } = await db.from('intelligence_memories').insert({
      organization_id: input.organizationId,
      memory_type: 'OUTCOME_PATTERN',
      knowledge_type: 'OUTCOME',
      scope_key: input.scopeKey,
      statement: input.statement,
      evidence_refs: input.evidenceRefs,
      resource_refs: input.resourceRefs ?? [],
      confidence: boundedConfidence,
      evidence_strength: evidenceStrength,
      occurrence_count: 1,
      contradiction_count: 0,
      status: 'ACTIVE',
      valid_from: new Date().toISOString(),
      valid_until: null,
    });
    if (error) throw error;
    return;
  }

  const occurrenceCount = Number(existing.occurrence_count || 0) + 1;
  const priorConfidence = Number(existing.confidence || 0);
  const nextConfidence = clamp(
    (priorConfidence * Math.max(1, occurrenceCount - 1) + boundedConfidence) / occurrenceCount,
  );
  const nextEvidenceStrength = clamp(
    (Number(existing.evidence_strength || 0) * Math.max(1, occurrenceCount - 1) + evidenceStrength) / occurrenceCount,
  );
  // A verified recommendation outcome is evidence about this instance. It is not
  // automatically promoted into an organizational PATTERN merely because it repeats.
  // Pattern promotion must be an explicit, evidence-reviewed operation.
  const knowledgeType = existing.knowledge_type ?? 'OUTCOME';

  const { error } = await db
    .from('intelligence_memories')
    .update({
      knowledge_type: knowledgeType,
      confidence: nextConfidence,
      evidence_strength: nextEvidenceStrength,
      occurrence_count: occurrenceCount,
      evidence_refs: [...new Set([...(Array.isArray(existing.evidence_refs) ? existing.evidence_refs : []), ...input.evidenceRefs])],
      resource_refs: [...new Set([...(Array.isArray(existing.resource_refs) ? existing.resource_refs : []), ...(input.resourceRefs ?? [])])],
      last_confirmed_at: new Date().toISOString(),
      valid_from: existing.valid_from ?? new Date().toISOString(),
      valid_until: existing.valid_until ?? null,
      status: 'ACTIVE',
    })
    .eq('id', existing.id)
    .eq('organization_id', input.organizationId);

  if (error) throw error;
}

export async function recordEllieCounterEvidence(
  db: SupabaseClient,
  input: {
    organizationId: string;
    scopeKey: string;
    statement: string;
    evidenceRefs: string[];
  },
): Promise<void> {
  if (!input.evidenceRefs.length) throw new Error('Counter-evidence requires evidence references');

  const { data: existing, error } = await db
    .from('intelligence_memories')
    .select('id,confidence,occurrence_count,contradiction_count,evidence_refs')
    .eq('organization_id', input.organizationId)
    .eq('scope_key', input.scopeKey)
    .eq('statement', input.statement)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return;

  const contradictionCount = Number(existing.contradiction_count || 0) + 1;
  const occurrenceCount = Math.max(1, Number(existing.occurrence_count || 1));
  const nextConfidence = clamp(
    Number(existing.confidence || 0.5) * (contradictionCount >= occurrenceCount ? 0.65 : 0.85),
  );
  const status = nextConfidence < 0.2 ? 'RETIRED' : 'ACTIVE';

  const { error: updateError } = await db
    .from('intelligence_memories')
    .update({
      confidence: nextConfidence,
      contradiction_count: contradictionCount,
      last_counter_evidence_at: new Date().toISOString(),
      evidence_refs: [...new Set([...(Array.isArray(existing.evidence_refs) ? existing.evidence_refs : []), ...input.evidenceRefs])],
      status,
    })
    .eq('id', existing.id)
    .eq('organization_id', input.organizationId);
  if (updateError) throw updateError;
}


export async function promoteTenantMemoryToPattern(
  db: SupabaseClient,
  input: {
    organizationId: string;
    memoryId: string;
  },
): Promise<void> {
  const { data: memory, error } = await db
    .from('intelligence_memories')
    .select('id,knowledge_type,memory_type,status,occurrence_count,contradiction_count,evidence_strength,evidence_refs')
    .eq('id', input.memoryId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!memory) throw new Error('ELLIE_MEMORY_NOT_FOUND');
  if (memory.status !== 'ACTIVE') throw new Error('ELLIE_MEMORY_NOT_ACTIVE');
  if (memory.knowledge_type !== 'OUTCOME') throw new Error('ELLIE_MEMORY_ALREADY_CLASSIFIED');
  if (Number(memory.occurrence_count ?? 0) < 3) throw new Error('ELLIE_PATTERN_EVIDENCE_INSUFFICIENT');
  if (Number(memory.contradiction_count ?? 0) > 0) throw new Error('ELLIE_PATTERN_CONTRADICTED');
  if (Number(memory.evidence_strength ?? 0) < 0.8) throw new Error('ELLIE_PATTERN_EVIDENCE_WEAK');
  if (!Array.isArray(memory.evidence_refs) || memory.evidence_refs.length < 3) {
    throw new Error('ELLIE_PATTERN_PROVENANCE_INSUFFICIENT');
  }

  const { error: updateError } = await db
    .from('intelligence_memories')
    .update({
      knowledge_type: 'PATTERN',
      memory_type: 'OPERATIONAL_PATTERN',
      source: 'CONTROLLED_PROMOTION',
      last_confirmed_at: new Date().toISOString(),
    })
    .eq('id', input.memoryId)
    .eq('organization_id', input.organizationId);

  if (updateError) throw updateError;
}
