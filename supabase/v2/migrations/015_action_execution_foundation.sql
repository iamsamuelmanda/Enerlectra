-- Enerlectra V2 — Migration 015: Action / Execution foundation

insert into public.permissions (key, description) values
  ('action.create', 'Propose operational Actions within the organization.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'action.create'
where r.key in ('OPERATOR','TECHNICIAN')
on conflict do nothing;

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid not null,
  action_type text not null check (length(btrim(action_type)) between 1 and 100),
  consequence_class text not null check (consequence_class in ('OBSERVATIONAL','COMMUNICATION','OPERATIONAL','FINANCIAL','PHYSICAL','EXTERNAL_SYSTEM')),
  status text not null default 'PROPOSED' check (status in ('PROPOSED','AUTHORIZED','EXECUTING','SUCCEEDED','FAILED','EXECUTION_UNKNOWN','CANCELLED')),
  requested_by_actor_id uuid not null references public.actors(id),
  authorized_by_actor_id uuid references public.actors(id),
  requested_at timestamptz not null default now(),
  authorized_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key text,
  target jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  authorization_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint actions_work_item_tenant_fk foreign key (organization_id, work_item_id)
    references public.work_items(organization_id, id),
  constraint actions_requested_actor_tenant_fk foreign key (organization_id, requested_by_actor_id)
    references public.memberships(organization_id, actor_id),
  constraint actions_authorized_actor_tenant_fk foreign key (organization_id, authorized_by_actor_id)
    references public.memberships(organization_id, actor_id),
  constraint actions_authorization_fields_ck check (
    (status = 'PROPOSED' and authorized_by_actor_id is null and authorized_at is null)
    or
    (status in ('AUTHORIZED','EXECUTING','SUCCEEDED','FAILED','EXECUTION_UNKNOWN','CANCELLED')
      and ((authorized_by_actor_id is not null and authorized_at is not null) or status = 'CANCELLED'))
  ),
  constraint actions_lifecycle_timestamps_ck check (
    (started_at is null or authorized_at is not null)
    and (completed_at is null or started_at is not null)
    and (completed_at is null or status in ('SUCCEEDED','FAILED','CANCELLED'))
  )
);

create unique index actions_idempotency_uq on public.actions (organization_id, idempotency_key)
where idempotency_key is not null;
create index actions_org_status_idx on public.actions (organization_id, status, created_at desc);
create index actions_work_item_idx on public.actions (organization_id, work_item_id, created_at desc);
create index actions_requested_actor_idx on public.actions (organization_id, requested_by_actor_id, created_at desc);
create index actions_authorized_actor_idx on public.actions (organization_id, authorized_by_actor_id, authorized_at desc)
where authorized_by_actor_id is not null;

create table public.action_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'CREATED' check (status in ('CREATED','EXECUTING','SUCCEEDED','FAILED','EXECUTION_UNKNOWN','CANCELLED')),
  executor_actor_id uuid references public.actors(id),
  executor_type text not null check (executor_type in ('HUMAN','SYSTEM')),
  execution_idempotency_key text not null,
  started_at timestamptz,
  finished_at timestamptz,
  external_system text,
  external_reference text,
  request_reference text,
  response_reference text,
  result_code text,
  result_summary text,
  error_code text,
  error_summary text,
  correlation_id uuid,
  causation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, action_id, attempt_number),
  constraint action_attempts_action_tenant_fk foreign key (organization_id, action_id)
    references public.actions(organization_id, id) on delete restrict,
  constraint action_attempts_human_executor_ck check (
    (executor_type = 'HUMAN' and executor_actor_id is not null)
    or (executor_type = 'SYSTEM' and executor_actor_id is null)
  ),
  constraint action_attempts_lifecycle_timestamps_ck check (
    (started_at is null or status <> 'CREATED')
    and (finished_at is null or status in ('SUCCEEDED','FAILED','EXECUTION_UNKNOWN','CANCELLED'))
    and (finished_at is null or started_at is not null)
  )
);

create unique index action_attempts_execution_idempotency_uq
  on public.action_attempts (organization_id, action_id, execution_idempotency_key);
