// integrations/telegram-bot/src/services/pcuMinting.ts
import { supabase } from '../lib/supabase';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const PCU_PER_KWH = parseFloat(process.env.PCU_PER_KWH || '1');
const MIN_DELTA_KWH = parseFloat(process.env.MIN_DELTA_KWH || '0.01');

export interface MeterReading {
  id: string;
  user_id: string;
  cluster_id: string;
  reading_kwh: number;
  meter_type: string;
  reporting_period: string;
  captured_at: string;
}

export async function mintPCUForExportReading(reading: MeterReading): Promise<void> {
  const eligibleTypes = ['solar_export', 'solar_generation'];
  if (!eligibleTypes.includes(reading.meter_type)) return;

  const { data: mintExists, error: mintLookupError } = await supabase
    .from('pcu_mints')
    .select('id')
    .eq('reading_id', reading.id)
    .maybeSingle();

  if (mintLookupError) {
    logger.error({ error: mintLookupError, readingId: reading.id }, 'Failed to check existing PCU mint');
    throw mintLookupError;
  }

  if (mintExists) {
    logger.info({ readingId: reading.id }, 'PCU already minted for this reading — skipping');
    return;
  }

  const { data: prevReading, error: prevError } = await supabase
    .from('meter_readings')
    .select('reading_kwh, captured_at')
    .eq('user_id', reading.user_id)
    .eq('cluster_id', reading.cluster_id)
    .eq('meter_type', reading.meter_type)
    .lt('captured_at', reading.captured_at)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevError) {
    logger.error({ error: prevError, readingId: reading.id }, 'Failed to fetch previous reading');
    throw prevError;
  }

  const prevKwh = prevReading?.reading_kwh ?? null;
  const deltaKwh = prevKwh !== null ? reading.reading_kwh - prevKwh : reading.reading_kwh;

  if (deltaKwh < MIN_DELTA_KWH) {
    logger.info({ readingId: reading.id, deltaKwh }, 'Delta below minimum — skipping mint');
    return;
  }

  const amountPcu = parseFloat((deltaKwh * PCU_PER_KWH).toFixed(4));
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from('pcu_mints').insert({
    reading_id: reading.id,
    user_id: reading.user_id,
    amount_pcu: amountPcu,
    status: 'completed',
    processed_at: now,
  });

  if (insertError) {
    if ((insertError as any).code === '23505') {
      logger.info({ readingId: reading.id }, 'PCU mint already exists — skipping');
      return;
    }
    logger.error({ error: insertError, readingId: reading.id }, 'Failed to record PCU mint');
    throw insertError;
  }

  const { data: currentBalance, error: balanceLookupError } = await supabase
    .from('pcu_balances')
    .select('balance_pcu, total_minted_pcu')
    .eq('user_id', reading.user_id)
    .maybeSingle();

  if (balanceLookupError) {
    logger.error({ error: balanceLookupError, readingId: reading.id }, 'Failed to fetch PCU balance');
    throw balanceLookupError;
  }

  const newBalance = parseFloat(((currentBalance?.balance_pcu ?? 0) + amountPcu).toFixed(4));
  const newTotalMinted = parseFloat(((currentBalance?.total_minted_pcu ?? 0) + amountPcu).toFixed(4));

  const { error: balanceError } = await supabase
    .from('pcu_balances')
    .upsert({
      user_id: reading.user_id,
      balance_pcu: newBalance,
      total_minted_pcu: newTotalMinted,
      updated_at: now,
    }, { onConflict: 'user_id' });

  if (balanceError) {
    logger.error({ error: balanceError, readingId: reading.id }, 'Failed to update PCU balance');
    throw balanceError;
  }

  logger.info({
    readingId: reading.id,
    userId: reading.user_id,
    deltaKwh,
    amountPcu,
    newBalance,
  }, 'PCU minted successfully');
}