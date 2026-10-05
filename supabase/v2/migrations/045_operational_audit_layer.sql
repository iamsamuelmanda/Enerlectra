-- 045: minimal operational audit layer.
create table if not exists public.audit_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  outcome text not null,
  reason text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_records_org_time_idx
  on public.audit_records(organization_id,occurred_at desc);

create index if not exists audit_records_org_resource_idx
  on public.audit_records(organization_id,resource_type,resource_id);

alter table public.audit_records enable row level security;
alter table public.audit_records force row level security;

create policy audit_records_select_member
on public.audit_records for select to authenticated
using (private.is_active_member(organization_id));

revoke all on public.audit_records from anon,authenticated;
grant select on public.audit_records to authenticated;

alter table public.recommendations force row level security;
alter table public.verifications force row level security;

-- Issue/recommendation creation records a single audit envelope.
-- Verification records a separate audit envelope in its transaction.
-- Organization context management records an audit event server-side.
