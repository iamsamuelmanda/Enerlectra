-- Enerlectra — Migration 052: make Ellie knowledge/retrieval schema match the intelligence implementation.
-- This migration closes the implementation/schema gap introduced by the evidence-backed
-- knowledge model. It is additive and preserves existing tenant-scoped memory rows.

alter table public.intelligence_memories
  add column if not exists knowledge_type text not null default 'OUTCOME'
    check (knowledge_type in ('FACT','PROCEDURE','POLICY','PATTERN','PREFERENCE','OUTCOME')),
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists evidence_strength numeric not null default 0.5
    check (evidence_strength >= 0 and evidence_strength <= 1),
  add column if not exists contradiction_count integer not null default 0
    check (contradiction_count >= 0),
  add column if not exists last_counter_evidence_at timestamptz,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz;

update public.intelligence_memories
set valid_from = coalesce(valid_from, first_observed_at),
    valid_until = coalesce(valid_until, first_observed_at + interval '180 days')
where valid_from is null or valid_until is null;

alter table public.intelligence_memories
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(scope_key, '') || ' ' || coalesce(statement, ''))
  ) stored;

create index if not exists intelligence_memories_search_document_idx
  on public.intelligence_memories using gin (search_document);

create index if not exists intelligence_memories_org_knowledge_validity_idx
  on public.intelligence_memories (
    organization_id,
    knowledge_type,
    status,
    valid_from,
    valid_until,
    last_confirmed_at desc
  );

create index if not exists intelligence_memories_resource_refs_gin_idx
  on public.intelligence_memories using gin (resource_refs);

comment on column public.intelligence_memories.knowledge_type is
  'Epistemic class: canonical fact, demonstrated procedure, authoritative policy, learned pattern, preference, or recommendation outcome.';
comment on column public.intelligence_memories.evidence_strength is
  'Strength of the evidence supporting this memory; recommendation outcomes do not become patterns automatically.';
comment on column public.intelligence_memories.contradiction_count is
  'Count of verified counter-evidence events recorded against this memory.';
comment on column public.intelligence_memories.valid_until is
  'Temporal validity boundary used to prevent stale organizational knowledge from being retrieved as current truth.';
