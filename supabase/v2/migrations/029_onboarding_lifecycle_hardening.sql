-- Enerlectra V2 — Migration 029: harden onboarding lifecycle operations
--
-- Migration 028 established the model. This migration closes two lifecycle gaps:
-- 1) primary-role changes must not leave stale OWNER assignments;
-- 2) ownership transfer must be a controlled, atomic operation.

alter table public.membership_roles
  add column if not exists is_primary boolean not null default false;

update public.membership_roles mr
set is_primary = true
where exists (
  select 1
  from public.memberships m
  where m.id = mr.membership_id
    and m.role_id = mr.role_id
);

create unique index if not exists membership_roles_one_primary_idx
  on public.membership_roles(membership_id)
  where is_primary;

create or replace function private.sync_primary_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role_id is distinct from old.role_id then
    delete from public.membership_roles
    where membership_id = new.id
      and role_id = old.role_id;

    update public.membership_roles
    set is_primary = false
    where membership_id = new.id
      and is_primary = true;

    insert into public.membership_roles(membership_id, role_id, is_primary)
    values (new.id, new.role_id, true)
    on conflict (membership_id, role_id)
    do update set is_primary = true;
  elsif tg_op = 'INSERT' then
    insert into public.membership_roles(membership_id, role_id, is_primary)
    values (new.id, new.role_id, true)
    on conflict (membership_id, role_id)
    do update set is_primary = true;
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_primary_role_sync on public.memberships;
create trigger memberships_primary_role_sync
after insert or update of role_id on public.memberships
for each row execute function private.sync_primary_membership_role();

-- The organization invitation RPC is intentionally backed by the private
-- authorization helper; there is no exposed public.has_org_permission API.
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
  select id into v_actor_id from public.ensure_current_actor();

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

  select id into v_role_id
  from public.roles
  where key = p_role_key;

  if v_role_id is null then
    raise exception 'ROLE_NOT_FOUND';
  end if;

  if p_purpose = 'OWNER_CLAIM' and p_role_key <> 'OWNER' then
    raise exception 'OWNER_CLAIM_REQUIRES_OWNER_ROLE';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.organization_invitations(
    organization_id, purpose, email, role_id, token_hash,
    invited_by_actor_id, expires_at
  )
  values (
    p_organization_id, p_purpose, lower(btrim(p_email)), v_role_id,
    encode(digest(v_token, 'sha256'), 'hex'), v_actor_id,
    now() + interval '7 days'
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

-- Controlled owner transfer. The target must already be an active member.
-- The current owner remains an owner by default because multiple ownership is
-- valid. Callers may explicitly demote themselves only after another owner exists.
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
  select id into v_current_actor from public.ensure_current_actor();

  select m.id into v_current_membership
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.organization_id = p_organization_id
    and m.actor_id = v_current_actor
    and m.status = 'ACTIVE'
    and r.key = 'OWNER'
  limit 1;

  if v_current_membership is null then
    raise exception 'ACTIVE_OWNER_REQUIRED';
  end if;

  select m.organization_id into v_target_org
  from public.memberships m
  where m.id = p_target_membership_id
    and m.status = 'ACTIVE';

  if v_target_org is distinct from p_organization_id then
    raise exception 'TARGET_MEMBERSHIP_OUTSIDE_ORGANIZATION';
  end if;

  select id into v_owner_role from public.roles where key = 'OWNER';
  if v_owner_role is null then
    raise exception 'OWNER_ROLE_MISSING';
  end if;

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

    if v_owner_count < 2 then
      raise exception 'FINAL_OWNER_CANNOT_BE_DEMOTED';
    end if;

    select role_id into v_current_primary_role
    from public.membership_roles
    where membership_id = v_current_membership
      and is_primary = true;

    delete from public.membership_roles mr
    where mr.membership_id = v_current_membership
      and mr.role_id = v_owner_role;

    if v_current_primary_role = v_owner_role then
      select id into v_operator_role from public.roles where key = 'OPERATOR';
      if v_operator_role is null then
        raise exception 'OPERATOR_ROLE_MISSING';
      end if;

      update public.memberships
      set role_id = v_operator_role,
          updated_at = now()
      where id = v_current_membership;
    end if;
  end if;

  update public.organizations
  set onboarding_state = 'ACTIVE',
      updated_at = now()
  where id = p_organization_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'target_membership_id', p_target_membership_id,
    'demoted_current_owner', p_demote_current_owner
  );
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid,uuid,boolean)
from public, anon;
grant execute on function public.transfer_organization_ownership(uuid,uuid,boolean)
to authenticated;

revoke all on function public.create_organization_invitation(uuid,text,text,text)
from public, anon;
grant execute on function public.create_organization_invitation(uuid,text,text,text)
to authenticated;
