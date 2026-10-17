-- V2 migration 008: make situation history trigger-owned and append-only

create or replace function private.record_situation_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.situation_history (
      organization_id, situation_id, actor_id, from_status, to_status, reason
    ) values (
      new.organization_id, new.id, private.current_actor_id(), null, new.status, 'SITUATION_CREATED'
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.situation_history (
      organization_id, situation_id, actor_id, from_status, to_status, reason
    ) values (
      new.organization_id, new.id, private.current_actor_id(), old.status, new.status, null
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.record_situation_status_history() from public, anon, authenticated;

create trigger situations_record_status_history
after insert or update of status on public.situations
for each row execute function private.record_situation_status_history();

revoke insert on public.situation_history from authenticated;
drop policy situation_history_insert on public.situation_history;
