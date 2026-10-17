-- Enerlectra V2 — Migration 016: Action system-execution and attempt hardening

create or replace function private.enforce_action_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_has_create boolean;
  v_has_authorize boolean;
  v_has_execute boolean;
  v_is_system boolean;
begin
  v_actor_id := private.current_actor_id();
  v_is_system := (current_user = 'service_role');

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
      if not v_is_system then
        if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      end if;
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
      if not v_is_system then
        if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      end if;
      if new.status in ('SUCCEEDED','FAILED') then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;
      return new;
    end if;

    if old.status = 'EXECUTION_UNKNOWN' and new.status = 'EXECUTING' then
      if not v_is_system then
        if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      end if;
      new.completed_at := null;
      new.started_at := coalesce(new.started_at, now());
      return new;
    end if;

    if old.status = 'EXECUTION_UNKNOWN' and new.status in ('SUCCEEDED','FAILED','CANCELLED') then
      if not v_is_system then
        if v_actor_id is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if not private.has_org_permission(new.organization_id, 'work.execute') then raise exception 'WORK_EXECUTE_PERMISSION_REQUIRED'; end if;
      end if;
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
  v_is_system boolean;
begin
  v_current_actor := private.current_actor_id();
  v_is_system := (current_user = 'service_role');

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
    elsif new.executor_type = 'SYSTEM' then
      if not v_is_system then raise exception 'SYSTEM_ATTEMPTS_REQUIRE_TRUSTED_SERVER_EXECUTION'; end if;
      if nullif(btrim(new.metadata ->> 'system_principal'), '') is null then raise exception 'SYSTEM_PRINCIPAL_REQUIRED'; end if;
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

    if old.status = 'CREATED' and new.status in ('EXECUTING','CANCELLED') then
      if new.executor_type = 'HUMAN' then
        if v_current_actor is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
        if new.executor_actor_id <> v_current_actor then raise exception 'HUMAN_EXECUTOR_MUST_BE_CURRENT_ACTOR'; end if;
      elsif not v_is_system then
        raise exception 'SYSTEM_ATTEMPTS_REQUIRE_TRUSTED_SERVER_EXECUTION';
      end if;

      if new.status = 'EXECUTING' then
        new.started_at := coalesce(new.started_at, now());
      else
        new.finished_at := coalesce(new.finished_at, now());
      end if;
      return new;
    end if;

    if old.status = 'EXECUTING' and new.status in ('SUCCEEDED','FAILED','EXECUTION_UNKNOWN') then
      if new.executor_type = 'HUMAN' then
        if v_current_actor is null then raise exception 'ACTIVE_ACTOR_REQUIRED'; end if;
      elsif not v_is_system then
        raise exception 'SYSTEM_ATTEMPTS_REQUIRE_TRUSTED_SERVER_EXECUTION';
      end if;
      new.started_at := coalesce(new.started_at, old.started_at, now());
      new.finished_at := coalesce(new.finished_at, now());
      return new;
    end if;

    raise exception 'INVALID_ATTEMPT_TRANSITION: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_action_integrity() from public, anon, authenticated;
revoke execute on function private.enforce_action_attempt_integrity() from public, anon, authenticated;
