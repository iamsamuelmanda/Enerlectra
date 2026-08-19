import { Request, Response } from 'express'; // Assuming standard Express middleware setup
import * as crypto from 'node:crypto';
import { EventStore } from '../../core/eventing/event-store.js';
import { EventRouter } from '../../core/eventing/event-router.js';
import { EventType, PaymentReceivedEvent } from '../../core/eventing/event-types.js';

export class PaymentWebhookHandler {
  /**
   * Main HTTP POST endpoint handler for incoming Telco Mobile Money notifications.
   * Secure Namecheap routes pass raw network payloads directly to this handler.
   */
  public static async handleIncomingPayment(req: Request, res: Response): Promise<void> {
    try {
      // 1. Extract multi-tenant routing parameters and transactional data from the telco call
      // In production, organizationId can be parsed from URL params or custom authorization headers
      const organizationId = req.headers['x-organization-id'] as string || 'standard_subscriber';
      
      const { 
        externalTransactionId, 
        provider,          // 'mtn' | 'airtel' | 'zamtel'
        paidAmount, 
        msisdn,            // Sender's phone number
        accountReference   // The Meter Serial Number entered by the customer
      } = req.body;

      console.log(`[WEBHOOK INGRESS]: Received ${paidAmount} ZMW notification from ${provider} via Org: ${organizationId}`);

      // 2. Map the raw network payload cleanly to your immutable PaymentReceivedEvent contract
      const paymentEvent: PaymentReceivedEvent = {
        type: EventType.PAYMENT_RECEIVED,
        metadata: {
          eventId: `evt_${crypto.randomUUID()}`,
          timestamp: new Date().toISOString(),
          actorId: `gateway.${provider}`,
          organizationId: organizationId, // Ties transaction to Renwasol, Solar Move Africa, etc.
          version: 1
        },
        payload: {
          transactionId: externalTransactionId || `tx_${crypto.randomUUID()}`,
          gateway: provider,
          amount: Number(paidAmount),
          currency: 'ZMW',
          senderPhoneNumber: msisdn,
          meterSerialNumber: accountReference
        }
      };

      // 3. LOCK THE TRUTH TO THE LEDGER
      // If Supabase is down or rejects the write, this throws a hard exception instantly
      await EventStore.append(paymentEvent);

      // 4. HAND OFF TO THE ROUTER
      // The webhook handler doesn't process business rules; it just drops the event onto the highway
      // fire-and-forget background execution ensures ultra-low response latency for telco gateways
      EventRouter.dispatch(paymentEvent).catch((err) => {
        console.error(`[ASYNC ROUTER CRASH]: Background workflows failed for event ${paymentEvent.metadata.eventId}:`, err);
      });

      // 5. RESPOND IMMEDIATELY TO THE TELECOM PROVIDER
      // This stops the infinite retry loops that happen when network connections block processing chains
      res.status(200).json({ status: 'SUCCESS', message: 'Transaction logged securely.' });

    } catch (error: any) {
      console.error('[CRITICAL WEBHOOK FAILABLE Handoff]:', error.message);
      
      // Return a server failure status code to ensure the telecom provider safely retries the transmission
      res.status(500).json({ status: 'FAILED', reason: error.message });
    }
  }
}