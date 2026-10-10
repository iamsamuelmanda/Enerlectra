-- Enerlectra V2 — Migration 028: self-service onboarding and authority model
--
-- Core correction:
--   organization creation = provenance
--   ownership = explicit organizational authority
--
-- This migration is intentionally additive. It keeps memberships.role_id as the
-- primary/default role for compatibility and introduces membership_roles so one
-- person can hold multiple responsibilities.

alter table public.organizations
  add column if not exists created_by_actor_id uuid references public.actors(id) on delete set null,
  add column if not exists onboarding_state text not null default 'ACTIVE'
    check (onboarding_state in ('PENDING_AUTHORITY','ACTIVE','RECOVERY_REQUIRED'));

-- Existing manually-created orgs without an owner are onboarding artifacts, not
-- valid owned tenants.
update public.organizations o
set onboarding_state = 'PENDING_AUTHORITY'
where onboarding_state = 'ACTIVE'
  and not exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = o.id
      and m.status = 'ACTIVE'
      and r.key = 'OWNER'
  );

create index if not exists organizations_created_by_actor_idx
  on public.organizations(created_by_actor_id);
create index if not exists organizations_onboarding_state_idx
  on public.organizations(onboarding_state);

-- A membership may carry several responsibilities. role_id remains the primary
-- role for compatibility with existing code.
create table if not exists public.membership_roles (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_id)
);

insert into public.membership_roles(membership_id, role_id)
select m.id, m.role_id
from public.memberships m
on conflict do nothing;

create index if not exists membership_roles_role_idx
  on public.membership_roles(role_id);

alter table public.membership_roles enable row level security;
revoke all on public.membership_roles from anon, authenticated;
grant select on public.membership_roles to authenticated;

create policy membership_roles_select_member
on public.membership_roles
for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_roles.membership_id
      and private.is_active_member(m.organization_id)
  )
);

insert into public.permissions(key, description) values
  ('organization.setup', 'Perform limited setup actions while authority is being established.'),
  ('organization.members.manage', 'Manage organization membership and member role assignments.'),
  ('organization.ownership.manage', 'Establish, transfer, and manage organizational ownership.')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'OWNER'
  and p.key in (
    'organization.setup',
    'organization.members.manage',
    'organization.ownership.manage'
  )
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'organization.setup'
where r.key = 'OPERATOR'
on conflict do nothing;

-- Authorization now evaluates every assigned role.
create or replace function private.has_org_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.id = coalesce(
      nullif(current_setting('app.actor_id', true), '')::uuid,
      (select a2.id
       from public.actors a2
       where a2.auth_user_id = auth.uid()
         and a2.status = 'ACTIVE'
       limit 1)
    )
      and a.status = 'ACTIVE'
      and m.organization_id = p_organization_id
      and m.status = 'ACTIVE'
      and p.key = p_permission_key
      and (
        p.key <> 'organization.setup'
        or exists (
          select 1
          from public.organizations o
          where o.id = p_organization_id
            and o.onboarding_state = 'PENDING_AUTHORITY'
        )
      )
  );
$$;

revoke execute on function private.has_org_permission(uuid,text)
from public, anon, authenticated;

-- Authenticated self-service actor bootstrap. auth.uid() is authoritative;
-- callers cannot choose another user's actor id or status.
create or replace function public.ensure_current_actor()
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
    auth_user_id,
    actor_type,
    display_name,
    email,
    status
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

revoke all on function public.ensure_current_actor() from public, anon;
grant execute on function public.ensure_current_actor() to authenticated;

-- Self-service organization creation. The caller supplies only an onboarding
-- intent, never an organization_id, role_id, or owner identity.
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
  select id into v_actor_id from public.ensure_current_actor();

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;

  if p_creator_intent not in ('OWNER','DELEGATED_OPERATOR') then
    raise exception 'INVALID_CREATOR_INTENT';
  end if;

  insert into public.organizations(
    name,
    created_by_actor_id,
    onboarding_state
  )
  values (
    btrim(p_name),
    v_actor_id,
    case
      when p_creator_intent = 'OWNER' then 'ACTIVE'
      else 'PENDING_AUTHORITY'
    end
  )
  returning * into v_org;

  select id into v_role_id
  from public.roles
  where key = case
    when p_creator_intent = 'OWNER' then 'OWNER'
    else 'OPERATOR'
  end;

  if v_role_id is null then
    raise exception 'ONBOARDING_ROLE_MISSING';
  end if;

  insert into public.memberships(
    organization_id,
    actor_id,
    role_id,
    status
  )
  values (v_org.id, v_actor_id, v_role_id, 'ACTIVE');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text,text)
