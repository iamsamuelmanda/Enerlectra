-- 001_energy_readings.sql
-- Run this in Supabase SQL Editor

-- Meter readings (Ellie writes here)
create table if not exists meter_readings (
  id uuid default gen_random_uuid() primary key,
  cluster_id text not null,
  unit_id text not null,
  user_id uuid references auth.users(id),
  
  -- The reading
  reading_kwh numeric not null,
  meter_type text check (meter_type in ('grid', 'solar', 'unit')),
  photo_url text,
  ocr_confidence numeric,
  
  -- Metadata
  captured_at timestamptz default now(),
  reporting_period text,
  source text default 'telegram',
  
  -- Validation
  validated boolean default false
);

-- Energy allocations (reconciliation results)
create table if not exists energy_allocations (
  id uuid default gen_random_uuid() primary key,
  cluster_id text not null,
  period text not null,
  
  -- Anchor data
  grid_total_kwh numeric,
  solar_total_kwh numeric,
  
  -- Calculated
  solar_self_consumed numeric,
  grid_purchased numeric,
  
  created_at timestamptz default now(),
  
  unique(cluster_id, period)
);

-- Per-unit energy shares
create table if not exists unit_energy_shares (
  allocation_id uuid references energy_allocations(id),
  unit_id text not null,
  user_id uuid,
  
  ownership_pct numeric,
  actual_kwh numeric,
  solar_allocation_kwh numeric,
  grid_allocation_kwh numeric,
  grid_surplus_deficit numeric,
  
  solar_credit numeric,
  grid_charge numeric,
  net_amount numeric,
  
  primary key (allocation_id, unit_id)
);

-- Enable RLS
alter table meter_readings enable row level security;
alter table energy_allocations enable row level security;
alter table unit_energy_shares enable row level security;
