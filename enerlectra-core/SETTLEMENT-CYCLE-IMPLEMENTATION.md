# Settlement Cycle Implementation - Production Grade

**Enerlectra Core now has infrastructure-grade settlement logic with BigInt arithmetic and cryptographic integrity.**

---

## **What You Now Have**

### **Before:**
- ✅ Ledger exists
- ✅ Hash chain implemented
- ❌ **But:** Settlement used floats (precision loss risk)
- ❌ **But:** No type safety (could mix units)
- ❌ **But:** No deterministic hash computation

### **After:**
- ✅ **BigInt-based arithmetic** (exact, no precision loss)
- ✅ **Branded types** (compile-time unit safety)
- ✅ **Deterministic hashing** (canonical serialization)
- ✅ **State machine enforcement** (no illegal transitions)
- ✅ **Invariant validation** (zero tolerance)

---

## **Architecture**

```
Settlement Cycle System:
┌─────────────────────────────────────────────────────┐
│ settlement-types.ts                                 │
│ ├─ Branded BigInt types (Ngwee, WattHours)        │
│ ├─ Type-safe arithmetic operations                 │
│ └─ Conversion & formatting utilities               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ settlement-cycle-hardened.ts                        │
│ ├─ SettlementCycle data model                      │
│ ├─ BuyerObligation & ContributorEntitlement        │
│ ├─ Serialization (BigInt → string)                 │
│ └─ Deserialization (string → BigInt)               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ settlement-invariants.ts                            │
│ ├─ Energy conservation (Σ buyer = Σ contributor)   │
│ ├─ Monetary conservation (exact equality)          │
│ ├─ Fee accounting (gross = net + fees)             │
│ └─ Non-negative validation                         │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ settlement-hash.ts                                  │
│ ├─ Canonical serialization (sorted, deterministic) │
│ ├─ SHA-256 hash computation                        │
│ ├─ Hash chain verification                         │
│ └─ Merkle root computation                         │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ settlement-finalization.ts                          │
│ ├─ State machine (OPEN → FINALIZED)                │
│ ├─ Transition enforcement (no skipping)            │
│ ├─ Finalization orchestrator                       │
│ └─ Integrity verification                          │
└─────────────────────────────────────────────────────┘
```

---

## **Type Safety: Branded BigInt**

### **The Problem:**
```typescript
// Without branded types - BAD
function transfer(amount: bigint) {
  // Is this ngwee or watt-hours?
  // Compiler can't help you!
}

transfer(100n); // Bug: passed watt-hours instead of ngwee
```

### **The Solution:**
```typescript
// With branded types - GOOD
import { Ngwee, WattHours, ngwee, wattHours } from '@enerlectra/core';

function transfer(amount: Ngwee) {
  // Type system enforces this is ngwee
}

const energy: WattHours = wattHours(100n);
transfer(energy); // ❌ Compile error - can't pass WattHours as Ngwee
transfer(ngwee(100n)); // ✅ Correct
```

---

## **Exact Arithmetic**

### **With JavaScript `number` (WRONG):**
```javascript
let total = 0;
for (let i = 0; i < 1000000; i++) {
  total += 0.01; // Add 1 cent, 1 million times
}
console.log(total); // Expected: 10000.00
// Actual: 9999.999999998 or 10000.000000002
// ❌ DRIFT
```

### **With BigInt (CORRECT):**
```typescript
import { Ngwee, ngwee, addNgwee, ZERO_NGWEE } from '@enerlectra/core';

let totalNgwee: Ngwee = ZERO_NGWEE;
for (let i = 0; i < 1000000; i++) {
  totalNgwee = addNgwee(totalNgwee, ngwee(1n)); // Add 1 ngwee
}
console.log(totalNgwee); // ALWAYS exactly 1000000n
// ✅ EXACT
```

---

## **Usage Examples**

### **Example 1: Create Settlement Cycle**

```typescript
import {
  createSettlementCycle,
  createBuyerObligation,
  createContributorEntitlement,
  ngwee,
  wattHours,
  zmwToNgwee,
  kwhToWh
} from '@enerlectra/core';

// Create cycle
const cycle = createSettlementCycle(
  'cycle-2026-02-25',
  'cluster-abc123',
  Date.now(),
  Date.now() + 24 * 60 * 60 * 1000 // 24 hours
);

// Add buyer obligation
const buyer = createBuyerObligation(
  'buyer-user123',
  kwhToWh(1.234), // 1.234 kWh = 1234 Wh
  zmwToNgwee(0.62), // 0.62 ZMW = 62 ngwee
  zmwToNgwee(0.02) // 0.02 ZMW fee = 2 ngwee
);

cycle.buyerObligations.push(buyer);

// Add contributor entitlement
const contributor = createContributorEntitlement(
  'contributor-abc',
  kwhToWh(1.234),
  zmwToNgwee(0.62),
  zmwToNgwee(0.02)
);

cycle.contributorEntitlements.push(contributor);

// Update totals
cycle.totalEnergyWh = buyer.energyWh;
cycle.totalBuyerGrossNgwee = buyer.grossAmountNgwee;
cycle.totalContributorGrossNgwee = contributor.grossAmountNgwee;
cycle.totalFeesNgwee = buyer.feesNgwee;
```

