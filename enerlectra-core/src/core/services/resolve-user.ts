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

  if (
    typeof data === 'object' &&
    data !== null &&
    typeof data.clusterId === 'string'
  ) {
    return data.clusterId;
  }

  logger.warn(
    { userId, key, dataType: typeof data },
    'Invalid selected cluster payload'
  );

  await redis.del(key);
  return null;
}

/**
 * Resolve Telegram user identity.
 *
 * Canonical identity invariant:
 *
 * telegram_users.user_id
 *        =
 * auth.users.id
 *        =
 * public.users.id
 */
export async function resolveUserId(
  telegramId: string,
  profile?: {
    username?: string;
    first_name?: string;
    last_name?: string;
  }
): Promise<string> {
  // 1. Upsert Telegram identity.
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
    logger.error(
      { upsertError, telegramId },
      'Failed to resolve Telegram identity'
    );

    throw new Error('Identity resolution failed');
  }

  const userId = telegramUser.user_id;

  // 2. Ensure corresponding Auth user exists.
  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(userId);

  if (authError || !authUser?.user) {
    logger.warn(
      { authError, userId },
      'Auth user not found, creating...'
    );

    const { data: newAuthUser, error: createAuthError } =
      await supabase.auth.admin.createUser({
        id: userId,
        email: `telegram-${telegramId}@enerlectra.local`,
        email_confirm: true,
        password: crypto.randomBytes(32).toString('hex'),
        user_metadata: {
          name:
            [profile?.first_name, profile?.last_name]
              .filter(Boolean)
              .join(' ') || 'Telegram User',
          source: 'telegram_bot',
        },
      });

    if (createAuthError || !newAuthUser?.user) {
      logger.error(
        {
          createAuthError,
          userId,
          telegramId,
        },
        'Failed to create Auth user for Telegram'
      );

      throw new Error(
        `Auth user creation failed: ${
          createAuthError?.message || 'unknown Supabase Auth error'
        }`
      );
    }

    logger.info(
      { userId, telegramId },
      'Created new Auth user for Telegram'
    );
  }

  // 3. Explicitly ensure public.users exists.
  const userName =
    [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(' ') || 'Telegram User';

  const userEmail = `telegram-${telegramId}@enerlectra.local`;

  const { error: profileError } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        name: userName,
        email: userEmail,
        phone: '+260000000000',
        location: null,
        current_class: 'STARTER',
        total_invested_usd: '0.00',
        cluster_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    logger.error(
      {
        profileError,
        userId,
        telegramId,
      },
      'Failed to ensure public.users profile for Telegram user'
    );

    throw new Error(
      `Profile creation failed: ${profileError.message}`
    );
  }

  logger.info(
    { userId, telegramId },
    'Telegram identity resolved successfully'
  );

  return userId;
}

/**
 * Get the phone number associated with a Telegram user.
 */
export async function getPhoneNumber(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { error, userId },
      'Failed to fetch phone number'
    );

    return null;
  }

  return data?.phone_number ?? null;
}

/**
 * Resolve WhatsApp identity.
 *
 * Canonical identity invariant:
 *
 * channel_identities.user_id
 *        =
 * auth.users.id
 *        =
 * public.users.id
 *
 * This function is deliberately idempotent.
 */
