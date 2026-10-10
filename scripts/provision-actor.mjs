import { createClient } from '@supabase/supabase-js';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = argument('email')?.trim().toLowerCase();
const organizationName = argument('organization')?.trim();
const organizationIdInput = argument('organization-id')?.trim();
const requestedRole = argument('role')?.trim().toUpperCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: npm run provision:actor -- --email person@example.com (--organization "New Org" | --organization-id UUID) [--role OWNER|OPERATOR|TECHNICIAN|FINANCE|VIEWER]');
}
if (Boolean(organizationName) === Boolean(organizationIdInput)) {
  throw new Error('Provide exactly one of --organization or --organization-id.');
}
if (organizationName && requestedRole && requestedRole !== 'OWNER') {
  throw new Error('A newly created organization must start with an OWNER membership.');
}
const roleKey = requestedRole ?? (organizationName ? 'OWNER' : undefined);
if (!roleKey || !['OWNER', 'OPERATOR', 'TECHNICIAN', 'FINANCE', 'VIEWER'].includes(roleKey)) {
  throw new Error('For an existing organization, provide a valid --role.');
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId;
let actorId;
let organizationId = organizationIdInput;

try {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('key', roleKey)
    .single();
  if (roleError) throw roleError;

  if (organizationName) {
    const { data: organization, error } = await admin
      .from('organizations')
      .insert({ name: organizationName, status: 'ACTIVE' })
      .select('id')
      .single();
    if (error) throw error;
    organizationId = organization.id;
  } else {
    const { data: organization, error } = await admin
      .from('organizations')
      .select('id, status')
      .eq('id', organizationId)
      .single();
    if (error) throw error;
    if (organization.status !== 'ACTIVE') throw new Error('Target organization is not ACTIVE.');
  }

  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email);
  if (invitationError) throw invitationError;
  userId = invitation.user.id;

  const { data: actor, error: actorError } = await admin
    .from('actors')
    .insert({ auth_user_id: userId, actor_type: 'HUMAN', status: 'ACTIVE' })
    .select('id')
    .single();
  if (actorError) throw actorError;
  actorId = actor.id;

  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .insert({
      organization_id: organizationId,
      actor_id: actorId,
      role_id: role.id,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (membershipError) throw membershipError;

  process.stdout.write(JSON.stringify({
    invited: email,
    actorId,
    organizationId,
    membershipId: membership.id,
    role: roleKey,
    nextStep: 'The invited user must accept the Supabase Auth invitation before signing in.',
  }, null, 2) + '\n');
} catch (error) {
  if (actorId) await admin.from('actors').delete().eq('id', actorId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (organizationName && organizationId) await admin.from('organizations').delete().eq('id', organizationId);
  process.stderr.write(`Actor provisioning failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
