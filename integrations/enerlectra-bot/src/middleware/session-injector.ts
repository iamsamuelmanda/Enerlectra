import { Middleware } from 'telegraf';
import { getUserRole, getUserOrgId } from 'enerlectra-core/src/core/services/identity';
import { resolveUserId } from 'enerlectra-core/src/core/services/resolve-user';
import type { BotContext, BotState } from '../types/context';

export type { BotState } from '../types/context';

export const injectSession: Middleware<BotContext> = async (ctx, next) => {
  if (ctx.from) {
    const telegramId = ctx.from.id.toString();
    const userId = await resolveUserId(telegramId);
    const [role, orgId] = await Promise.all([
      getUserRole(userId),
      getUserOrgId(userId)
    ]);

    // Replace the entire state object with a fresh one,
    // merging any existing state properties.
    ctx.state = { ...ctx.state, userId, role, orgId };
  }
  return next();
};

