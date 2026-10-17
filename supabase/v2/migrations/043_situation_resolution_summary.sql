-- 043: close the canonical situation schema gap discovered by the
-- verification integration smoke test.
alter table public.situations
  add column if not exists resolution_summary text;
