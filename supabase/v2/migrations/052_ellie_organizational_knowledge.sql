-- Enerlectra — Migration 052: evidence-backed organizational knowledge
-- Facts remain canonical domain records. Ellie memory stores bounded organizational
-- knowledge with explicit epistemic level, provenance, resource scope, and validity.

alter table public.intelligence_memories
  add column if not exists knowledge_type text,
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists evidence_strength numeric not null default 0.5,
  add column if not exists contradiction_count integer not null default 0,
  add column if not exists last_counter_evidence_at timestamptz,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists superseded_by uuid references public.intelligence_memories(id) on delete set null,
  add column if not exists search_document tsvector;

update public.intelligence_memories
set knowledge_type = case memory_type
  when 'OPERATIONAL_PATTERN' then 'PATTERN'
  when 'POLICY_FACT' then 'POLICY'
  when 'PREFERENCE' then 'PREFERENCE'
  when 'OUTCOME_PATTERN' then 'OUTCOME'
  else 'OUTCOME'
end,
evidence_strength = greatest(least(coalesce(evidence_strength, confidence), 1), 0),
resource_refs = coalesce(resource_refs, '[]'::jsonb),
contradiction_count = coalesce(contradiction_count, 0),
valid_from = coalesce(valid_from, first_observed_at, now()),
valid_until = coalesce(valid_until, first_observed_at + interval '180 days', now() + interval '180 days');

alter table public.intelligence_memories
  alter column knowledge_type set default 'OUTCOME',
  alter column knowledge_type set not null;

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

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_validity_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_validity_check
  check (valid_until is null or valid_from is null or valid_until >= valid_from);

create or replace function public.refresh_intelligence_memory_search_document()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_document := to_tsvector(
    'simple',
    coalesce(new.scope_key, '') || ' ' ||
    coalesce(new.statement, '') || ' ' ||
    coalesce(new.knowledge_type, '') || ' ' ||
    coalesce(new.memory_type, '')
  );
  return new;
end;
$$;

drop trigger if exists intelligence_memories_search_document on public.intelligence_memories;

create trigger intelligence_memories_search_document
before insert or update of scope_key, statement, knowledge_type, memory_type
on public.intelligence_memories
for each row execute function public.refresh_intelligence_memory_search_document();

update public.intelligence_memories
set search_document = to_tsvector(
  'simple',
  coalesce(scope_key, '') || ' ' ||
  coalesce(statement, '') || ' ' ||
  coalesce(knowledge_type, '') || ' ' ||
  coalesce(memory_type, '')
);

create index if not exists intelligence_memories_search_document_idx
  on public.intelligence_memories using gin(search_document);

create index if not exists intelligence_memories_org_knowledge_validity_idx
  on public.intelligence_memories(
    organization_id, knowledge_type, status, valid_from, valid_until,
    last_confirmed_at desc
  );

create index if not exists intelligence_memories_superseded_by_idx
  on public.intelligence_memories(superseded_by);

create index if not exists intelligence_memories_resource_refs_gin_idx
  on public.intelligence_memories using gin(resource_refs);

comment on column public.intelligence_memories.knowledge_type is
  'Epistemic class: FACT, PROCEDURE, POLICY, PATTERN, PREFERENCE or OUTCOME. OUTCOME is instance-level learning and is not organizational doctrine.';
comment on column public.intelligence_memories.evidence_refs is
  'Identifiers of authoritative evidence supporting this knowledge claim.';
comment on column public.intelligence_memories.evidence_strength is
  'Strength of authoritative evidence supporting the knowledge, bounded 0..1.';
comment on column public.intelligence_memories.contradiction_count is
  'Number of verified counter-evidence events observed against this knowledge.';
comment on column public.intelligence_memories.resource_refs is
  'Canonical resource identifiers to which the knowledge applies; never a substitute for tenant authorization.';
comment on column public.intelligence_memories.valid_until is
  'Temporal validity boundary; expired knowledge is excluded from retrieval.';
