-- V2 migration 014: indexes for work-item subject foreign keys

create index work_items_org_customer_idx on public.work_items(organization_id,customer_id);
create index work_items_org_site_idx on public.work_items(organization_id,site_id);