export async function resolveWhatsAppUserId(
  phoneNumber: string
): Promise<string> {
  const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

  if (!normalizedPhone) {
    throw new Error('Invalid WhatsApp phone number');
  }

  const generatedEmail =
    `whatsapp-${normalizedPhone.replace(/\+/g, '')}@enerlectra.local`;

  // ------------------------------------------------------------------
  // 1. Check existing WhatsApp identity.
  // ------------------------------------------------------------------

  const {
    data: existingIdentity,
    error: lookupError,
  } = await supabase
    .from('channel_identities')
    .select('user_id')
    .eq('channel', 'whatsapp')
    .eq('external_id', normalizedPhone)
    .maybeSingle();

  if (lookupError) {
    logger.error(
      {
        lookupError,
        phoneNumber: normalizedPhone,
      },
      'Failed to lookup WhatsApp identity'
    );

    throw new Error(
      `Identity lookup failed: ${lookupError.message}`
    );
  }

  let userId: string;

  // ------------------------------------------------------------------
  // 2. Existing identity.
  // ------------------------------------------------------------------

  if (existingIdentity?.user_id) {
    userId = existingIdentity.user_id;

    logger.info(
      {
        userId,
        phoneNumber: normalizedPhone,
      },
      'Existing WhatsApp identity resolved'
    );
  } else {
    // ----------------------------------------------------------------
    // 3. No identity exists.
    //
    // Create Auth user first. The resulting UUID becomes the
    // canonical Enerlectra user ID.
    // ----------------------------------------------------------------

    const {
      data: newAuthUser,
      error: createAuthError,
    } = await supabase.auth.admin.createUser({
      email: generatedEmail,
      email_confirm: true,
      password: crypto.randomBytes(32).toString('hex'),
      user_metadata: {
        name: 'WhatsApp User',
        source: 'whatsapp_business',
        phone_number: normalizedPhone,
      },
    });

    if (createAuthError || !newAuthUser?.user) {
      logger.error(
        {
          createAuthError,
          phoneNumber: normalizedPhone,
          status: createAuthError?.status,
          code: createAuthError?.code,
          name: createAuthError?.name,
          message: createAuthError?.message,
        },
        'Failed to create Auth user for WhatsApp'
      );

      // If another request won the race and created the same
      // deterministic email, try resolving the existing identity.
      const {
        data: racedIdentity,
        error: racedLookupError,
      } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'whatsapp')
        .eq('external_id', normalizedPhone)
        .maybeSingle();

      if (!racedLookupError && racedIdentity?.user_id) {
        userId = racedIdentity.user_id;

        logger.info(
          {
            userId,
            phoneNumber: normalizedPhone,
          },
          'Resolved WhatsApp identity after concurrent creation'
        );
      } else {
        throw new Error(
          `Auth user creation failed: ${
            createAuthError?.message ||
            'unknown Supabase Auth error'
          }`
        );
      }
    } else {
      userId = newAuthUser.user.id;

      logger.info(
        {
          userId,
          phoneNumber: normalizedPhone,
        },
        'Created new Auth user for WhatsApp'
      );
    }
  }

  // ------------------------------------------------------------------
  // 4. Verify Auth user actually exists.
  // ------------------------------------------------------------------

  const {
    data: verifiedAuthUser,
    error: verifyAuthError,
  } = await supabase.auth.admin.getUserById(userId);

  if (verifyAuthError || !verifiedAuthUser?.user) {
    logger.error(
      {
        verifyAuthError,
        userId,
        phoneNumber: normalizedPhone,
      },
      'Canonical WhatsApp Auth user could not be verified'
    );

    throw new Error('Canonical Auth user verification failed');
  }

  // ------------------------------------------------------------------
  // 5. Explicitly provision public.users.
  //
  // DO NOT rely exclusively on the auth trigger.
  // ------------------------------------------------------------------

  const {
    data: existingProfile,
    error: profileLookupError,
  } = await supabase
    .from('users')
    .select('id, email, phone')
    .eq('id', userId)
    .maybeSingle();

  if (profileLookupError) {
    logger.error(
      {
        profileLookupError,
        userId,
        phoneNumber: normalizedPhone,
      },
      'Failed to lookup public.users profile'
    );

    throw new Error(
      `Profile lookup failed: ${profileLookupError.message}`
    );
  }

  if (!existingProfile) {
    const {
      error: profileInsertError,
    } = await supabase
      .from('users')
      .insert({
        id: userId,
        name: 'WhatsApp User',
        email: generatedEmail,
        phone: normalizedPhone,
        location: null,
        current_class: 'STARTER',
        total_invested_usd: '0.00',
        cluster_count: 0,
        updated_at: new Date().toISOString(),
      });

    if (profileInsertError) {
      // Another concurrent request may have inserted it between
      // our lookup and insert. Verify before failing.
      const {
        data: concurrentProfile,
        error: concurrentLookupError,
      } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (concurrentLookupError || !concurrentProfile) {
        logger.error(
          {
            profileInsertError,
            concurrentLookupError,
            userId,
            phoneNumber: normalizedPhone,
          },
          'Failed to provision public.users profile'
        );

        throw new Error(
          `Profile creation failed: ${profileInsertError.message}`
        );
      }
    }

    logger.info(
      {
        userId,
        phoneNumber: normalizedPhone,
      },
      'Created public.users profile for WhatsApp user'
    );
  }

  // ------------------------------------------------------------------
  // 6. Ensure channel identity points to canonical user.
  // ------------------------------------------------------------------

  const {
    error: identityError,
  } = await supabase
    .from('channel_identities')
    .upsert(
      {
        user_id: userId,
        channel: 'whatsapp',
        external_id: normalizedPhone,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'channel,external_id',
      }
    );

  if (identityError) {
    logger.error(
      {
        identityError,
        userId,
        phoneNumber: normalizedPhone,
      },
      'Failed to create/update WhatsApp channel identity'
    );

    throw new Error(
      `Channel identity creation failed: ${identityError.message}`
    );
  }

  // ------------------------------------------------------------------
  // 7. Final invariant check.
  //
  // Before returning, verify that the canonical identity exists
  // everywhere it must exist.
  // ------------------------------------------------------------------

  const {
    data: finalProfile,
    error: finalProfileError,
  } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (finalProfileError || !finalProfile) {
    logger.error(
      {
        finalProfileError,
        userId,
        phoneNumber: normalizedPhone,
      },
      'WhatsApp identity invariant failed: public.users missing'
    );

    throw new Error(
      'WhatsApp identity provisioning incomplete'
    );
  }

  logger.info(
    {
      userId,
      phoneNumber: normalizedPhone,
      authUserId: verifiedAuthUser.user.id,
      publicUserId: finalProfile.id,
    },
    'WhatsApp user identity fully resolved'
  );

  return userId;
}

/**
 * Resolve the actor's selected cluster.
 */
export async function resolveCluster(
  actorId: string
): Promise<{
  clusterId: string | null;
  unitId: string | null;
}> {
  const cached = await getSelectedCluster(actorId);

  if (cached) {
    return {
      clusterId: cached,
      unitId: null,
    };
  }

  const { data, error } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', actorId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { error, actorId },
      'Failed to resolve cluster'
    );
  }

  if (data?.cluster_id) {
    return {
      clusterId: data.cluster_id,
      unitId: null,
    };
  }

  return {
    clusterId: null,
    unitId: null,
  };
      }
