// handlers/commands/support.ts
import type { BotContext } from '../../types/context';
import { getBotState } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { redis } from '../../lib/redis';   // ← make sure this is imported
import { logger } from '../../services/logger';
import { queryHuggingFace } from '../../services/huggingface';
import { trackTicketCreated } from '../../services/metrics';

export type Intent =
  | 'payment_status'
  | 'token_delivery'
  | 'fault_report'
  | 'account_balance'
  | 'knowledge'   // ← new intent
  | 'unknown';

interface TransactionRow {
  id: string;
  amount: number;
  status: string;
  meter_number: string;
  token?: string | null;
  failure_reason?: string | null;
}

interface SupportFacts {
  transactions?: TransactionRow[];
  balance?: { balance_pcu: number; total_minted_pcu: number };
  fault?: boolean;
}

// ─── Rule‑based intent detection ─────────────────────────────────────
function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  // Payment status: asking about a specific payment
  if (
    (lower.includes('payment') || lower.includes('paid') || lower.includes('pay')) &&
    (lower.includes('received') || lower.includes('status') ||
     lower.includes('went') || lower.includes('through') ||
     lower.includes('confirmed') || lower.includes('go through'))
  ) {
    return 'payment_status';
  }

  // Token delivery: asking about a token that hasn't arrived
  if (
    (lower.includes('token') || lower.includes('code') || lower.includes('voucher')) &&
    (lower.includes('not') || lower.includes('didn\'t') || lower.includes('fail') ||
     lower.includes('missing') || lower.includes('work') || lower.includes('arrive'))
  ) {
    return 'token_delivery';
  }

  // Fault report: explicitly reporting a technical problem
  if (
    (lower.includes('fault') || lower.includes('broke') || lower.includes('error') ||
     lower.includes('issue') || lower.includes('problem')) &&
    (lower.includes('battery') || lower.includes('inverter') ||
     lower.includes('solar') || lower.includes('system') || lower.includes('meter'))
  ) {
    return 'fault_report';
  }

  // Account balance: explicitly asking about balance or PCU amount
  if (
    (lower.includes('balance') || lower.includes('how much pcu') ||
     lower.includes('how many pcu')) &&
    !lower.includes('what is pcu') && !lower.includes('explain pcu')
  ) {
    return 'account_balance';
  }

  // Knowledge questions (explanations, how‑to)
  if (
    lower.includes('what is') ||
    lower.includes('explain') ||
    lower.includes('how do i') ||
    lower.includes('how does')
  ) {
    return 'knowledge';
  }

  return 'unknown';
}

// ─── AI‑powered intent detection (Hugging Face) ─────────────────────
async function detectIntentWithAI(userMessage: string): Promise<Intent> {
  const prompt = `Classify the following support request into one of these categories:
- payment_status (asking about a payment)
- token_delivery (asking about a token or code)
- fault_report (reporting a technical fault or problem)
- account_balance (asking about balance or credits)
- knowledge (asking for an explanation or general information)
- unknown (none of the above)

Request: "${userMessage}"

Category:`;

  try {
    const result = await queryHuggingFace(prompt);
    const cleaned = result.toLowerCase().replace(/[^a-z_]/g, '').trim();
    if (
      ['payment_status', 'token_delivery', 'fault_report', 'account_balance', 'knowledge'].includes(cleaned)
    ) {
      return cleaned as Intent;
    }
    return 'unknown';
  } catch (err) {
    logger.warn({ err }, 'AI intent detection failed, falling back to rule-based');
    return detectIntent(userMessage);
  }
}

// ─── Gather relevant facts from the database ─────────────────────────
async function gatherFacts(
  intent: Intent,
  userId: string,
  _orgId: string,
  _message: string
): Promise<SupportFacts> {
  switch (intent) {
    case 'payment_status':
    case 'token_delivery': {
      const { data: user } = await supabase
        .from('telegram_users')
        .select('phone_number')
        .eq('user_id', userId)
        .single();
      const phone = user?.phone_number;
      if (!phone) return { transactions: [] };

      const searchPattern = `%${phone}%`;
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .or(`customer_phone.ilike.${searchPattern},meter_number.ilike.${searchPattern}`)
        .order('created_at', { ascending: false })
        .limit(intent === 'token_delivery' ? 5 : 3);

      return { transactions: (txns as TransactionRow[]) || [] };
    }

    case 'fault_report':
      return { fault: true };

    case 'account_balance': {
      const { data: balance } = await supabase
        .from('pcu_balances')
        .select('balance_pcu, total_minted_pcu')
        .eq('user_id', userId)
        .maybeSingle();
      return {
        balance: balance || { balance_pcu: 0, total_minted_pcu: 0 },
      };
    }

    case 'knowledge':
    default:
      return {};
  }
}

