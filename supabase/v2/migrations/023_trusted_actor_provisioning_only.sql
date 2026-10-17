-- 023: reserve Actor and channel identity provisioning for trusted server operations.
-- Self-service Actor creation is not onboarding: without a verified invitation or
-- organization membership flow it creates orphan identities and weakens the
-- canonical identity boundary. Service-role provisioning remains available.

drop policy if exists actors_insert_self on public.actors;
revoke insert on table public.actors from authenticated;

-- Migration 022 revoked these grants. Remove the now-dead self-write policies too,
-- so policy review reflects the intended trusted-provisioning-only contract.
drop policy if exists channel_identities_insert_self on public.channel_identities;
drop policy if exists channel_identities_update_self on public.channel_identities;
drop policy if exists channel_identities_delete_self on public.channel_identities;
