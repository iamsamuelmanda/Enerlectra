-- 024: keep organization creation unavailable to browser clients until
-- trusted invitation/onboarding is implemented. Preserve server provisioning.
revoke execute on function public.create_organization(text) from public, anon, authenticated;
grant execute on function public.create_organization(text) to service_role;

-- Harden the SECURITY DEFINER function against search_path object shadowing.
alter function public.create_organization(text) set search_path = '';
