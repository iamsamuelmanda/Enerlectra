import { BotContext } from '../types/context';
import { SupportWorkflow } from 'enerlectra-core/src/core/workflow/support-workflow';

export async function startQuickSupport(ctx: BotContext) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from!.id.toString();
  const supportWorkflow = new SupportWorkflow();
  await supportWorkflow.startQuickSupport(telegramId);
  await ctx.reply(
    'Ask me anything about your energy account, payments, or tokens. ' +
    'For example: "Was my payment of K50 received?" or "Why is my token not working?"'
  );
}