from public, anon;
drop function if exists public.create_organization(text);
grant execute on function public.create_organization(text,text)
to authenticated;

-- Invitations cover normal member onboarding and delegated owner claim.
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose text not null check (purpose in ('MEMBER_INVITE','OWNER_CLAIM')),
  email text not null check (length(btrim(email)) between 3 and 320),
  role_id uuid not null references public.roles(id),
  token_hash text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  invited_by_actor_id uuid references public.actors(id) on delete set null,
  accepted_by_actor_id uuid references public.actors(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_invitations_org_status_idx
  on public.organization_invitations(organization_id, status);
create index if not exists organization_invitations_email_idx
  on public.organization_invitations(lower(email));

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon, authenticated;

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
      public.has_org_permission(p_organization_id, 'organization.ownership.manage')
      or public.has_org_permission(p_organization_id, 'organization.setup')
    ) then
      raise exception 'ORGANIZATION_OWNERSHIP_INVITE_FORBIDDEN';
    end if;
  elsif p_purpose = 'MEMBER_INVITE' then
    if not public.has_org_permission(p_organization_id, 'organization.members.manage') then
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

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.organization_invitations(
    organization_id,
    purpose,
    email,
    role_id,
    token_hash,
    invited_by_actor_id,
    expires_at
  )
  values (
    p_organization_id,
    p_purpose,
    lower(btrim(p_email)),
    v_role_id,
    encode(digest(v_token, 'sha256'), 'hex'),
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

-- Invitation acceptance derives the actor from auth.uid() and checks email
-- ownership of the invitation. The caller cannot choose tenant or role.
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
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
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
    insert into public.memberships(
      organization_id,
      actor_id,
      role_id,
      status
    )
    values (
      v_inv.organization_id,
      v_actor.id,
      v_inv.role_id,
      'ACTIVE'
    )
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

  insert into public.membership_roles(membership_id, role_id)
  values (v_membership.id, v_inv.role_id)
  on conflict do nothing;

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

-- Keep membership.role_id mirrored into the multi-role assignment set.
create or replace function private.sync_primary_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.membership_roles(membership_id, role_id)
  values (new.id, new.role_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists memberships_primary_role_sync on public.memberships;
create trigger memberships_primary_role_sync
after insert or update of role_id on public.memberships
for each row execute function private.sync_primary_membership_role();

-- A committed ACTIVE organization must have at least one ACTIVE OWNER.
-- Pending-authority organizations are the deliberate exception.
create or replace function private.assert_organization_has_owner(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and onboarding_state = 'PENDING_AUTHORITY'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = p_organization_id
      and m.status = 'ACTIVE'
      and r.key = 'OWNER'
  ) then
    raise exception 'ORGANIZATION_MUST_HAVE_ACTIVE_OWNER';
  end if;
end;
$$;

create or replace function private.assert_membership_owner_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if tg_table_name = 'memberships' then
    v_org_id := coalesce(new.organization_id, old.organization_id);
  else
    select m.organization_id into v_org_id
    from public.memberships m
    where m.id = coalesce(new.membership_id, old.membership_id);
  end if;

  perform private.assert_organization_has_owner(v_org_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_owner_invariant on public.memberships;
create constraint trigger memberships_owner_invariant
after insert or update or delete on public.memberships
deferrable initially deferred
for each row execute function private.assert_membership_owner_state();

drop trigger if exists membership_roles_owner_invariant on public.membership_roles;
create constraint trigger membership_roles_owner_invariant
after insert or update or delete on public.membership_roles
deferrable initially deferred
for each row execute function private.assert_membership_owner_state();

revoke execute on function public.ensure_current_actor() from public, anon;
revoke execute on function private.sync_primary_membership_role() from public, anon, authenticated;
revoke execute on function private.assert_organization_has_owner(uuid) from public, anon, authenticated;
revoke execute on function private.assert_membership_owner_state() from public, anon, authenticated;
