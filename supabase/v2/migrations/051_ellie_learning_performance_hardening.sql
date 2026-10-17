-- Enerlectra V2 — Migration 051: Ellie learning query/index hardening
-- Keep tenant-scoped learning fast without changing its authorization semantics.

create index intelligence_learning_events_actor_idx
  on public.intelligence_learning_events(actor_id);

create index intelligence_learning_events_recommendation_idx
  on public.intelligence_learning_events(recommendation_id);

create index intelligence_learning_events_verification_idx
  on public.intelligence_learning_events(verification_id);

drop policy if exists intelligence_learning_events_select_member
  on public.intelligence_learning_events;

create policy intelligence_learning_events_select_member
on public.intelligence_learning_events for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = (select auth.uid())
      and a.status = 'ACTIVE'
      and m.organization_id = intelligence_learning_events.organization_id
      and m.status = 'ACTIVE'
      and p.key = 'recommendation.read'
  )
);

drop policy if exists intelligence_memories_select_member
  on public.intelligence_memories;

create policy intelligence_memories_select_member
on public.intelligence_memories for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    join public.actors a on a.id = m.actor_id
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where a.auth_user_id = (select auth.uid())
      and a.status = 'ACTIVE'
      and m.organization_id = intelligence_memories.organization_id
      and m.status = 'ACTIVE'
      and p.key = 'recommendation.read'
  )
);
