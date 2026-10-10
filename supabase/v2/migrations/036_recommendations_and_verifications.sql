-- 036: Shared operational intelligence primitives required by the
-- EPC and PAYGo validation slices.

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  situation_id uuid not null references public.situations(id) on delete cascade,
  generated_by text not null,
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED','ACCEPTED','REJECTED','EXPIRED')),
  recommendation_type text not null,
  summary text not null,
  rationale text,
  confidence numeric(6,5)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index recommendations_org_situation_idx
  on public.recommendations(organization_id, situation_id, created_at desc);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  situation_id uuid references public.situations(id) on delete cascade,
  work_item_id uuid references public.work_items(id) on delete cascade,
  action_id uuid references public.actions(id) on delete cascade,
  verification_type text not null,
  status text not null
    check (status in ('VERIFIED','PARTIAL','FAILED','REOPENED')),
  verified_by_actor_id uuid references public.actors(id) on delete set null,
  verified_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb,
  observation_id uuid references public.observations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  check (situation_id is not null or work_item_id is not null or action_id is not null)
);

create index verifications_org_situation_idx
  on public.verifications(organization_id, situation_id, verified_at desc);

create index verifications_org_work_idx
  on public.verifications(organization_id, work_item_id, verified_at desc);

alter table public.recommendations enable row level security;
alter table public.verifications enable row level security;

create policy recommendations_select_member
  on public.recommendations for select to authenticated
  using (private.is_active_member(organization_id));

create policy verifications_select_member
  on public.verifications for select to authenticated
  using (private.is_active_member(organization_id));

create policy verifications_insert_member
  on public.verifications for insert to authenticated
  with check (
    private.has_org_permission(organization_id, 'verification.write')
    and verified_by_actor_id = private.current_actor_id()
  );

revoke all on public.recommendations, public.verifications from anon;

grant select on public.recommendations to authenticated;
grant select, insert on public.verifications to authenticated;

revoke insert, update, delete on public.recommendations from authenticated;
