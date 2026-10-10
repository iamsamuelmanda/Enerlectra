-- V2 migration 010: work item integrity and append-only history

create table public.work_item_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid not null,
  event_type text not null check (event_type in (
    'WORK_ITEM_CREATED','WORK_ITEM_ASSIGNED','WORK_ITEM_UNASSIGNED',
    'WORK_ITEM_STARTED','WORK_ITEM_COMPLETED','WORK_ITEM_CANCELLED'
  )),
  previous_status text check (previous_status is null or previous_status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  new_status text check (new_status is null or new_status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  previous_assigned_actor_id uuid references public.actors(id) on delete set null,
  new_assigned_actor_id uuid references public.actors(id) on delete set null,
  actor_id uuid references public.actors(id) on delete set null,
  reason text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,work_item_id) references public.work_items(organization_id,id) on delete restrict
);

create index work_item_history_org_work_item_idx on public.work_item_history(organization_id,work_item_id,occurred_at desc);
create index work_item_history_org_event_idx on public.work_item_history(organization_id,event_type,occurred_at desc);

alter table public.work_item_history enable row level security;
alter table public.work_item_history force row level security;

create policy work_item_history_select on public.work_item_history for select to authenticated
using ((select private.has_org_permission(organization_id,'work.read')));

grant select on public.work_item_history to authenticated;

create or replace function private.enforce_work_item_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid;
  has_execute boolean;
  has_assign boolean;
begin
  actor := private.current_actor_id();
  if actor is null then raise exception 'WORK_ITEM_ACTOR_REQUIRED' using errcode = '42501'; end if;

  if tg_op = 'INSERT' then
    has_execute := private.has_org_permission(new.organization_id,'work.execute');
    if not has_execute then raise exception 'WORK_ITEM_CREATE_NOT_AUTHORIZED' using errcode = '42501'; end if;
    new.created_by_actor_id := actor;

    if new.assigned_actor_id is not null then
      has_assign := private.has_org_permission(new.organization_id,'work.assign');
      if not has_assign then raise exception 'WORK_ITEM_ASSIGN_NOT_AUTHORIZED' using errcode = '42501'; end if;
      if not exists (
        select 1 from public.memberships m join public.actors a on a.id=m.actor_id
        where m.organization_id=new.organization_id and m.actor_id=new.assigned_actor_id
          and m.status='ACTIVE' and a.status='ACTIVE'
      ) then raise exception 'WORK_ITEM_ASSIGNEE_NOT_ACTIVE_MEMBER' using errcode = '23514'; end if;
      if new.status='OPEN' then new.status := 'ASSIGNED'; end if;
      new.assigned_at := coalesce(new.assigned_at,pg_catalog.now());
    else
      new.assigned_at := null;
    end if;

    if new.status='COMPLETED' then new.completed_at := coalesce(new.completed_at,pg_catalog.now()); end if;
    if new.status='ASSIGNED' and new.assigned_actor_id is null then
      raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status in ('COMPLETED','CANCELLED') and row(new.*) is distinct from row(old.*) then
    raise exception 'WORK_ITEM_TERMINAL_STATE_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'WORK_ITEM_TENANT_IMMUTABLE' using errcode = '23514';
  end if;
  if new.situation_id is distinct from old.situation_id then
    raise exception 'WORK_ITEM_SITUATION_IMMUTABLE' using errcode = '23514';
  end if;
  if new.created_by_actor_id is distinct from old.created_by_actor_id then
    raise exception 'WORK_ITEM_CREATOR_IMMUTABLE' using errcode = '23514';
  end if;

  if new.assigned_actor_id is distinct from old.assigned_actor_id then
    has_assign := private.has_org_permission(new.organization_id,'work.assign');
    if not has_assign then raise exception 'WORK_ITEM_ASSIGN_NOT_AUTHORIZED' using errcode = '42501'; end if;

    if new.assigned_actor_id is null then
      if new.status='ASSIGNED' then new.status := 'OPEN';
      elsif new.status='IN_PROGRESS' then raise exception 'WORK_ITEM_IN_PROGRESS_REQUIRES_ASSIGNEE' using errcode = '23514';
      end if;
      new.assigned_at := null;
    else
      if not exists (
        select 1 from public.memberships m join public.actors a on a.id=m.actor_id
        where m.organization_id=new.organization_id and m.actor_id=new.assigned_actor_id
          and m.status='ACTIVE' and a.status='ACTIVE'
      ) then raise exception 'WORK_ITEM_ASSIGNEE_NOT_ACTIVE_MEMBER' using errcode = '23514'; end if;
      if new.status='OPEN' then new.status := 'ASSIGNED'; end if;
      new.assigned_at := coalesce(new.assigned_at,pg_catalog.now());
    end if;
  elsif new.assigned_at is distinct from old.assigned_at then
    raise exception 'WORK_ITEM_ASSIGNED_AT_REQUIRES_ASSIGNMENT_CHANGE' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    has_execute := private.has_org_permission(new.organization_id,'work.execute');
    if not has_execute then raise exception 'WORK_ITEM_STATUS_NOT_AUTHORIZED' using errcode = '42501'; end if;

    if not (
      (old.status='OPEN' and new.status in ('ASSIGNED','CANCELLED')) or
      (old.status='ASSIGNED' and new.status in ('IN_PROGRESS','OPEN','CANCELLED')) or
      (old.status='IN_PROGRESS' and new.status in ('COMPLETED','ASSIGNED','CANCELLED'))
    ) then raise exception 'WORK_ITEM_INVALID_STATUS_TRANSITION' using errcode = '23514'; end if;

    if new.status in ('ASSIGNED','IN_PROGRESS') and new.assigned_actor_id is null then
      raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '23514';
    end if;

    if new.status='COMPLETED' then new.completed_at := coalesce(new.completed_at,pg_catalog.now());
    elsif new.completed_at is not null then new.completed_at := null;
    end if;
  elsif new.completed_at is distinct from old.completed_at then
    raise exception 'WORK_ITEM_COMPLETED_AT_REQUIRES_COMPLETION' using errcode = '23514';
  end if;

  if new.work_type is distinct from old.work_type or new.priority is distinct from old.priority
     or new.title is distinct from old.title or new.description is distinct from old.description
     or new.customer_id is distinct from old.customer_id or new.site_id is distinct from old.site_id
     or new.asset_id is distinct from old.asset_id or new.due_at is distinct from old.due_at
     or new.correlation_id is distinct from old.correlation_id or new.idempotency_key is distinct from old.idempotency_key then
    has_execute := private.has_org_permission(new.organization_id,'work.execute');
    if not has_execute then raise exception 'WORK_ITEM_UPDATE_NOT_AUTHORIZED' using errcode = '42501'; end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_work_item_integrity() from public,anon,authenticated;

