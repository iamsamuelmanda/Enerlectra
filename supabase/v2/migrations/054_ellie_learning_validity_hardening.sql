-- Enerlectra convergence — Migration 054: Ellie learning validity hardening
-- Complements 052_ellie_organizational_knowledge_provenance.
-- Does not replace the existing trigger-backed search_document representation.

alter table public.intelligence_memories
  add column if not exists evidence_strength numeric not null default 0.5
    check (evidence_strength >= 0 and evidence_strength <= 1),
  add column if not exists resource_refs jsonb not null default '[]'::jsonb,
  add column if not exists contradiction_count integer not null default 0
    check (contradiction_count >= 0),
  add column if not exists last_counter_evidence_at timestamptz,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz;

update public.intelligence_memories
set
  evidence_strength = greatest(least(coalesce(evidence_strength, confidence), 1), 0),
  resource_refs = coalesce(resource_refs, '[]'::jsonb),
  contradiction_count = coalesce(contradiction_count, 0),
  valid_from = coalesce(valid_from, first_observed_at, now()),
  valid_until = coalesce(valid_until, first_observed_at + interval '180 days', now() + interval '180 days');

alter table public.intelligence_memories
  drop constraint if exists intelligence_memories_validity_check;

alter table public.intelligence_memories
  add constraint intelligence_memories_validity_check
  check (valid_until is null or valid_from is null or valid_until >= valid_from);

create index if not exists intelligence_memories_org_scope_idx
  on public.intelligence_memories(organization_id, scope_key);

create index if not exists intelligence_memories_resource_refs_gin_idx
  on public.intelligence_memories using gin(resource_refs);

comment on column public.intelligence_memories.knowledge_type is
  'Epistemic class: FACT, PROCEDURE, POLICY, PATTERN, PREFERENCE or OUTCOME.';
comment on column public.intelligence_memories.evidence_refs is
  'Identifiers of authoritative evidence supporting this knowledge claim.';
comment on column public.intelligence_memories.resource_refs is
  'Canonical customer/site/asset/resource identifiers to which the knowledge applies.';
comment on column public.intelligence_memories.valid_until is
  'Temporal validity boundary; expired knowledge is excluded from retrieval.';
