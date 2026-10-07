import { ExecutionContext } from '../../../core/workflow/execution-context.js';
import type { EllieContext } from '../ellie-context.js';
import { captureMessageContext } from './context-builder.js';
import { askEllie } from '../../../ai/ellie.js';

function formatCanonicalContext(context: EllieContext): string {
  return [
    '[Canonical Enerlectra Context]',
    'Actor: ' + context.actorId,
    'Organization: ' + context.organizationId,
    'Permissions: ' + JSON.stringify(context.permissions),
    'Operating Context: ' + JSON.stringify(context.operatingContext),
    'Capabilities: ' + JSON.stringify(context.capabilities),
    'Policies: ' + JSON.stringify(context.policies),
    'Evidence: ' + JSON.stringify(context.evidence),
    'Situations: ' + JSON.stringify(context.situations),
    'Recommendations: ' + JSON.stringify(context.recommendations),
    'Work: ' + JSON.stringify(context.work),
    'Verified Organizational Memories: ' + JSON.stringify(context.memories),
  ].join('\n');
}

export class EllieWorker {
  /**
   * Canonical callers provide ellieContext; legacy channels remain behind
   * the legacy context-builder adapter until their identity/persistence
   * boundaries are migrated.
   */
  async execute(userText: string, context: ExecutionContext, senderPhone?: string): Promise<string> {
    try {
      let telemetryContext: string;

      if (context.ellieContext) {
        telemetryContext = formatCanonicalContext(context.ellieContext);
      } else {
        const dataContext = await captureMessageContext(context.supabase, userText, senderPhone);
        if (!dataContext.customerRecord) {
          return 'I searched our unified records but could not find a customer profile matching that phone number or meter record. Please verify the identifier and try again.';
        }
        telemetryContext = [
          '[Legacy Adapter Context]',
          'Customer Record: ' + JSON.stringify(dataContext.customerRecord),
          'Recent Ledger Transactions: ' + JSON.stringify(dataContext.transactionHistory),
          'Unresolved System Alerts: ' + JSON.stringify(dataContext.systemAlerts),
        ].join('\n');
      }

      context.logger.info({ actorId: context.actorId, organizationId: context.organizationId }, '[EllieWorker] Executing inference');
      return await askEllie(userText, telemetryContext);
    } catch (error) {
      context.logger.error('[EllieWorker] Cognitive Engine Failure', { error });
      return 'The operational reasoning layer was unable to extract operational telemetry. Please use manual platform dashboards.';
    }
  }
}
