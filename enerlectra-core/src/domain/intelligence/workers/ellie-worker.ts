// domains/intelligence/workers/ellie-worker.ts
import { ExecutionContext } from '../../../core/workflow/execution-context.js';
import { captureMessageContext } from './context-builder.js';

import { askEllie } from '../../../ai/ellie.js'; 

export class EllieWorker {
  /**
   * Orchestrates the inference pipeline.
   * Now purely dependency-injected and testable.
   */
  async execute(userText: string, context: ExecutionContext, senderPhone?: string): Promise<string> {
    try {
      // 1. Fetch context using the kernel's Supabase instance
      // We pass the context.supabase instead of a global import
      const dataContext = await captureMessageContext(context.supabase, userText, senderPhone);

      if (!dataContext.customerRecord) {
        return "I searched our unified records but could not find a customer profile matching that phone number or meter record. Please verify the identifier and try again.";
      }

      // 2. Format the database payload cleanly
      const telemetryContext = `
[Verified System Telemetry Snapshot]
Customer Record: ${JSON.stringify(dataContext.customerRecord)}
Recent Ledger Transactions: ${JSON.stringify(dataContext.transactionHistory)}
Unresolved System Alerts: ${JSON.stringify(dataContext.systemAlerts)}
`.trim();

      // 3. Execute inference
      // We log via the kernel's logger instead of console.log
      context.logger.info(`[EllieWorker] Executing inference for user`);
      
      return await askEllie(userText, telemetryContext);

    } catch (error) {
      // Use the kernel's logger for error tracking
      context.logger.error('[EllieWorker] Cognitive Engine Failure', { error });
      return "The operational reasoning layer was unable to extract ledger telemetry data. Please use manual platform dashboards.";
    }
  }
}