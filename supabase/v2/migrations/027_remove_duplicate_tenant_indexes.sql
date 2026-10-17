-- 027: remove only the two verified duplicate non-constraint indexes.
-- The *_unique indexes back composite tenant foreign keys and are retained.
drop index if exists public.customers_org_id_uq;
drop index if exists public.sites_org_id_uq;
