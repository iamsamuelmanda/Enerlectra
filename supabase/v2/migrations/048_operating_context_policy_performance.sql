-- 048: avoid duplicate permissive SELECT policy evaluation on operating context tables.
-- Keep member read access separate from organization.manage mutation access.

drop policy if exists operating_model_profiles_manage on public.operating_model_profiles;
create policy operating_model_profiles_insert_manage on public.operating_model_profiles
for insert to authenticated
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy operating_model_profiles_update_manage on public.operating_model_profiles
for update to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy operating_model_profiles_delete_manage on public.operating_model_profiles
for delete to authenticated
using (private.has_org_permission(organization_id,'organization.manage'));

drop policy if exists operating_model_business_models_manage on public.operating_model_business_models;
create policy operating_model_business_models_insert_manage on public.operating_model_business_models
for insert to authenticated
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy operating_model_business_models_update_manage on public.operating_model_business_models
for update to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy operating_model_business_models_delete_manage on public.operating_model_business_models
for delete to authenticated
using (private.has_org_permission(organization_id,'organization.manage'));

drop policy if exists organization_capabilities_manage on public.organization_capabilities;
create policy organization_capabilities_insert_manage on public.organization_capabilities
for insert to authenticated
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy organization_capabilities_update_manage on public.organization_capabilities
for update to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy organization_capabilities_delete_manage on public.organization_capabilities
for delete to authenticated
using (private.has_org_permission(organization_id,'organization.manage'));

drop policy if exists organization_policies_manage on public.organization_policies;
create policy organization_policies_insert_manage on public.organization_policies
for insert to authenticated
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy organization_policies_update_manage on public.organization_policies
for update to authenticated
using (private.has_org_permission(organization_id,'organization.manage'))
with check (private.has_org_permission(organization_id,'organization.manage'));
create policy organization_policies_delete_manage on public.organization_policies
for delete to authenticated
using (private.has_org_permission(organization_id,'organization.manage'));
