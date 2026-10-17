-- V2 migration 009: work item foundation
--
-- A work item is an authorized unit of operational work created to move a
-- situation toward a verifiable outcome. It is not evidence, an event,
-- diagnosis, action, or situation resolution.

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  situation_id uuid not null,
  work_type text not null check (work_type in (
    'INVESTIGATE','CONTACT_CUSTOMER','VISIT_SITE','RECONCILE_PAYMENT','ESCALATE_EXTERNAL'
  )),
  status text not null default 'OPEN' check (status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  title text not null check (length(btrim(title)) between 1 and 250),
  description text,
  customer_id uuid,
  site_id uuid,
  asset_id uuid,
  assigned_actor_id uuid references public.actors(id) on delete set null,
  assigned_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  created_by_actor_id uuid not null references public.actors(id) on delete restrict,
  correlation_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,situation_id) references public.situations(organization_id,id) on delete restrict,
  foreign key (organization_id,customer_id) references public.customers(organization_id,id) on delete set null,
  foreign key (organization_id,site_id) references public.sites(organization_id,id) on delete set null,
  foreign key (organization_id,asset_id) references public.assets(organization_id,id) on delete set null,
  check (status not in ('ASSIGNED','IN_PROGRESS') or assigned_actor_id is not null),
  check ((status = 'COMPLETED') = (completed_at is not null)),
  check (assigned_at is null or assigned_actor_id is not null),
  check (due_at is null or due_at >= created_at),
  check (completed_at is null or completed_at >= created_at)
);

create unique index work_items_org_idempotency_key_uidx
  on public.work_items(organization_id,idempotency_key)
  where idempotency_key is not null;

create index work_items_org_status_idx on public.work_items(organization_id,status,updated_at desc);
create index work_items_org_situation_idx on public.work_items(organization_id,situation_id,created_at desc);
create index work_items_org_assignee_idx on public.work_items(organization_id,assigned_actor_id,status);
create index work_items_org_subject_idx on public.work_items(organization_id,asset_id,site_id,customer_id);

create trigger work_items_set_updated_at before update on public.work_items
for each row execute function public.set_updated_at();

alter table public.work_items enable row level security;
alter table public.work_items force row level security;

create policy work_items_select on public.work_items for select to authenticated
using ((select private.has_org_permission(organization_id,'work.read')));

create policy work_items_insert on public.work_items for insert to authenticated
with check ((select private.has_org_permission(organization_id,'work.execute')));

create policy work_items_update on public.work_items for update to authenticated
using (
  (select private.has_org_permission(organization_id,'work.execute'))
  or (select private.has_org_permission(organization_id,'work.assign'))
)
with check (
  (select private.has_org_permission(organization_id,'work.execute'))
  or (select private.has_org_permission(organization_id,'work.assign'))
);

grant select, insert, update on public.work_items to authenticated;
