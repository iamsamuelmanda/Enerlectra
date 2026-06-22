import { BotContext } from '../../types/context';

export async function handleHelp(ctx: BotContext) {
  await ctx.reply(
    `*Commands*\n\n` +
    `Send a meter photo - Submit a reading\n` +
    `/read <kWh> [type] - e.g. /read 150 solar_export\n` +
    `/balance - Check PCU balance\n` +
    `/status - View linked cluster\n` +
    `/register - Add mobile number\n` +
    `/history - View past submissions\n` +
    `/redeem <amount> - Cash out PCU\n` +
    `/transfer <amount> <@user> - Send PCU\n` +
    `/clusters - Browse communities\n` +
    `/resetmeter - Reset meter after replacement\n` +
    `/support - Ask Enerlectra support`,
    { parse_mode: 'Markdown' }
  );
}

