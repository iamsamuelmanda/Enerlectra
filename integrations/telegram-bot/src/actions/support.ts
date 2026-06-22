import { BotContext } from '../types/context';
import { redis } from '../lib/redis';

export async function startQuickSupport(ctx: BotContext) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from!.id.toString();
  await redis.del(`demo_state:${telegramId}`);   // ← CLEAR STALE STATE
  await redis.set(`quick_support:${telegramId}`, '1', { ex: 120 });
  await ctx.reply(
    'Ask me anything about your energy account, payments, or tokens. ' +
    'For example: "Was my payment of K50 received?" or "Why is my token not working?"'
  );
}