// enerlectra-core/src/core/handlers/resetmeter.types.ts

import type { MeterType } from '../../../services/ocr.types.js';

export const METER_TYPE_LABELS: Record<MeterType, string> = {
  grid_import: 'Grid Import',
  solar_import: 'Solar Import',
  solar_export: 'Solar Export',
  solar_generation: 'Solar Generation',
  generator: 'Generator',
  unit_submeter: 'Unit Submeter',
  unknown: 'Unknown',
};

export const ALLOWED_METER_TYPES: MeterType[] = [
  'grid_import',
  'solar_import',
  'solar_export',
  'solar_generation',
  'generator',
  'unit_submeter',
];

export type ResetStep = 'awaiting_meter_type' | 'awaiting_confirmation';

export interface ResetSession {
  step: ResetStep;
  selectedMeterType?: MeterType;
  clusterId?: string;
}

export interface ResetmeterStartResult {
  session: ResetSession;
  clusterId?: string;
  message: string;
  meterTypeOptions: { type: MeterType; label: string }[];
}

export interface ResetmeterSelectResult {
  session: ResetSession;
  message: string;
  meterType: MeterType;
}

export type ResetConfirmStatus =
  | 'SESSION_EXPIRED'
  | 'CANCELLED'
  | 'FAILED'
  | 'RECORDED';

export interface ResetmeterConfirmResult {
  status: ResetConfirmStatus;
  sessionCleared: boolean;
  message: string;
  clusterId?: string;
  meterType?: MeterType;
}