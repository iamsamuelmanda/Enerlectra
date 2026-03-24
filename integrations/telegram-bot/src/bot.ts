// integrations/telegram-bot/src/bot.ts
import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

// Start
bot.start((ctx) => {
  ctx.reply(
    '👋 Hello! I am *Ellie*, your Enerlectra meter assistant.\n\n' +
    '📸 Send me a photo of your electricity meter\n' +
    'or type: LOW / NORMAL / HIGH',
    { parse_mode: 'Markdown' }
  );
});

// Handle signals
bot.on('text', async (ctx) => {
  const text = ctx.message.text.toUpperCase().trim();
  if (['LOW', 'NORMAL', 'HIGH'].includes(text)) {
    await axios.post(`${BACKEND_URL}/api/readings/ingest`, {
      clusterId: 'clu_l8nydwpo',
      unitId: `unit-${ctx.from.id}`,
      userId: ctx.from.id.toString(),
      readingKwh: 0,
      meterType: 'unit',
      signal: text,
      source: 'telegram'
    });
    ctx.reply(`✅ Signal recorded: ${text}`);
  }
});

// Handle photos
bot.on('photo', async (ctx) => {
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    await axios.post(`${BACKEND_URL}/api/readings/ingest`, {
      clusterId: 'clu_l8nydwpo',
      unitId: `unit-${ctx.from.id}`,
      userId: ctx.from.id.toString(),
      photoUrl: fileLink.href,
      meterType: 'unit',
      source: 'telegram'
    });

    ctx.reply('📸 Photo received! Processing reading...');
  } catch (err) {
    ctx.reply('❌ Failed to process photo.');
  }
});

bot.launch();
console.log('🚀 Ellie Telegram Bot started successfully!');