create index action_attempts_org_status_idx on public.action_attempts (organization_id, status, created_at desc);
create index action_attempts_action_idx on public.action_attempts (organization_id, action_id, attempt_number);
create index action_attempts_executor_idx on public.action_attempts (organization_id, executor_actor_id, status)
where executor_actor_id is not null;

create table public.action_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid not null,
  event_type text not null check (event_type in (
    'ACTION_PROPOSED','ACTION_AUTHORIZED','ACTION_EXECUTING','ACTION_SUCCEEDED',
    'ACTION_FAILED','ACTION_EXECUTION_UNKNOWN','ACTION_CANCELLED',
    'ATTEMPT_CREATED','ATTEMPT_SUCCEEDED','ATTEMPT_FAILED','ATTEMPT_UNKNOWN','ATTEMPT_CANCELLED'
  )),
  previous_status text,
  new_status text,
  actor_id uuid references public.actors(id),
  reason text,
  correlation_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, id),
  constraint action_history_action_tenant_fk foreign key (organization_id, action_id)
    references public.actions(organization_id, id) on delete cascade,
  constraint action_history_actor_tenant_fk foreign key (organization_id, actor_id)
    references public.memberships(organization_id, actor_id)
);

create index action_history_action_idx on public.action_history (organization_id, action_id, occurred_at desc);
create index action_history_org_time_idx on public.action_history (organization_id, occurred_at desc);

create or replace function private.enforce_action_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_has_create boolean;
  v_has_authorize boolean;
begin
  v_actor_id := private.current_actor_id();

  if tg_op = 'INSERT' then
    if new.status <> 'PROPOSED' then raise exception 'ACTION_MUST_START_PROPOSED'; end if;
    if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
    if new.requested_by_actor_id <> v_actor_id then raise exception 'ACTION_REQUESTER_MUST_BE_CURRENT_ACTOR'; end if;
    v_has_create := private.has_org_permission(new.organization_id, 'action.create');
    if not v_has_create then raise exception 'ACTION_CREATE_PERMISSION_REQUIRED'; end if;
    if not private.is_active_member(new.organization_id) then raise exception 'ACTIVE_ORG_MEMBERSHIP_REQUIRED'; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('SUCCEEDED','FAILED','CANCELLED') then raise exception 'ACTION_TERMINAL_IMMUTABLE'; end if;

    if old.status <> 'PROPOSED' and (
      old.organization_id <> new.organization_id
      or old.work_item_id <> new.work_item_id
      or old.action_type <> new.action_type
      or old.consequence_class <> new.consequence_class
      or old.requested_by_actor_id <> new.requested_by_actor_id
      or old.requested_at <> new.requested_at
      or old.idempotency_key is distinct from new.idempotency_key
      or old.target is distinct from new.target
    ) then raise exception 'AUTHORIZED_ACTION_FIELDS_IMMUTABLE'; end if;

    if old.status = 'PROPOSED' and new.status = 'AUTHORIZED' then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      v_has_authorize := private.has_org_permission(new.organization_id, 'action.authorize');
      if not v_has_authorize then raise exception 'ACTION_AUTHORIZE_PERMISSION_REQUIRED'; end if;
      if new.authorized_by_actor_id <> v_actor_id then raise exception 'AUTHORIZED_BY_MUST_BE_CURRENT_ACTOR'; end if;
      new.authorized_at := coalesce(new.authorized_at, now());
      new.authorization_metadata := coalesce(new.authorization_metadata, '{}'::jsonb)
        || jsonb_build_object('authorized_status', old.status, 'authorized_at', new.authorized_at,
          'authorized_by_actor_id', v_actor_id, 'action_type', old.action_type,
          'consequence_class', old.consequence_class);
      return new;
    end if;

    if old.status = 'PROPOSED' and new.status = 'CANCELLED' then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'action.create') then raise exception 'ACTION_CREATE_PERMISSION_REQUIRED'; end if;
      new.completed_at := coalesce(new.completed_at, now());
      return new;
    end if;

    if old.status = 'AUTHORIZED' and new.status = 'EXECUTING' then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      new.started_at := coalesce(new.started_at, now());
      return new;
    end if;

    if old.status = 'AUTHORIZED' and new.status = 'CANCELLED' then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      new.completed_at := coalesce(new.completed_at, now());
      return new;
    end if;

    if old.status = 'EXECUTING' and new.status in ('SUCCEEDED','FAILED','EXECUTION_UNKNOWN') then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      if new.status in ('SUCCEEDED','FAILED') then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;
      return new;
    end if;

    if old.status = 'EXECUTION_UNKNOWN' and new.status = 'EXECUTING' then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      new.completed_at := null;
      new.started_at := coalesce(new.started_at, now());
      return new;
    end if;

    if old.status = 'EXECUTION_UNKNOWN' and new.status in ('SUCCEEDED','FAILED','CANCELLED') then
      if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      new.completed_at := coalesce(new.completed_at, now());
      return new;
    end if;

    raise exception 'INVALID_ACTION_TRANSITION: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_action_attempt_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_action_status text;
  v_current_actor uuid;
