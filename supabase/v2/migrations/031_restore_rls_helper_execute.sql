-- Enerlectra V2 — Migration 031: restore RLS helper execution privilege
--
-- private.has_org_permission() is not a public RPC, but authenticated callers
-- need EXECUTE privilege because organizations/memberships RLS policies invoke
-- it during policy evaluation.

grant execute on function private.has_org_permission(uuid,text) to authenticated;
grant execute on function private.current_actor_id() to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