// ─── Rule‑based response generation ──────────────────────────────────
function generateResponse(intent: Intent, facts: SupportFacts, userMessage: string): string {
  switch (intent) {
    case 'payment_status': {
      const txns = facts.transactions || [];
      if (txns.length === 0) {
        return 'I could not find any recent transactions for your account. Please check the phone number you registered with /register and try again.';
      }
      let reply = '*Recent Transactions*\n\n';
      txns.forEach((t) => {
        const emoji = t.status === 'DELIVERED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
        reply += `${emoji} K${t.amount} - Meter ${t.meter_number} - ${t.status}\n`;
        if (t.token) reply += `   Token: \`${t.token}\`\n`;
      });
      return reply;
    }

    case 'token_delivery': {
      const txns = facts.transactions || [];
      if (txns.length === 0) {
        return 'No recent token requests found. If you paid and have not received a token, please contact the operator.';
      }
      const failed = txns.filter((t) => t.status === 'FAILED');
      if (failed.length > 0) {
        return `I found ${failed.length} failed token generation(s). The issue has been logged and our team will investigate. Reference: TXN-${failed[0].id.slice(0, 8).toUpperCase()}`;
      }
      return 'Your recent token requests appear to have been successful. If you are still having issues, try entering the token again or contact support.';
    }

    case 'fault_report':
      return 'I have logged your fault report. A technician will be assigned to investigate.';

    case 'account_balance': {
      const bal = facts.balance || { balance_pcu: 0, total_minted_pcu: 0 };
      return `*Your PCU Balance*\n\nAvailable: ${bal.balance_pcu} PCU\nLifetime earned: ${bal.total_minted_pcu} PCU\n\nUse /redeem to cash out.`;
    }

    case 'knowledge': {
      // Small built‑in knowledge base
      if (userMessage.toLowerCase().includes('pcu')) {
        return 'PCU stands for Power Credit Unit. It is the digital energy credit you earn for verified solar exports. 1 PCU ≈ 1 kWh of exported energy. You can redeem PCU for mobile money via /redeem.';
      }
      if (userMessage.toLowerCase().includes('enerlectra')) {
        return 'Enerlectra is an Energy Operations Layer – it helps you track, settle and get paid for energy, using a simple Telegram bot.';
      }
      return 'I can answer questions about PCU, payments, tokens, and faults. Try asking something specific.';
    }

    default:
      return 'I am not sure how to help with that. You can try asking about payments, tokens, faults, or your balance. If you need urgent help, contact the operator.';
  }
}

// ─── AI‑powered response generation (Hugging Face) ──────────────────
async function generateResponseWithAI(
  intent: Intent,
  facts: SupportFacts,
  userMessage: string
): Promise<string> {
  let context = '';

  if (intent === 'payment_status' || intent === 'token_delivery') {
    const txns = facts.transactions || [];
    if (txns.length === 0) {
      context = 'No recent transactions found.';
    } else {
      context =
        'Recent transactions:\n' +
        txns
          .map(
            (t) =>
              `- Amount: K${t.amount}, Status: ${t.status}, Meter: ${t.meter_number}, Token: ${t.token || 'N/A'}`
          )
          .join('\n');
    }
  } else if (intent === 'fault_report') {
    context = 'The user is reporting a technical fault.';
  } else if (intent === 'account_balance') {
    const bal = facts.balance || { balance_pcu: 0, total_minted_pcu: 0 };
    context = `Current balance: ${bal.balance_pcu} PCU. Lifetime earned: ${bal.total_minted_pcu} PCU.`;
  } else if (intent === 'knowledge') {
    context = 'The user is asking a general knowledge question.';
  } else {
    context = 'No specific facts available for this request.';
  }

  const prompt = `You are a helpful energy operations support assistant. Use the facts below to answer the user's question concisely. If you don't know, say so.

Facts:
${context}

User question: "${userMessage}"

Answer:`;

  try {
    return await queryHuggingFace(prompt);
  } catch (err) {
    logger.warn({ err }, 'AI response generation failed, falling back to rule-based');
    return generateResponse(intent, facts, userMessage);
  }
}

