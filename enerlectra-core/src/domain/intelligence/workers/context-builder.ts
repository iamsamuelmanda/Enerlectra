// domains/intelligence/workers/context-builder.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface AutomatedContextSnapshot {
  customerRecord: any | null;
  transactionHistory: any[];
  systemAlerts: any[];
}

/**
 * Proactively captures and aggregates operational customer profiles, transactional histories,
 * and system alerts. 
 * 
 * NOTE: Supabase is now INJECTED, making this function pure and testable.
 */
export async function captureMessageContext(
  supabase: SupabaseClient, // Injected dependency
  rawMessageText: string, 
  senderPhone?: string
): Promise<AutomatedContextSnapshot> {
  const snapshot: AutomatedContextSnapshot = {
    customerRecord: null,
    transactionHistory: [],
    systemAlerts: [],
  };

  let targetIdentifier: string | null = null;

  // 1. Clean and standardize the channel's phone number
  if (senderPhone) {
    targetIdentifier = senderPhone.replace(/[\s\+\-\(\)]/g, '');
  }

  // 2. Override check for identifiers
  const extractedIdMatch = rawMessageText.match(/\b(2004\d{4}|\d{9,12})\b/);
  if (extractedIdMatch) {
    targetIdentifier = extractedIdMatch[0];
  }

  if (!targetIdentifier) {
    return snapshot;
  }

  try {
    // 3. Query the customer table
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .or(`meter_number.eq.${targetIdentifier},phone.eq.${targetIdentifier},phone.ilike.%${targetIdentifier}`)
      .maybeSingle();

    if (customerError) {
      console.error('[Supabase Customer Lookup Error]:', customerError);
      return snapshot;
    }

    if (customer) {
      snapshot.customerRecord = customer;

      // 4. Concurrent fetch for telemetry
      const [transactionsResult, alertsResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('meter_number', customer.meter_number)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('alerts')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(2)
      ]);

      if (transactionsResult.error) console.error('[Supabase Transactions Fetch Error]:', transactionsResult.error);
      else snapshot.transactionHistory = transactionsResult.data || [];

      if (alertsResult.error) console.error('[Supabase Alerts Fetch Error]:', alertsResult.error);
      else snapshot.systemAlerts = alertsResult.data || [];
    }
  } catch (databaseQueryError) {
    console.error('[Operational Context Aggregation Drop]:', databaseQueryError);
  }

  return snapshot;
}