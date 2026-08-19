// enerlectra-core/src/core/handlers/payments.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { getInvoices, createPaymentRequest, subscribeTenantToPlan } from '../../../services/payments.js';
import { supabase } from '../../../../infrastructure/supabase.js';

/**
 * Shared result types for payments-related commands.
 */

export interface PaymentsMenuItem {
  id: string;
  description: string;
  amount: number;
  status: string;
}

export interface PaymentsMenuResult {
  items: PaymentsMenuItem[];
  message: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

export interface SubscriptionOptionsResult {
  plans: SubscriptionPlan[];
  message: string;
}

export interface PlanSelectionResult {
  planId: string | null;
  message: string;
}

/**
 * SHOW_PAYMENTS_MENU
 *
 * Previously: showPaymentsMenu(ctx: BotContext)
 */
export class ShowPaymentsMenuHandler implements CommandHandler {
  async execute(command: Command): Promise<PaymentsMenuResult> {
    const orgId = command.context.organizationId;

    if (!orgId) {
      return {
        items: [],
        message: 'No organisation linked.',
      };
    }

    const invoices = await getInvoices(orgId);
    if (!invoices.length) {
      return {
        items: [],
        message: 'No invoices yet.',
      };
    }

    const items: PaymentsMenuItem[] = invoices.map((inv: any) => ({
      id: String(inv.id ?? ''),
      description: inv.description || 'Invoice',
      amount: Number(inv.amount ?? 0),
      status: String(inv.status ?? ''),
    }));

    let msg = '*Recent Invoices*\n\n';
    items.forEach((inv) => {
      msg += `• ${inv.description} – K${inv.amount} – ${inv.status}\n`;
    });

    return {
      items,
      message: msg,
    };
  }
}

/**
 * SHOW_SUBSCRIPTION_OPTIONS
 *
 * Previously: showSubscriptionOptions(ctx: BotContext)
 */
export class ShowSubscriptionOptionsHandler implements CommandHandler {
  async execute(_command: Command): Promise<SubscriptionOptionsResult> {
    const { data: plans, error } = await supabase.from('plans').select('*');

    if (error) {
      return {
        plans: [],
        message: 'Unable to load subscription plans. Please try again.',
      };
    }

    if (!plans?.length) {
      return {
        plans: [],
        message: 'No subscription plans available yet.',
      };
    }

    const normalized: SubscriptionPlan[] = plans.map((plan: any) => ({
      id: String(plan.id),
      name: String(plan.name),
      price: Number(plan.price),
    }));

    return {
      plans: normalized,
      message: '*Choose a plan*',
    };
  }
}

/**
 * HANDLE_PLAN_SELECTION
 *
 * Previously: handlePlanSelection(ctx: BotContext)
 */
export class HandlePlanSelectionHandler implements CommandHandler {
  async execute(command: Command): Promise<PlanSelectionResult> {
    const payload = command.payload as any;
    const callback = String(payload.callback ?? '');
    const planId = callback.split(':')[1] ?? null;

    if (!planId) {
      return {
        planId: null,
        message: 'No plan selected.',
      };
    }

    const actorId = command.context.actorId;
    const orgId = command.context.organizationId;

    // Optional: trigger domain actions when ready
    // await subscribeTenantToPlan({ userId: actorId, planId, organizationId: orgId });
    // await createPaymentRequest({ userId: actorId, planId, organizationId: orgId });

    return {
      planId,
      message: `You selected plan ${planId}. A payment request will be sent to your mobile number.`,
    };
  }
}