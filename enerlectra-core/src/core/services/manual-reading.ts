// services/manual-reading.ts
import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';
import { validateReading } from './validation.js';
import { computeSettlementScore } from './settlementScore.js';
import { decideSettlement } from './settlementDecision.js';
import { calculateValue } from './tariff-calculator.js';
import { mintPCUForExportReading } from './pcuMinting.js';
import { requestLencoPayout } from './settlement.js';
import { getPhoneNumber, resolveCluster } from './cluster.js';
import { getCurrentPeriod } from './period.js';
import { generateReadingKey, maskPhone } from '../../utils/format.js';
import { MeterType } from './ocr.js'; // assume MeterType is defined in ocr or validation

/**
 * Process a manual meter reading (no photo). Returns a Markdown string to send back to the user.
 */
export async function processManualReading(
  userId: string,
  readingKwh: number,
  meterType: string
): Promise<string> {
  // 1. Resolve cluster
  const { clusterId, unitId } = await resolveCluster(userId);
  if (!clusterId) {
    return 'Join a community first. Use /clusters.';
  }

  // 2. Validate reading (confidence = 1.0 for manual)
  const validation = await validateReading({
    userId,
    clusterId,
    newKwh: readingKwh,
    confidence: 1.0,
    meterType: meterType as MeterType,
    requestId: 'manual-' + Date.now(),
    logger,
  });

  if (!validation.valid) {
    return `Rejected\n\n${validation.reason}`;
  }

  const v = validation as any; // cast to local type

  // 3. Settlement score
  const timeSinceLastReadingSec = (v.hoursSinceLastReading ?? 1) * 3600;
  const maxAllowedKwh = (getMeterRule(meterType) ?? 2.5) * (v.hoursSinceLastReading ?? 1);
  const scoreResult = computeSettlementScore({
    deltaKwh: v.delta ?? 0,
    timeSinceLastReadingSec,
    maxAllowedKwh,
    userTrustScore: 0.6,
    deviceConsistencyScore: 1.0,
  });
  const estimatedValue = (v.delta ?? 0) * 65;
  const decision = decideSettlement(scoreResult.score, estimatedValue);

  // 4. Insert reading record
  const period = getCurrentPeriod();
  const readingKey = generateReadingKey(userId, clusterId, meterType, period, readingKwh);
  const metadata: any = {};
  if (v.imageHash) metadata.image_hash = v.imageHash;

  const { data: reading, error: insertError } = await supabase
    .from('meter_readings')
    .insert({
      user_id: userId,
      cluster_id: clusterId,
      unit_id: unitId,
      reading_kwh: readingKwh,
      meter_type: meterType,
      validated: true,
      captured_at: new Date().toISOString(),
      reporting_period: period,
      source: 'manual',
      delta_kwh: v.delta ?? 0,
      reading_key: readingKey,
      status: 'active',
      metadata,
    })
    .select('*')
    .single();

  if (insertError) throw insertError;

  // 5. Handle PCU minting and value calculation (same as auto flow)
  const isExport = meterType === 'solar_export' || meterType === 'solar_generation';
  let valueMsg = isExport
    ? '\nExport baseline recorded. PCU earnings start on your next submission. Check /balance.'
    : '\nImport reading logged. No payout for consumption.';

  if (isExport && v.delta > 0) {
    try {
      await mintPCUForExportReading(reading);
      valueMsg = '\nPCUs minted for export. Check /balance.';
    } catch (err) {
      valueMsg = '\nExport reading saved, PCU wallet update pending.';
    }
  }

  if (decision === 'INSTANT' && v.delta && v.delta > 0) {
    const phone = await getPhoneNumber(userId);
    if (phone) {
      try {
        const value = await calculateValue(
          v.delta,
          meterType as MeterType,
          userId,
          clusterId,
          'manual',
          logger,
          { consentGiven: true }
        );
        if (value.netValue >= 1) {
          const payout = await requestLencoPayout({
            userId,
            clusterId,
            readingId: reading.id,
            amount: value.netValue,
            phoneNumber: phone,
            narration: `Manual credit – ${v.delta.toFixed(2)} kWh`,
          }, logger);
          valueMsg += `\nValue: K${value.netValue.toFixed(2)}\nPayout: K${value.netValue.toFixed(2)}\nTo: ${maskPhone(phone)}\nRef: ${payout.reference}`;
        } else {
          valueMsg += `\nValue: K${value.netValue.toFixed(2)} – below K1 threshold.`;
        }
      } catch (err) {
        valueMsg += '\nValue calculation unavailable.';
      }
    } else {
      valueMsg += '\nRegister your number to receive payouts: /register';
    }
  } else if (decision === 'REVIEW') {
    valueMsg += '\n\nStatus: Under review – high confidence reading required for instant payout.';
  } else if (decision === 'REJECT') {
    valueMsg = '\nReading rejected by settlement scoring.';
  }

  const deltaText = v.delta !== null
    ? `${v.delta > 0 ? '+' : ''}${v.delta.toFixed(2)} kWh`
    : 'First reading';

  return (
    `*Reading accepted*\n\n` +
    `Meter: ${readingKwh.toFixed(2)} kWh\n` +
    `Previous: ${v.prevKwh?.toFixed(2) ?? 'N/A'}\n` +
    `Change: ${deltaText}\n` +
    `Type: ${meterType.replace(/_/g, ' ')}\n` +
    `Community: \`${clusterId}\`\n` +
    `Period: ${period}\n` +
    valueMsg
  );
}

function getMeterRule(meterType: string): number {
  const rules: Record<string, number> = {
    grid_import: 2.5,
    solar_import: 1.5,
    solar_export: 20,
    solar_generation: 20,
    generator: 5,
    unit_submeter: 1,
    unknown: 2.5,
  };
  return rules[meterType] ?? 2.5;
}