---

### **Example 2: Validate Invariants**

```typescript
import { validateCycleInvariants } from '@enerlectra/core';

try {
  validateCycleInvariants(cycle);
  console.log('✅ All invariants passed');
} catch (error) {
  console.error('❌ Invariant violation:', error.message);
  // Example error:
  // "Energy not conserved: buyers=1234 Wh, contributors=1200 Wh"
}
```

---

### **Example 3: Compute Hash**

```typescript
import { computeCycleHash } from '@enerlectra/core';

const hash = computeCycleHash(cycle);
console.log('Cycle hash:', hash);
// Example: "9a3f8b2c4d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0"

// Store hash in cycle
cycle.cycleHash = hash;
```

---

### **Example 4: Finalize Settlement**

```typescript
import { finalizeSettlementCycle } from '@enerlectra/core';

// Define netted transfers
const nettedTransfers = [
  {
    fromAccountId: 'buyer-account-123',
    toAccountId: 'contributor-account-abc',
    amountNgwee: ngwee(60n) // 60 ngwee = 0.60 ZMW
  }
];

// Finalize
const result = await finalizeSettlementCycle(
  cycle,
  nettedTransfers,
  previousCycleHash // Optional: link to previous cycle
);

if (result.success) {
  console.log('✅ Settlement finalized');
  console.log('Cycle hash:', result.cycleHash);
  console.log('Operations:', result.operations);
  
  // Cycle is now in FINALIZED state
  // Ready for payout execution
} else {
  console.error('❌ Finalization failed:', result.errors);
}
```

---

### **Example 5: Verify Settlement Integrity**

```typescript
import { verifySettlementIntegrity } from '@enerlectra/core';

const verification = verifySettlementIntegrity(cycle);

if (verification.valid) {
  console.log('✅ Settlement integrity verified');
} else {
  console.error('❌ Integrity issues:', verification.issues);
  // Example issues:
  // - "Cycle not finalized (state: OPEN)"
  // - "Cycle hash verification failed"
  // - "Invariant violation: Energy not conserved"
}
```

---

## **Database Integration**

### **SQL Schema:**

```sql
-- Settlement cycles table
CREATE TABLE settlement_cycles (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  start_timestamp BIGINT NOT NULL,
  end_timestamp BIGINT NOT NULL,
  state TEXT NOT NULL,
  
  -- Totals (BigInt stored as TEXT or BIGINT)
  total_buyer_gross_ngwee BIGINT NOT NULL,
  total_contributor_gross_ngwee BIGINT NOT NULL,
  total_fees_ngwee BIGINT NOT NULL,
  total_energy_wh BIGINT NOT NULL,
  
  -- Hash chain
  previous_cycle_hash TEXT,
  cycle_hash TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Buyer obligations
CREATE TABLE buyer_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_cycle_id TEXT NOT NULL REFERENCES settlement_cycles(id),
  buyer_id TEXT NOT NULL,
  
  -- BigInt values
  energy_wh BIGINT NOT NULL,
  gross_amount_ngwee BIGINT NOT NULL,
  fees_ngwee BIGINT NOT NULL,
  net_payable_ngwee BIGINT NOT NULL
);

-- Contributor entitlements
CREATE TABLE contributor_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_cycle_id TEXT NOT NULL REFERENCES settlement_cycles(id),
  contributor_id TEXT NOT NULL,
  
  -- BigInt values
  energy_wh BIGINT NOT NULL,
  gross_amount_ngwee BIGINT NOT NULL,
  fees_ngwee BIGINT NOT NULL,
  net_receivable_ngwee BIGINT NOT NULL
);
```

### **Serialization:**

```typescript
import { 
  serializeSettlementCycle, 
  deserializeSettlementCycle 
} from '@enerlectra/core';

// Save to database
const serialized = serializeSettlementCycle(cycle);
await supabase
  .from('settlement_cycles')
  .insert({
    id: serialized.id,
    cluster_id: serialized.clusterId,
    // ... all BigInt values are now strings
    total_buyer_gross_ngwee: serialized.totalBuyerGrossNgwee, // string
    total_energy_wh: serialized.totalEnergyWh // string
  });

// Load from database
const { data } = await supabase
  .from('settlement_cycles')
  .select('*')
  .eq('id', cycleId)
  .single();

const cycle = deserializeSettlementCycle(data);
// All string values converted back to BigInt
```

---

## **State Machine**

### **States:**

```
OPEN            → Settlement cycle created, accepting obligations
RECONCILED      → All obligations/entitlements added, invariants validated
NETTED          → Transfers computed, ready for finalization
FINALIZED       → Hash computed, immutable, ready for payout
ANCHORED        → Hash anchored to blockchain (optional)
```

