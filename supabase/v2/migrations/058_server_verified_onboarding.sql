-- Migration 058: server-verified onboarding boundary.
--
-- Browser clients must not execute SECURITY DEFINER onboarding RPCs. The API
-- verifies the Supabase access token with auth.getUser(), then calls these
-- functions using the service-role client and passes only the verified user ID
-- and verified email. No client-supplied actor, organization, or role IDs exist.

create or replace function public.server_create_onboarding_organization(
  p_auth_user_id uuid,
  p_verified_email text,
  p_name text,
  p_intent text,
  p_owner_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.actors;
  v_org public.organizations;
  v_role_id uuid;
  v_inv public.organization_invitations;
  v_token text;
  v_owner_email text;
begin
  if p_auth_user_id is null
     or p_verified_email is null
     or length(btrim(p_verified_email)) < 3
     or position('@' in btrim(p_verified_email)) < 2 then
    raise exception 'VERIFIED_AUTH_IDENTITY_REQUIRED';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;
  if p_intent not in ('OWNER', 'DELEGATED_OPERATOR') then
    raise exception 'INVALID_CREATOR_INTENT';
  end if;

  -- Serialize actor bootstrap for a given Supabase identity.
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));
  select * into v_actor from public.actors where auth_user_id = p_auth_user_id for update;
  if v_actor.id is null then
    insert into public.actors(auth_user_id, actor_type, display_name, email, status)
    values (p_auth_user_id, 'HUMAN', null, lower(btrim(p_verified_email)), 'ACTIVE')
    returning * into v_actor;
  elsif v_actor.status <> 'ACTIVE' then
    raise exception 'ACTOR_INACTIVE';
  else
    -- The email is sourced from the verified Auth user, never the request body.
    update public.actors set email = lower(btrim(p_verified_email))
    where id = v_actor.id returning * into v_actor;
  end if;

  select id into v_role_id from public.roles
  where key = case when p_intent = 'OWNER' then 'OWNER' else 'OPERATOR' end;
  if v_role_id is null then raise exception 'ONBOARDING_ROLE_MISSING'; end if;

  insert into public.organizations(name, created_by_actor_id, onboarding_state)
  values (
    btrim(p_name), v_actor.id,
    case when p_intent = 'OWNER' then 'ACTIVE' else 'PENDING_AUTHORITY' end
  )
  returning * into v_org;

  insert into public.memberships(organization_id, actor_id, role_id, status)
  values (v_org.id, v_actor.id, v_role_id, 'ACTIVE');
  -- The memberships trigger mirrors the primary role to membership_roles.

  if p_intent = 'OWNER' then
    return jsonb_build_object(
      'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'onboarding_state', v_org.onboarding_state)
    );
  end if;

  v_owner_email := lower(btrim(coalesce(p_owner_email, '')));
  if length(v_owner_email) < 3 or length(v_owner_email) > 320
     or position('@' in v_owner_email) < 2 then
    raise exception 'VALID_OWNER_EMAIL_REQUIRED';
  end if;

  select id into v_role_id from public.roles where key = 'OWNER';
  if v_role_id is null then raise exception 'ONBOARDING_ROLE_MISSING'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.organization_invitations(
    organization_id, purpose, email, role_id, token_hash,
    invited_by_actor_id, expires_at
  ) values (
    v_org.id, 'OWNER_CLAIM', v_owner_email, v_role_id,
    encode(digest(v_token, 'sha256'), 'hex'), v_actor.id,
    now() + interval '7 days'
  ) returning * into v_inv;

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'onboarding_state', v_org.onboarding_state),
    'invitation', jsonb_build_object(
      'invitation_id', v_inv.id, 'token', v_token, 'email', v_inv.email,
      'purpose', v_inv.purpose, 'expires_at', v_inv.expires_at
    )
  );
end;
$$;

create or replace function public.server_accept_organization_invitation(
  p_auth_user_id uuid,
  p_verified_email text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.actors;
  v_inv public.organization_invitations;
  v_membership public.memberships;
begin
  if p_auth_user_id is null or p_verified_email is null or p_token is null or length(p_token) < 32 then
    raise exception 'VERIFIED_AUTH_IDENTITY_AND_TOKEN_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));
  select * into v_actor from public.actors where auth_user_id = p_auth_user_id for update;
  if v_actor.id is null then
    insert into public.actors(auth_user_id, actor_type, display_name, email, status)
    values (p_auth_user_id, 'HUMAN', null, lower(btrim(p_verified_email)), 'ACTIVE')
    returning * into v_actor;
  elsif v_actor.status <> 'ACTIVE' then
    raise exception 'ACTOR_INACTIVE';
  else
    update public.actors set email = lower(btrim(p_verified_email))
    where id = v_actor.id returning * into v_actor;
  end if;

  select * into v_inv
  from public.organization_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'PENDING' and expires_at > now()
  for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID_OR_EXPIRED'; end if;
  if lower(btrim(p_verified_email)) <> lower(v_inv.email) then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;

  select * into v_membership from public.memberships
  where organization_id = v_inv.organization_id and actor_id = v_actor.id
  for update;
  if v_membership.id is null then
    insert into public.memberships(organization_id, actor_id, role_id, status)
    values (v_inv.organization_id, v_actor.id, v_inv.role_id, 'ACTIVE')
    returning * into v_membership;
  else
    update public.memberships set status = 'ACTIVE', role_id = v_inv.role_id, updated_at = now()
    where id = v_membership.id returning * into v_membership;
  end if;

  insert into public.membership_roles(membership_id, role_id)
  values (v_membership.id, v_inv.role_id) on conflict do nothing;

  if v_inv.purpose = 'OWNER_CLAIM' then
    update public.organizations set onboarding_state = 'ACTIVE', updated_at = now()
    where id = v_inv.organization_id;
  end if;

  update public.organization_invitations
  set status = 'ACCEPTED', accepted_by_actor_id = v_actor.id, accepted_at = now()
  where id = v_inv.id;

  return jsonb_build_object(
    'membership_id', v_membership.id,
    'organization_id', v_membership.organization_id,
    'status', v_membership.status
  );
end;
$$;

revoke all on function public.server_create_onboarding_organization(uuid,text,text,text,text)
from public, anon, authenticated;
revoke all on function public.server_accept_organization_invitation(uuid,text,text)
from public, anon, authenticated;
grant execute on function public.server_create_onboarding_organization(uuid,text,text,text,text)
to service_role;
grant execute on function public.server_accept_organization_invitation(uuid,text,text)
to service_role;
