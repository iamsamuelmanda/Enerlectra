-- V2 migration 005: immutable evidence / observation and normalized event foundation
--
-- Domain distinction:
--   observation = evidence received/observed about reality
--   event       = normalized fact recognized by Enerlectra as having happened
--   situation   = contextual interpretation (added in a later migration)
--
-- Both records are append-only. Neither is an authoritative operational state.

create table public.observations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 actor_id uuid references public.actors(id) on delete set null,
 source text not null check (length(btrim(source)) between 1 and 100),
 observation_type text not null check (length(btrim(observation_type)) between 1 and 150),
 observed_at timestamptz not null,
 received_at timestamptz not null default now(),
 customer_id uuid,
 site_id uuid,
 asset_id uuid,
 value jsonb not null default '{}'::jsonb,
 provenance jsonb not null default '{}'::jsonb,
 raw_reference text,
 correlation_id uuid,
 created_at timestamptz not null default now(),
 unique (organization_id, id),
 foreign key (organization_id, customer_id)
   references public.customers(organization_id, id) on delete set null,
 foreign key (organization_id, site_id)
   references public.sites(organization_id, id) on delete set null,
 foreign key (organization_id, asset_id)
   references public.assets(organization_id, id) on delete set null
);

create table public.events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 actor_id uuid references public.actors(id) on delete set null,
 event_type text not null check (length(btrim(event_type)) between 1 and 150),
 occurred_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 source text not null check (length(btrim(source)) between 1 and 100),
 customer_id uuid,
 site_id uuid,
 asset_id uuid,
 source_observation_id uuid,
 payload jsonb not null default '{}'::jsonb,
 provenance jsonb not null default '{}'::jsonb,
 correlation_id uuid,
 causation_id uuid,
 created_at timestamptz not null default now(),
 unique (organization_id, id),
 foreign key (organization_id, customer_id)
   references public.customers(organization_id, id) on delete set null,
 foreign key (organization_id, site_id)
   references public.sites(organization_id, id) on delete set null,
 foreign key (organization_id, asset_id)
   references public.assets(organization_id, id) on delete set null,
 foreign key (organization_id, source_observation_id)
   references public.observations(organization_id, id) on delete restrict
);

create index observations_org_observed_idx
 on public.observations (organization_id, observed_at desc);
create index observations_org_type_idx
 on public.observations (organization_id, observation_type, observed_at desc);
create index observations_org_correlation_idx
 on public.observations (organization_id, correlation_id)
 where correlation_id is not null;

create index events_org_occurred_idx
 on public.events (organization_id, occurred_at desc);
create index events_org_type_idx
 on public.events (organization_id, event_type, occurred_at desc);
create index events_org_correlation_idx
 on public.events (organization_id, correlation_id)
 where correlation_id is not null;
create index events_org_causation_idx
 on public.events (organization_id, causation_id)
 where causation_id is not null;
create index events_org_observation_idx
 on public.events (organization_id, source_observation_id)
 where source_observation_id is not null;

-- Evidence and events are append-only domain facts.
-- There are deliberately no UPDATE or DELETE policies.
alter table public.observations enable row level security;
alter table public.observations force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;

create policy observations_select
 on public.observations for select to authenticated
 using (private.has_org_permission(organization_id,'observation.read'));

create policy observations_insert
 on public.observations for insert to authenticated
 with check (private.has_org_permission(organization_id,'observation.write'));

create policy events_select
 on public.events for select to authenticated
 using (private.has_org_permission(organization_id,'event.read'));

create policy events_insert
 on public.events for insert to authenticated
 with check (private.has_org_permission(organization_id,'event.write'));

grant select,insert on public.observations,public.events to authenticated;
