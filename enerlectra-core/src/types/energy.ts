// enerlectra-core/src/types/energy.ts

export interface MeterReading {
  id?: string;
  clusterId: string;
  unitId: string;
  userId: string;
  readingKwh: number;
  meterType: 'grid' | 'solar' | 'unit';
  photoUrl?: string;
  ocrConfidence?: number;
  capturedAt?: string;
  reportingPeriod: string;
  source: 'telegram' | 'manual' | 'iot';
  validated?: boolean;
}

export interface EnergyAllocation {
  clusterId: string;
  period: string;
  gridTotalKwh: number;
  solarTotalKwh: number;
  solarSelfConsumed: number;
  gridPurchased: number;
}

export interface UnitEnergyShare {
  userId: string;
  unitId: string;
  ownershipPct: number;
  actualKwh: number;
  solarAllocationKwh: number;
  gridAllocationKwh: number;
  gridSurplusDeficit: number;
  solarCredit: number;
  gridCharge: number;
  netAmount: number;
}

export interface ReconciliationResult {
  allocation: EnergyAllocation;
  unitShares: UnitEnergyShare[];
}
