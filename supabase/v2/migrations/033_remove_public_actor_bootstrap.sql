-- Enerlectra V2 — Migration 033: remove legacy public actor bootstrap RPC
--
-- The onboarding RPCs now use private.ensure_current_actor(). The public helper
-- is no longer part of the API surface and must not remain callable.

revoke all on function public.ensure_current_actor() from public, anon, authenticated;
drop function if exists public.ensure_current_actor();
