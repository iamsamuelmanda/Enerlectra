import { Context } from 'telegraf';

export interface BotSession {
  clusterId?: string;
  awaitingPhone?: boolean;
  awaitingSearch?: boolean;
  awaitingMeterLookup?: boolean;
}

export interface BotState {
  userId: string;
  role: string | null;
  orgId: string | null;
}

// This is the definitive BotContext – includes both session and state.
export interface BotContext extends Context {
  session: BotSession;
  state: BotState;
}

export type BotSessionContext = Context & { session: BotSession };

// Helper to safely extract state (used in places where full context isn't available)
export function getBotState(ctx: Context): BotState | null {
  const state = ctx.state as Partial<BotState>;
  if (!state?.userId) return null;
  return {
    userId: state.userId,
    role: state.role ?? null,
    orgId: state.orgId ?? null,
  };
}

