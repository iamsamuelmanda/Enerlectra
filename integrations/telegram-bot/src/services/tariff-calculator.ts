// services/tariff-calculator.ts
import { supabase } from '../lib/supabase';
import type { MeterType } from './ocr';
import type { Logger } from 'pino';

export interface ValueEstimate {
  grossValue: number;
  physicsAdjustedValue: number;
  netValue: number;
  effectiveRate: number;
  tariffCode: string;
  bandBreakdown: Array<{
    band_name: string;
    kwh: number;
    rate_kz: number;
    vat_rate: number;
    cost_kz: number;
  }>;
  disclaimer: string;
}

export async function calculateValue(
  deltaKwh: number,
  meterType: MeterType,
  userId: string,
  clusterId: string,
  requestId: string | undefined,
  logger: Logger,
  options?: { consentGiven: boolean; temperatureC?: number }
): Promise<ValueEstimate> {
  const log = logger.child({ requestId, userId, clusterId, meterType, deltaKwh });

  if (deltaKwh <= 0) {
    log.info('Zero or negative delta – no value calculated');
    return {
      grossValue: 0,
      physicsAdjustedValue: 0,
      netValue: 0,
      effectiveRate: 0,
      tariffCode: 'none',
      bandBreakdown: [],
      disclaimer: 'No consumption change detected.',
    };
  }

  // Physics adjustment
  let adjustedKwh = deltaKwh;
  if (meterType === 'solar_generation' && options?.temperatureC) {
    const tempCoeff = -0.004;
    const tempDelta = options.temperatureC - 25;
    adjustedKwh = deltaKwh * (1 + tempCoeff * tempDelta);
  } else if (meterType === 'grid_import' || meterType === 'solar_import') {
    adjustedKwh = deltaKwh * 1.05; // 5% losses
  }

  // Call PostgreSQL banded tariff function
  const { data, error } = await supabase.rpc('calculate_banded_rate', {
    p_user_id: userId,
    p_cluster_id: clusterId,
    p_at: new Date().toISOString(),
    p_delta_kwh: adjustedKwh,
    p_meter_type: meterType,
  });

  if (error) {
    log.error({ error }, 'Banded rate calculation failed');
    throw new Error(`Tariff calculation error: ${error.message}`);
  }

  const banded = data as {
    tariff_code: string;
    category: string;
    effective_rate_kz: number;
    total_cost_kz: number;
    total_kwh: number;
    bands: Array<{
      band_name: string;
      kwh: number;
      rate_kz: number;
      vat_rate: number;
      cost_kz: number;
    }>;
  };

  const grossValue = banded.total_cost_kz;
  const netValue = grossValue;

  const result: ValueEstimate = {
    grossValue: Number(grossValue.toFixed(2)),
    physicsAdjustedValue: Number(adjustedKwh.toFixed(3)),
    netValue: Number(netValue.toFixed(2)),
    effectiveRate: Number(banded.effective_rate_kz.toFixed(4)),
    tariffCode: banded.tariff_code,
    bandBreakdown: banded.bands,
    disclaimer: 'Estimates based on published ZESCO/ERB tariffs. Actual bill may differ due to tiered blocks, taxes, or regulatory changes.',
  };

  // Audit log
  if (options?.consentGiven) {
    const { error: auditError } = await supabase.from('energy_value_audits').insert({
      user_id: userId,
      cluster_id: clusterId,
      meter_type: meterType,
      raw_kwh: deltaKwh,
      delta_kwh: deltaKwh,
      gross_value_zmw: result.grossValue,
      physics_adjusted_kwh: adjustedKwh,
      net_value_zmw: result.netValue,
      tariff_params: banded,
      consent_given: true,
      temperature_c: options.temperatureC,
      request_id: requestId,
    });
    if (auditError) log.error({ error: auditError }, 'Failed to write audit log');
  }

  log.info({ result }, 'Value calculated');
  return result;
}

// Helper to get user consent from public.users
export async function getUserConsent(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('consent_given')
    .eq('id', userId)
    .single();

  if (error) {
    // User row might not exist yet
    return false;
  }
  return data?.consent_given ?? false;
}