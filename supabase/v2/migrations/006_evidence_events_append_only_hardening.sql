-- V2 migration 006: harden append-only evidence/event table privileges
--
-- RLS policies deny unauthorized mutations, but table privileges must also
-- express the append-only contract. Authenticated clients receive only
-- SELECT and INSERT on immutable evidence/event records.

revoke all on table public.observations, public.events from authenticated;
grant select, insert on table public.observations, public.events to authenticated;
