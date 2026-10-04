// enerlectra-core/src/core/services/bot-state.ts
//
// Channel-agnostic resolution of "who is calling and what org are they in"
// for command handlers that need both actorId and organizationId.

export interface BotState {
  userId: string;
  orgId: string | null;
}

export interface ConversationState {
  awaitingPhone?: boolean;
  awaitingAmount?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Resolves the bot state (userId + orgId) from a command's execution context.
 * `context` is expected to carry at least `actorId`; `organizationId` may already
 * be present on the context (set by the CommandFactory), in which case we use it
 * directly rather than re-querying the database.
 */
export async function getBotState(context: {
  actorId: string;
  organizationId?: string;
}): Promise<BotState | null> {
  if (!context?.actorId) return null;

  const userId = context.actorId;
  // Organization context must come from a trusted channel/tenant resolver.
  // Never infer tenant authorization from a legacy channel-user table.
  const orgId = context.organizationId?.trim();
  if (!orgId) return null;

  return { userId, orgId };
}

/**
 * Sets conversational state for a user in a transport-agnostic way.
 * This allows the adapter layer to manage session state through core services.
 */
export async function setConversationState(
  userId: string,
  state: ConversationState
): Promise<ConversationState> {
  // In a real implementation, this would persist to Redis or similar
  // For now, we return the state that the adapter should store
  return state;
}

/**
 * Gets conversational state for a user.
 */
export async function getConversationState(userId: string): Promise<ConversationState> {
  // In a real implementation, this would fetch from Redis or similar
  return {};
}

/**
 * Checks if a user has a phone number registered.
 * Transport-agnostic check that can be used by any adapter.
 */
export async function checkUserHasPhone(userId: string): Promise<boolean> {
  const { data, error } = await (await import('../../infrastructure/supabase.js')).supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();

  return !!(data?.phone_number);
}
