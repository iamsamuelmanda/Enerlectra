-- 047: cover foreign-key joins used by the operational kernel.
-- These indexes are low-risk integrity/performance hardening; no product semantics change.

create index if not exists audit_records_actor_idx
  on public.audit_records(actor_id);

create index if not exists operating_model_business_models_org_profile_fk_idx
  on public.operating_model_business_models(organization_id, operating_model_profile_id);

create index if not exists organization_invitations_accepted_by_actor_idx
  on public.organization_invitations(accepted_by_actor_id);

create index if not exists organization_invitations_invited_by_actor_idx
  on public.organization_invitations(invited_by_actor_id);

create index if not exists organization_invitations_role_idx
  on public.organization_invitations(role_id);

create index if not exists recommendations_situation_idx
  on public.recommendations(situation_id);

create index if not exists verifications_action_idx
  on public.verifications(action_id);

create index if not exists verifications_event_idx
  on public.verifications(event_id);

create index if not exists verifications_observation_idx
  on public.verifications(observation_id);

create index if not exists verifications_situation_idx
  on public.verifications(situation_id);

create index if not exists verifications_verified_by_actor_idx
  on public.verifications(verified_by_actor_id);

create index if not exists verifications_work_item_idx
  on public.verifications(work_item_id);
