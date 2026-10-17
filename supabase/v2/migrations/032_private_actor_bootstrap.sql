-- Enerlectra V2 — Migration 032: keep actor bootstrap helper private
--
-- Customer-facing onboarding RPCs remain public authenticated RPCs. The helper
-- they use to derive the current Actor is not itself a customer API surface.

create or replace function private.ensure_current_actor()
returns public.actors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.actors;
  v_auth_id uuid;
begin
  v_auth_id := auth.uid();

  if v_auth_id is null then
    raise exception 'AUTHENTICATED_USER_REQUIRED';
  end if;

  select a.* into v_actor
  from public.actors a
  where a.auth_user_id = v_auth_id
  limit 1;

  if v_actor.id is not null then
    return v_actor;
  end if;

  insert into public.actors(
    auth_user_id, actor_type, display_name, email, status
  )
  values (
    v_auth_id,
    'HUMAN',
    nullif(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name'
    ), ''),
    nullif(auth.jwt() ->> 'email', ''),
    'ACTIVE'
  )
  returning * into v_actor;

  return v_actor;
end;
$$;

revoke all on function private.ensure_current_actor() from public, anon, authenticated;

create or replace function public.create_organization(
  p_name text,
  p_creator_intent text default 'OWNER'
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_org public.organizations;
  v_role_id uuid;
begin
  select id into v_actor_id from private.ensure_current_actor();

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;

  if p_creator_intent not in ('OWNER','DELEGATED_OPERATOR') then
    raise exception 'INVALID_CREATOR_INTENT';
  end if;

  insert into public.organizations(name, created_by_actor_id, onboarding_state)
  values (
    btrim(p_name),
    v_actor_id,
    case when p_creator_intent = 'OWNER' then 'ACTIVE' else 'PENDING_AUTHORITY' end
  )
  returning * into v_org;

  select id into v_role_id
  from public.roles
  where key = case when p_creator_intent = 'OWNER' then 'OWNER' else 'OPERATOR' end;

  if v_role_id is null then raise exception 'ONBOARDING_ROLE_MISSING'; end if;

  insert into public.memberships(organization_id, actor_id, role_id, status)
  values (v_org.id, v_actor_id, v_role_id, 'ACTIVE');

  return v_org;
end;
$$;

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_purpose text,
  p_role_key text default 'OWNER'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role_id uuid;
  v_token text;
  v_inv public.organization_invitations;
begin
  select id into v_actor_id from private.ensure_current_actor();

  if p_purpose = 'OWNER_CLAIM' then
    if not (
      private.has_org_permission(p_organization_id, 'organization.ownership.manage')
      or private.has_org_permission(p_organization_id, 'organization.setup')
    ) then
      raise exception 'ORGANIZATION_OWNERSHIP_INVITE_FORBIDDEN';
    end if;
  elsif p_purpose = 'MEMBER_INVITE' then
    if not private.has_org_permission(p_organization_id, 'organization.members.manage') then
      raise exception 'ORGANIZATION_MEMBER_INVITE_FORBIDDEN';
    end if;
  else
    raise exception 'INVALID_INVITATION_PURPOSE';
  end if;

  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if p_purpose = 'OWNER_CLAIM' and p_role_key <> 'OWNER' then
    raise exception 'OWNER_CLAIM_REQUIRES_OWNER_ROLE';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.organization_invitations(
    organization_id, purpose, email, role_id, token_hash,
    invited_by_actor_id, expires_at
  )
  values (
    p_organization_id, p_purpose, lower(btrim(p_email)), v_role_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_actor_id, now() + interval '7 days'
  )
  returning * into v_inv;

  return jsonb_build_object(
    'invitation_id', v_inv.id,
    'token', v_token,
    'email', v_inv.email,
    'purpose', v_inv.purpose,
    'expires_at', v_inv.expires_at
  );
end;
$$;

create or replace function public.accept_organization_invitation(p_token text)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.actors;
  v_inv public.organization_invitations;
  v_membership public.memberships;
begin
  select * into v_actor from private.ensure_current_actor();

  select * into v_inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'PENDING'
    and expires_at > now()
  for update;

  if v_inv.id is null then raise exception 'INVITATION_INVALID_OR_EXPIRED'; end if;
  if lower(coalesce(v_actor.email, '')) <> lower(v_inv.email) then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;

  select * into v_membership
  from public.memberships
  where organization_id=v_inv.organization_id and actor_id=v_actor.id
  limit 1;

  if v_membership.id is null then
    insert into public.memberships(organization_id, actor_id, role_id, status)
    values (v_inv.organization_id, v_actor.id, v_inv.role_id, 'ACTIVE')
    returning * into v_membership;
  else
    update public.memberships
    set status='ACTIVE',
        role_id=case when v_inv.purpose='OWNER_CLAIM' then v_inv.role_id else role_id end,
        updated_at=now()
    where id=v_membership.id
    returning * into v_membership;
  end if;

  insert into public.membership_roles(membership_id, role_id, is_primary)
  values (v_membership.id, v_inv.role_id, true)
  on conflict (membership_id, role_id) do update set is_primary=true;

  if v_inv.purpose='OWNER_CLAIM' then
    update public.organizations
    set onboarding_state='ACTIVE', updated_at=now()
    where id=v_inv.organization_id;
  end if;

  update public.organization_invitations
  set status='ACCEPTED', accepted_by_actor_id=v_actor.id, accepted_at=now()
  where id=v_inv.id;

  return v_membership;
end;
$$;

create or replace function public.transfer_organization_ownership(
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
  v_current_actor uuid;
  v_current_membership uuid;
  v_target_org uuid;
  v_owner_role uuid;
  v_owner_count integer;
  v_operator_role uuid;
  v_current_primary_role uuid;
begin
  select id into v_current_actor from private.ensure_current_actor();

  select m.id into v_current_membership
  from public.memberships m
  join public.membership_roles mr on mr.membership_id=m.id
  join public.roles r on r.id=mr.role_id
  where m.organization_id=p_organization_id
    and m.actor_id=v_current_actor
    and m.status='ACTIVE'
    and r.key='OWNER'
  limit 1;

  if v_current_membership is null then raise exception 'ACTIVE_OWNER_REQUIRED'; end if;

  select m.organization_id into v_target_org
  from public.memberships m
  where m.id=p_target_membership_id and m.status='ACTIVE';

  if v_target_org is distinct from p_organization_id then
    raise exception 'TARGET_MEMBERSHIP_OUTSIDE_ORGANIZATION';
  end if;

  select id into v_owner_role from public.roles where key='OWNER';
  if v_owner_role is null then raise exception 'OWNER_ROLE_MISSING'; end if;

  insert into public.membership_roles(membership_id, role_id, is_primary)
  values (p_target_membership_id, v_owner_role, false)
  on conflict (membership_id, role_id) do nothing;

  if p_demote_current_owner then
    select count(*) into v_owner_count
    from public.membership_roles mr
    join public.memberships m on m.id=mr.membership_id
    join public.roles r on r.id=mr.role_id
    where m.organization_id=p_organization_id and m.status='ACTIVE' and r.key='OWNER';

    if v_owner_count < 2 then raise exception 'FINAL_OWNER_CANNOT_BE_DEMOTED'; end if;

    select role_id into v_current_primary_role
    from public.membership_roles
    where membership_id=v_current_membership and is_primary=true;

    delete from public.membership_roles
    where membership_id=v_current_membership and role_id=v_owner_role;

    if v_current_primary_role=v_owner_role then
      select id into v_operator_role from public.roles where key='OPERATOR';
      if v_operator_role is null then raise exception 'OPERATOR_ROLE_MISSING'; end if;

      update public.memberships
      set role_id=v_operator_role, updated_at=now()
      where id=v_current_membership;
    end if;
  end if;

  update public.organizations
  set onboarding_state='ACTIVE', updated_at=now()
  where id=p_organization_id;

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'target_membership_id',p_target_membership_id,
    'demoted_current_owner',p_demote_current_owner
  );
end;
$$;

revoke all on function public.ensure_current_actor() from public, anon;
grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.create_organization_invitation(uuid,text,text,text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.transfer_organization_ownership(uuid,uuid,boolean) to authenticated;
