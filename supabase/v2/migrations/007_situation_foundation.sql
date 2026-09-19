-- V2 migration 007: situation / incident foundation
--
-- A situation is an evolving operational interpretation of immutable events.
-- It is not itself an event, diagnosis, work item, or authoritative domain fact.

create table public.situations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 situation_type text not null check (length(btrim(situation_type)) between 1 and 150),
 status text not null default 'OPEN' check (status in ('OPEN','INVESTIGATING','RESOLVED','DISMISSED')),
 severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
 title text not null check (length(btrim(title)) between 1 and 250),
 summary text,
 customer_id uuid,
 site_id uuid,
 asset_id uuid,
 opened_at timestamptz not null default now(),
 resolved_at timestamptz,
 last_observed_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id,id),
 foreign key (organization_id,customer_id) references public.customers(organization_id,id) on delete set null,
 foreign key (organization_id,site_id) references public.sites(organization_id,id) on delete set null,
 foreign key (organization_id,asset_id) references public.assets(organization_id,id) on delete set null,
 check ((status in ('RESOLVED','DISMISSED')) = (resolved_at is not null)),
 check (resolved_at is null or resolved_at >= opened_at)
);

create table public.situation_event_links (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 situation_id uuid not null,
 event_id uuid not null,
 relation_type text not null default 'SUPPORTING' check (relation_type in ('TRIGGER','SUPPORTING','RESOLUTION')),
 created_at timestamptz not null default now(),
 primary key (organization_id,situation_id,event_id),
 foreign key (organization_id,situation_id) references public.situations(organization_id,id) on delete cascade,
 foreign key (organization_id,event_id) references public.events(organization_id,id) on delete restrict
);

create table public.situation_history (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 situation_id uuid not null,
 actor_id uuid references public.actors(id) on delete set null,
 from_status text check (from_status is null or from_status in ('OPEN','INVESTIGATING','RESOLVED','DISMISSED')),
 to_status text not null check (to_status in ('OPEN','INVESTIGATING','RESOLVED','DISMISSED')),
 reason text,
 created_at timestamptz not null default now(),
 unique (organization_id,id),
 foreign key (organization_id,situation_id) references public.situations(organization_id,id) on delete restrict
);

create index situations_org_status_idx on public.situations(organization_id,status,updated_at desc);
create index situations_org_subject_idx on public.situations(organization_id,asset_id,site_id,customer_id);
create index situation_event_links_org_event_idx on public.situation_event_links(organization_id,event_id);
create index situation_history_org_situation_idx on public.situation_history(organization_id,situation_id,created_at desc);

create trigger situations_set_updated_at before update on public.situations for each row execute function public.set_updated_at();

alter table public.situations enable row level security;
alter table public.situations force row level security;
alter table public.situation_event_links enable row level security;
alter table public.situation_event_links force row level security;
alter table public.situation_history enable row level security;
alter table public.situation_history force row level security;

create policy situations_select on public.situations for select to authenticated using (private.has_org_permission(organization_id,'situation.read'));
create policy situations_insert on public.situations for insert to authenticated with check (private.has_org_permission(organization_id,'situation.manage'));
create policy situations_update on public.situations for update to authenticated using (private.has_org_permission(organization_id,'situation.manage')) with check (private.has_org_permission(organization_id,'situation.manage'));

create policy situation_event_links_select on public.situation_event_links for select to authenticated using (private.has_org_permission(organization_id,'situation.read'));
create policy situation_event_links_insert on public.situation_event_links for insert to authenticated with check (private.has_org_permission(organization_id,'situation.manage'));
create policy situation_event_links_delete on public.situation_event_links for delete to authenticated using (private.has_org_permission(organization_id,'situation.manage'));

create policy situation_history_select on public.situation_history for select to authenticated using (private.has_org_permission(organization_id,'situation.read'));

grant select,insert,update on public.situations to authenticated;
grant select,insert,delete on public.situation_event_links to authenticated;
grant select on public.situation_history to authenticated;
