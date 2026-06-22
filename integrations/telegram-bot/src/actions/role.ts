import type { BotContext } from '../types/context';
import { getBotState } from '../types/context';
import { setUserRole } from '../services/identity';
import { sendRoleHome } from '../views/home';
import { ROLE_OPTIONS } from '../views/menus';

export async function handleRoleSelection(ctx: BotContext, role: string): Promise<void> {
  const validRole = ROLE_OPTIONS.find((r) => r.id === role);
  if (!validRole) {
    await ctx.answerCbQuery('Invalid role');
    return;
  }

  const state = getBotState(ctx);
  if (!state) {
    await ctx.answerCbQuery('Session expired');
    await ctx.reply('Please try /start again.');
    return;
  }

  await setUserRole(state.userId, role);
  Object.assign(ctx.state, { ...state, role });

  await ctx.answerCbQuery(`Role set: ${validRole.label}`);
  await ctx.editMessageText(`*Role set:* ${validRole.label}`, { parse_mode: 'Markdown' });
  await sendRoleHome(ctx);
}


