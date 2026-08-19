// enerlectra-core/src/adapters/telegram/telegram-adapter.ts

import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  IncomingMessageEvent,
  InteractionType,
  UnifiedMedia,
} from '../../core/contracts/incoming-message.js';
import { ExecutionContext } from '../../core/workflow/execution-context.js';
import { WorkflowEngine } from '../../core/workflow/workflow-engine.js';

export class TelegramAdapter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly workflowEngine: WorkflowEngine,
    private readonly bot: Telegraf<Context>
  ) {}

  registerHandlers() {
    this.bot.command(['start', 'status', 'help', 'redeem', 'history', 'balance'], async (ctx) => {
      const event = this.toIncomingEvent(ctx, 'command');
      const execCtx = this.buildExecutionContext(event);
      await this.auditInbound(event);
      await this.workflowEngine.processIncomingMessage(event, execCtx);
    });

    this.bot.on(message('text'), async (ctx) => {
      const event = this.toIncomingEvent(ctx, 'text');
      const execCtx = this.buildExecutionContext(event);
      await this.auditInbound(event);
      await this.workflowEngine.processIncomingMessage(event, execCtx);
    });

    this.bot.on(message('photo'), async (ctx) => {
      const event = this.toIncomingEvent(ctx, 'image');
      const execCtx = this.buildExecutionContext(event);
      await this.auditInbound(event);
      await this.workflowEngine.processIncomingMessage(event, execCtx);
    });

    this.bot.on('callback_query', async (ctx) => {
      const event = this.toIncomingEvent(ctx, 'button');
      const execCtx = this.buildExecutionContext(event);
      await this.auditInbound(event);
      await this.workflowEngine.processIncomingMessage(event, execCtx);
    });
  }

  public toIncomingEvent(ctx: Context, interaction: InteractionType): IncomingMessageEvent {
    const updateId = String(ctx.update.update_id);
    const nowIso = new Date().toISOString();

    const base: IncomingMessageEvent = {
      eventId: updateId,
      correlationId: updateId,
      conversationId: `telegram:${ctx.chat?.id ?? ctx.from?.id}`,
      timestamp: nowIso,
      channel: 'telegram',
      interaction,
      sender: {
        id: ctx.from!.id.toString(),
        channel: 'telegram',
        username: ctx.from!.username,
        displayName: [ctx.from!.first_name, ctx.from!.last_name].filter(Boolean).join(' '),
        role: 'unknown',
      },
      metadata: {
        rawUpdate: ctx.update,
      },
    };

    if (interaction === 'command' || interaction === 'text') {
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
      return {
        ...base,
        text,
        metadata: {
          ...base.metadata,
          commandName:
            interaction === 'command'
              ? text?.split(' ')[0]?.replace('/', '')
              : undefined,
        },
      };
    }

    if (interaction === 'image') {
      const photo =
        ctx.message && 'photo' in ctx.message
          ? ctx.message.photo.slice(-1)[0]
          : undefined;
      const media: UnifiedMedia[] = [];

      if (photo) {
        media.push({
          id: photo.file_id,
          type: 'image',
          url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${photo.file_id}`,
          mimeType: 'image/jpeg',
        });
      }

      return {
        ...base,
        media,
      };
    }

    if (interaction === 'button') {
      const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
      return {
        ...base,
        metadata: {
          ...base.metadata,
          callbackData: data,
        },
      };
    }

    return base;
  }

  private async auditInbound(event: IncomingMessageEvent): Promise<void> {
    const { error } = await this.supabase
      .from('communication_messages')
      .upsert(
        {
          message_id: event.eventId,
          channel: event.channel,
          direction: 'inbound',
          from_number: event.sender.phoneNumber ?? event.sender.id,
          body: event.text,
          message_type: event.interaction,
          payload: event.metadata,
          status: 'received',
          received_at: event.timestamp,
        },
        { onConflict: 'message_id' }
      );

    if (error) {
      console.error('[TelegramAdapter] Failed to audit inbound message', {
        eventId: event.eventId,
        error,
      });
    }
  }

  public buildExecutionContext(event: IncomingMessageEvent): ExecutionContext {
    return {
      supabase: this.supabase,
      logger: console,
      correlationId: event.correlationId,
      aiContext: {},
      actorId: event.sender.id,
      organizationId: event.sender.organizationId ?? '',
      posthog: undefined,
    };
  }
}