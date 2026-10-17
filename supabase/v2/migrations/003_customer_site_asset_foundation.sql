-- V2 migration 003: customer / site / asset operational foundation
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 external_ref text,
 name text not null check (length(btrim(name)) between 1 and 200),
 phone text, email text,
 status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (organization_id, external_ref)
);
create table public.sites (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete set null,
 name text not null check (length(btrim(name)) between 1 and 200),
 address text, latitude double precision, longitude double precision,
 status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (latitude is null or latitude between -90 and 90),
 check (longitude is null or longitude between -180 and 180)
);
create table public.assets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 site_id uuid references public.sites(id) on delete set null,
 customer_id uuid references public.customers(id) on delete set null,
 asset_type text not null check (length(btrim(asset_type)) between 1 and 100),
 manufacturer text, model text, serial_number text,
 status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','FAULTED','RETIRED')),
 installed_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index customers_org_idx on public.customers (organization_id);
create index customers_org_status_idx on public.customers (organization_id,status);
create index sites_org_idx on public.sites (organization_id);
create index sites_org_customer_idx on public.sites (organization_id,customer_id);
create index assets_org_idx on public.assets (organization_id);
create index assets_org_site_idx on public.assets (organization_id,site_id);
create index assets_org_customer_idx on public.assets (organization_id,customer_id);
create index assets_org_status_idx on public.assets (organization_id,status);
create unique index assets_org_serial_idx on public.assets (organization_id,serial_number) where serial_number is not null;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger sites_set_updated_at before update on public.sites for each row execute function public.set_updated_at();
create trigger assets_set_updated_at before update on public.assets for each row execute function public.set_updated_at();
alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.sites enable row level security;
alter table public.sites force row level security;
alter table public.assets enable row level security;
alter table public.assets force row level security;
create policy customers_select on public.customers for select to authenticated using (private.has_org_permission(organization_id,'customer.read'));
create policy customers_insert on public.customers for insert to authenticated with check (private.has_org_permission(organization_id,'customer.write'));
create policy customers_update on public.customers for update to authenticated using (private.has_org_permission(organization_id,'customer.write')) with check (private.has_org_permission(organization_id,'customer.write'));
create policy customers_delete on public.customers for delete to authenticated using (private.has_org_permission(organization_id,'customer.write'));
create policy sites_select on public.sites for select to authenticated using (private.has_org_permission(organization_id,'site.read'));
create policy sites_insert on public.sites for insert to authenticated with check (private.has_org_permission(organization_id,'site.write'));
create policy sites_update on public.sites for update to authenticated using (private.has_org_permission(organization_id,'site.write')) with check (private.has_org_permission(organization_id,'site.write'));
create policy sites_delete on public.sites for delete to authenticated using (private.has_org_permission(organization_id,'site.write'));
create policy assets_select on public.assets for select to authenticated using (private.has_org_permission(organization_id,'asset.read'));
create policy assets_insert on public.assets for insert to authenticated with check (private.has_org_permission(organization_id,'asset.write'));
create policy assets_update on public.assets for update to authenticated using (private.has_org_permission(organization_id,'asset.write')) with check (private.has_org_permission(organization_id,'asset.write'));
create policy assets_delete on public.assets for delete to authenticated using (private.has_org_permission(organization_id,'asset.write'));
grant select,insert,update,delete on public.customers,public.sites,public.assets to authenticated;
