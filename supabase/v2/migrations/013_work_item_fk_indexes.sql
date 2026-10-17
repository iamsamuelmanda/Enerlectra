-- V2 migration 013: indexes for work-item foreign keys flagged by performance advisor

create index work_items_assigned_actor_idx on public.work_items(assigned_actor_id);
create index work_items_created_by_actor_idx on public.work_items(created_by_actor_id);
create index work_item_history_actor_idx on public.work_item_history(actor_id);
create index work_item_history_previous_assignee_idx on public.work_item_history(previous_assigned_actor_id);
create index work_item_history_new_assignee_idx on public.work_item_history(new_assigned_actor_id);
