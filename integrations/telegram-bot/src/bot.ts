import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Ellie is awake and monitoring the grid! ⚡'));
app.listen(PORT, () => console.log(`Health check listening on port ${PORT}`));

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const triggerReconciliation = async (ctx: any, clusterId: string) => {
  try {
    const res = await axios.post(`${BACKEND_URL}/api/readings/clusters/${clusterId}/reconcile`, {
      period: getCurrentPeriod()
    });
    const summary = res.data.summary || res.data;
    await ctx.reply(
      `🏆 *Settlement Complete*\n\n` +
      `📍 Cluster: \`${clusterId}\`\n` +
      `📅 Period: ${getCurrentPeriod()}\n\n` +
      `_Check balances at enerlectra.vercel.app_`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    console.error('[RECONCILE ERROR]', err.message);
    await ctx.reply('⚠️ Reading saved, but immediate settlement failed.');
  }
};

// --- UPDATED START HANDLER WITH DEEP LINKING ---
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;

  if (startPayload) {
    try {
      // Decode the Base64 string (Format: c:clusterId|u:unitId)
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const clusterId = decoded.split('|')[0].replace('c:', '');
      
      return ctx.reply(
        `👋 *Context Verified!*\n\n` +
        `I have linked you to Cluster: \`${clusterId}\`\n\n` +
        `To log your energy, please send a **Photo** of your meter or type:\n` +
        `\`/read <kWh>\``,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Payload decode error', e);
    }
  }

  ctx.reply(
    '👋 Hello! I am *Ellie*, your Enerlectra assistant.\n\n' +
    'Commands:\n' +
    '⚡ `/read <kWh> <clusterId>` — Submit a meter reading\n' +
    '📸 Send a meter photo + Cluster ID in caption',
    { parse_mode: 'Markdown' }
  );
});

bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);
  const clusterId = parts[2]; 

  if (isNaN(readingKwh) || !clusterId) {
    return ctx.reply('❌ Usage: `/read <kWh> <clusterId>`');
  }

  try {
    await axios.post(`${BACKEND_URL}/api/readings/ingest`, {
      clusterId,
      unitId: `unit-${ctx.from.id}`,
      userId: ctx.from.id.toString(),
      readingKwh,
      meterType: 'unit',
      source: 'telegram',
      reportingPeriod: getCurrentPeriod()
    });

    await ctx.reply(`✅ Reading recorded: *${readingKwh} kWh*`, { parse_mode: 'Markdown' });
    await triggerReconciliation(ctx, clusterId);
  } catch (err: any) {
    ctx.reply('❌ Failed to submit reading.');
  }
});

bot.on('photo', async (ctx) => {
  const clusterId = ctx.message.caption; 
  if (!clusterId) {
    return ctx.reply('📸 Please include the **Cluster ID** in the caption!');
  }

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    await axios.post(`${BACKEND_URL}/api/readings/ingest`, {
      clusterId,
      unitId: `unit-${ctx.from.id}`,
      userId: ctx.from.id.toString(),
      photoUrl: fileLink.href,
      readingKwh: 0,
      meterType: 'unit',
      source: 'telegram',
      reportingPeriod: getCurrentPeriod()
    });

    await ctx.reply('📸 Photo received! Processing...');
    await triggerReconciliation(ctx, clusterId);
  } catch {
    ctx.reply('❌ Failed to process photo.');
  }
});

bot.launch();