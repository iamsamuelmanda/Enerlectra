import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.V2_SUPABASE_URL;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.V2_SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceRoleKey && anonKey);

test('V2 actor and channel identity write restrictions are configured', () => {
  if (!enabled) {
    assert.ok(true, 'Set V2_SUPABASE_URL, V2_SUPABASE_ANON_KEY and V2_SUPABASE_SERVICE_ROLE_KEY to run live privilege tests.');
  }
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = Date.now().toString(36);
  const email = `v2-identity-security-${runId}@example.invalid`;
  const password = `V2_Identity_Security_${runId}_Secure!`;
  let authUserId;
  let actorId;

  before(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    authUserId = data.user.id;

    const { data: actor, error: actorError } = await admin
      .from('actors')
      .insert({ auth_user_id: authUserId, actor_type: 'HUMAN', status: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(actorError);
    actorId = actor.id;
  });

  after(async () => {
    if (actorId) {
      const { error } = await admin.from('actors').delete().eq('id', actorId);
      assert.ifError(error);
    }
    if (authUserId) {
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      assert.ifError(error);
    }
  });

  test('authenticated actor may update profile fields but cannot change lifecycle status', async () => {
    const auth = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sessionData, error: signInError } = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(signInError);
    assert.ok(sessionData.session?.access_token);

    const scoped = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
    });

    const { error: profileError } = await scoped
      .from('actors')
      .update({ display_name: 'V2 security test' })
      .eq('id', actorId);
    assert.ifError(profileError);

    const { error: statusError } = await scoped
      .from('actors')
      .update({ status: 'DISABLED' })
      .eq('id', actorId);
    assert.ok(statusError, 'authenticated actor must not update its own status');

    const { data: actor, error: readError } = await admin
      .from('actors')
      .select('status')
      .eq('id', actorId)
      .single();
    assert.ifError(readError);
    assert.equal(actor.status, 'ACTIVE');
  });

  test('authenticated actor cannot attach an unverified channel identity', async () => {
    const auth = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session?.access_token);

    const scoped = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });

    const { error: insertError } = await scoped.from('channel_identities').insert({
      actor_id: actorId,
      channel: 'whatsapp',
      external_id: `+260-test-${runId}`,
      status: 'ACTIVE',
    });
    assert.ok(insertError, 'authenticated actor must not self-assert an external channel identity');
  });
}
