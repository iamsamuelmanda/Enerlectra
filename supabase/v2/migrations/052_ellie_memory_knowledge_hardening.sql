-- Enerlectra — Migration 052: Ellie evidence-backed organizational memory hardening
-- Converts the first learning slice into a typed, provenance-aware knowledge store.
-- Outcomes remain distinct from organizational patterns and are never auto-promoted.

alter table public.intelligence_memories
  add column if not exists knowledge_type text not null default 'OUTCOME',
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists evidence_strength numeric not null default 0.5
    check (evidence_strength >= 0 and evidence_strength <= 1),
  add column if not exists contradiction_count integer not null default 0
    check (contradiction_count >= 0),
  add column if not exists last_counter_evidence_at timestamptz,
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz;

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_memory_type_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_memory_type_check
  check (memory_type in (
    'OPERATIONAL_PATTERN',
    'POLICY_FACT',
    'PREFERENCE',
    'OUTCOME_PATTERN',
    'PROCEDURE',
    'FACT',
    'PATTERN',
    'POLICY',
    'OUTCOME'
  ));

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_knowledge_type_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_knowledge_type_check
  check (knowledge_type in ('FACT','PROCEDURE','POLICY','PATTERN','PREFERENCE','OUTCOME'));

alter table public.intelligence_memories
  drop column if exists search_document;

alter table public.intelligence_memories
  add column search_document tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(scope_key, '') || ' ' ||
      coalesce(statement, '') || ' ' ||
      coalesce(knowledge_type, '') || ' ' ||
      coalesce(memory_type, '')
    )
  ) stored;

create index if not exists intelligence_memories_search_idx
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

create index if not exists intelligence_memories_org_scope_idx
  on public.intelligence_memories(organization_id, scope_key);

-- Existing first-generation memories are explicitly classified as outcomes.
update public.intelligence_memories
set
  knowledge_type = case
    when knowledge_type in ('FACT','PROCEDURE','POLICY','PATTERN','PREFERENCE','OUTCOME') then knowledge_type
    else 'OUTCOME'
  end,
  evidence_strength = greatest(least(coalesce(evidence_strength, confidence), 1), 0),
  resource_refs = coalesce(resource_refs, '[]'::jsonb),
  contradiction_count = coalesce(contradiction_count, 0),
  valid_from = coalesce(valid_from, first_observed_at, now()),
  valid_until = coalesce(valid_until, first_observed_at + interval '180 days', now() + interval '180 days');

comment on column public.intelligence_memories.knowledge_type is
  'Epistemic class: canonical facts/policies are not AI memory; outcome knowledge requires verified evidence and explicit promotion before becoming a pattern.';

comment on column public.intelligence_memories.evidence_refs is
  'Identifiers of authoritative evidence supporting this knowledge claim.';

comment on column public.intelligence_memories.resource_refs is
  'Canonical customer/site/asset/resource identifiers to which the knowledge applies.';

comment on column public.intelligence_memories.valid_until is
  'Temporal validity boundary. Expired knowledge is not eligible for Ellie retrieval.';
