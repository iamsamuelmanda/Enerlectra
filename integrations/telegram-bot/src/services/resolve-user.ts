import { supabase } from '../lib/supabase';
import { redis, REDIS_KEY_PREFIX } from '../lib/redis';
import crypto from 'node:crypto';
import { logger } from './logger';
import type { BotSessionContext } from '../types/context';

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
    const userName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Telegram User';
  
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
  
export async function resolveCluster(
    ctx: BotSessionContext,
    userId: string
  ): Promise<{ clusterId: string | null; unitId: string | null }> {
    if (ctx.session.clusterId) return { clusterId: ctx.session.clusterId, unitId: null };
  
    const cached = await getSelectedCluster(userId);
    if (cached) {
      ctx.session.clusterId = cached;
      return { clusterId: cached, unitId: null };
    }
  
    const { data, error } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('user_id', userId)
      .maybeSingle();
  
    if (error) {
      logger.warn({ error, userId }, 'Failed to resolve cluster');
    }
  
    if (data?.cluster_id) {
      ctx.session.clusterId = data.cluster_id;
      return { clusterId: data.cluster_id, unitId: null };
    }
  
    return { clusterId: null, unitId: null };
  }
  
  // ─── UI Helpers ────────────────────────────────────────────────
export async function promptForCluster(ctx: BotSessionContext): Promise<void> {
    const { data: clusters, error } = await supabase
      .from('clusters')
      .select('id, name, location')
      .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
      .limit(10);
  
    if (error) {
      logger.error({ error }, 'Failed to fetch clusters');
      await ctx.reply('Unable to load communities. Please try again later.');
      return;
    }
  
    if (!clusters?.length) {
      await ctx.reply('No communities available. Contact support or try again later.');
      return;
    }
  
    const keyboard = clusters.map((cluster) => [
      {
        text: `${cluster.name}${cluster.location ? ` - ${cluster.location}` : ''}`,
        callback_data: `join:${cluster.id}`,
      },
    ]);
  
    await ctx.reply('Select a community to join:', {
      reply_markup: { inline_keyboard: keyboard },
    });
  }
  
export async function replyOrEdit(
    ctx: BotSessionContext,
    text: string,
    extra?: Record<string, unknown>,
    editMessageId?: number
  ): Promise<unknown> {
    if (editMessageId && ctx.chat?.id) {
      return ctx.telegram
        .editMessageText(ctx.chat.id, editMessageId, undefined, text, extra)
        .catch(() => ctx.reply(text, extra));
    }
    return ctx.reply(text, extra);
  }

