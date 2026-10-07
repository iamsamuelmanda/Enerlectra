-- Enerlectra — Migration 052: evidence-backed organizational knowledge model
-- Memory is not a second source of truth. Facts remain canonical records; this table stores
-- bounded organizational knowledge with provenance, temporal validity, contradiction handling,
-- and explicit epistemic level.

alter table public.intelligence_memories
  add column if not exists knowledge_type text not null default 'OUTCOME',
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists evidence_strength numeric not null default 0.5,
  add column if not exists contradiction_count integer not null default 0,
  add column if not exists last_counter_evidence_at timestamptz,
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz,
  add column if not exists superseded_by uuid references public.intelligence_memories(id) on delete set null;

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_knowledge_type_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_knowledge_type_check
  check (knowledge_type in ('FACT','PROCEDURE','POLICY','PATTERN','PREFERENCE','OUTCOME'));

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_evidence_strength_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_evidence_strength_check
  check (evidence_strength >= 0 and evidence_strength <= 1);

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_contradiction_count_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_contradiction_count_check
  check (contradiction_count >= 0);

-- Existing verified outcome memories are explicitly outcomes, not organizational doctrine.
update public.intelligence_memories
set knowledge_type = case
  when memory_type = 'POLICY_FACT' then 'POLICY'
  when memory_type = 'PREFERENCE' then 'PREFERENCE'
  when memory_type = 'OPERATIONAL_PATTERN' then 'PATTERN'
  when memory_type = 'OUTCOME_PATTERN' then 'OUTCOME'
  else 'OUTCOME'
end
where knowledge_type = 'OUTCOME';

alter table public.intelligence_memories
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(scope_key, '') || ' ' || coalesce(statement, '')
    )
  ) stored;

create index if not exists intelligence_memories_search_idx
  on public.intelligence_memories using gin(search_document);

create index if not exists intelligence_memories_retrieval_idx
  on public.intelligence_memories(
    organization_id,
    status,
    knowledge_type,
    valid_until,
    evidence_strength desc,
    last_confirmed_at desc
  );

create index if not exists intelligence_memories_resource_refs_idx
  on public.intelligence_memories using gin(resource_refs);

comment on column public.intelligence_memories.knowledge_type is
  'Epistemic level: FACT, PROCEDURE, POLICY, PATTERN, PREFERENCE, or OUTCOME. OUTCOME is instance-level learning and must not be treated as a general procedure/pattern.';
comment on column public.intelligence_memories.evidence_strength is
  'Strength of the authoritative evidence supporting the knowledge, bounded 0..1.';
comment on column public.intelligence_memories.contradiction_count is
  'Number of verified counter-evidence events observed against this knowledge.';
comment on column public.intelligence_memories.valid_until is
  'Optional expiry for knowledge that should be reconsidered after a bounded period.';
comment on column public.intelligence_memories.resource_refs is
  'Canonical resource identifiers this knowledge concerns; never a substitute for tenant authorization.';
