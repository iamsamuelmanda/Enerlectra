-- 025: evaluate auth.uid() once per statement in self-profile RLS policies.
drop policy if exists actors_select_self on public.actors;
create policy actors_select_self
  on public.actors
  for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists actors_update_self on public.actors;
create policy actors_update_self
  on public.actors
  for update
  to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));
