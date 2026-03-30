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
  gridRate?: number;    // ZMW per kWh (Zambia Grid Standard)
  solarRate?: number;   // ZMW per kWh (Discounted Clean Rate)
}

/**
 * The Brain of Enerlectra:
 * Reconciles physical meter data against financial ownership snapshots.
 * Determines how much solar credit an investor gets vs how much grid debt a user owes.
 */
export function reconcileEnergyAllocation(input: ReconciliationInput): ReconciliationResult {
  const { 
    readings, 
    ownership, 
    clusterId, 
    period,
    gridRate = 0.17, // Defaults to standard Zambian low-voltage rates
    solarRate = 0.05  // Incentivized solar rate
  } = input;

  // 1. Extract Anchors (Physical Truth)
  const gridReading = readings.find(r => r.meterType === 'grid');
  const solarReading = readings.find(r => r.meterType === 'solar');
  const unitReadings = readings.filter(r => r.meterType === 'unit');

  // If a main grid meter is missing, sum the individual units as a fallback
  const gridTotal = gridReading?.readingKwh || sumReadings(unitReadings);
  const solarTotal = solarReading?.readingKwh || 0;

  // 2. Calculate Energy Flows
  const consumption = gridTotal;
  const solarSelfConsumed = Math.min(solarTotal, consumption);
  const gridPurchased = Math.max(0, consumption - solarTotal);

  // 3. Prepare ownership entries for the distribution engine
  const ownershipEntries = ownership.map(o => ({
    userId: o.userId,
    pct: o.ownershipPct
  }));

  // 4. Allocate Solar "Profit" based on Financial Ownership %
  const solarDistribution = distributeOutcome(
    ownershipEntries,
    solarSelfConsumed
  );

  // 5. Map individual consumption to Unit IDs
  const consumptionMap = new Map<string, number>();
  
  if (unitReadings.length > 0) {
    unitReadings.forEach(r => {
      consumptionMap.set(r.unitId, r.readingKwh);
    });
  } else {
    // Fallback: If no unit meters, assume consumption matches ownership share
    solarDistribution.forEach(s => {
      consumptionMap.set(s.userId, s.allocatedKwh);
    });
  }

  // 6. Calculate Financial Shares (ZMW Settlement)
  const unitShares: UnitEnergyShare[] = solarDistribution.map(solar => {
    const actualConsumed = consumptionMap.get(solar.userId) || solar.allocatedKwh;
    
    // Logic: Grid is used only after personal solar allocation is exhausted
    const gridAllocated = Math.max(0, actualConsumed - solar.allocatedKwh);
    const surplusDeficit = solar.allocatedKwh - actualConsumed;
    
    // Financial translation
    const solarCredit = solar.allocatedKwh * solarRate;
    const gridCharge = gridAllocated * gridRate;
    
    return {
      userId: solar.userId,
      unitId: solar.userId, // Using userId as unitId reference for this cycle
      ownershipPct: solar.ownershipPct,
      actualKwh: actualConsumed,
      solarAllocationKwh: solar.allocatedKwh,
      gridAllocationKwh: gridAllocated,
      gridSurplusDeficit: surplusDeficit,
      solarCredit,
      gridCharge,
      netAmount: gridCharge - solarCredit // The final billable/payable amount
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

/**
 * Utility: Accumulates readings for a collection of meters
 */
function sumReadings(readings: MeterReading[]): number {
  return readings.reduce((sum, r) => sum + (Number(r.readingKwh) || 0), 0);
}