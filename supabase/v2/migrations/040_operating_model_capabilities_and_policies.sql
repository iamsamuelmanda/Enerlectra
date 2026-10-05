-- 040: organization operating model, capability and policy configuration.
-- Generic platform configuration for diverse and mixed energy businesses.
-- No fixed business-model enum is used as product authorization.

create table if not exists public.operating_model_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null default 'Default operating profile',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operating_model_business_models (
  id uuid primary key default gen_random_uuid(),
  operating_model_profile_id uuid not null references public.operating_model_profiles(id) on delete cascade,
  business_model_key text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (operating_model_profile_id, business_model_key)
);

create unique index if not exists operating_model_business_models_primary_idx
  on public.operating_model_business_models(operating_model_profile_id)
  where is_primary;

create table if not exists public.organization_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_key text not null,
  status text not null default 'ENABLED' check (status in ('ENABLED','DISABLED','CONFIGURED')),
  configuration jsonb not null default '{}'::jsonb,
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, capability_key)
);

create table if not exists public.organization_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_key text not null,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_policies_active_unique_idx
  on public.organization_policies(organization_id, policy_key)
  where status='ACTIVE' and effective_to is null;

alter table public.operating_model_profiles enable row level security;
alter table public.operating_model_business_models enable row level security;
alter table public.organization_capabilities enable row level security;
alter table public.organization_policies enable row level security;

create policy operating_model_profiles_member_select on public.operating_model_profiles
for select to authenticated
using (private.is_active_member(organization_id));
create policy operating_model_profiles_manage on public.operating_model_profiles
for all to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));

create policy operating_model_business_models_member_select on public.operating_model_business_models
for select to authenticated
using (exists (
  select 1 from public.operating_model_profiles p
  where p.id=operating_model_profile_id and private.is_active_member(p.organization_id)
));
create policy operating_model_business_models_manage on public.operating_model_business_models
for all to authenticated
using (exists (
  select 1 from public.operating_model_profiles p
  where p.id=operating_model_profile_id and private.has_org_permission(p.organization_id,'organization.manage')
))
with check (exists (
  select 1 from public.operating_model_profiles p
  where p.id=operating_model_profile_id and private.has_org_permission(p.organization_id,'organization.manage')
));

create policy organization_capabilities_member_select on public.organization_capabilities
for select to authenticated
using (private.is_active_member(organization_id));
create policy organization_capabilities_manage on public.organization_capabilities
for all to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));

create policy organization_policies_member_select on public.organization_policies
for select to authenticated
using (private.is_active_member(organization_id));
create policy organization_policies_manage on public.organization_policies
for all to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));

revoke all on public.operating_model_profiles, public.operating_model_business_models,
  public.organization_capabilities, public.organization_policies from anon;
grant select, insert, update, delete on public.operating_model_profiles,
  public.operating_model_business_models, public.organization_capabilities,
  public.organization_policies to authenticated;

-- Backfill an empty, non-prescriptive operating profile for existing organizations.
insert into public.operating_model_profiles (organization_id,name,status,configuration)
select o.id,'Default operating profile','ACTIVE','{}'::jsonb
from public.organizations o
left join public.operating_model_profiles p on p.organization_id=o.id
where p.id is null;

-- New organizations receive the same neutral empty profile during creation.
create or replace function public.create_organization(
  p_name text,
  p_creator_intent text default 'OWNER'
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_org public.organizations;
  v_role_id uuid;
begin
  select id into v_actor_id from public.ensure_current_actor();

  if p_name is null or pg_catalog.length(pg_catalog.btrim(p_name)) = 0 then
    raise exception 'ORGANIZATION_NAME_REQUIRED';
  end if;

  if p_creator_intent not in ('OWNER','DELEGATED_OPERATOR') then
    raise exception 'INVALID_CREATOR_INTENT';
  end if;

  insert into public.organizations(name,created_by_actor_id,onboarding_state)
  values (
    pg_catalog.btrim(p_name),
    v_actor_id,
    case when p_creator_intent='OWNER' then 'ACTIVE' else 'PENDING_AUTHORITY' end
  )
  returning * into v_org;

  insert into public.operating_model_profiles(organization_id,name,status,configuration)
  values (v_org.id,'Default operating profile','ACTIVE','{}'::jsonb);

  select id into v_role_id from public.roles
  where key=case when p_creator_intent='OWNER' then 'OWNER' else 'OPERATOR' end;
  if v_role_id is null then raise exception 'ONBOARDING_ROLE_MISSING'; end if;

  insert into public.memberships(organization_id,actor_id,role_id,status)
  values (v_org.id,v_actor_id,v_role_id,'ACTIVE');

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text,text) from public,anon;
grant execute on function public.create_organization(text,text) to authenticated;