-- 044: direct tenant scope for operating-model business descriptors.
alter table public.operating_model_business_models
  add column if not exists organization_id uuid;

update public.operating_model_business_models bm
set organization_id = p.organization_id
from public.operating_model_profiles p
where p.id = bm.operating_model_profile_id
  and bm.organization_id is null;

alter table public.operating_model_business_models
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='operating_model_business_models_organization_id_fkey'
  ) then
    alter table public.operating_model_business_models
      add constraint operating_model_business_models_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
end $$;

create index if not exists operating_model_business_models_org_idx
  on public.operating_model_business_models(organization_id);

drop policy if exists operating_model_business_models_member_select on public.operating_model_business_models;
drop policy if exists operating_model_business_models_manage on public.operating_model_business_models;

create policy operating_model_business_models_member_select
on public.operating_model_business_models for select to authenticated
using (private.is_active_member(organization_id));

create policy operating_model_business_models_manage
on public.operating_model_business_models for all to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (
  private.has_org_permission(organization_id,'organization.manage')
  and exists (
    select 1
    from public.operating_model_profiles p
    where p.id = operating_model_profile_id
      and p.organization_id = organization_id
  )
);

alter table public.operating_model_profiles force row level security;
alter table public.operating_model_business_models force row level security;
alter table public.organization_capabilities force row level security;
alter table public.organization_policies force row level security;

-- Structural guarantee: the descriptor's organization and profile tenant must match.
create unique index if not exists operating_model_profiles_org_id_uidx
  on public.operating_model_profiles(organization_id,id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='operating_model_business_models_org_profile_fkey'
  ) then
    alter table public.operating_model_business_models
      add constraint operating_model_business_models_org_profile_fkey
      foreign key (organization_id, operating_model_profile_id)
      references public.operating_model_profiles(organization_id,id)
      on delete cascade;
  end if;
end $$;

drop policy if exists operating_model_business_models_manage on public.operating_model_business_models;
create policy operating_model_business_models_manage
on public.operating_model_business_models for all to authenticated
using (operating_model_business_models.organization_id = organization_id
       and private.has_org_permission(operating_model_business_models.organization_id,'organization.manage'))
with check (
  private.has_org_permission(operating_model_business_models.organization_id,'organization.manage')
);
