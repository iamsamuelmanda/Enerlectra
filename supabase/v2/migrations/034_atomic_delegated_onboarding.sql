-- Enerlectra — Migration 034: atomic delegated organization onboarding
--
-- A delegated creator must not be left with a pending organization that has no
-- owner-claim invitation when the second client RPC fails. Keep organization
-- creation and invitation issuance in one PostgreSQL transaction.

create or replace function public.create_delegated_organization_with_owner_invitation(
  p_name text,
  p_owner_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_invitation jsonb;
begin
  if p_owner_email is null
     or length(btrim(p_owner_email)) < 3
     or length(btrim(p_owner_email)) > 320
     or position('@' in btrim(p_owner_email)) < 2 then
    raise exception 'VALID_OWNER_EMAIL_REQUIRED';
  end if;

  v_org := public.create_organization(p_name, 'DELEGATED_OPERATOR');

  v_invitation := public.create_organization_invitation(
    v_org.id,
    lower(btrim(p_owner_email)),
    'OWNER_CLAIM',
    'OWNER'
  );

  return jsonb_build_object(
    'organization', to_jsonb(v_org),
    'invitation', v_invitation
  );
end;
$$;

revoke all on function public.create_delegated_organization_with_owner_invitation(text,text)
from public, anon;
grant execute on function public.create_delegated_organization_with_owner_invitation(text,text)
to authenticated;
