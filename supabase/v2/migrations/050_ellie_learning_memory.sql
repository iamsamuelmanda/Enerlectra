-- Enerlectra V2 — Migration 050: Tenant-scoped Ellie learning memory
-- Learning is derived from verified operational outcomes, never from raw cross-tenant model state.

create table public.intelligence_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  verification_id uuid references public.verifications(id) on delete set null,
  outcome text not null check (outcome in ('ACCEPTED','REJECTED','VERIFIED','FAILED','SUPERSEDED')),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index intelligence_learning_events_org_idx
  on public.intelligence_learning_events(organization_id, occurred_at desc);

create table public.intelligence_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  memory_type text not null check (memory_type in ('OPERATIONAL_PATTERN','POLICY_FACT','PREFERENCE','OUTCOME_PATTERN')),
  scope_key text not null,
  statement text not null check (length(btrim(statement)) between 1 and 2000),
  evidence_refs jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  source text not null default 'VERIFIED_OUTCOME',
  first_observed_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope_key, statement)
);

create index intelligence_memories_org_active_idx
  on public.intelligence_memories(organization_id, status, last_confirmed_at desc);

create trigger intelligence_memories_set_updated_at
before update on public.intelligence_memories
for each row execute function public.set_updated_at();

alter table public.intelligence_learning_events enable row level security;
alter table public.intelligence_memories enable row level security;

create policy intelligence_learning_events_select_member
on public.intelligence_learning_events for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = auth.uid()
      and a.status = 'ACTIVE'
      and m.organization_id = intelligence_learning_events.organization_id
      and m.status = 'ACTIVE'
      and p.key = 'recommendation.read'
  )
);

create policy intelligence_memories_select_member
on public.intelligence_memories for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = auth.uid()
      and a.status = 'ACTIVE'
      and m.organization_id = intelligence_memories.organization_id
      and m.status = 'ACTIVE'
      and p.key = 'recommendation.read'
  )
);

revoke all on public.intelligence_learning_events, public.intelligence_memories from anon;
grant select on public.intelligence_learning_events, public.intelligence_memories to authenticated;

-- Writes are intentionally server-side/service-role only. The browser cannot teach
-- Ellie directly; verified operational outcomes are the learning boundary.
