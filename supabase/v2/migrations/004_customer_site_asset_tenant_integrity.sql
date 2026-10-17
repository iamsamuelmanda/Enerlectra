-- V2 migration 004: enforce same-tenant customer/site/asset relationships
alter table public.customers add constraint customers_org_id_unique unique (organization_id,id);
alter table public.sites add constraint sites_org_id_unique unique (organization_id,id);

alter table public.sites drop constraint sites_customer_id_fkey;
alter table public.sites add constraint sites_customer_org_fkey
  foreign key (organization_id,customer_id) references public.customers (organization_id,id) on delete set null;

alter table public.assets drop constraint assets_site_id_fkey;
alter table public.assets drop constraint assets_customer_id_fkey;
alter table public.assets add constraint assets_site_org_fkey
  foreign key (organization_id,site_id) references public.sites (organization_id,id) on delete set null;
alter table public.assets add constraint assets_customer_org_fkey
  foreign key (organization_id,customer_id) references public.customers (organization_id,id) on delete set null;
