-- 037: strengthen the shared operational loop.
-- Issue creation no longer requires work.execute; creating work is not execution.
-- A bounded, non-authoritative recommendation is recorded before the work item.

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
  p_correlation_id text default null
)
returns table (observation_id uuid, event_id uuid, situation_id uuid, work_item_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_correlation_id text := coalesce(nullif(pg_catalog.btrim(p_correlation_id), ''), pg_catalog.gen_random_uuid()::text);
  v_observation_id uuid;
  v_event_id uuid;
  v_situation_id uuid;
  v_work_item_id uuid;
begin
  if p_organization_id is null or p_actor_id is null then raise exception 'ORGANIZATION_AND_ACTOR_REQUIRED'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) = 0 then raise exception 'ISSUE_TITLE_REQUIRED'; end if;
  if p_observation_value is null then raise exception 'OBSERVATION_VALUE_REQUIRED'; end if;

  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'ACTIVE')
    then raise exception 'ORGANIZATION_NOT_ACTIVE'; end if;

  if not exists (
    select 1 from public.memberships m join public.actors a on a.id = m.actor_id
    where m.organization_id = p_organization_id and m.actor_id = p_actor_id
      and m.status = 'ACTIVE' and a.status = 'ACTIVE'
  ) then raise exception 'ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if not exists (
    select 1 from public.memberships m
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_organization_id and m.actor_id = p_actor_id
      and m.status = 'ACTIVE' and p.key = 'situation.manage'
  ) then raise exception 'SITUATION_MANAGE_PERMISSION_REQUIRED'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1 from public.memberships m join public.actors a on a.id = m.actor_id
    where m.organization_id = p_organization_id and m.actor_id = p_assigned_actor_id
      and m.status = 'ACTIVE' and a.status = 'ACTIVE'
  ) then raise exception 'ASSIGNED_ACTOR_NOT_ACTIVE_MEMBER'; end if;

  if p_assigned_actor_id is not null and not exists (
    select 1 from public.memberships m
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_organization_id and m.actor_id = p_actor_id
      and m.status = 'ACTIVE' and p.key = 'work.assign'
  ) then raise exception 'WORK_ASSIGN_PERMISSION_REQUIRED'; end if;

  if p_idempotency_key is not null then
    select w.id, w.situation_id,
           (s.metadata ->> 'source_event_id')::uuid,
           (s.metadata ->> 'source_observation_id')::uuid
      into v_work_item_id, v_situation_id, v_event_id, v_observation_id
    from public.work_items w
    join public.situations s on s.organization_id = w.organization_id and s.id = w.situation_id
    where w.organization_id = p_organization_id and w.idempotency_key = p_idempotency_key
    limit 1;
    if v_work_item_id is not null then
      return query select v_observation_id, v_event_id, v_situation_id, v_work_item_id;
      return;
    end if;
  end if;

  perform pg_catalog.set_config('app.actor_id', p_actor_id::text, true);

  insert into public.observations (
    organization_id, actor_id, source, observation_type, observed_at, received_at,
    customer_id, site_id, asset_id, value, provenance, correlation_id
  ) values (
    p_organization_id, p_actor_id, coalesce(p_source, 'customer_report'),
    coalesce(p_observation_type, 'CUSTOMER_OPERATIONAL_ISSUE'), v_now, v_now,
    p_customer_id, p_site_id, p_asset_id, p_observation_value,
    pg_catalog.jsonb_build_object(
      'kind', 'customer_operational_issue', 'actor_id', p_actor_id,
      'source', coalesce(p_source, 'customer_report'), 'verified', false
    ), v_correlation_id
  ) returning id into v_observation_id;

  insert into public.events (
    organization_id, actor_id, event_type, occurred_at, recorded_at, source,
    customer_id, site_id, asset_id, source_observation_id, payload, provenance, correlation_id
  ) values (
    p_organization_id, p_actor_id, 'CUSTOMER_OPERATIONAL_ISSUE_REPORTED',
    v_now, v_now, coalesce(p_source, 'customer_report'),
    p_customer_id, p_site_id, p_asset_id, v_observation_id,
    pg_catalog.jsonb_build_object('title', pg_catalog.btrim(p_title), 'summary', p_summary),
    pg_catalog.jsonb_build_object('kind', 'observation_derived', 'observation_id', v_observation_id),
    v_correlation_id
  ) returning id into v_event_id;

  insert into public.situations (
    organization_id, situation_type, status, severity, title, summary,
    customer_id, site_id, asset_id, opened_at, last_observed_at, metadata
  ) values (
    p_organization_id, 'CUSTOMER_OPERATIONAL_ISSUE', 'OPEN', coalesce(p_severity, 'MEDIUM'),
    pg_catalog.btrim(p_title), p_summary, p_customer_id, p_site_id, p_asset_id,
    v_now, v_now,
    pg_catalog.jsonb_build_object(
      'source_event_id', v_event_id,
      'source_observation_id', v_observation_id,
      'evidence_verified', false
    )
  ) returning id into v_situation_id;

  insert into public.situation_event_links (organization_id, situation_id, event_id, relation_type)
  values (p_organization_id, v_situation_id, v_event_id, 'TRIGGER');

  insert into public.recommendations (
    organization_id, situation_id, generated_by, status, recommendation_type,
    summary, rationale, context_snapshot
  ) values (
    p_organization_id,
    v_situation_id,
    'RULE_ENGINE',
    'PROPOSED',
    case coalesce(p_work_type, 'INVESTIGATE')
      when 'CONTACT_CUSTOMER' then 'CUSTOMER_CONTACT'
      when 'VISIT_SITE' then 'FIELD_INSPECTION'
      when 'RECONCILE_PAYMENT' then 'PAYMENT_RECONCILIATION'
      when 'ESCALATE_EXTERNAL' then 'EXTERNAL_ESCALATION'
      else 'OPERATIONAL_INVESTIGATION'
    end,
    case coalesce(p_work_type, 'INVESTIGATE')
      when 'CONTACT_CUSTOMER' then 'Contact the customer to clarify the reported condition and current service status.'
      when 'VISIT_SITE' then 'Arrange a site visit to inspect the reported condition and capture field evidence.'
      when 'RECONCILE_PAYMENT' then 'Verify the payment reference against the customer/service record and resolve the exception.'
      when 'ESCALATE_EXTERNAL' then 'Escalate the issue to the responsible external provider with the available evidence.'
      else 'Review the available evidence and investigate the reported operational condition before taking consequential action.'
    end,
    'Initial recommendation generated from the reported operational evidence. It is non-authoritative and must be evaluated by an authorized operator.',
    pg_catalog.jsonb_build_object(
      'source_observation_id', v_observation_id,
      'source_event_id', v_event_id,
      'work_type', coalesce(p_work_type, 'INVESTIGATE'),
      'customer_id', p_customer_id,
      'site_id', p_site_id,
      'asset_id', p_asset_id
    )
  );

  insert into public.work_items (
    organization_id, situation_id, work_type, status, priority, title, description,
    customer_id, site_id, asset_id, assigned_actor_id, assigned_at,
    created_by_actor_id, correlation_id, idempotency_key
  ) values (
    p_organization_id, v_situation_id, coalesce(p_work_type, 'INVESTIGATE'),
    case when p_assigned_actor_id is not null then 'ASSIGNED' else 'OPEN' end,
    coalesce(p_priority, 'NORMAL'), pg_catalog.btrim(p_title), p_summary,
    p_customer_id, p_site_id, p_asset_id, p_assigned_actor_id,
    case when p_assigned_actor_id is not null then v_now else null end,
    p_actor_id, v_correlation_id, p_idempotency_key
  ) returning id into v_work_item_id;

  return query select v_observation_id, v_event_id, v_situation_id, v_work_item_id;
end;
$function$;

revoke execute on function public.create_customer_operational_issue(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, jsonb, text, text, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.create_customer_operational_issue(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, jsonb, text, text, text, uuid, text, text
) to service_role;
