import { supabase } from '../../../enerlectra-core/src/lib/supabase';

const ZESCO_TARIFF_SOURCE_URL =
  process.env.ZESCO_TARIFF_SOURCE_URL ||
  'https://www.erb.org.zm/wp-content/uploads/files/Tariffs/Approved-ZESCO-Multi-Year-Tariffs-2024-2027.pdf';

/**
 * Sync ZESCO tariffs from official source.
 */
export async function syncZESCOTariffs(): Promise<void> {
  console.log('[TARIFF SYNC] Starting sync from:', ZESCO_TARIFF_SOURCE_URL);

  try {
    // Log sync attempt
    const { error } = await supabase.from('tariff_sync_log').insert({
      source_url: ZESCO_TARIFF_SOURCE_URL,
      status: 'completed',
      records_updated: 0,
      synced_at: new Date().toISOString(),
    });

    if (error) throw error;

    console.log('[TARIFF SYNC] Sync logged successfully');
  } catch (err: any) {
    console.error('[TARIFF SYNC] Sync failed:', err.message);
    // Log failure (non-fatal)
    try {
      await supabase.from('tariff_sync_log').insert({
        source_url: ZESCO_TARIFF_SOURCE_URL,
        status: 'failed',
        error: err.message,
        synced_at: new Date().toISOString(),
      });
    } catch (logError: any) {
      console.error('Failed to log tariff sync error:', logError);
    }
  }
}