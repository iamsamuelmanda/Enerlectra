# Production Verification & Analytics

Complete guide to production verification, validation, and analytics in Enerlectra Core.

---

## **Overview**

Production verification ensures that meter readings and production reports are accurate before they enter the settlement cycle. This prevents:

- ❌ Fraudulent data (inflated readings)
- ❌ Meter errors (faulty equipment)
- ❌ Data corruption (transmission errors)
- ❌ Impossible values (exceeding capacity)

**Key principle:** Verify first, settle second.

---

## **Components**

### **1. ProductionVerifier**

Validates individual production reports.

```typescript
import { ProductionVerifier } from '@enerlectra/core';

const verifier = new ProductionVerifier();
```

**Methods:**

- `verify()` — Full validation with errors/warnings
- `autoVerify()` — Auto-approve if confidence threshold met
- `detectAnomalies()` — Find suspicious patterns in historical data

### **2. ProductionAggregate**

Aggregates and analyzes production over time.

```typescript
import { ProductionAggregate } from '@enerlectra/core';

const aggregate = new ProductionAggregate();
```

**Methods:**

- `aggregateDaily()` — Convert to daily summaries
- `aggregateWeekly()` — Weekly rollups
- `aggregateMonthly()` — Monthly rollups
- `calculateStats()` — Comprehensive statistics
- `predictProduction()` — Simple forecasting
- `compareToTarget()` — Performance tracking

---

## **Usage Examples**

### **Example 1: Basic Validation**

```typescript
import { ProductionVerifier } from '@enerlectra/core';

const verifier = new ProductionVerifier();

const report = {
  cluster_id: 'cluster-123',
  settlement_date: '2026-02-25',
  kwh_reported: 22.5,
  kwh_verified: 22.0,
  timestamp: new Date()
};

const capacity = {
  cluster_id: 'cluster-123',
  rated_capacity_kw: 5,
  max_daily_kwh: 120,
  expected_daily_kwh: 22.5
};

const result = verifier.verify(report, capacity);

console.log(result);
// {
//   valid: true,
//   errors: [],
//   warnings: [],
//   verified_kwh: 22.0
// }
```

---

### **Example 2: Auto-Verification**

```typescript
const auto_result = verifier.autoVerify(
  report,
  capacity,
  historical_avg,
  0.9 // 90% confidence threshold
);

if (auto_result.auto_approved) {
  // Proceed to settlement
  await runDailySettlement(supabase, {
    production_report: {
      kwh_verified: auto_result.verified_kwh,
      // ...
    }
  });
} else {
  // Flag for manual review
  console.log('Manual review required:', auto_result.reason);
}
```

---

### **Example 3: Anomaly Detection**

```typescript
const anomalies = verifier.detectAnomalies(
  last_30_days_reports,
  capacity
);

console.log(anomalies);
// {
//   suspicious_patterns: [
//     "Production is suspiciously consistent...",
//     "Always at max capacity..."
//   ],
//   anomaly_score: 0.7  // 70% suspicious
// }

if (anomalies.anomaly_score > 0.5) {
  // Trigger audit
}
```

---

### **Example 4: Historical Analytics**

```typescript
import { ProductionAggregate } from '@enerlectra/core';

const aggregate = new ProductionAggregate();

// Get 30-day statistics
const stats = aggregate.calculateStats(
  'cluster-123',
  last_30_days,
  rated_capacity_kw
);

console.log(stats);
// {
//   total_kwh: 675,
//   avg_kwh_per_day: 22.5,
//   max_kwh_day: 28.3,
//   avg_capacity_factor: 0.19,
//   uptime_percentage: 96.7
// }
```

---

### **Example 5: Performance Tracking**

```typescript
const comparison = aggregate.compareToTarget(
  stats,
  8000 // Target: 8000 kWh/year
);

console.log(comparison);
// {
//   on_track: true,
//   projected_annual_kwh: 8212,
//   vs_target_percentage: 102.6,
//   days_ahead_or_behind: 9.5
// }

// System is 9.5 days ahead of target pace!
```

---

## **Validation Checks**

### **1. Sanity Checks**

✅ Non-negative values
✅ Verified ≤ Reported
✅ Values within reasonable range

### **2. Capacity Checks**

✅ Production ≤ Theoretical maximum (24h × capacity)
✅ Not exceeding physical limits by 50%+

### **3. Historical Comparison**

✅ Deviation < 50% from average (warning)
✅ Deviation < 200% from average (error)

### **4. Meter Consistency**

✅ Meter readings increasing
✅ Meter delta = reported kWh

### **5. Verification Loss**

✅ Loss < 5% (typical)
✅ Loss < 15% (acceptable)
✅ Loss > 15% (error)

### **6. Zero Production**

⚠️ Warning if zero production reported

---

## **Anomaly Detection**

Detects suspicious patterns:

### **Pattern 1: Suspiciously Consistent**

Real solar varies 15-30% daily. If coefficient of variation < 5%, data may be fabricated.

### **Pattern 2: Always at Capacity**

Real systems rarely hit theoretical maximum. If >70% of days at max capacity → suspicious.

### **Pattern 3: No Weather Variation**

