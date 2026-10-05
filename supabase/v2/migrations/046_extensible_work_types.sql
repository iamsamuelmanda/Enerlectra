-- 046: make operational work types extensible.
-- The workflow primitive remains fixed; organization-specific work categories
-- must not be forced into an EPC/PAYGo vocabulary.

alter table public.work_items
  drop constraint if exists work_items_work_type_check;

alter table public.work_items
  add constraint work_items_work_type_check
  check (length(btrim(work_type)) between 1 and 100);
