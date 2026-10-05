-- 041: recommendation generation becomes organization-context aware.
-- The operational transaction accepts a recommendation produced by the server-side
-- capability-aware intelligence layer. Business-model labels are not inspected.

create or replace function public.create_customer_operational_issue(
  p_organization_id uuid,
  p_actor_id uuid,
  p_title text,
  p_summary text default null,
  p_severity text default 'MEDIUM',
  p_customer_id uuid default null,
  p_site_id uuid default null,
  p_asset_id uuid default null,
  p_observation_type text default 'CUSTOMER_OPERATIONAL_ISSUE',
  p_observation_value jsonb default '{}'::jsonb,
  p_source text default 'customer_report',
  p_work_type text default 'INVESTIGATE',
  p_priority text default 'NORMAL',
  p_assigned_actor_id uuid default null,
  p_idempotency_key text default null,
  p_correlation_id text default null,
  p_recommendation_type text default 'OPERATIONAL_INVESTIGATION',
  p_recommendation_summary text default null,
  p_recommendation_rationale text default null,
  p_recommendation_confidence numeric default null,
  p_recommendation_context jsonb default '{}'::jsonb
)
returns table (observation_id uuid, event_id uuid, situation_id uuid, work_item_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_correlation_id uuid := case
    when p_correlation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
  v_observation_id uuid;
  v_event_id uuid;
  v_situation_id uuid;
  v_work_item_id uuid;
begin
  if p_organization_id is null or p_actor_id is null then raise exception 'ORGANIZATION_AND_ACTOR_REQUIRED'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) = 0 then raise exception 'ISSUE_TITLE_REQUIRED'; end if;
  if p_observation_value is null then raise exception 'OBSERVATION_VALUE_REQUIRED'; end if;

  if not exists (
    select 1 from public.organizations o
    where o.id=p_organization_id and o.status='ACTIVE'
  ) then raise exception 'ORGANIZATION_NOT_ACTIVE'; end if;

  if not exists (
    select 1
    from public.memberships m
    join public.actors a on a.id=m.actor_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and a.status='ACTIVE'
  ) then raise exception 'ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if not exists (
    select 1
    from public.memberships m
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and p.key='situation.manage'
  ) then raise exception 'SITUATION_MANAGE_PERMISSION_REQUIRED'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1
    from public.memberships m
    join public.actors a on a.id=m.actor_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_assigned_actor_id
      and m.status='ACTIVE'
      and a.status='ACTIVE'
  ) then raise exception 'ASSIGNED_ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1
    from public.memberships m
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and p.key='work.assign'
  ) then raise exception 'WORK_ASSIGN_PERMISSION_REQUIRED'; end if;

  if p_idempotency_key is not null then
    select w.id,w.situation_id,
      (s.metadata->>'source_event_id')::uuid,
      (s.metadata->>'source_observation_id')::uuid
    into v_work_item_id,v_situation_id,v_event_id,v_observation_id
    from public.work_items w
    join public.situations s
      on s.organization_id=w.organization_id
     and s.id=w.situation_id
    where w.organization_id=p_organization_id
      and w.idempotency_key=p_idempotency_key
    limit 1;

    if v_work_item_id is not null then
      return query select v_observation_id,v_event_id,v_situation_id,v_work_item_id;
      return;
    end if;
  end if;

  perform pg_catalog.set_config('app.actor_id',p_actor_id::text,true);

  insert into public.observations (
    organization_id,actor_id,source,observation_type,observed_at,received_at,
    customer_id,site_id,asset_id,value,provenance,correlation_id
  ) values (
    p_organization_id,p_actor_id,coalesce(p_source,'customer_report'),
    coalesce(p_observation_type,'CUSTOMER_OPERATIONAL_ISSUE'),v_now,v_now,
    p_customer_id,p_site_id,p_asset_id,p_observation_value,
    pg_catalog.jsonb_build_object(
      'kind','customer_operational_issue',
      'actor_id',p_actor_id,
      'source',coalesce(p_source,'customer_report'),
      'verified',false
    ),
    v_correlation_id
  ) returning id into v_observation_id;

  insert into public.events (
    organization_id,actor_id,event_type,occurred_at,recorded_at,source,
    customer_id,site_id,asset_id,source_observation_id,payload,provenance,correlation_id
  ) values (
    p_organization_id,p_actor_id,'CUSTOMER_OPERATIONAL_ISSUE_REPORTED',
    v_now,v_now,coalesce(p_source,'customer_report'),
    p_customer_id,p_site_id,p_asset_id,v_observation_id,
    pg_catalog.jsonb_build_object('title',pg_catalog.btrim(p_title),'summary',p_summary),
    pg_catalog.jsonb_build_object('kind','observation_derived','observation_id',v_observation_id),
    v_correlation_id
  ) returning id into v_event_id;

  insert into public.situations (
    organization_id,situation_type,status,severity,title,summary,
    customer_id,site_id,asset_id,opened_at,last_observed_at,metadata
  ) values (
    p_organization_id,'CUSTOMER_OPERATIONAL_ISSUE','OPEN',coalesce(p_severity,'MEDIUM'),
    pg_catalog.btrim(p_title),p_summary,p_customer_id,p_site_id,p_asset_id,
    v_now,v_now,
    pg_catalog.jsonb_build_object(
      'source_event_id',v_event_id,
      'source_observation_id',v_observation_id,
      'evidence_verified',false
    )
  ) returning id into v_situation_id;

  insert into public.situation_event_links(organization_id,situation_id,event_id,relation_type)
  values(p_organization_id,v_situation_id,v_event_id,'TRIGGER');

  insert into public.recommendations (
    organization_id,situation_id,generated_by,status,recommendation_type,
    summary,rationale,confidence,context_snapshot
  ) values (
    p_organization_id,v_situation_id,'RULE_ENGINE','PROPOSED',
    coalesce(nullif(pg_catalog.btrim(p_recommendation_type),''),
      'OPERATIONAL_INVESTIGATION'),
    coalesce(nullif(pg_catalog.btrim(p_recommendation_summary),''),
      'Review the available evidence and determine the next operational step before taking consequential action.'),
    coalesce(nullif(pg_catalog.btrim(p_recommendation_rationale),''),
      'The situation was normalized from operational evidence and requires contextual human evaluation.'),
    p_recommendation_confidence,
    coalesce(p_recommendation_context,'{}'::jsonb)
  );

  insert into public.work_items (
    organization_id,situation_id,work_type,status,priority,title,description,
    customer_id,site_id,asset_id,assigned_actor_id,assigned_at,created_by_actor_id,
    correlation_id,idempotency_key
  ) values (
    p_organization_id,v_situation_id,coalesce(p_work_type,'INVESTIGATE'),
    case when p_assigned_actor_id is not null then 'ASSIGNED' else 'OPEN' end,
    coalesce(p_priority,'NORMAL'),pg_catalog.btrim(p_title),p_summary,
    p_customer_id,p_site_id,p_asset_id,p_assigned_actor_id,
    case when p_assigned_actor_id is not null then v_now else null end,
    p_actor_id,v_correlation_id,p_idempotency_key
  ) returning id into v_work_item_id;

  return query select v_observation_id,v_event_id,v_situation_id,v_work_item_id;
