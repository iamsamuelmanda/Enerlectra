-- V2 migration 011: work item privilege hardening

revoke all on public.work_items from authenticated;
grant select, insert, update on public.work_items to authenticated;

revoke all on public.work_item_history from authenticated;
grant select on public.work_item_history to authenticated;

revoke all on public.work_items from anon;
revoke all on public.work_item_history from anon;
