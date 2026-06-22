# fix-errors.ps1
# Run from integrations/telegram-bot

$root = Get-Location

# ─── Create missing files ────────────────────────────────────────────

# services/exchange.ts
@"
import { logger } from './logger';

export async function getLiveExchangeRate(): Promise<number> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY not configured');
  const axios = (await import('axios')).default;
  const res = await axios.get(`https://v6.exchangerate-api.com/v6/` + apiKey + `/latest/USD`);
  const rate = res.data?.conversion_rates?.ZMW;
  if (!rate) throw new Error('Invalid exchange rate response');
  return rate;
}
"@ | Out-File -FilePath "$root/src/services/exchange.ts" -Encoding UTF8

# services/period.ts
@"
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
"@ | Out-File -FilePath "$root/src/services/period.ts" -Encoding UTF8

# utils/format.ts (if utils folder doesn't exist)
New-Item -ItemType Directory -Force -Path "$root/src/utils" | Out-Null
@"
import crypto from 'node:crypto';

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function generateReadingKey(
  userId: string, clusterId: string, meterType: string,
  period: string, readingKwh: number
): string {
  const raw = `${userId}:${clusterId}:${meterType}:${period}:${readingKwh.toFixed(2)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function normalizePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let n = cleaned;
  if (n.startsWith('0')) n = '+260' + n.slice(1);
  if (n.startsWith('260')) n = '+' + n;
  return /^\+260\d{9}$/.test(n) ? n : null;
}

export function dbErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '42P01') return 'Database table missing. Run the migration script in Supabase.';
  return `Query failed: ${error.message || 'unknown error'}`;
}
"@ | Out-File -FilePath "$root/src/utils/format.ts" -Encoding UTF8

# middleware/auth.ts
New-Item -ItemType Directory -Force -Path "$root/src/middleware" | Out-Null
@"
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  (req as any).user = user;
  next();
}
"@ | Out-File -FilePath "$root/src/middleware/auth.ts" -Encoding UTF8

# middleware/apiKey.ts
@"
import { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
"@ | Out-File -FilePath "$root/src/middleware/apiKey.ts" -Encoding UTF8

# handlers/actions/payments.ts
New-Item -ItemType Directory -Force -Path "$root/src/handlers/actions" | Out-Null
@"
import type { BotContext } from '../../types/context';
import { getInvoices, createPaymentRequest, subscribeTenantToPlan } from '../../services/payments';
import { supabase } from '../../lib/supabase';
import { Markup } from 'telegraf';

export async function showPaymentsMenu(ctx: BotContext) {
  await ctx.answerCbQuery();
  const orgId = ctx.state.orgId;
  if (!orgId) return ctx.reply('No organisation linked.');

  const invoices = await getInvoices(orgId);
  if (!invoices.length) return ctx.reply('No invoices yet.');

  let msg = '*Recent Invoices*\n\n';
  invoices.forEach((inv: any) => {
    msg += `• ${inv.description || 'Invoice'} – K${inv.amount} – ${inv.status}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

export async function showSubscriptionOptions(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { data: plans } = await supabase.from('plans').select('*');
  if (!plans?.length) return ctx.reply('No subscription plans available yet.');

  const keyboard = plans.map((plan: any) => [
    Markup.button.callback(`${plan.name} – K${plan.price}/month`, `sub_plan:${plan.id}`)
  ]);
  await ctx.reply('*Choose a plan*', {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(keyboard),
  });
}

export async function handlePlanSelection(ctx: BotContext) {
  await ctx.answerCbQuery();
  const planId = (ctx.callbackQuery as any).data.split(':')[1];
  const { userId } = ctx.state;
  await ctx.reply(`You selected plan ${planId}. A payment request will be sent to your mobile number.`);
}
"@ | Out-File -FilePath "$root/src/handlers/actions/payments.ts" -Encoding UTF8

Write-Host "✅ Missing files created."