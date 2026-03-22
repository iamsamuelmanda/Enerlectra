// integrations/telegram-bot/src/bot.ts
import { Telegraf, session } from 'telegraf';
import { handleMeterPhoto, handleMeterTypeCallback } from './handlers/meterReading';

const bot = new Telegraf(process.env.BOT_TOKEN || '');

// Session middleware
bot.use(session());

// Commands
bot.command('start', (ctx) => {
  ctx.reply(
    '👋 Hello! I am *Ellie*, your energy meter assistant.\n\n' +
    'Send me a photo of your electricity meter to record your usage.\n\n' +
    'Commands:\n' +
    '/status - Check submission status\n' +
    '/manual <number> - Enter reading manually',
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  // TODO: Fetch status from API
  await ctx.reply('📊 Checking your cluster status...');
});

bot.command('manual', (ctx) => {
  const text = ctx.message.text;
  const reading = text.split(' ')[1];
  
  if (!reading || isNaN(Number(reading))) {
    return ctx.reply('Usage: /manual 12345');
  }
  
  // TODO: Send to API as manual entry
  ctx.reply(`✅ Manual reading recorded: ${reading} kWh`);
});

// Photo handler
bot.on('photo', handleMeterPhoto);

// Callback queries (meter type selection)
bot.on('callback_query', handleMeterTypeCallback);

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('⚠️ Something went wrong. Please try again.');
});

// Start
console.log('🤖 Ellie is starting...');
bot.launch();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
