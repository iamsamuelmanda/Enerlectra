// enerlectra-core/src/core/handlers/history.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';

export interface HistoryItem {
  readingKwh: number;
  meterType: string;
  deltaKwh?: number | null;
  deltaLabel: string;
  dateLabel: string;
}

export interface HistoryResult {
  items: HistoryItem[];
  totalExport?: number;
  message: string;
}

/**
 * SHOW_HISTORY
 *
 * Previously: handleHistory(ctx: BotContext)
 */
export class ShowHistoryHandler implements CommandHandler {
  async execute(command: Command): Promise<HistoryResult> {
    const userId = command.context.actorId;

    const { data: readings, error } = await supabase
      .from('meter_readings')
      .select('reading_kwh, meter_type, captured_at, delta_kwh')
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .limit(5);

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch reading history');
      return {
        items: [],
        message: 'Unable to load history. Please try again.',
      };
    }

    if (!readings?.length) {
      return {
        items: [],
        message: 'No readings yet.',
      };
    }

    let totalExport = 0;
    const items: HistoryItem[] = [];

    for (const reading of readings as any[]) {
      const dateLabel = new Date(reading.captured_at).toLocaleDateString('en-GB');

      const deltaLabel = reading.delta_kwh
        ? `${reading.delta_kwh > 0 ? '+' : ''}${reading.delta_kwh} kWh`
        : 'baseline';

      const sanitizedMeterType = String(reading.meter_type).replace(/_/g, ' ');

      items.push({
        readingKwh: Number(reading.reading_kwh),
        meterType: sanitizedMeterType,
        deltaKwh: reading.delta_kwh ?? null,
        deltaLabel,
        dateLabel,
      });

      if (
        reading.delta_kwh &&
        reading.delta_kwh > 0 &&
        (reading.meter_type === 'solar_export' ||
          reading.meter_type === 'solar_generation')
      ) {
        totalExport += reading.delta_kwh;
      }
    }

    let msg = `*Recent Submissions*\n\n`;
    for (const item of items) {
      msg += `${item.readingKwh} kWh (${item.meterType}) - ${item.deltaLabel} - ${item.dateLabel}\n`;
    }

    if (totalExport > 0) {
      msg +=
        `\nTotal export: ${totalExport.toFixed(2)} kWh\n` +
        `Submit regularly to maximize earnings.`;
    }

    return {
      items,
      totalExport: totalExport > 0 ? totalExport : undefined,
      message: msg,
    };
  }
}