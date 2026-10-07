-- Enerlectra convergence — Migration 052: organizational intelligence provenance
-- Extends the first Ellie learning slice without making AI memory a second source of truth.
-- Canonical business facts remain in domain tables; this table stores bounded organizational knowledge.

alter table public.intelligence_memories
  add column if not exists knowledge_type text,
  add column if not exists evidence_strength numeric not null default 0.5
    check (evidence_strength >= 0 and evidence_strength <= 1),
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists contradiction_count integer not null default 0
    check (contradiction_count >= 0),
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
end
where knowledge_type is null;

alter table public.intelligence_memories
  alter column knowledge_type set default 'OUTCOME';

alter table public.intelligence_memories
  alter column knowledge_type set not null;

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_knowledge_type_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_knowledge_type_check
  check (knowledge_type in ('FACT','PROCEDURE','POLICY','PATTERN','PREFERENCE','OUTCOME'));

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_validity_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_validity_check
  check (valid_until is null or valid_from is null or valid_until >= valid_from);

create or replace function public.refresh_intelligence_memory_search_document()
returns trigger
language plpgsql
immutable
set search_path = public
as $$
begin
  new.search_document :=
    to_tsvector(
      'simple',
      coalesce(new.scope_key, '') || ' ' || coalesce(new.statement, '')
    );
  return new;
end;
$$;

drop trigger if exists intelligence_memories_search_document on public.intelligence_memories;

create trigger intelligence_memories_search_document
before insert or update of scope_key, statement
on public.intelligence_memories
for each row execute function public.refresh_intelligence_memory_search_document();

update public.intelligence_memories
set search_document =
  to_tsvector('simple', coalesce(scope_key, '') || ' ' || coalesce(statement, ''));

create index if not exists intelligence_memories_search_document_idx
  on public.intelligence_memories using gin(search_document);

create index if not exists intelligence_memories_org_knowledge_validity_idx
  on public.intelligence_memories(
    organization_id,
    knowledge_type,
    status,
    valid_from,
    valid_until,
    last_confirmed_at desc
  );

create index if not exists intelligence_memories_superseded_by_idx
  on public.intelligence_memories(superseded_by);

create index if not exists intelligence_memories_resource_refs_gin_idx
  on public.intelligence_memories using gin(resource_refs);

-- The old memory_type remains for compatibility/audit history. New code must use
-- knowledge_type for epistemic meaning. OUTCOME is deliberately not auto-promoted
-- to PATTERN by repeated recommendations.
