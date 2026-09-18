-- Enerlectra V2 — Migration 001: Foundation
-- Scope: identity, tenancy, authorization primitives, channel identity.
-- Reproducible from an empty Supabase database.
-- No V1 marketplace/PCU/cluster/settlement objects.

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_name_ci_uq on public.organizations (lower(name));

create table public.actors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  actor_type text not null default 'HUMAN'
    check (actor_type in ('HUMAN','SYSTEM')),
  display_name text,
  email text,
  phone text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED','DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index actors_auth_user_id_idx on public.actors(auth_user_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.actors(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'ACTIVE'
    check (status in ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, actor_id)
);

create index memberships_actor_org_idx on public.memberships(actor_id, organization_id);
create index memberships_org_status_idx on public.memberships(organization_id, status);

create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.actors(id) on delete cascade,
  channel text not null check (length(btrim(channel)) between 1 and 50),
  external_id text not null check (length(btrim(external_id)) between 1 and 255),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DISABLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);

create index channel_identities_actor_idx on public.channel_identities(actor_id);

insert into public.roles (key, name, description) values
  ('OWNER', 'Owner', 'Full organizational authority within the platform permission boundary.'),
  ('OPERATOR', 'Operator', 'Operational user responsible for day-to-day work.'),
  ('TECHNICIAN', 'Technician', 'Field/service execution role.'),
  ('FINANCE', 'Finance', 'Financial and reconciliation operational role.'),
  ('VIEWER', 'Viewer', 'Read-only operational access.')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('organization.read', 'Read organization information.'),
  ('organization.manage', 'Manage organization settings and membership.'),
  ('customer.read', 'Read customer records.'),
  ('customer.write', 'Create and update customer records.'),
  ('site.read', 'Read site records.'),
  ('site.write', 'Create and update site records.'),
  ('asset.read', 'Read asset records.'),
  ('asset.write', 'Create and update asset records.'),
  ('observation.read', 'Read operational observations.'),
  ('observation.write', 'Record operational observations.'),
  ('event.read', 'Read operational events.'),
  ('event.write', 'Record operational events.'),
  ('situation.read', 'Read operational situations.'),
  ('situation.manage', 'Manage operational situations.'),
  ('work.read', 'Read operational work.'),
  ('work.assign', 'Assign operational work.'),
  ('work.execute', 'Execute assigned operational work.'),
  ('recommendation.read', 'Read operational recommendations.'),
  ('action.authorize', 'Authorize consequential operational actions.'),
  ('verification.read', 'Read verification records.'),
  ('verification.write', 'Record verification results.'),
  ('communication.read', 'Read organization communication records.'),
  ('communication.send', 'Send organization communications.'),
  ('audit.read', 'Read organization audit records.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'OWNER' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','customer.write','site.read','site.write',
  'asset.read','asset.write','observation.read','observation.write','event.read','event.write',
  'situation.read','situation.manage','work.read','work.assign','work.execute',
  'recommendation.read','verification.read','verification.write','communication.read','communication.send'
) where r.key = 'OPERATOR' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read',
  'observation.read','observation.write','event.read','event.write','situation.read',
  'work.read','work.execute','recommendation.read','verification.read','verification.write','communication.read'
) where r.key = 'TECHNICIAN' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read',
  'observation.read','observation.write','event.read','event.write','situation.read',
  'work.read','recommendation.read','verification.read','communication.read'
) where r.key = 'FINANCE' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read','observation.read',
  'event.read','situation.read','work.read','recommendation.read','verification.read','communication.read'
) where r.key = 'VIEWER' on conflict do nothing;

create or replace function public.current_actor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from public.actors a
  where a.auth_user_id = auth.uid() and a.status = 'ACTIVE' limit 1
$$;

create or replace function public.is_active_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.actors a on a.id = m.actor_id
    where a.auth_user_id = auth.uid() and a.status = 'ACTIVE'
      and m.organization_id = p_organization_id and m.status = 'ACTIVE'
  )
$$;

create or replace function public.has_org_permission(p_organization_id uuid, p_permission_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = auth.uid() and a.status = 'ACTIVE'
      and m.organization_id = p_organization_id and m.status = 'ACTIVE'
      and p.key = p_permission_key
  )
$$;

revoke all on function public.current_actor_id() from public, anon;
revoke all on function public.is_active_member(uuid) from public, anon;
revoke all on function public.has_org_permission(uuid,text) from public, anon;
grant execute on function public.current_actor_id() to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid,text) to authenticated;

create or replace function public.create_organization(p_name text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid;
  v_org public.organizations;
  v_owner_role uuid;
begin
  v_actor_id := public.current_actor_id();
  if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'ORGANIZATION_NAME_REQUIRED'; end if;

  insert into public.organizations(name) values (btrim(p_name)) returning * into v_org;
  select id into v_owner_role from public.roles where key = 'OWNER';
  if v_owner_role is null then raise exception 'OWNER_ROLE_MISSING'; end if;

  insert into public.memberships(organization_id, actor_id, role_id, status)
  values (v_org.id, v_actor_id, v_owner_role, 'ACTIVE');
  return v_org;
end;
$$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger actors_set_updated_at before update on public.actors
for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
for each row execute function public.set_updated_at();
create trigger channel_identities_set_updated_at before update on public.channel_identities
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.actors enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.channel_identities enable row level security;

create policy organizations_select_member on public.organizations for select to authenticated
using (public.is_active_member(id));
create policy organizations_update_manager on public.organizations for update to authenticated
using (public.has_org_permission(id, 'organization.manage'))
with check (public.has_org_permission(id, 'organization.manage'));

create policy actors_select_self on public.actors for select to authenticated
using (auth_user_id = auth.uid());
create policy actors_insert_self on public.actors for insert to authenticated
with check (auth_user_id = auth.uid() and actor_type = 'HUMAN');
create policy actors_update_self on public.actors for update to authenticated
using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy memberships_select_member on public.memberships for select to authenticated
using (public.is_active_member(organization_id));
create policy memberships_insert_manager on public.memberships for insert to authenticated
with check (public.has_org_permission(organization_id, 'organization.manage'));
create policy memberships_update_manager on public.memberships for update to authenticated
using (public.has_org_permission(organization_id, 'organization.manage'))
with check (public.has_org_permission(organization_id, 'organization.manage'));
create policy memberships_delete_manager on public.memberships for delete to authenticated
using (public.has_org_permission(organization_id, 'organization.manage'));

create policy roles_select_authenticated on public.roles for select to authenticated using (true);
create policy permissions_select_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_select_authenticated on public.role_permissions for select to authenticated using (true);

create policy channel_identities_select_self on public.channel_identities for select to authenticated
using (actor_id = public.current_actor_id());
create policy channel_identities_insert_self on public.channel_identities for insert to authenticated
with check (actor_id = public.current_actor_id());
create policy channel_identities_update_self on public.channel_identities for update to authenticated
using (actor_id = public.current_actor_id()) with check (actor_id = public.current_actor_id());
create policy channel_identities_delete_self on public.channel_identities for delete to authenticated
using (actor_id = public.current_actor_id());

revoke all on public.organizations, public.actors, public.memberships, public.roles,
  public.permissions, public.role_permissions, public.channel_identities from anon;

grant select, insert, update on public.actors to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select, insert, update, delete on public.channel_identities to authenticated;

revoke insert, update, delete on public.roles, public.permissions, public.role_permissions from authenticated;