begin
  v_current_actor := private.current_actor_id();

  select a.status into v_action_status
  from public.actions a
  where a.organization_id = new.organization_id and a.id = new.action_id;

  if v_action_status is null then raise exception 'ACTION_NOT_FOUND'; end if;

  if tg_op = 'INSERT' then
    if v_action_status not in ('AUTHORIZED','EXECUTING','EXECUTION_UNKNOWN') then raise exception 'ACTION_NOT_EXECUTABLE'; end if;
    if new.status <> 'CREATED' then raise exception 'ATTEMPT_MUST_START_CREATED'; end if;
    if new.executor_type = 'HUMAN' then
      if v_current_actor is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      if new.executor_actor_id <> v_current_actor then raise exception 'HUMAN_EXECUTOR_MUST_BE_CURRENT_ACTOR'; end if;
      if not private.is_active_member(new.organization_id) then raise exception 'ACTIVE_ORG_MEMBERSHIP_REQUIRED'; end if;
    else
      raise exception 'SYSTEM_ATTEMPTS_REQUIRE_TRUSTED_SERVER_EXECUTION';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('SUCCEEDED','FAILED','EXECUTION_UNKNOWN','CANCELLED') then raise exception 'ATTEMPT_TERMINAL_IMMUTABLE'; end if;
    if old.organization_id <> new.organization_id
      or old.action_id <> new.action_id
      or old.attempt_number <> new.attempt_number
      or old.executor_type <> new.executor_type
      or old.executor_actor_id is distinct from new.executor_actor_id
      or old.execution_idempotency_key <> new.execution_idempotency_key then
      raise exception 'ATTEMPT_IDENTITY_IMMUTABLE';
    end if;

    if old.status = 'CREATED' and new.status = 'EXECUTING' then
      if new.executor_type = 'HUMAN' then
        if v_current_actor is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if new.executor_actor_id <> v_current_actor then raise exception 'HUMAN_EXECUTOR_MUST_BE_CURRENT_ACTOR'; end if;
      else
        raise exception 'SYSTEM_ATTEMPTS_REQUIRE_TRUSTED_SERVER_EXECUTION';
      end if;
      new.started_at := coalesce(new.started_at, now());
      return new;
    end if;

    if old.status = 'EXECUTING' and new.status in ('SUCCEEDED','FAILED','EXECUTION_UNKNOWN') then
      new.started_at := coalesce(new.started_at, old.started_at, now());
      new.finished_at := coalesce(new.finished_at, now());
      return new;
    end if;

    raise exception 'INVALID_ATTEMPT_TRANSITION: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function private.record_action_history()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_event_type text;
