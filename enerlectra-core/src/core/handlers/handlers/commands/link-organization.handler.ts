// enerlectra-core/src/core/handlers/link-organization.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';

export interface LinkOrgResult {
  organizationId?: string;
  organizationName?: string;
  message: string;
}

/**
 * LINK_ORGANIZATION
 *
 * Previously: handleLinkOrg(ctx: BotContext)
 */
export class LinkOrganizationHandler implements CommandHandler {
  async execute(command: Command): Promise<LinkOrgResult> {
    const payload = command.payload as any;

    // Raw text from the user, e.g. "/linkorg renwasol"
    const rawText = String(payload.rawText ?? '');

    // Basic validation: must be a text command
    if (!rawText) {
      return {
        message:
          'Usage: /linkorg <organisation>\n\nExample: /linkorg renwasol',
      };
    }

    // Derive the slug from the text
    const slug = rawText.replace(/^\/linkorg(@\w+)?\s*/, '').trim().toLowerCase();
    if (!slug) {
      return {
        message:
          'Usage: /linkorg <organisation>\n\nExample: /linkorg renwasol',
      };
    }

    const userId = command.context.actorId;

    // Look up organisation by slug
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    if (orgError || !org) {
      logger.warn({ orgError, slug }, 'Organisation lookup failed');
      return {
        message:
          `Organisation "${slug}" not found. Available examples: renwasol, ds-solar, boarding-house`,
      };
    }

    // Link telegram user to organisation
    const { error: updateError } = await supabase
      .from('telegram_users')
      .update({
        organization_id: org.id,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      logger.error(
        { updateError, userId, orgId: org.id },
        'Failed to link organisation',
      );
      return {
        message: 'Failed to link organisation. Please try again.',
      };
    }

    // At this point, caller (adapter) can update its own state with orgId if needed.
    return {
      organizationId: String(org.id),
      organizationName: String(org.name),
      message:
        `*Linked to ${org.name}*\n\n` +
        `You can now use /support to ask questions about your account.`,
    };
  }
}