// ─── Escalation logic ────────────────────────────────────────────────
function checkEscalation(intent: Intent, facts: SupportFacts): boolean {
  if (intent === 'fault_report') return true;
  if (
    intent === 'token_delivery' &&
    (facts.transactions?.filter((t) => t.status === 'FAILED').length ?? 0) > 0
  ) {
    return true;
  }
  if (intent === 'unknown') return true;
  // Knowledge questions do not need escalation
  return false;
}

// ─── Ticket creation + alert (with metric tracking) ──────────────────
async function createTicketAndAlert(
  ctx: BotContext,
  intent: Intent,
  _facts: SupportFacts,
  userMessage: string
): Promise<void> {
  const state = getBotState(ctx);
  if (!state?.orgId) return;

  const { userId, orgId } = state;
  const title = `Support: ${intent.replace(/_/g, ' ')}`;
  const description = `User message: ${userMessage}\n\nAuto-detected intent: ${intent}`;

  // Insert ticket and capture the ID
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      organisation_id: orgId,
      customer_id: userId,
      title,
      description,
      status: 'open',
      intent,
      metadata: { source: 'telegram', telegram_id: ctx.from?.id?.toString() },
    })
    .select('id')
    .single();

  if (ticketError || !ticket) {
    logger.error({ ticketError, userId, orgId }, 'Failed to create support ticket');
    return;
  }

  // Log the ticket creation metric
  await trackTicketCreated(userId, orgId, ticket.id);

  // Create an alert for the operator
  const { error: alertError } = await supabase.from('alerts').insert({
    severity: 'WARNING',
    source: 'telegram_support',
    message: `New support ticket from user ${userId}: ${title}`,
    metadata: { organisation_id: orgId, user_id: userId, intent, user_message: userMessage },
  });

  if (alertError) {
    logger.error({ alertError, userId, orgId }, 'Failed to create support alert');
  }

  // Notify operator via Telegram
  const operatorChatId = process.env.OPERATOR_CHAT_ID;
  if (operatorChatId) {
    await ctx.telegram
      .sendMessage(
        operatorChatId,
        `🚨 *New Support Ticket*\n\nUser: ${userId}\nIntent: ${intent}\nMessage: ${userMessage}`,
        { parse_mode: 'Markdown' }
      )
      .catch((err) => logger.warn({ err }, 'Failed to notify operator chat'));
  }
}

// ─── Main support handler ─────────────────────────────────────────────
export async function handleSupport(ctx: BotContext): Promise<void> {
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('Send /support followed by your question.');
    return;
  }

  const userMessage = ctx.message.text.replace(/^\/support(@\w+)?\s*/, '').trim();
  if (!userMessage) {
    await ctx.reply(
      'I am your Enerlectra support assistant. Ask me anything about your energy account, payments, tokens, or faults.\n\n' +
        'Examples:\n' +
        '• "Was my payment of K50 received?"\n' +
        '• "Why is my token not working?"\n' +
        '• "I have a fault with my battery."'
    );
    return;
  }

  // ── Clear any stale Redis workflow state ───────────────────────────
  const telegramId = ctx.from!.id.toString();
  await redis.del(`demo_state:${telegramId}`);

  const state = getBotState(ctx);
  if (!state) {
    await ctx.reply('Authentication error. Please try /start first.');
    return;
  }

  const { userId, orgId } = state;
  if (!orgId) {
    await ctx.reply(
      'You are not linked to an organisation. Please use /linkorg <name> first (e.g. /linkorg renwasol).'
    );
    return;
  }

  const useAI = Boolean(process.env.HF_API_KEY);
  const intent = useAI
    ? await detectIntentWithAI(userMessage)
    : detectIntent(userMessage);

  logger.info({ userId, message: userMessage, intent, useAI }, 'Support request');

  const facts = await gatherFacts(intent, userId, orgId, userMessage);
  const response = useAI
    ? await generateResponseWithAI(intent, facts, userMessage)
    : generateResponse(intent, facts, userMessage);

  const needsEscalation = checkEscalation(intent, facts);

  await ctx.reply(response, { parse_mode: 'Markdown' });

  if (needsEscalation) {
    await createTicketAndAlert(ctx, intent, facts, userMessage);
    await ctx.reply(
      'I have also created a support ticket and notified the operator. Someone will follow up shortly.',
      { parse_mode: 'Markdown' }
    );
  }
}

export async function handleFreeformSupport(ctx: any) {
  await handleSupport(ctx);
}