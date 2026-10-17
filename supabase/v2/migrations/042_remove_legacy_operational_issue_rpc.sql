-- 042: remove the obsolete overloaded operational-issue RPC.
-- The context-aware signature is the only supported server boundary.

drop function if exists public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text
);

revoke execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) from public,anon,authenticated;

grant execute on function public.create_customer_operational_issue(
  uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text,text,uuid,text,text,text,text,text,numeric,jsonb
) to service_role;
