import { BotContext } from '../../types/context';

export async function handleRegister(ctx: BotContext) {
  ctx.session.awaitingPhone = true;
  await ctx.reply('Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`', {
    parse_mode: 'Markdown',
  });
}