begin
  v_actor_id := private.current_actor_id();

  if tg_table_name = 'actions' then
    if tg_op = 'INSERT' then
      insert into public.action_history (organization_id, action_id, event_type, previous_status, new_status, actor_id, occurred_at, metadata)
      values (new.organization_id, new.id, 'ACTION_PROPOSED', null, new.status, v_actor_id, now(), '{}'::jsonb);
    elsif old.status is distinct from new.status then
      v_event_type := case new.status
        when 'AUTHORIZED' then 'ACTION_AUTHORIZED'
        when 'EXECUTING' then 'ACTION_EXECUTING'
        when 'SUCCEEDED' then 'ACTION_SUCCEEDED'
        when 'FAILED' then 'ACTION_FAILED'
        when 'EXECUTION_UNKNOWN' then 'ACTION_EXECUTION_UNKNOWN'
        when 'CANCELLED' then 'ACTION_CANCELLED'
      end;
      insert into public.action_history (organization_id, action_id, event_type, previous_status, new_status, actor_id, occurred_at, metadata)
      values (new.organization_id, new.id, v_event_type, old.status, new.status, v_actor_id, now(), '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_table_name = 'action_attempts' then
    if tg_op = 'INSERT' then
      insert into public.action_history (organization_id, action_id, event_type, previous_status, new_status, actor_id, occurred_at, metadata)
      values (new.organization_id, new.action_id, 'ATTEMPT_CREATED', null, new.status,
        coalesce(new.executor_actor_id, v_actor_id), now(),
        jsonb_build_object('attempt_id', new.id, 'attempt_number', new.attempt_number));
    elsif old.status is distinct from new.status then
      v_event_type := case new.status
        when 'SUCCEEDED' then 'ATTEMPT_SUCCEEDED'
        when 'FAILED' then 'ATTEMPT_FAILED'
        when 'EXECUTION_UNKNOWN' then 'ATTEMPT_UNKNOWN'
        when 'CANCELLED' then 'ATTEMPT_CANCELLED'
      end;
      if v_event_type is not null then
        insert into public.action_history (organization_id, action_id, event_type, previous_status, new_status, actor_id, occurred_at, metadata)
        values (new.organization_id, new.action_id, v_event_type, old.status, new.status,
          coalesce(new.executor_actor_id, v_actor_id), now(),
          jsonb_build_object('attempt_id', new.id, 'attempt_number', new.attempt_number));
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_action_integrity() from public, anon, authenticated;
revoke execute on function private.enforce_action_attempt_integrity() from public, anon, authenticated;
revoke execute on function private.record_action_history() from public, anon, authenticated;

create trigger actions_set_updated_at before update on public.actions
for each row execute function public.set_updated_at();
create trigger actions_enforce_integrity before insert or update on public.actions
for each row execute function private.enforce_action_integrity();
create trigger actions_record_history after insert or update on public.actions
for each row execute function private.record_action_history();
create trigger action_attempts_enforce_integrity before insert or update on public.action_attempts
for each row execute function private.enforce_action_attempt_integrity();
create trigger action_attempts_record_history after insert or update on public.action_attempts
for each row execute function private.record_action_history();

alter table public.actions enable row level security;
alter table public.actions force row level security;
alter table public.action_attempts enable row level security;
alter table public.action_attempts force row level security;
alter table public.action_history enable row level security;
alter table public.action_history force row level security;

create policy actions_select_member on public.actions for select to authenticated
using ((select private.is_active_member(organization_id)) and (select private.has_org_permission(organization_id, 'work.read')));

create policy actions_insert_creator on public.actions for insert to authenticated
with check ((select private.has_org_permission(organization_id, 'action.create')));

create policy actions_update_operator on public.actions for update to authenticated
using (
  (select private.has_org_permission(organization_id, 'action.create'))
  or (select private.has_org_permission(organization_id, 'action.authorize'))
  or (select private.has_org_permission(organization_id, 'work.execute'))
)
with check ((select private.is_active_member(organization_id)));

create policy action_attempts_select_member on public.action_attempts for select to authenticated
using ((select private.is_active_member(organization_id)) and (select private.has_org_permission(organization_id, 'work.read')));

create policy action_attempts_insert_executor on public.action_attempts for insert to authenticated
with check ((select private.has_org_permission(organization_id, 'work.execute')));

create policy action_attempts_update_executor on public.action_attempts for update to authenticated
using ((select private.has_org_permission(organization_id, 'work.execute')))
with check ((select private.is_active_member(organization_id)));

create policy action_history_select_member on public.action_history for select to authenticated
using ((select private.is_active_member(organization_id)) and (select private.has_org_permission(organization_id, 'work.read')));

revoke all on public.actions, public.action_attempts, public.action_history from anon, authenticated;
grant select, insert, update on public.actions to authenticated;
grant select, insert, update on public.action_attempts to authenticated;
grant select on public.action_history to authenticated;
