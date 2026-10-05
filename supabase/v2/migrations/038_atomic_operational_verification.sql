-- 038: make verification a single authoritative, atomic domain operation.
-- Direct authenticated table INSERT is revoked; callers use the validated RPC.

create or replace function public.record_operational_verification(
  p_organization_id uuid,
  p_actor_id uuid,
  p_situation_id uuid default null,
  p_work_item_id uuid default null,
  p_action_id uuid default null,
  p_verification_type text default 'OPERATOR_CONFIRMATION',
  p_status text default 'VERIFIED',
  p_result jsonb default '{}'::jsonb,
  p_observation_id uuid default null,
  p_event_id uuid default null
)
returns table (
  verification_id uuid,
  situation_id uuid,
  work_item_id uuid,
  action_id uuid,
  verification_status text,
  situation_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_situation_id uuid := p_situation_id;
  v_work_item_id uuid := p_work_item_id;
  v_action_id uuid := p_action_id;
  v_verification_id uuid;
  v_situation_status text;
begin
  if p_organization_id is null or p_actor_id is null then raise exception 'ORGANIZATION_AND_ACTOR_REQUIRED'; end if;
  if p_situation_id is null and p_work_item_id is null and p_action_id is null then raise exception 'VERIFICATION_TARGET_REQUIRED'; end if;
  if p_verification_type not in ('OPERATOR_CONFIRMATION','TECHNICIAN_CONFIRMATION','CUSTOMER_CONFIRMATION','TELEMETRY','METER_READING','PAYMENT_CONFIRMATION','SYSTEM_STATE') then raise exception 'INVALID_VERIFICATION_TYPE'; end if;
  if p_status not in ('VERIFIED','PARTIAL','FAILED','REOPENED') then raise exception 'INVALID_VERIFICATION_STATUS'; end if;

  if not exists (
    select 1 from public.memberships m
    join public.actors a on a.id = m.actor_id
    where m.organization_id = p_organization_id and m.actor_id = p_actor_id
      and m.status = 'ACTIVE' and a.status = 'ACTIVE'
  ) then raise exception 'ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if not exists (
    select 1 from public.memberships m
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_organization_id and m.actor_id = p_actor_id
      and m.status = 'ACTIVE' and p.key = 'verification.write'
  ) then raise exception 'VERIFICATION_WRITE_PERMISSION_REQUIRED'; end if;

  if v_situation_id is not null and not exists (
    select 1 from public.situations s where s.id = v_situation_id and s.organization_id = p_organization_id
  ) then raise exception 'SITUATION_NOT_FOUND'; end if;

  if v_work_item_id is not null then
    declare
      work_situation_id uuid;
    begin
      select w.situation_id into work_situation_id
      from public.work_items w
      where w.id = v_work_item_id and w.organization_id = p_organization_id;
      if work_situation_id is null then raise exception 'WORK_ITEM_NOT_FOUND'; end if;
      if v_situation_id is not null and v_situation_id <> work_situation_id then
        raise exception 'WORK_SITUATION_TARGET_MISMATCH';
      end if;
      v_situation_id := work_situation_id;
    end;
  end if;

  if v_action_id is not null then
    declare
      action_work_item_id uuid;
      action_situation_id uuid;
    begin
      select a.work_item_id, w.situation_id into action_work_item_id, action_situation_id
      from public.actions a
      join public.work_items w on w.id = a.work_item_id and w.organization_id = p_organization_id
      where a.id = v_action_id and a.organization_id = p_organization_id;

      if action_work_item_id is null then raise exception 'ACTION_NOT_FOUND'; end if;
      if v_work_item_id is not null and v_work_item_id <> action_work_item_id then raise exception 'ACTION_WORK_TARGET_MISMATCH'; end if;
      v_work_item_id := action_work_item_id;
      if v_situation_id is not null and action_situation_id <> v_situation_id then raise exception 'ACTION_SITUATION_TARGET_MISMATCH'; end if;
      v_situation_id := action_situation_id;
    end;
  end if;

  insert into public.verifications (
    organization_id, situation_id, work_item_id, action_id, verification_type,
    status, verified_by_actor_id, verified_at, result, observation_id, event_id
  ) values (
    p_organization_id, v_situation_id, v_work_item_id, v_action_id,
    p_verification_type, p_status, p_actor_id, v_now,
    coalesce(p_result, '{}'::jsonb), p_observation_id, p_event_id
  ) returning id into v_verification_id;

  if v_situation_id is not null then
    if p_status = 'VERIFIED' then
      update public.situations
      set status = 'RESOLVED', resolved_at = v_now,
          resolution_summary = coalesce(p_result ->> 'summary', 'Operational outcome verified.')
      where id = v_situation_id and organization_id = p_organization_id;
    elsif p_status = 'REOPENED' then
      update public.situations set status = 'OPEN', resolved_at = null, resolution_summary = null
      where id = v_situation_id and organization_id = p_organization_id;
    elsif p_status in ('PARTIAL','FAILED') then
      update public.situations set status = 'INVESTIGATING', resolved_at = null
      where id = v_situation_id and organization_id = p_organization_id;
    end if;

    select s.status into v_situation_status from public.situations s where s.id = v_situation_id;
  end if;

  return query select v_verification_id, v_situation_id, v_work_item_id, v_action_id, p_status, v_situation_status;
end;
$function$;

revoke execute on function public.record_operational_verification(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.record_operational_verification(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid, uuid
) to service_role;

revoke insert on public.verifications from authenticated;
