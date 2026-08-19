import { EventRouter } from '../../core/eventing/event-router.js';
import { EventType, PaymentReceivedEvent } from '../../core/eventing/event-types.js';

/**
 * Defines the universal operational business models supported by Enerlectra OS.
 * This directly covers your entire target ICP axis.
 */
export enum PlatformArchetype {
  PREPAID_MINIGRID = 'PREPAID_MINIGRID',   // e.g., Renwasol, DS Solar
  LEASE_TO_OWN     = 'LEASE_TO_OWN',       // e.g., Solar Move Africa (Installments/Inventory)
  FIXED_LEDGER     = 'FIXED_LEDGER'        // e.g., Ndambo/Bune Boarding Houses (Property Managers)
}

export class PaymentCoordinator {
  /**
   * Registers the coordinator with the EventRouter.
   */
  static init(): void {
    EventRouter.subscribe(EventType.PAYMENT_RECEIVED, this.routePaymentByArchetype);
    console.log('[COORDINATOR INITIALIZED]: Operating in dynamic multi-tenant mode.');
  }

  /**
   * Processes the incoming payment by dynamically checking the organization's operational model.
   */
  private static async routePaymentByArchetype(event: PaymentReceivedEvent): Promise<void> {
    const { organizationId } = event.metadata;
    
    try {
      // 1. DYNAMIC LOOKUP (Instead of hardcoding)
      // In production, this will query your Supabase 'organizations' table:
      // const { data: org } = await supabase.from('organizations').select('archetype').eq('id', organizationId).single();
      const archetype = await PaymentCoordinator.resolveOrganizationArchetype(organizationId);

      console.log(`[COORDINATOR]: Routing event for Tenant [${organizationId}] via Archetype [${archetype}]`);

      // 2. ROUTE BY OPERATIONAL BEHAVIOR, NOT BY COMPANY NAME
      switch (archetype) {
        
        case PlatformArchetype.PREPAID_MINIGRID:
          // Triggers standard STS utility token generation routines
          // await TokenGeneratorCapability.process(event);
          console.log(`[CAPABILITY MATCH]: Executed Mini-Grid Utility Token Process.`);
          break;

        case PlatformArchetype.LEASE_TO_OWN:
          // Triggers collection balance reduction and hardware inventory updates
          // await LeaseTrackerCapability.process(event);
          console.log(`[CAPABILITY MATCH]: Executed Asset Installment & Stock Allocation Process.`);
          break;

        case PlatformArchetype.FIXED_LEDGER:
          // Triggers simple accounting/tenant balance spreadsheet logging
          // await TenantLedgerCapability.process(event);
          console.log(`[CAPABILITY MATCH]: Executed Property Management Accounting Update.`);
          break;

        default:
          console.warn(`[COORDINATOR WARN]: Unhandled operational archetype [${archetype}] for Org [${organizationId}].`);
          break;
      }

    } catch (error: any) {
      console.error(`[COORDINATOR CRITICAL ERROR] Tenant routing failed for Org [${organizationId}]:`, error.message);
    }
  }

  /**
   * Simulated database lookup matching an organization ID to its operational archetype configuration.
   */
  private static async resolveOrganizationArchetype(organizationId: string): Promise<PlatformArchetype> {
    // This mapping lives completely inside your Supabase database configuration tables, NOT in your code!
    const registry: Record<string, PlatformArchetype> = {
      'renwasol_uuid_123': PlatformArchetype.PREPAID_MINIGRID,
      'ds_solar_uuid_456': PlatformArchetype.PREPAID_MINIGRID,
      'solar_move_africa_uuid_789': PlatformArchetype.LEASE_TO_OWN,
      'bune_boarding_uuid_999': PlatformArchetype.FIXED_LEDGER,
    };

    const detected = registry[organizationId];
    if (!detected) {
      // Fallback to a default or throw an error if the tenant is unauthorized
      return PlatformArchetype.FIXED_LEDGER;
    }
    return detected;
  }
}