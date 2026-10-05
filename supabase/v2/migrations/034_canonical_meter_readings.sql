-- Enerlectra — Migration 034: Canonical meter readings capability
-- Preserve the validated reading domain without restoring the legacy
-- user_id/cluster_id authorization boundary.

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  observation_id uuid references public.observations(id) on delete set null,
  reading_key text not null,
  reading_kwh numeric(18,6) not null check (reading_kwh >= 0),
  meter_type text not null check (
    meter_type in (
      'grid_import',
      'solar_import',
      'solar_export',
      'solar_generation',
      'generator',
      'unit_submeter',
      'unknown'
    )
  ),
  photo_url text,
  ocr_confidence numeric(6,5) check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  validation_status text not null default 'VALIDATED'
    check (validation_status in ('VALIDATED','REVIEW','REJECTED','RESET_MARKER')),
  delta_kwh numeric(18,6),
  validation_flag text,
  source text not null default 'manual',
  captured_at timestamptz not null default now(),
  reporting_period text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, reading_key)
);

create index meter_readings_org_asset_time_idx
  on public.meter_readings(organization_id, asset_id, meter_type, captured_at desc);

create index meter_readings_org_site_time_idx
  on public.meter_readings(organization_id, site_id, captured_at desc);

create index meter_readings_observation_idx
  on public.meter_readings(observation_id);

create table public.fraud_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  meter_reading_id uuid references public.meter_readings(id) on delete set null,
  signal_type text not null check (
    signal_type in ('delta_spike','rapid_submission','visual_mismatch')
  ),
  severity numeric(6,5) not null check (severity >= 0 and severity <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index fraud_signals_org_asset_time_idx
  on public.fraud_signals(organization_id, asset_id, created_at desc);

create index fraud_signals_org_actor_time_idx
  on public.fraud_signals(organization_id, actor_id, created_at desc);

create table public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  cumulative_score numeric(10,5) not null,
  status text not null default 'OPEN'
    check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index fraud_alerts_org_status_idx
  on public.fraud_alerts(organization_id, status, created_at desc);

alter table public.meter_readings enable row level security;
alter table public.fraud_signals enable row level security;
alter table public.fraud_alerts enable row level security;

create policy meter_readings_select_member
  on public.meter_readings for select to authenticated
  using (public.is_active_member(organization_id));

create policy meter_readings_insert_member
  on public.meter_readings for insert to authenticated
  with check (
    public.has_org_permission(organization_id, 'observation.write')
    and actor_id = public.current_actor_id()
  );

create policy meter_readings_update_operator
  on public.meter_readings for update to authenticated
  using (public.has_org_permission(organization_id, 'observation.write'))
  with check (public.has_org_permission(organization_id, 'observation.write'));

create policy fraud_signals_select_member
  on public.fraud_signals for select to authenticated
  using (public.is_active_member(organization_id));

create policy fraud_signals_insert_member
  on public.fraud_signals for insert to authenticated
  with check (
    public.has_org_permission(organization_id, 'observation.write')
    and actor_id = public.current_actor_id()
  );

create policy fraud_alerts_select_member
  on public.fraud_alerts for select to authenticated
  using (public.is_active_member(organization_id));

revoke all on public.meter_readings, public.fraud_signals, public.fraud_alerts from anon;
grant select, insert, update on public.meter_readings to authenticated;
grant select, insert on public.fraud_signals to authenticated;
grant select on public.fraud_alerts to authenticated;

comment on table public.meter_readings is
  'Canonical energy-reading capability. Legacy cluster/user fields are intentionally absent.';
comment on table public.fraud_signals is
  'Tenant-scoped fraud evidence generated by reading validation.';
comment on table public.fraud_alerts is
  'Tenant-scoped fraud alerts generated from accumulated reading signals.';
