-- Server-mediated ownership transfer. The browser never executes the privileged
-- legacy SECURITY DEFINER function directly; the API supplies a verified auth user.
create or replace function public.server_transfer_organization_ownership(
  p_auth_user_id uuid,
  p_organization_id uuid,
  p_target_membership_id uuid,
  p_demote_current_owner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_current_membership uuid;
  v_target_org uuid;
  v_owner_role uuid;
  v_owner_count integer;
  v_operator_role uuid;
  v_current_primary_role uuid;
begin
  if p_auth_user_id is null or p_organization_id is null or p_target_membership_id is null then
    raise exception 'OWNERSHIP_TRANSFER_INPUT_REQUIRED';
  end if;

  select a.id into v_actor_id
  from public.actors a
  where a.auth_user_id = p_auth_user_id and a.status = 'ACTIVE'
  for update;

  if v_actor_id is null then raise exception 'ACTOR_INACTIVE'; end if;

  select m.id into v_current_membership
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.organization_id = p_organization_id
    and m.actor_id = v_actor_id
    and m.status = 'ACTIVE'
    and r.key = 'OWNER'
  limit 1
  for update of m;

  if v_current_membership is null then raise exception 'ACTIVE_OWNER_REQUIRED'; end if;

  select m.organization_id into v_target_org
  from public.memberships m
  where m.id = p_target_membership_id and m.status = 'ACTIVE'
  for update;

  if v_target_org is distinct from p_organization_id then
    raise exception 'TARGET_MEMBERSHIP_OUTSIDE_ORGANIZATION';
  end if;

  select id into v_owner_role from public.roles where key = 'OWNER';
  if v_owner_role is null then raise exception 'OWNER_ROLE_MISSING'; end if;

  insert into public.membership_roles(membership_id, role_id, is_primary)
  values (p_target_membership_id, v_owner_role, false)
  on conflict (membership_id, role_id) do nothing;

  if p_demote_current_owner then
    select count(*) into v_owner_count
    from public.membership_roles mr
    join public.memberships m on m.id = mr.membership_id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = p_organization_id
      and m.status = 'ACTIVE'
      and r.key = 'OWNER';

    if v_owner_count < 2 then raise exception 'FINAL_OWNER_CANNOT_BE_DEMOTED'; end if;

    select role_id into v_current_primary_role
    from public.membership_roles
    where membership_id = v_current_membership and is_primary = true;

    delete from public.membership_roles
    where membership_id = v_current_membership and role_id = v_owner_role;

    if v_current_primary_role = v_owner_role then
      select id into v_operator_role from public.roles where key = 'OPERATOR';
      if v_operator_role is null then raise exception 'OPERATOR_ROLE_MISSING'; end if;
      update public.memberships set role_id = v_operator_role, updated_at = now()
      where id = v_current_membership;
    end if;
  end if;

  update public.organizations set onboarding_state = 'ACTIVE', updated_at = now()
  where id = p_organization_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'target_membership_id', p_target_membership_id,
    'demoted_current_owner', p_demote_current_owner
  );
end;
$$;

revoke all on function public.server_transfer_organization_ownership(uuid,uuid,uuid,boolean)
from public, anon, authenticated;
grant execute on function public.server_transfer_organization_ownership(uuid,uuid,uuid,boolean)
to service_role;
