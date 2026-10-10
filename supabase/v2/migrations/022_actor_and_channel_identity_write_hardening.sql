-- 022: prevent self-service authorization and unverified channel identity changes
-- Actor lifecycle is controlled by trusted server-side administration.
-- Channel identities may only be written by trusted server-side provisioning
-- until a provider ownership-verification flow exists.

revoke update on table public.actors from authenticated;
grant update (display_name, email, phone) on table public.actors to authenticated;

revoke insert, update, delete on table public.channel_identities from authenticated;
grant select on table public.channel_identities to authenticated;
