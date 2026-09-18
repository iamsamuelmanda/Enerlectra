-- Enerlectra V2 — Migration 002: Foundation security hardening
-- Move RLS helper functions out of the exposed public API schema.
-- create_organization remains an intentional authenticated RPC.

create schema if not exists private;

create or replace function private.current_actor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id
  from public.actors a
  where a.auth_user_id = auth.uid()
    and a.status = 'ACTIVE'
  limit 1
$$;

create or replace function private.is_active_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    where a.auth_user_id = auth.uid()
      and a.status = 'ACTIVE'
      and m.organization_id = p_organization_id
      and m.status = 'ACTIVE'
  )
$$;

create or replace function private.has_org_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = auth.uid()
      and a.status = 'ACTIVE'
      and m.organization_id = p_organization_id
      and m.status = 'ACTIVE'
      and p.key = p_permission_key
  )
$$;

revoke all on function private.current_actor_id() from public, anon, authenticated;
revoke all on function private.is_active_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_permission(uuid,text) from public, anon, authenticated;

drop policy if exists organizations_select_member on public.organizations;
drop policy if exists organizations_update_manager on public.organizations;
drop policy if exists memberships_select_member on public.memberships;
drop policy if exists memberships_insert_manager on public.memberships;
drop policy if exists memberships_update_manager on public.memberships;
drop policy if exists memberships_delete_manager on public.memberships;
drop policy if exists channel_identities_select_self on public.channel_identities;
drop policy if exists channel_identities_insert_self on public.channel_identities;
drop policy if exists channel_identities_update_self on public.channel_identities;
drop policy if exists channel_identities_delete_self on public.channel_identities;

create policy organizations_select_member on public.organizations for select to authenticated
using (private.is_active_member(id));

create policy organizations_update_manager on public.organizations for update to authenticated
using (private.has_org_permission(id, 'organization.manage'))
with check (private.has_org_permission(id, 'organization.manage'));

create policy memberships_select_member on public.memberships for select to authenticated
using (private.is_active_member(organization_id));

create policy memberships_insert_manager on public.memberships for insert to authenticated
with check (private.has_org_permission(organization_id, 'organization.manage'));

create policy memberships_update_manager on public.memberships for update to authenticated
using (private.has_org_permission(organization_id, 'organization.manage'))
with check (private.has_org_permission(organization_id, 'organization.manage'));

create policy memberships_delete_manager on public.memberships for delete to authenticated
using (private.has_org_permission(organization_id, 'organization.manage'));

create policy channel_identities_select_self on public.channel_identities for select to authenticated
using (actor_id = private.current_actor_id());

create policy channel_identities_insert_self on public.channel_identities for insert to authenticated
with check (actor_id = private.current_actor_id());

create policy channel_identities_update_self on public.channel_identities for update to authenticated
using (actor_id = private.current_actor_id())
with check (actor_id = private.current_actor_id());

create policy channel_identities_delete_self on public.channel_identities for delete to authenticated
using (actor_id = private.current_actor_id());

create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_org public.organizations;
  v_owner_role uuid;
begin
  v_actor_id := private.current_actor_id();

  if v_actor_id is null then
    raise exception 'ACTIVE_ACTOR_REQUIRED';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;

  insert into public.organizations(name)
  values (btrim(p_name))
  returning * into v_org;

  select id into v_owner_role from public.roles where key = 'OWNER';
  if v_owner_role is null then raise exception 'OWNER_ROLE_MISSING'; end if;

  insert into public.memberships(organization_id, actor_id, role_id, status)
  values (v_org.id, v_actor_id, v_owner_role, 'ACTIVE');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

drop function public.current_actor_id();
drop function public.is_active_member(uuid);
drop function public.has_org_permission(uuid,text);
