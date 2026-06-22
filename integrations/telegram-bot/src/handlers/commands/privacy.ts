import { BotContext } from '../../types/context';

export async function handlePrivacy(ctx: BotContext) {
  await ctx.reply(
    `*Enerlectra Privacy Policy*\n\n` +
    `Data collected: Telegram ID, username, phone number, meter readings, location.\n\n` +
    `Why: To process energy settlements and deliver payouts.\n\n` +
    `Storage: Encrypted via Supabase. Never sold to third parties.\n\n` +
    `Contact: enerlectra.energy@gmail.com`,
    { parse_mode: 'Markdown' }
  );
}

