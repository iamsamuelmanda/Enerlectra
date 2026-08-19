import type { BotContext } from '../types/context';
import { getBotState } from '../types/context';
import { RoleService } from 'enerlectra-core/src/core/services/role.service';
import { sendRoleHome } from '../views/home';

export async function handleRoleSelection(ctx: BotContext, role: string): Promise<void> {
  const roleService = new RoleService();
  const validRole = await roleService.validateRole(role);
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

  await roleService.setUserRole(state.userId, role);
  Object.assign(ctx.state, { ...state, role });

  await ctx.answerCbQuery(`Role set: ${validRole.label}`);
  await ctx.editMessageText(`*Role set:* ${validRole.label}`, { parse_mode: 'Markdown' });
  await sendRoleHome(ctx);
}


