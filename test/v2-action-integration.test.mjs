import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.V2_SUPABASE_URL;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const integrationEnabled = Boolean(url && serviceRoleKey);

test('V2 Action authenticated integration gate is configured', () => {
  if (!integrationEnabled) {
    assert.ok(true, 'Set V2_SUPABASE_URL and V2_SUPABASE_SERVICE_ROLE_KEY to run live authenticated Action tests.');
  }
});

if (!integrationEnabled) {
  // Do not silently claim the live gate passed when credentials are unavailable.
} else {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now().toString(36);
  const password = `V2_Action_Integration_${runId}_Secure!`;
  const users = {};
  const orgs = {};

  async function createAuthUser(label) {
    const email = `v2-action-${label}-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    users[label] = { id: data.user.id, email };
    return data.user.id;
  }

  async function signIn(label) {
    const authClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Exchange credentials for a real authenticated JWT. The service-role key is never
    // used for the assertions below.
    const { data, error } = await authClient.auth.signInWithPassword({
      email: users[label].email,
      password,
    });
    assert.ifError(error);
    assert.ok(data.session?.access_token);
    const scoped = createClient(url, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: sessionError } = await scoped.auth.setSession(data.session);
    assert.ifError(sessionError);
    return scoped;
  }

  async function querySingle(table, query) {
    const { data, error } = await admin.from(table).select(query).limit(1).maybeSingle();
    assert.ifError(error);
    return data;
  }

  async function seedOrg(label) {
    const { data, error } = await admin
      .from('organizations')
      .insert({ name: `V2 Action Test ${label} ${runId}`, status: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(error);
    orgs[label] = data.id;
    return data.id;
  }

  async function seedActor(label, authUserId, roleKey, orgId) {
    const { data: actor, error: actorError } = await admin
      .from('actors')
      .insert({ auth_user_id: authUserId, status: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(actorError);

    const { data: roleRow, error: roleError } = await admin
      .from('roles')
      .select('id, key')
      .eq('key', roleKey)
      .single();
    assert.ifError(roleError);

    const { error: membershipError } = await admin.from('memberships').insert({
      organization_id: orgId,
      actor_id: actor.id,
      role_id: roleRow.id,
      status: 'ACTIVE',
    });
    assert.ifError(membershipError);

    return actor.id;
  }

  async function seedOperationalChain(orgId, actorId) {
    const { data: situation, error: situationError } = await admin
      .from('situations')
      .insert({
        organization_id: orgId,
        situation_type: 'equipment_fault',
        status: 'OPEN',
        severity: 'HIGH',
        title: 'Authenticated Action integration test',
        summary: 'Test situation',
      })
      .select('id')
      .single();
    assert.ifError(situationError);

    const { data: work, error: workError } = await admin
      .from('work_items')
      .insert({
        organization_id: orgId,
        situation_id: situation.id,
        work_type: 'INVESTIGATE',
        status: 'OPEN',
        priority: 'HIGH',
        title: 'Investigate test fault',
        created_by_actor_id: actorId,
      })
      .select('id')
      .single();
    assert.ifError(workError);
    return { situationId: situation.id, workItemId: work.id };
  }

  let operatorClient;
  let ownerClient;
  let technicianClient;
  let orgAChain;
  let orgBChain;

  before(async () => {
    const [operatorAuth, ownerAuth, technicianAuth, otherAuth] = await Promise.all([
      createAuthUser('operator'),
      createAuthUser('owner'),
      createAuthUser('technician'),
      createAuthUser('other'),
    ]);

    const [orgA, orgB] = await Promise.all([seedOrg('A'), seedOrg('B')]);

    const [operatorActor, ownerActor, technicianActor, otherActor] = await Promise.all([
      seedActor('operator', operatorAuth, 'OPERATOR', orgA),
      seedActor('owner', ownerAuth, 'OWNER', orgA),
      seedActor('technician', technicianAuth, 'TECHNICIAN', orgA),
      seedActor('other', otherAuth, 'OPERATOR', orgB),
    ]);

    operatorClient = await signIn('operator');
    ownerClient = await signIn('owner');
    technicianClient = await signIn('technician');

    orgAChain = await seedOperationalChain(orgA, operatorActor);
    orgBChain = await seedOperationalChain(orgB, otherActor);

    // Keep actor ids on the test object for explicit separation assertions.
    orgAChain.operatorActor = operatorActor;
    orgAChain.ownerActor = ownerActor;
    orgAChain.technicianActor = technicianActor;
    orgAChain.orgId = orgA;
    orgBChain.orgId = orgB;
    orgBChain.otherActor = otherActor;
  });

  after(async () => {
    // Remove dependent actors before auth.users so actor.auth_user_id FKs cannot
    // leave orphaned Auth users behind. Tenant records are then removed with orgs.
    for (const label of Object.keys(users)) {
      await admin.from('actors').delete().eq('auth_user_id', users[label].id);
    }
    for (const orgId of Object.values(orgs)) {
      await admin.from('memberships').delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    for (const label of Object.keys(users)) {
      await admin.auth.admin.deleteUser(users[label].id);
    }
  });

  test('tenant isolation: Org A cannot read Org B Action', async () => {
    const { data: bAction, error: seedError } = await admin.from('actions').insert({
      organization_id: orgBChain.orgId,
      work_item_id: orgBChain.workItemId,
      action_type: 'INSPECT_ASSET',
      consequence_class: 'OBSERVATIONAL',
      requested_by_actor_id: orgBChain.otherActor,
      idempotency_key: `b-${runId}`,
      target: { asset: 'test' },
    }).select('id').single();
    assert.ifError(seedError);

    const { data, error } = await operatorClient.from('actions').select('id').eq('id', bAction.id);
    assert.ifError(error);
    assert.deepEqual(data, []);
  });

  test('cross-tenant Action relationship is rejected by composite tenant FK', async () => {
    const { error } = await operatorClient.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgBChain.workItemId,
      action_type: 'INSPECT_ASSET',
      consequence_class: 'OBSERVATIONAL',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `cross-${runId}`,
    });
    assert.ok(error);
  });

  test('Action creation starts at PROPOSED', async () => {
    const { data, error } = await operatorClient.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'INSPECT_ASSET',
      consequence_class: 'OBSERVATIONAL',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `proposal-${runId}`,
    }).select('id,status').single();
    assert.ifError(error);
    assert.equal(data.status, 'PROPOSED');
    orgAChain.actionId = data.id;
  });

  test('unauthorized actor cannot authorize Action', async () => {
    const { error } = await technicianClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.technicianActor })
      .eq('id', orgAChain.actionId);
    assert.ok(error);
  });

  test('authorized actor can authorize, but cannot skip to execution', async () => {
    const { error: authError } = await ownerClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.ownerActor })
      .eq('id', orgAChain.actionId);
    assert.ifError(authError);

    const { data, error } = await ownerClient.from('actions')
      .update({ status: 'SUCCEEDED' })
      .eq('id', orgAChain.actionId)
      .select('status')
      .single();
    assert.ok(error);
    assert.equal(data, null);
  });

  test('PROPOSED cannot transition directly to EXECUTING', async () => {
    const { data: fresh, error: createError } = await operatorClient.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'CONTACT_CUSTOMER',
      consequence_class: 'COMMUNICATION',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `skip-${runId}`,
    }).select('id,status').single();
    assert.ifError(createError);

    const { error } = await operatorClient.from('actions')
      .update({ status: 'EXECUTING' })
      .eq('id', fresh.id);
    assert.ok(error);
  });

  test('authorized Action executes and records a separate executor', async () => {
    const { error } = await technicianClient.from('actions')
      .update({ status: 'EXECUTING' })
      .eq('id', orgAChain.actionId);
    assert.ifError(error);

    const { data: attempt, error: attemptError } = await technicianClient.from('action_attempts')
      .insert({
        organization_id: orgAChain.orgId,
        action_id: orgAChain.actionId,
        attempt_number: 1,
        status: 'CREATED',
        executor_type: 'HUMAN',
        executor_actor_id: orgAChain.technicianActor,
        execution_idempotency_key: `attempt-1-${runId}`,
      }).select('id,status').single();
    assert.ifError(attemptError);
    assert.equal(attempt.status, 'CREATED');

    const { error: attemptStartError } = await technicianClient.from('action_attempts')
      .update({ status: 'EXECUTING' }).eq('id', attempt.id);
    assert.ifError(attemptStartError);

    const { error: attemptUnknownError } = await technicianClient.from('action_attempts')
      .update({ status: 'EXECUTION_UNKNOWN' }).eq('id', attempt.id);
    assert.ifError(attemptUnknownError);

    const { error: actionUnknownError } = await technicianClient.from('actions')
      .update({ status: 'EXECUTION_UNKNOWN' }).eq('id', orgAChain.actionId);
    assert.ifError(actionUnknownError);

    const { error: retryActionError } = await technicianClient.from('actions')
      .update({ status: 'EXECUTING' }).eq('id', orgAChain.actionId);
    assert.ifError(retryActionError);

    const { data: attempt2, error: attempt2Error } = await technicianClient.from('action_attempts')
      .insert({
        organization_id: orgAChain.orgId,
        action_id: orgAChain.actionId,
        attempt_number: 2,
        status: 'CREATED',
        executor_type: 'HUMAN',
        executor_actor_id: orgAChain.technicianActor,
        execution_idempotency_key: `attempt-2-${runId}`,
      }).select('id,status').single();
    assert.ifError(attempt2Error);

    await technicianClient.from('action_attempts').update({ status: 'EXECUTING' }).eq('id', attempt2.id);
    const { error: successError } = await technicianClient.from('action_attempts')
      .update({ status: 'SUCCEEDED', result_code: 'OK', result_summary: 'Test execution succeeded' })
      .eq('id', attempt2.id);
    assert.ifError(successError);

    const { error: actionSuccessError } = await technicianClient.from('actions')
      .update({ status: 'SUCCEEDED' }).eq('id', orgAChain.actionId);
    assert.ifError(actionSuccessError);

    const { data: attempts, error: countError } = await technicianClient.from('action_attempts')
      .select('id,attempt_number,status').eq('action_id', orgAChain.actionId).order('attempt_number');
    assert.ifError(countError);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map((a) => a.attempt_number), [1, 2]);
    assert.equal(attempts[0].status, 'EXECUTION_UNKNOWN');
    assert.equal(attempts[1].status, 'SUCCEEDED');

    assert.notEqual(orgAChain.operatorActor, orgAChain.ownerActor);
    assert.notEqual(orgAChain.ownerActor, orgAChain.technicianActor);
  });


  test('cross-tenant authorization and execution are both denied', async () => {
    const { data: bAction, error: seedError } = await admin.from('actions').insert({
      organization_id: orgBChain.orgId,
      work_item_id: orgBChain.workItemId,
      action_type: 'INSPECT_ASSET',
      consequence_class: 'OBSERVATIONAL',
      requested_by_actor_id: orgBChain.otherActor,
      idempotency_key: `b-auth-exec-${runId}`,
    }).select('id,status').single();
    assert.ifError(seedError);
    assert.equal(bAction.status, 'PROPOSED');

    const { error: authError } = await operatorClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.ownerActor })
      .eq('id', bAction.id);
    assert.ok(authError);

    const { error: execError } = await operatorClient.from('actions')
      .update({ status: 'EXECUTING' })
      .eq('id', bAction.id);
    assert.ok(execError);
  });

  test('cross-tenant Action-to-Attempt relationship is rejected', async () => {
    const { data: bAction, error: actionError } = await admin.from('actions').insert({
      organization_id: orgBChain.orgId,
      work_item_id: orgBChain.workItemId,
      action_type: 'INSPECT_ASSET',
      consequence_class: 'OBSERVATIONAL',
      requested_by_actor_id: orgBChain.otherActor,
      idempotency_key: `b-attempt-${runId}`,
    }).select('id').single();
    assert.ifError(actionError);

    const { error: attemptError } = await operatorClient.from('action_attempts').insert({
      organization_id: orgAChain.orgId,
      action_id: bAction.id,
      attempt_number: 1,
      status: 'CREATED',
      executor_type: 'HUMAN',
      executor_actor_id: orgAChain.technicianActor,
      execution_idempotency_key: `cross-attempt-${runId}`,
    });
    assert.ok(attemptError);
  });

  test('Action and Attempt idempotency reject duplicate requests', async () => {
    const key = `idem-${runId}`;
    const payload = {
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'RECONCILE_PAYMENT',
      consequence_class: 'FINANCIAL',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: key,
    };
    const first = await operatorClient.from('actions').insert(payload).select('id').single();
    assert.ifError(first.error);

    const second = await operatorClient.from('actions').insert(payload).select('id').single();
    assert.ok(second.error);

    const attemptPayload = {
      organization_id: orgAChain.orgId,
      action_id: first.data.id,
      attempt_number: 1,
      status: 'CREATED',
      executor_type: 'HUMAN',
      executor_actor_id: orgAChain.technicianActor,
      execution_idempotency_key: `exec-${runId}`,
    };
    // Authorize first so Attempt creation reaches the Attempt gate.
    const auth = await ownerClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.ownerActor })
      .eq('id', first.data.id);
    assert.ifError(auth.error);

    const a1 = await technicianClient.from('action_attempts').insert(attemptPayload).select('id').single();
    assert.ifError(a1.error);
    const a2 = await technicianClient.from('action_attempts').insert(attemptPayload).select('id').single();
    assert.ok(a2.error);
  });


  test('authorized Action consequential fields and Attempt identity are immutable', async () => {
    const { data: proposal, error: proposalError } = await operatorClient.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'CONTACT_CUSTOMER',
      consequence_class: 'COMMUNICATION',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `immutable-${runId}`,
      target: { customer: 'test' },
    }).select('id').single();
    assert.ifError(proposalError);

    const { error: authError } = await ownerClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.ownerActor })
      .eq('id', proposal.id);
    assert.ifError(authError);

    const { error: actionMutation } = await ownerClient.from('actions')
      .update({ action_type: 'RECONCILE_PAYMENT', target: { changed: true } })
      .eq('id', proposal.id);
    assert.ok(actionMutation);

    const { error: startError } = await technicianClient.from('actions')
      .update({ status: 'EXECUTING' }).eq('id', proposal.id);
    assert.ifError(startError);

    const { data: attempt, error: attemptError } = await technicianClient.from('action_attempts').insert({
      organization_id: orgAChain.orgId,
      action_id: proposal.id,
      attempt_number: 1,
      status: 'CREATED',
      executor_type: 'HUMAN',
      executor_actor_id: orgAChain.technicianActor,
      execution_idempotency_key: `immutable-attempt-${runId}`,
    }).select('id').single();
    assert.ifError(attemptError);

    const { error: attemptMutation } = await technicianClient.from('action_attempts')
      .update({ executor_actor_id: orgAChain.ownerActor, attempt_number: 99 })
      .eq('id', attempt.id);
    assert.ok(attemptMutation);
  });

  test('authenticated client cannot manufacture or delete Action history', async () => {
    const { data: history, error: readError } = await operatorClient.from('action_history')
      .select('event_type').eq('action_id', orgAChain.actionId);
    assert.ifError(readError);
    assert.ok(history.length >= 1);

    const { error: insertError } = await operatorClient.from('action_history').insert({
      organization_id: orgAChain.orgId,
      action_id: orgAChain.actionId,
      event_type: 'ACTION_PROPOSED',
      new_status: 'PROPOSED',
    });
    assert.ok(insertError);

    const { error: deleteError } = await operatorClient.from('action_history')
      .delete().eq('action_id', orgAChain.actionId);
    assert.ok(deleteError);
  });


  test('system execution requires a trusted server claim and system principal', async () => {
    const { data: proposal, error: proposalError } = await admin.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'CONTACT_CUSTOMER',
      consequence_class: 'COMMUNICATION',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `system-${runId}`,
    }).select('id').single();
    assert.ifError(proposalError);

    const auth = await ownerClient.from('actions')
      .update({ status: 'AUTHORIZED', authorized_by_actor_id: orgAChain.ownerActor })
      .eq('id', proposal.id);
    assert.ifError(auth.error);

    const exec = await ownerClient.from('actions')
      .update({ status: 'EXECUTING' }).eq('id', proposal.id);
    assert.ifError(exec.error);

    const forged = await ownerClient.from('action_attempts').insert({
      organization_id: orgAChain.orgId,
      action_id: proposal.id,
      attempt_number: 1,
      status: 'CREATED',
      executor_type: 'SYSTEM',
      execution_idempotency_key: `forged-system-${runId}`,
      metadata: { system_principal: 'ellie' },
    });
    assert.ok(forged.error);

    const trusted = await admin.from('action_attempts').insert({
      organization_id: orgAChain.orgId,
      action_id: proposal.id,
      attempt_number: 1,
      status: 'CREATED',
      executor_type: 'SYSTEM',
      execution_idempotency_key: `trusted-system-${runId}`,
      metadata: { system_principal: 'action-executor' },
    });
    assert.ifError(trusted.error);
  });

  test('trusted server cannot authorize on behalf of Ellie without an actor', async () => {
    const { data: proposal, error: proposalError } = await admin.from('actions').insert({
      organization_id: orgAChain.orgId,
      work_item_id: orgAChain.workItemId,
      action_type: 'CONTACT_CUSTOMER',
      consequence_class: 'COMMUNICATION',
      requested_by_actor_id: orgAChain.operatorActor,
      idempotency_key: `ellie-${runId}`,
    }).select('id').single();
    assert.ifError(proposalError);

    const { error } = await admin.from('actions')
      .update({ status: 'AUTHORIZED' })
      .eq('id', proposal.id);
    assert.ok(error);
  });
}
