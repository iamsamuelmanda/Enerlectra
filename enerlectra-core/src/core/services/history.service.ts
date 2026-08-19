import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';

export interface MeterReading {
  reading_kwh: number;
  meter_type: string;
  captured_at: string;
  delta_kwh: number | null;
}

export async function getUserHistory(userId: string): Promise<MeterReading[]> {
  const { data: readings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, meter_type, captured_at, delta_kwh')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error({ error, userId }, 'History fetch failed');
    throw error;
  }

  return readings || [];
}