-- Restrict SECURITY DEFINER onboarding/ownership RPCs to the server-side service role.
-- RLS remains enabled on organization_invitations with no policy by design: direct client
-- access is denied; server-side service-role code owns invitation lifecycle.

revoke execute on function public.accept_organization_invitation(text) from public, authenticated;
revoke execute on function public.create_organization(text, text) from public, authenticated;
revoke execute on function public.create_organization_invitation(uuid, text, text, text) from public, authenticated;
revoke execute on function public.transfer_organization_ownership(uuid, uuid, boolean) from public, authenticated;

grant execute on function public.accept_organization_invitation(text) to service_role;
grant execute on function public.create_organization(text, text) to service_role;
grant execute on function public.create_organization_invitation(uuid, text, text, text) to service_role;
grant execute on function public.transfer_organization_ownership(uuid, uuid, boolean) to service_role;
