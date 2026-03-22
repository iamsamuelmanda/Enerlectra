// enerlectra-core/src/engines/reconciliation.ts
import { distributeOutcome } from './distribution';
import { 
  MeterReading, 
  EnergyAllocation, 
  UnitEnergyShare,
  ReconciliationResult 
} from '../types/energy';

interface ReconciliationInput {
  readings: MeterReading[];
  ownership: Array<{ userId: string; ownershipPct: number }>;
  clusterId: string;
  period: string;
  gridRate?: number;    // ZMW per kWh
  solarRate?: number;   // ZMW per kWh
}

export function reconcileEnergyAllocation(input: ReconciliationInput): ReconciliationResult {
  const { 
    readings, 
    ownership, 
    clusterId, 
    period,
    gridRate = 0.17,
    solarRate = 0.05
  } = input;

  // 1. Extract anchors
  const gridReading = readings.find(r => r.meterType === 'grid');
  const solarReading = readings.find(r => r.meterType === 'solar');
  const unitReadings = readings.filter(r => r.meterType === 'unit');

  const gridTotal = gridReading?.readingKwh || sumReadings(unitReadings);
  const solarTotal = solarReading?.readingKwh || 0;

  // 2. Calculate energy flows
  const consumption = gridTotal;
  const solarSelfConsumed = Math.min(solarTotal, consumption);
  const gridPurchased = Math.max(0, consumption - solarTotal);

  // 3. Prepare ownership entries for distribution engine
  const ownershipEntries = ownership.map(o => ({
    userId: o.userId,
    pct: o.ownershipPct
  }));

  // 4. Allocate solar based on financial ownership
  const solarDistribution = distributeOutcome(
    ownershipEntries,
    solarSelfConsumed
  );

  // 5. Map consumptions
  const consumptionMap = new Map<string, number>();
  
  if (unitReadings.length > 0) {
    unitReadings.forEach(r => {
      consumptionMap.set(r.unitId, r.readingKwh);
    });
  } else {
    // Fallback: assume equal to solar allocation
    solarDistribution.forEach(s => {
      consumptionMap.set(s.userId, s.allocatedKwh);
    });
  }

  // 6. Calculate shares
  const unitShares: UnitEnergyShare[] = solarDistribution.map(solar => {
    const actualConsumed = consumptionMap.get(solar.userId) || solar.allocatedKwh;
    const gridAllocated = Math.max(0, actualConsumed - solar.allocatedKwh);
    const surplusDeficit = solar.allocatedKwh - actualConsumed;
    
    const solarCredit = solar.allocatedKwh * solarRate;
    const gridCharge = gridAllocated * gridRate;
    
    return {
      userId: solar.userId,
      unitId: solar.userId, // Map appropriately
      ownershipPct: solar.ownershipPct,
      actualKwh: actualConsumed,
      solarAllocationKwh: solar.allocatedKwh,
      gridAllocationKwh: gridAllocated,
      gridSurplusDeficit: surplusDeficit,
      solarCredit,
      gridCharge,
      netAmount: gridCharge - solarCredit
    };
  });

  return {
    allocation: {
      clusterId,
      period,
      gridTotalKwh: gridTotal,
      solarTotalKwh: solarTotal,
      solarSelfConsumed,
      gridPurchased
    },
    unitShares
  };
}

function sumReadings(readings: MeterReading[]): number {
  return readings.reduce((sum, r) => sum + (r.readingKwh || 0), 0);
}
