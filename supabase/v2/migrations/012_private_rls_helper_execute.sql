-- V2 migration 012: restore authenticated execution of private RLS helpers
--
-- RLS policies invoke these helpers as security-definer functions in the
-- private schema. They are not exposed RPCs; authenticated callers need
-- EXECUTE privilege for policy evaluation, while PUBLIC/anon remain denied.

grant execute on function private.current_actor_id() to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid,text) to authenticated;
