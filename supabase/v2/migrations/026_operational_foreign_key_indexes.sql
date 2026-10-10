-- 026: cover foreign-key lookups identified by the live Supabase advisor.
-- These are additive indexes; no existing indexes or data are removed.
create index if not exists action_attempts_executor_actor_id_idx
  on public.action_attempts (executor_actor_id);
create index if not exists action_history_actor_id_idx
  on public.action_history (actor_id);
create index if not exists actions_authorized_by_actor_id_idx
  on public.actions (authorized_by_actor_id);
create index if not exists actions_requested_by_actor_id_idx
  on public.actions (requested_by_actor_id);
create index if not exists events_actor_id_idx
  on public.events (actor_id);
create index if not exists events_organization_asset_fk_idx
  on public.events (organization_id, asset_id);
create index if not exists events_organization_customer_fk_idx
  on public.events (organization_id, customer_id);
create index if not exists events_organization_site_fk_idx
  on public.events (organization_id, site_id);
create index if not exists memberships_role_id_idx
  on public.memberships (role_id);
create index if not exists observations_actor_id_idx
  on public.observations (actor_id);
create index if not exists observations_organization_asset_fk_idx
  on public.observations (organization_id, asset_id);
create index if not exists observations_organization_customer_fk_idx
  on public.observations (organization_id, customer_id);
create index if not exists observations_organization_site_fk_idx
  on public.observations (organization_id, site_id);
create index if not exists role_permissions_permission_id_idx
  on public.role_permissions (permission_id);
create index if not exists situation_history_actor_id_idx
  on public.situation_history (actor_id);
create index if not exists situations_organization_customer_fk_idx
  on public.situations (organization_id, customer_id);
create index if not exists situations_organization_site_fk_idx
  on public.situations (organization_id, site_id);
