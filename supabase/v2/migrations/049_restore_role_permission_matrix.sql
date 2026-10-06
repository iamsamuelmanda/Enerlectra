-- Enerlectra V2 — Migration 049: restore canonical role-permission grants
-- The role and permission catalogs survived reconstruction, but the live
-- role_permissions bridge is empty. Restore the canonical matrix from 001.
-- Idempotent and additive: existing grants are preserved.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'OWNER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','customer.write','site.read','site.write',
  'asset.read','asset.write','observation.read','observation.write','event.read','event.write',
  'situation.read','situation.manage','work.read','work.assign','work.execute',
  'recommendation.read','verification.read','verification.write','communication.read','communication.send',
  'action.create'
)
where r.key = 'OPERATOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read',
  'observation.read','observation.write','event.read','event.write','situation.read',
  'work.read','work.execute','recommendation.read','verification.read','verification.write',
  'communication.read','action.create'
)
where r.key = 'TECHNICIAN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read',
  'observation.read','observation.write','event.read','event.write','situation.read',
  'work.read','recommendation.read','verification.read','communication.read'
)
where r.key = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'organization.read','customer.read','site.read','asset.read','observation.read',
  'event.read','situation.read','work.read','recommendation.read','verification.read',
  'communication.read'
)
where r.key = 'VIEWER'
on conflict do nothing;
