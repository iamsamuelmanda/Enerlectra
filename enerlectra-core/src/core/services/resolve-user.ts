import { supabase } from '../../infrastructure/supabase.js';
import { redis, REDIS_KEY_PREFIX } from '../../infrastructure/redis.js';
import crypto from 'node:crypto';
import { logger } from './logger.js';

const SELECTED_CLUSTER_PREFIX = `${REDIS_KEY_PREFIX}:selected_cluster`;

async function getSelectedCluster(userId: string): Promise<string | null> {
  const key = `${SELECTED_CLUSTER_PREFIX}:${userId}`;
  const data = await redis.get<string | { clusterId?: string }>(key);
  if (!data) return null;

  if (typeof data === 'string') return data;
  if (typeof data === 'object' && typeof data.clusterId === 'string') return data.clusterId;

  logger.warn({ userId, key, dataType: typeof data }, 'Invalid selected cluster payload');
  await redis.del(key);
  return null;
}

export async function resolveUserId(
  telegramId: string,
  profile?: { username?: string; first_name?: string; last_name?: string }
): Promise<string> {
  // 1. Upsert telegram identity
  const { data: telegramUser, error: upsertError } = await supabase
    .from('telegram_users')
    .upsert(
      {
        telegram_id: telegramId,
        username: profile?.username ?? null,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id' }
    )
    .select('user_id')
    .single();

  if (upsertError || !telegramUser?.user_id) {
    logger.error({ upsertError, telegramId }, 'Failed to resolve telegram identity');
    throw new Error('Identity resolution failed');
  }

  const userId = telegramUser.user_id;

  // 2. CRITICAL: Ensure user exists in auth.users (required by all FKs)
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

  if (authError || !authUser?.user) {
    logger.warn({ authError, userId }, 'Auth user not found, creating...');

    const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
      id: userId,
      email: `telegram-${telegramId}@enerlectra.local`,
      email_confirm: true,
      password: crypto.randomBytes(32).toString('hex'),
      user_metadata: {
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Telegram User',
        source: 'telegram_bot',
      },
    });

    if (createAuthError) {
      logger.error({ createAuthError, userId }, 'Failed to create auth user');
      throw new Error('Auth user creation failed');
    }

    logger.info({ userId }, 'Created new auth user for Telegram');
  }

  // 3. Ensure public.users profile exists
  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Telegram User';

  const { error: profileError } = await supabase.from('users').upsert(
    {
      id: userId,
      name: userName,
      email: `telegram-${telegramId}@enerlectra.local`,
      phone: '+260000000000',
      location: null,
      current_class: 'STARTER',
      total_invested_usd: '0.00',
      cluster_count: 0,
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    logger.error({ profileError, userId }, 'Profile upsert failed');
    throw new Error('Profile creation failed');
  }

  return userId;
}

export async function getPhoneNumber(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId }, 'Failed to fetch phone number');
    return null;
  }

  return data?.phone_number ?? null;
}

export async function resolveWhatsAppUserId(phoneNumber: string): Promise<string> {
  // 1. Check if WhatsApp identity already exists
  const { data: existingIdentity, error: lookupError } = await supabase
    .from('channel_identities')
    .select('user_id')
    .eq('channel', 'whatsapp')
    .eq('external_id', phoneNumber)
    .maybeSingle();

  if (lookupError) {
    logger.error({ lookupError, phoneNumber }, 'Failed to lookup WhatsApp identity');
    throw new Error('Identity lookup failed');
  }

  // 2. If found, return existing user_id
  if (existingIdentity?.user_id) {
    return existingIdentity.user_id;
  }

  // 3. Create new auth user
  const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
    email: `whatsapp-${phoneNumber}@enerlectra.local`,
    email_confirm: true,
    password: crypto.randomBytes(32).toString('hex'),
    user_metadata: {
      name: 'WhatsApp User',
      source: 'whatsapp_business',
      phone_number: phoneNumber,
    },
  });

  if (createAuthError || !newAuthUser?.user) {
  logger.error(
    {
      createAuthError,
      phoneNumber,
      status: createAuthError?.status,
      code: createAuthError?.code,
      name: createAuthError?.name,
      message: createAuthError?.message,
    },
    'Failed to create auth user for WhatsApp'
  );

  throw new Error(
    `Auth user creation failed: ${createAuthError?.message || 'unknown Supabase Auth error'}`
  );
  }

  const userId = newAuthUser.user.id;

  // 4. Create public.users profile
  const { error: profileError } = await supabase.from('users').insert({
    id: userId,
    name: 'WhatsApp User',
    email: `whatsapp-${phoneNumber}@enerlectra.local`,
    phone: phoneNumber,
    location: null,
    current_class: 'STARTER',
    total_invested_usd: '0.00',
    cluster_count: 0,
  });

  if (profileError) {
  logger.error(
    {
      profileError,
      userId,
      phoneNumber,
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    },
    'Failed to create user profile for WhatsApp'
  );

  await supabase.auth.admin.deleteUser(userId);

  throw new Error(`Profile creation failed: ${profileError.message}`);
  }

  // 5. Create channel_identity link
  const { error: identityError } = await supabase
  .from('channel_identities')
  .upsert(
    {
      user_id: userId,
      channel: 'whatsapp',
      external_id: phoneNumber,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'channel,external_id',
    }
  );
  
  if (identityError) {
    logger.error({ identityError, userId, phoneNumber }, 'Failed to create channel identity');
    throw new Error('Channel identity creation failed');
  }

  logger.info({ userId, phoneNumber }, 'Created new WhatsApp user');
  return userId;
}

export async function resolveCluster(
  actorId: string
): Promise<{ clusterId: string | null; unitId: string | null }> {
  const cached = await getSelectedCluster(actorId);
  if (cached) {
    return { clusterId: cached, unitId: null };
  }

  const { data, error } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', actorId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, actorId }, 'Failed to resolve cluster');
  }

  if (data?.cluster_id) {
    return { clusterId: data.cluster_id, unitId: null };
  }

  return { clusterId: null, unitId: null };
}
