-- Enerlectra V2 — Migration 030: qualify pgcrypto functions under hardened search_path
--
-- Migrations 028/029 intentionally pin SECURITY DEFINER search_path to empty.
-- Supabase installs pgcrypto functions in the extensions schema, so they must
-- be schema-qualified rather than relying on search_path resolution.

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

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.organization_invitations(
    organization_id, purpose, email, role_id, token_hash,
    invited_by_actor_id, expires_at
  )
  values (
    p_organization_id,
    p_purpose,
    lower(btrim(p_email)),
    v_role_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_actor_id,
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

revoke all on function public.create_organization_invitation(uuid,text,text,text)
from public, anon;
grant execute on function public.create_organization_invitation(uuid,text,text,text)
to authenticated;

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
  select * into v_actor from public.ensure_current_actor();

  select * into v_inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'PENDING'
    and expires_at > now()
  for update;

  if v_inv.id is null then
    raise exception 'INVITATION_INVALID_OR_EXPIRED';
  end if;

  if lower(coalesce(v_actor.email, '')) <> lower(v_inv.email) then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;

  select * into v_membership
  from public.memberships
  where organization_id = v_inv.organization_id
    and actor_id = v_actor.id
  limit 1;

  if v_membership.id is null then
    insert into public.memberships(organization_id, actor_id, role_id, status)
    values (v_inv.organization_id, v_actor.id, v_inv.role_id, 'ACTIVE')
    returning * into v_membership;
  else
    update public.memberships
    set status = 'ACTIVE',
        role_id = case
          when v_inv.purpose = 'OWNER_CLAIM' then v_inv.role_id
          else role_id
        end,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  insert into public.membership_roles(membership_id, role_id, is_primary)
  values (v_membership.id, v_inv.role_id, true)
  on conflict (membership_id, role_id)
  do update set is_primary = true;

  if v_inv.purpose = 'OWNER_CLAIM' then
    update public.organizations
    set onboarding_state = 'ACTIVE',
        updated_at = now()
    where id = v_inv.organization_id;
  end if;

  update public.organization_invitations
  set status = 'ACCEPTED',
      accepted_by_actor_id = v_actor.id,
      accepted_at = now()
  where id = v_inv.id;

  return v_membership;
end;
$$;

revoke all on function public.accept_organization_invitation(text)
from public, anon;
grant execute on function public.accept_organization_invitation(text)
to authenticated;
