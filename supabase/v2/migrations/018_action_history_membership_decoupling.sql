-- Enerlectra V2 — Migration 018: decouple Action history from mutable membership rows

alter table public.actions
  drop constraint if exists actions_requested_actor_tenant_fk,
  drop constraint if exists actions_authorized_actor_tenant_fk;

alter table public.action_history
  drop constraint if exists action_history_actor_tenant_fk;

-- Actor identity remains referentially valid after membership revocation.
-- Tenant authorization is enforced at Action creation/authorization time by the trigger.
