-- 021_trusted_actor_permission_context
-- Existing Work Item triggers use has_org_permission(). Trusted server-side
-- RPCs set app.actor_id; allow that established actor context to participate
-- in the same permission check used by authenticated requests.

create or replace function private.has_org_permission(p_organization_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path='public','pg_temp'
as $function$
  select exists(
    select 1
    from public.memberships m
    join public.actors a on a.id=m.actor_id
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where a.id=coalesce(
      nullif(current_setting('app.actor_id',true),'')::uuid,
      (select a2.id from public.actors a2 where a2.auth_user_id=auth.uid() and a2.status='ACTIVE' limit 1)
    )
    and a.status='ACTIVE' and m.organization_id=p_organization_id
    and m.status='ACTIVE' and p.key=p_permission_key
  )
$function$;

revoke execute on function private.has_org_permission(uuid,text) from public,anon,authenticated;