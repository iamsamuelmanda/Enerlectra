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

interface PcuBalanceSnapshot {
  balancePcu: number;
  totalMintedPcu: number;
}

async function ensurePcuBalanceRow(userId: string, now: string): Promise<PcuBalanceSnapshot> {
  const { data: currentBalance, error: balanceLookupError } = await supabase
    .from('pcu_balances')
    .select('balance_pcu, total_minted_pcu')
    .eq('user_id', userId)
    .maybeSingle();

  if (balanceLookupError) {
    logger.error({ error: balanceLookupError, userId }, 'Failed to fetch PCU balance');
    throw balanceLookupError;
  }

  const balancePcu = parseFloat(((currentBalance?.balance_pcu ?? 0) as number).toFixed(4));
  const totalMintedPcu = parseFloat(((currentBalance?.total_minted_pcu ?? 0) as number).toFixed(4));

  if (!currentBalance) {
    const { error: createBalanceError } = await supabase
      .from('pcu_balances')
      .upsert(
        {
          user_id: userId,
          balance_pcu: balancePcu,
          total_minted_pcu: totalMintedPcu,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      );

    if (createBalanceError) {
      logger.error({ error: createBalanceError, userId }, 'Failed to create PCU balance row');
      throw createBalanceError;
    }
  }

  return { balancePcu, totalMintedPcu };
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

  const now = new Date().toISOString();
  const balanceSnapshot = await ensurePcuBalanceRow(reading.user_id, now);

  const prevKwh = prevReading?.reading_kwh ?? null;
  if (prevKwh === null) {
    logger.info(
      { readingId: reading.id, userId: reading.user_id, readingKwh: reading.reading_kwh },
      'Export baseline recorded; wallet ensured without mint'
    );
    return;
  }

  const deltaKwh = reading.reading_kwh - prevKwh;

  if (deltaKwh < MIN_DELTA_KWH) {
    logger.info({ readingId: reading.id, deltaKwh }, 'Delta below minimum — skipping mint');
    return;
  }

  const amountPcu = parseFloat((deltaKwh * PCU_PER_KWH).toFixed(4));

  const { error: insertError } = await supabase.from('pcu_mints').insert({
    reading_id:   reading.id,
    user_id:      reading.user_id,
    amount_pcu:   amountPcu,
    status:       'completed',
    processed_at: now,
    metadata:     {},
    updated_at:   now, 
  });

  if (insertError) {
    if ((insertError as any).code === '23505') {
      logger.info({ readingId: reading.id }, 'PCU mint already exists — skipping');
      return;
    }
    logger.error({ error: insertError, readingId: reading.id }, 'Failed to record PCU mint');
    throw insertError;
  }

  const newBalance = parseFloat((balanceSnapshot.balancePcu + amountPcu).toFixed(4));
  const newTotalMinted = parseFloat((balanceSnapshot.totalMintedPcu + amountPcu).toFixed(4));

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

export async function backfillPCUWalletForUser(userId: string): Promise<void> {
  const { data: readings, error } = await supabase
    .from('meter_readings')
    .select('id, user_id, cluster_id, reading_kwh, meter_type, reporting_period, captured_at')
    .eq('user_id', userId)
    .in('meter_type', ['solar_export', 'solar_generation'])
    .eq('status', 'active')
    .order('captured_at', { ascending: true });

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch readings for PCU wallet backfill');
    throw error;
  }

  if (!readings?.length) {
    return;
  }

  for (const reading of readings as MeterReading[]) {
    await mintPCUForExportReading(reading);
  }
}
