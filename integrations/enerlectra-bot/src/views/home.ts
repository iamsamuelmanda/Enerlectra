// views/home.ts
import type { BotContext } from '../types/context';
import {
  operatorHomeKeyboard,
  tenantHomeKeyboard,
  propertyOwnerHomeKeyboard,
  installerHomeKeyboard,
  roleSelectionKeyboard,
} from './menus';
import {
  getOperatorDashboard,
  getTenantDashboard,
  getInstallerDashboard,
  getPropertyOwnerDashboard,
} from 'enerlectra-core/src/core/services/dashboard';
import { supabase } from '../lib/supabase';
import { logger } from 'enerlectra-core/src/core/services/logger';
import { trackOperatorLogin } from 'enerlectra-core/src/core/services/metrics'; // ← new import

export async function sendRoleSelection(ctx: BotContext): Promise<void> {
  await ctx.reply(
    '*Welcome to Enerlectra*\n\n' +
      'Select your role to get started. You can change this later from /start.',
    { parse_mode: 'Markdown', ...roleSelectionKeyboard() }
  );
}

export async function sendRoleHome(ctx: BotContext): Promise<void> {
  const role = ctx.state.role;
  switch (role) {
    case 'operator':
      return sendOperatorHome(ctx);
    case 'installer':
      return sendInstallerHome(ctx);
    case 'property_owner':
      return sendPropertyOwnerHome(ctx);
    case 'tenant':
      return sendTenantHome(ctx);
    default:
      return sendRoleSelection(ctx);
  }
}

export async function sendOperatorHome(ctx: BotContext): Promise<void> {
  const { userId, orgId } = ctx.state;
  let msg: string;

  if (orgId) {
    try {
      msg = await getOperatorDashboard({ userId, orgId, role: 'operator' });
    } catch (err) {
      logger.error({ err, userId, orgId }, 'Failed to load operator dashboard');
      msg = '*Operator Console*\n\nUnable to load live data.';
    }
    // Track operator login once per day
    await trackOperatorLogin(userId, orgId); // ← new call
  } else {
    msg = '*Operator Console*\n\nLink your organisation with /linkorg to see live data.';
  }

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...operatorHomeKeyboard(),
  });
}

export async function sendTenantHome(ctx: BotContext): Promise<void> {
  const { userId, orgId } = ctx.state;

  // Dynamic phone check
  let hasPhone = false;
  try {
    const { data: user } = await supabase
      .from('telegram_users')
      .select('phone_number')
      .eq('user_id', userId)
      .single();
    hasPhone = !!user?.phone_number;
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to check phone for tenant');
  }

  let msg: string;
  try {
    msg = await getTenantDashboard({ userId, orgId: orgId ?? '', role: 'tenant' });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to load tenant dashboard');
    msg = '*Your Energy*\n\nUnable to load live data.';
  }

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...tenantHomeKeyboard(hasPhone),
  });
}

export async function sendInstallerHome(ctx: BotContext): Promise<void> {
  const { userId, orgId } = ctx.state;

  let msg: string;
  if (orgId) {
    try {
      msg = await getInstallerDashboard({ userId, orgId, role: 'installer' });
    } catch (err) {
      logger.error({ err, userId, orgId }, 'Failed to load installer dashboard');
      msg = '*Installer Console*\n\nUnable to load live data.';
    }
  } else {
    msg = '*Installer Console*\n\nLink your organisation with /linkorg to see live data.';
  }

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...installerHomeKeyboard(),
  });
}

export async function sendPropertyOwnerHome(ctx: BotContext): Promise<void> {
  const { userId, orgId } = ctx.state;

  let msg: string;
  if (orgId) {
    try {
      msg = await getPropertyOwnerDashboard({ userId, orgId, role: 'property_owner' });
    } catch (err) {
      logger.error({ err, userId, orgId }, 'Failed to load property owner dashboard');
      msg = '*Property Manager Console*\n\nUnable to load live data.';
    }
  } else {
    msg = '*Property Manager Console*\n\nLink your organisation with /linkorg to see live data.';
  }

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...propertyOwnerHomeKeyboard(),
  });
}

