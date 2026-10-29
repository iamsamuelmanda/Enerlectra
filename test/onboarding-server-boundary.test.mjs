import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('browser onboarding uses the authenticated API and never invokes privileged RPCs', async () => {
  const source = await read('../client/src/pages/Onboarding.tsx');
  assert.match(source, /\/api\/onboarding\/organizations/);
  assert.match(source, /\/api\/onboarding\/invitations\/accept/);
  assert.ok(source.includes('Authorization: `Bearer ${accessToken}`'));
  for (const rpc of ['create_organization', 'create_delegated_organization_with_owner_invitation', 'accept_organization_invitation']) {
    assert.equal(source.includes(`rpc('${rpc}'`), false, `browser must not call privileged RPC ${rpc}`);
  }
});

test('server onboarding verifies a confirmed Supabase identity and maps only trusted identity to privileged RPCs', async () => {
  const source = await read('../server/src/routes/onboarding.ts');
  assert.match(source, /db\.auth\.getUser\(token\)/);
  assert.match(source, /user\.email_confirmed_at/);
  assert.match(source, /server_create_onboarding_organization/);
  assert.match(source, /server_accept_organization_invitation/);
  assert.match(source, /p_auth_user_id: user\.id/);
  assert.match(source, /p_verified_email: user\.email/);
  assert.doesNotMatch(source.slice(0, source.indexOf("router.post('/ownership/transfer'")), /p_actor_id|p_organization_id|p_role_id/);
});

test('trusted onboarding migration limits RPC execution to service_role and checks invitation identity', async () => {
  const source = await read('../supabase/v2/migrations/058_server_verified_onboarding.sql');
  assert.match(source, /revoke all on function public\.server_create_onboarding_organization[\s\S]*?from public, anon, authenticated/i);
  assert.match(source, /grant execute on function public\.server_create_onboarding_organization[\s\S]*?to service_role/i);
  assert.match(source, /grant execute on function public\.server_accept_organization_invitation[\s\S]*?to service_role/i);
  assert.match(source, /revoke all on function public\.create_delegated_organization_with_owner_invitation\(text,text\)[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(source, /extensions\.gen_random_bytes\(32\)/);
  assert.match(source, /extensions\.digest\(p_token, 'sha256'\)/);
  assert.match(source, /INVITATION_EMAIL_MISMATCH/);
  assert.match(source, /expires_at > now\(\)/);
  assert.match(source, /encode\(extensions\.digest\(p_token, 'sha256'\), 'hex'\)/);
});


test('ownership transfer accepts verified identity, derives tenant context and calls only the server RPC', async () => {
  const source = await read('../server/src/routes/onboarding.ts');
  const migration = await read('../supabase/v2/migrations/059_server_verified_ownership_transfer.sql');
  assert.match(source, /router\.post\('\/ownership\/transfer'/);
  assert.match(source, /tenantResolver\.resolve/);
  assert.match(source, /tenant\.permissions\.includes\('organization\.ownership\.manage'\)/);
  assert.match(source, /p_auth_user_id: user\.id/);
  assert.match(source, /p_organization_id: tenant\.organizationId/);
  assert.match(source, /server_transfer_organization_ownership/);
  assert.match(migration, /where a\.auth_user_id = p_auth_user_id and a\.status = 'ACTIVE'/);
  assert.match(migration, /grant execute on function public\.server_transfer_organization_ownership[\s\S]*?to service_role/i);
  assert.match(migration, /revoke all on function public\.server_transfer_organization_ownership[\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /FINAL_OWNER_CANNOT_BE_DEMOTED/);
});