end;
$function$;

revoke execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) from public,anon,authenticated;

grant execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) to service_role;

      then p_correlation_id::uuid
    else pg_catalog.gen_random_uuid()
  end;
  v_observation_id uuid;
  v_event_id uuid;
  v_situation_id uuid;
  v_work_item_id uuid;
begin
  if p_organization_id is null or p_actor_id is null then raise exception 'ORGANIZATION_AND_ACTOR_REQUIRED'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) = 0 then raise exception 'ISSUE_TITLE_REQUIRED'; end if;
  if p_observation_value is null then raise exception 'OBSERVATION_VALUE_REQUIRED'; end if;

  if not exists (
    select 1 from public.organizations o
    where o.id=p_organization_id and o.status='ACTIVE'
  ) then raise exception 'ORGANIZATION_NOT_ACTIVE'; end if;

  if not exists (
    select 1
    from public.memberships m
    join public.actors a on a.id=m.actor_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and a.status='ACTIVE'
  ) then raise exception 'ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if not exists (
    select 1
    from public.memberships m
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and p.key='situation.manage'
  ) then raise exception 'SITUATION_MANAGE_PERMISSION_REQUIRED'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1
    from public.memberships m
    join public.actors a on a.id=m.actor_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_assigned_actor_id
      and m.status='ACTIVE'
      and a.status='ACTIVE'
  ) then raise exception 'ASSIGNED_ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1
    from public.memberships m
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.organization_id=p_organization_id
      and m.actor_id=p_actor_id
      and m.status='ACTIVE'
      and p.key='work.assign'
  ) then raise exception 'WORK_ASSIGN_PERMISSION_REQUIRED'; end if;

  if p_idempotency_key is not null then
    select w.id,w.situation_id,
      (s.metadata->>'source_event_id')::uuid,
      (s.metadata->>'source_observation_id')::uuid
    into v_work_item_id,v_situation_id,v_event_id,v_observation_id
    from public.work_items w
    join public.situations s
      on s.organization_id=w.organization_id
     and s.id=w.situation_id
    where w.organization_id=p_organization_id
      and w.idempotency_key=p_idempotency_key
    limit 1;

    if v_work_item_id is not null then
      return query select v_observation_id,v_event_id,v_situation_id,v_work_item_id;
      return;
    end if;
  end if;

  perform pg_catalog.set_config('app.actor_id',p_actor_id::text,true);

  insert into public.observations (
    organization_id,actor_id,source,observation_type,observed_at,received_at,
    customer_id,site_id,asset_id,value,provenance,correlation_id
  ) values (
    p_organization_id,p_actor_id,coalesce(p_source,'customer_report'),
    coalesce(p_observation_type,'CUSTOMER_OPERATIONAL_ISSUE'),v_now,v_now,
    p_customer_id,p_site_id,p_asset_id,p_observation_value,
    pg_catalog.jsonb_build_object(
      'kind','customer_operational_issue',
      'actor_id',p_actor_id,
      'source',coalesce(p_source,'customer_report'),
      'verified',false
    ),
    v_correlation_id
  ) returning id into v_observation_id;

  insert into public.events (
    organization_id,actor_id,event_type,occurred_at,recorded_at,source,
    customer_id,site_id,asset_id,source_observation_id,payload,provenance,correlation_id
  ) values (
    p_organization_id,p_actor_id,'CUSTOMER_OPERATIONAL_ISSUE_REPORTED',
    v_now,v_now,coalesce(p_source,'customer_report'),
    p_customer_id,p_site_id,p_asset_id,v_observation_id,
    pg_catalog.jsonb_build_object('title',pg_catalog.btrim(p_title),'summary',p_summary),
    pg_catalog.jsonb_build_object('kind','observation_derived','observation_id',v_observation_id),
    v_correlation_id
  ) returning id into v_event_id;

  insert into public.situations (
    organization_id,situation_type,status,severity,title,summary,
    customer_id,site_id,asset_id,opened_at,last_observed_at,metadata
  ) values (
    p_organization_id,'CUSTOMER_OPERATIONAL_ISSUE','OPEN',coalesce(p_severity,'MEDIUM'),
    pg_catalog.btrim(p_title),p_summary,p_customer_id,p_site_id,p_asset_id,
    v_now,v_now,
    pg_catalog.jsonb_build_object(
      'source_event_id',v_event_id,
      'source_observation_id',v_observation_id,
      'evidence_verified',false
    )
  ) returning id into v_situation_id;

  insert into public.situation_event_links(organization_id,situation_id,event_id,relation_type)
  values(p_organization_id,v_situation_id,v_event_id,'TRIGGER');

  insert into public.recommendations (
    organization_id,situation_id,generated_by,status,recommendation_type,
    summary,rationale,confidence,context_snapshot
  ) values (
    p_organization_id,v_situation_id,'RULE_ENGINE','PROPOSED',
    coalesce(nullif(pg_catalog.btrim(p_recommendation_type),''),
      'OPERATIONAL_INVESTIGATION'),
    coalesce(nullif(pg_catalog.btrim(p_recommendation_summary),''),
      'Review the available evidence and determine the next operational step before taking consequential action.'),
    coalesce(nullif(pg_catalog.btrim(p_recommendation_rationale),''),
      'The situation was normalized from operational evidence and requires contextual human evaluation.'),
    p_recommendation_confidence,
    coalesce(p_recommendation_context,'{}'::jsonb)
  );

  insert into public.work_items (
    organization_id,situation_id,work_type,status,priority,title,description,
    customer_id,site_id,asset_id,assigned_actor_id,assigned_at,created_by_actor_id,
    correlation_id,idempotency_key
  ) values (
    p_organization_id,v_situation_id,coalesce(p_work_type,'INVESTIGATE'),
    case when p_assigned_actor_id is not null then 'ASSIGNED' else 'OPEN' end,
    coalesce(p_priority,'NORMAL'),pg_catalog.btrim(p_title),p_summary,
    p_customer_id,p_site_id,p_asset_id,p_assigned_actor_id,
    case when p_assigned_actor_id is not null then v_now else null end,
    p_actor_id,v_correlation_id,p_idempotency_key
  ) returning id into v_work_item_id;

  return query select v_observation_id,v_event_id,v_situation_id,v_work_item_id;
end;
$function$;

revoke execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) from public,anon;

grant execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) to service_role;
