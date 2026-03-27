import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const triggerReconciliation = async (clusterId: string) => {
  try {
    const res = await axios.post(`${BACKEND_URL}/api/readings/clusters/${clusterId}/reconcile`, {
      period: getCurrentPeriod()
    });
    return res.data;
  } catch (err: any) {
    console.error('[RECONCILE ERROR]', err.message);
    return null;
  }
};

// Start
bot.start((ctx) => {
  ctx.reply(
    '👋 Hello! I am *Ellie*, your Enerlectra grid assistant.\n\n' +
    'Commands:\n' +
    '⚡ `/read <kWh> <clusterId>` — Submit a meter reading\n' +
    '📊 `/status <clusterId>` — Check cluster status\n' +
    '📸 Send a meter photo to log a reading\n' +
    '🔴 LOW / 🟡 NORMAL / 🟢 HIGH — Send grid signal',
    { parse_mode: 'Markdown' }
  );
});

// /read command: /read 45.2 clu_l8nydwpo
bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);
  const clusterId = parts[2] || 'clu_l8nydwpo';

  if (isNaN(readingKwh)) {
    return ctx.reply('❌ Usage: /read <kWh> <clusterId>\nExample: /read 45.2 clu_l8nydwpo');
  }

  try {
    await ctx.reply(`⏳ Submitting reading of ${readingKwh} kWh...`);

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

    await ctx.reply(`✅ Reading recorded: *${readingKwh} kWh*\n⚙️ Running settlement...`, { parse_mode: 'Markdown' });

    const result = await triggerReconciliation(clusterId);

    if (result) {
      const summary = result.summary || result;
      await ctx.reply(
        `🏆 *Settlement Complete*\n\n` +
        `📍 Cluster: \`${clusterId}\`\n` +
        `⚡ Total kWh: ${summary.totalKwh ?? readingKwh}\n` +
        `👥 Participants settled: ${summary.participantCount ?? '—'}\n` +
        `📅 Period: ${getCurrentPeriod()}\n\n` +
        `_Check your wallet on enerlectra.vercel.app_`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('⚠️ Reading saved but settlement could not be triggered. It will run automatically.');
    }
  } catch (err: any) {
    console.error('[READ ERROR]', err.message);
    ctx.reply('❌ Failed to submit reading. Is the backend online?');
  }
});

// /status command
bot.command('status', async (ctx) => {
  const clusterId = ctx.message.text.split(' ')[1] || 'clu_l8nydwpo';
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
    ctx.reply('❌ Could not fetch cluster status.');
  }
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
      source: 'telegram',
      reportingPeriod: getCurrentPeriod()
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
      readingKwh: 0,
      meterType: 'unit',
      source: 'telegram',
      reportingPeriod: getCurrentPeriod()
    });

    ctx.reply('📸 Photo received! Processing reading...\n\nTo submit a numeric reading: /read 45.2 clu_l8nydwpo');
  } catch {
    ctx.reply('❌ Failed to process photo.');
  }
});

bot.launch();
console.log('🚀 Ellie is live!');
