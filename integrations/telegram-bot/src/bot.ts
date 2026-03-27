import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express'; // Added for health checks

dotenv.config();

// --- HEALTH CHECK SERVER (For Render Free Tier) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Ellie is awake and monitoring the grid! ⚡'));
app.listen(PORT, () => console.log(`Health check listening on port ${PORT}`));

// --- BOT CONFIGURATION ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Logic to trigger settlement immediately after a reading
const triggerReconciliation = async (ctx: any, clusterId: string) => {
  try {
    const res = await axios.post(`${BACKEND_URL}/api/readings/clusters/${clusterId}/reconcile`, {
      period: getCurrentPeriod()
    });
    
    const summary = res.data.summary || res.data;
    await ctx.reply(
      `🏆 *Settlement Complete*\n\n` +
      `📍 Cluster: \`${clusterId}\`\n` +
      `⚡ Total kWh: ${summary.totalKwh ?? 'Calculated'}\n` +
      `👥 Participants: ${summary.participantCount ?? '1'}\n` +
      `📅 Period: ${getCurrentPeriod()}\n\n` +
      `_Check balances at enerlectra.vercel.app_`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    console.error('[RECONCILE ERROR]', err.message);
    await ctx.reply('⚠️ Reading saved, but immediate settlement failed. It will be processed in the next automated batch.');
  }
};

// Start
bot.start((ctx) => {
  ctx.reply(
    '👋 Hello! I am *Ellie*, your Enerlectra assistant.\n\n' +
    'Commands:\n' +
    '⚡ `/read <kWh> <clusterId>` — Submit a meter reading\n' +
    '📊 `/status <clusterId>` — Check cluster status\n' +
    '📸 Send a meter photo + Cluster ID in caption\n' +
    '🔴 LOW / 🟡 NORMAL / 🟢 HIGH — Send grid signal',
    { parse_mode: 'Markdown' }
  );
});

// /read command: /read 45.2 clu_l8nydwpo
bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);
  const clusterId = parts[2]; // Removed hardcoded default

  if (isNaN(readingKwh) || !clusterId) {
    return ctx.reply('❌ Usage: `/read <kWh> <clusterId>`\nExample: `/read 45.2 clu_l8nydwpo`', { parse_mode: 'Markdown' });
  }

  try {
    await ctx.reply(`⏳ Submitting ${readingKwh} kWh for ${clusterId}...`);

    await axios.post(`${BACKEND_URL}/api/readings/ingest`, {
      clusterId,
      unitId: `unit-${ctx.from.id}`,
      userId: ctx.from.id.toString(),
      readingKwh,
      meterType: 'unit',
      signal: 'NORMAL',
      source: 'telegram',
      reportingPeriod: getCurrentPeriod()
    });

    await ctx.reply(`✅ Reading recorded: *${readingKwh} kWh*`, { parse_mode: 'Markdown' });
    
    // Trigger the Outcome phase immediately
    await triggerReconciliation(ctx, clusterId);
  } catch (err: any) {
    console.error('[READ ERROR]', err.message);
    ctx.reply('❌ Failed to submit reading. Check your Cluster ID or backend status.');
  }
});

// /status command
bot.command('status', async (ctx) => {
  const clusterId = ctx.message.text.split(' ')[1];
  if (!clusterId) return ctx.reply('❌ Please provide a Cluster ID. Usage: `/status clu_l8nydwpo`', { parse_mode: 'Markdown' });

  try {
    const res = await axios.get(`${BACKEND_URL}/api/clusters/${clusterId}`);
    const c = res.data;
    ctx.reply(
      `📊 *${c.name}*\n\n` +
      `📍 ${c.location}\n` +
      `💰 Funded: $${c.current_usd} / $${c.target_usd}\n` +
      `⚡ Capacity: ${c.target_kw} kW\n` +
      `🔄 State: ${c.lifecycle_state}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    ctx.reply('❌ Could not fetch status. Ensure Cluster ID is correct.');
  }
});

// Handle signals
bot.on('text', async (ctx) => {
  const text = ctx.message.text.toUpperCase().trim();
  if (['LOW', 'NORMAL', 'HIGH'].includes(text)) {
    // Note: Signal currently needs a cluster context. For now, Ellie asks for a read command.
    ctx.reply(`To log a ${text} signal, please include the Cluster ID via the /read command.`);
  }
});

// Handle photos
bot.on('photo', async (ctx) => {
  const clusterId = ctx.message.caption; // Use caption as Cluster ID
  if (!clusterId) {
    return ctx.reply('📸 Photo received, but I need the **Cluster ID** in the caption to log it!', { parse_mode: 'Markdown' });
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

    await ctx.reply('📸 Photo received! Processing via OCR...');
    await triggerReconciliation(ctx, clusterId);
  } catch {
    ctx.reply('❌ Failed to process photo.');
  }
});

bot.launch();
console.log('🚀 Ellie is live with Health Check and Dynamic Routing!');