### **Transitions:**

```
OPEN → RECONCILED → NETTED → FINALIZED → ANCHORED
  ↓         ↓          ↓          ↓          ↓
  ✓         ✓          ✓          ✓      TERMINAL
```

### **Enforcement:**

```typescript
// ❌ Illegal transitions throw errors
transitionToFinalized(openCycle); 
// Error: Illegal state transition: OPEN → FINALIZED

// ✅ Legal transitions succeed
const reconciled = transitionToReconciled(openCycle);
const netted = transitionToNetted(reconciled, transfers);
const finalized = transitionToFinalized(netted);
```

---

## **Invariant Checks**

### **1. Energy Conservation:**
```
Σ(buyer.energyWh) === Σ(contributor.energyWh)

EXACT equality. NO tolerance.
```

### **2. Monetary Conservation:**
```
Σ(buyer.grossAmountNgwee) === Σ(contributor.grossAmountNgwee)

EXACT equality. NO tolerance.
```

### **3. Fee Accounting:**
```
Σ(buyer.grossAmountNgwee) === Σ(contributor.netReceivableNgwee) + Σ(fees)

EXACT equality. NO tolerance.
```

### **4. Non-Negative Values:**
```
All energy/monetary values >= 0

Negative values = corruption.
```

---

## **Production Deployment**

### **1. Install Package:**

```bash
npm install @enerlectra/core
```

### **2. Import Types:**

```typescript
import {
  // Types
  Ngwee,
  WattHours,
  SettlementCycle,
  SettlementState,
  
  // Factories
  ngwee,
  wattHours,
  createSettlementCycle,
  
  // Operations
  validateCycleInvariants,
  computeCycleHash,
  finalizeSettlementCycle,
  
  // Utilities
  zmwToNgwee,
  kwhToWh,
  formatNgwee,
  formatWh
} from '@enerlectra/core';
```

### **3. Run Daily Settlement:**

```typescript
async function runDailySettlement(clusterId: string, date: string) {
  // 1. Create cycle
  const cycle = createSettlementCycle(
    `${clusterId}-${date}`,
    clusterId,
    startOfDay(date),
    endOfDay(date)
  );

  // 2. Add obligations/entitlements
  // ... (from your business logic)

  // 3. Validate invariants
  validateCycleInvariants(cycle);

  // 4. Compute netted transfers
  const transfers = computeNettedTransfers(cycle);

  // 5. Finalize
  const result = await finalizeSettlementCycle(cycle, transfers);

  if (!result.success) {
    throw new Error(`Finalization failed: ${result.errors}`);
  }

  // 6. Save to database
  await saveSettlementCycle(result.cycle);

  // 7. Execute payouts
  await executePayouts(result.cycle);

  return result;
}
```

---

## **Monitoring & Alerts**

### **Health Check:**

```typescript
import { verifySettlementIntegrity } from '@enerlectra/core';

async function dailyIntegrityCheck() {
  const yesterday = getYesterday();
  const cycles = await getSettlementCycles(yesterday);

  for (const cycle of cycles) {
    const verification = verifySettlementIntegrity(cycle);
    
    if (!verification.valid) {
      await sendAlert({
        severity: 'CRITICAL',
        message: `Settlement integrity failure: ${cycle.id}`,
        issues: verification.issues
      });
    }
  }
}
```

---

## **Key Advantages**

### **Institutional Trust:**
✅ Auditors can verify exact arithmetic
✅ Regulators can replay settlements deterministically
✅ External capital trusts BigInt precision

### **Operational Safety:**
✅ No floating point drift (ever)
✅ Compile-time unit safety (no mixing ngwee/watt-hours)
✅ Runtime invariant enforcement (zero tolerance)

### **Future Proof:**
✅ Scales to billions of ngwee without precision loss
✅ Hash chain enables blockchain anchoring
✅ Deterministic replay supports audit exports

---

## **Comparison: Before vs After**

| Feature | Old (number) | New (BigInt) |
|---------|--------------|--------------|
| **Arithmetic** | Floating point | Exact integer |
| **Precision** | ~15 digits | Unlimited |
| **Drift** | Accumulates | Never |
| **Type Safety** | None | Compile-time |
| **Determinism** | ❌ Machine-dependent | ✅ Always identical |
| **Hash Stability** | ❌ Varies | ✅ Stable |
| **Audit Grade** | ❌ Approximate | ✅ Exact |

---

## **Files Created**

```
src/domain/settlement/
├── settlement-types.ts              ← Branded BigInt types
├── settlement-cycle-hardened.ts     ← Data model
├── settlement-invariants.ts         ← Validation
├── settlement-hash.ts               ← Hashing
└── settlement-finalization.ts       ← State machine
```

---

**Enerlectra Core now has clearinghouse-grade settlement logic. Deploy it.** 🔥