Weekday and weekend production should differ due to weather patterns. Identical averages → suspicious.

---

## **Integration with Settlement**

### **Recommended Flow:**

```typescript
// 1. Receive production report
const report = await getMeterReading(cluster_id, date);

// 2. Verify
const verifier = new ProductionVerifier();
const verification = verifier.autoVerify(
  report,
  cluster_capacity,
  historical_avg,
  0.9
);

// 3. Decision
if (verification.auto_approved) {
  // Auto-approve and settle
  await runDailySettlement(supabase, {
    production_report: {
      kwh_verified: verification.verified_kwh,
      // ...
    }
  });
} else {
  // Manual review required
  await flagForReview({
    cluster_id,
    date,
    reason: verification.reason,
    confidence: verification.confidence
  });
}
```

---

## **Capacity Factor**

**Definition:** Actual production / Theoretical maximum

```
Capacity Factor = kWh produced / (rated_capacity_kw × 24 hours)
```

**Typical values:**

- 15-20%: Good for solar in Zambia (4-5 peak sun hours)
- 10-15%: Acceptable (cloudy season, shading)
- <10%: Poor (equipment issues, heavy shading)
- >25%: Excellent (or suspicious if consistently high)

---

## **Forecasting**

Simple moving average predictor:

```typescript
const forecast = aggregate.predictProduction(
  last_14_days,
  7 // Forecast next 7 days
);

console.log(forecast);
// [
//   { date: '2026-03-01', predicted_kwh: 22.5, confidence: 0.85 },
//   { date: '2026-03-02', predicted_kwh: 22.5, confidence: 0.85 },
//   ...
// ]
```

Use for:
- Planning maintenance windows
- Estimating contributor payouts
- Detecting underperformance early

---

## **API Reference**

### **ProductionVerifier**

#### `verify(report, capacity, historical_avg?)`

Returns:
```typescript
{
  valid: boolean;
  errors: string[];
  warnings: string[];
  verified_kwh: number;
}
```

#### `autoVerify(report, capacity, historical_avg?, threshold?)`

Returns:
```typescript
{
  auto_approved: boolean;
  verified_kwh: number;
  confidence: number; // 0-1
  requires_manual_review: boolean;
  reason?: string;
}
```

#### `detectAnomalies(reports, capacity)`

Returns:
```typescript
{
  suspicious_patterns: string[];
  anomaly_score: number; // 0-1, higher = more suspicious
}
```

---

### **ProductionAggregate**

#### `calculateStats(cluster_id, reports, rated_capacity_kw)`

Returns:
```typescript
{
  cluster_id: string;
  period_start: string;
  period_end: string;
  total_kwh: number;
  avg_kwh_per_day: number;
  max_kwh_day: number;
  min_kwh_day: number;
  avg_capacity_factor: number;
  uptime_days: number;
  total_days: number;
  uptime_percentage: number;
}
```

#### `aggregateWeekly(daily_data)`

Returns:
```typescript
WeeklyAggregate[] = [{
  week_start: string;
  week_end: string;
  total_kwh: number;
  avg_daily_kwh: number;
  days_reported: number;
  avg_capacity_factor: number;
}]
```

#### `compareToTarget(stats, target_annual_kwh)`

Returns:
```typescript
{
  on_track: boolean;
  projected_annual_kwh: number;
  vs_target_percentage: number;
  days_ahead_or_behind: number;
}
```

---

## **Best Practices**

### **1. Always verify before settlement**

Never settle without verification. Fraud is expensive.

### **2. Use historical averages**

Compare against last 30 days for context.

### **3. Set appropriate thresholds**

- High-stakes: 95% confidence threshold
- Standard: 90% confidence threshold
- Experimental: 80% confidence threshold

### **4. Monitor anomaly scores**

Run `detectAnomalies()` weekly. Score >0.5 → investigate.

### **5. Track capacity factor**

Trending downward → equipment degradation, schedule maintenance.

### **6. Archive validation results**

Store verification results in database for audit trail.

---

## **Common Scenarios**

### **Scenario: Meter Replaced**

**Problem:** New meter starts at 0, old meter was at 50,000

**Solution:** 
- Detect negative meter delta
- Flag for manual review
- Operator updates baseline

### **Scenario: Weather Event**

**Problem:** Cyclone → 3 days of zero production

**Solution:**
- Zero production triggers warning (not error)
- Historical comparison shows deviation
- Auto-approve with low confidence
- Operator confirms weather event

### **Scenario: Equipment Failure**

**Problem:** Inverter fails → production drops 80%

**Solution:**
- Deviation from historical average triggers warning
- Capacity factor drops to <5%
- System flags for maintenance
- Operator dispatches technician

### **Scenario: Fraudulent Data**

**Problem:** Someone reports 150 kWh from 5 kW system

**Solution:**
- Exceeds theoretical maximum → error
- Auto-verification rejects
- Flagged for manual review
- Operator investigates

---

## **See Also**

- [examples/production-verification-example.ts](../examples/production-verification-example.ts) — Complete working example
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System design
- [README.md](../README.md) — Main documentation

---

**Production verification is the first line of defense against bad data entering your settlement system. Use it!** 🛡️