create trigger work_items_enforce_integrity before insert or update on public.work_items
for each row execute function private.enforce_work_item_integrity();

create or replace function private.record_work_item_history()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op='INSERT' then
    insert into public.work_item_history(organization_id,work_item_id,event_type,new_status,new_assigned_actor_id,actor_id,correlation_id)
    values (new.organization_id,new.id,'WORK_ITEM_CREATED',new.status,new.assigned_actor_id,new.created_by_actor_id,new.correlation_id);
    if new.assigned_actor_id is not null then
      insert into public.work_item_history(organization_id,work_item_id,event_type,new_status,new_assigned_actor_id,actor_id,correlation_id)
      values (new.organization_id,new.id,'WORK_ITEM_ASSIGNED',new.status,new.assigned_actor_id,private.current_actor_id(),new.correlation_id);
    end if;
    return new;
  end if;

  if new.assigned_actor_id is distinct from old.assigned_actor_id then
    insert into public.work_item_history(
      organization_id,work_item_id,event_type,previous_status,new_status,
      previous_assigned_actor_id,new_assigned_actor_id,actor_id,correlation_id)
    values (
      new.organization_id,new.id,
      case when new.assigned_actor_id is null then 'WORK_ITEM_UNASSIGNED' else 'WORK_ITEM_ASSIGNED' end,
      old.status,new.status,old.assigned_actor_id,new.assigned_actor_id,
      private.current_actor_id(),new.correlation_id);
  end if;

  if new.status is distinct from old.status then
    insert into public.work_item_history(
      organization_id,work_item_id,event_type,previous_status,new_status,
      previous_assigned_actor_id,new_assigned_actor_id,actor_id,correlation_id)
    values (
      new.organization_id,new.id,
      case new.status when 'IN_PROGRESS' then 'WORK_ITEM_STARTED'
        when 'COMPLETED' then 'WORK_ITEM_COMPLETED'
        when 'CANCELLED' then 'WORK_ITEM_CANCELLED'
        else 'WORK_ITEM_ASSIGNED' end,
      old.status,new.status,old.assigned_actor_id,new.assigned_actor_id,
      private.current_actor_id(),new.correlation_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.record_work_item_history() from public,anon,authenticated;

create trigger work_items_record_history after insert or update on public.work_items
for each row execute function private.record_work_item_history();

revoke insert,update,delete on public.work_item_history from authenticated;
