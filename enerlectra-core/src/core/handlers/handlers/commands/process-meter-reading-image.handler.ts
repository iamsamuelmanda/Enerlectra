// enerlectra-core/src/core/handlers/handlers/commands/process-meter-reading-image.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';
import { readMeterOCR } from '../../../services/ocr.js';
import { validateReading } from '../../../services/validation.js';
import { resolveCluster } from '../../../services/resolve-user.js';
import { getCurrentPeriod } from '../../../services/period.js';
import { generateReadingKey } from '../../../../utils/format.js';
import { mintPCUForExportReading } from '../../../services/pcuMinting.js';

export interface ProcessMeterReadingImageResult {
  message: string;
}

/**
 * PROCESS_METER_READING_IMAGE
 *
 * Handles an incoming meter photo: runs OCR, validates the reading,
 * persists it, and mints PCU for export readings.
 */
export class ProcessMeterReadingImageHandler implements CommandHandler {
  async execute(command: Command): Promise<ProcessMeterReadingImageResult> {
    const userId = command.context.actorId;
    const payload = command.payload as any;

    const media = Array.isArray(payload?.media) ? payload.media : [];
    const image = media.find((m: any) => m?.type === 'image' && m?.url);
    const imageUrl = image?.url ?? payload?.imageUrl;

    if (!imageUrl) {
      return {
        message: 'No image received. Send a photo of your meter, or use /read <kWh> [type] for manual entry.',
      };
    }

    // 1. OCR the image
    const ocrResult = await readMeterOCR(imageUrl, {
      requestId: `image-${Date.now()}`,
    });

    if (ocrResult.status === 'failed' || ocrResult.status === 'manual_required') {
      return {
        message: ocrResult.error ?? 'Unable to read the meter photo. Please retake with better lighting or use /read <kWh> [type].',
      };
    }

    if (ocrResult.kwh === null) {
      return {
        message: 'No reading detected in the photo. Please retake with better lighting or use /read <kWh> [type].',
      };
    }

    // 2. Resolve cluster
    const { clusterId, unitId } = await resolveCluster(userId);
    if (!clusterId) {
      return { message: 'Join a community first. Use /clusters.' };
    }

    // 3. Validate reading
    const validation = await validateReading({
      userId,
      clusterId,
      newKwh: ocrResult.kwh,
      confidence: ocrResult.confidence,
      meterType: ocrResult.meterType,
      imageUrl,
      requestId: `image-${Date.now()}`,
      logger,
    });

    if (!validation.valid) {
      return { message: `Rejected\n\n${validation.reason}` };
    }

    const v = validation as any;

    // 4. Insert reading record
    const period = getCurrentPeriod();
    const readingKey = generateReadingKey(userId, clusterId, ocrResult.meterType, period, ocrResult.kwh);
    const metadata: any = {
      ocr_confidence: ocrResult.confidence,
      ocr_source: ocrResult.source,
      ocr_raw_text: ocrResult.rawText,
    };
    if (v.imageHash) metadata.image_hash = v.imageHash;

    const { data: reading, error: insertError } = await supabase
      .from('meter_readings')
      .insert({
        user_id: userId,
        cluster_id: clusterId,
        unit_id: unitId,
        reading_kwh: ocrResult.kwh,
        meter_type: ocrResult.meterType,
        validated: true,
        captured_at: new Date().toISOString(),
        reporting_period: period,
        source: 'ocr',
        delta_kwh: v.delta ?? 0,
        reading_key: readingKey,
        status: 'active',
        metadata,
      })
      .select('*')
      .single();

    if (insertError) {
      logger.error({ insertError, userId }, 'Failed to insert OCR reading');
      return { message: 'An error occurred while saving your reading. Please try again.' };
    }

    // 5. Mint PCU for export readings
    const isExport = ocrResult.meterType === 'solar_export' || ocrResult.meterType === 'solar_generation';
    let valueMsg = isExport
      ? '\nExport baseline recorded. PCU earnings start on your next submission. Check /balance.'
      : '\nImport reading logged. No payout for consumption.';

    if (isExport && v.delta > 0) {
      try {
        await mintPCUForExportReading(reading);
        valueMsg = '\nPCUs minted for export. Check /balance.';
      } catch (err) {
        logger.error({ err, userId }, 'PCU minting failed for OCR reading');
        valueMsg = '\nExport reading saved, PCU wallet update pending.';
      }
    }

    const deltaText = v.delta !== null
      ? `${v.delta > 0 ? '+' : ''}${v.delta.toFixed(2)} kWh`
      : 'First reading';

    return {
      message:
        `*Reading accepted*\n\n` +
        `Meter: ${ocrResult.kwh.toFixed(2)} kWh\n` +
        `Previous: ${v.prevKwh?.toFixed(2) ?? 'N/A'}\n` +
        `Change: ${deltaText}\n` +
        `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
        `Community: \`${clusterId}\`\n` +
        `Period: ${period}\n` +
        valueMsg,
    };
  }
}