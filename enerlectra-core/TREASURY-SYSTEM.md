# Treasury Multi-Escrow System

**Production-grade treasury management for multi-rail payment operations.**

---

## **What This System Does**

The Treasury system is the **boundary layer** between Enerlectra's sovereign internal ledger and external payment rails (MTN, Airtel, Bank, Stablecoin).

### **Core Responsibilities:**
1. ✅ **Liquidity management** - Ensure sufficient funds before payouts
2. ✅ **Insolvency prevention** - Never pay out more than available
3. ✅ **Daily reconciliation** - Verify internal = external balances
4. ✅ **Multi-rail support** - MTN, Airtel, Bank, Stablecoin
5. ✅ **Reserve management** - Fee collection, insurance buffer

---

## **Architecture**

```
EXTERNAL WORLD              TREASURY BOUNDARY              INTERNAL LEDGER
┌──────────────┐           ┌────────────────────┐         ┌─────────────────┐
│ MTN          │◄─────────►│ ESCROW_MTN         │◄───────►│ TREASURY        │
│ (2605.50)    │           │ (internal: 2605)   │         │ (anchor)        │
│              │           │ (external: 2600)   │         │                 │
│              │           │ (discrepancy: 5)   │         │                 │
└──────────────┘           └────────────────────┘         └─────────────────┘
                                     ↓                              ↓
                           RECONCILIATION CHECK            CONTRIBUTOR/BUYER
                           (if |diff| > tolerance         ACCOUNTS
                            → freeze payouts)
```

### **Key Principle:**

**Internal ledger remains Σ = 0. External accounts are MIRRORS.**

---

## **Payment Rails**

### **Supported Rails:**

| Rail | Use Case | Reversal Window | Min Balance |
|------|----------|-----------------|-------------|
| **MTN** | Primary mobile money | 48 hours | 100 ZMW |
| **Airtel** | Secondary mobile money | 48 hours | 100 ZMW |
| **Bank** | Large payouts, B2B | 72 hours | 500 ZMW |
| **Stablecoin** | International, DeFi | 1 hour | 50 ZMW |

### **Rail Status:**

```
ACTIVE     → Operating normally
DEGRADED   → Minor discrepancy detected
SUSPENDED  → Critical discrepancy, no payouts
DISABLED   → Manually disabled
```

---

## **Liquidity Guards**

### **Before Every Payout:**

```typescript
import { TreasuryService } from '@enerlectra/core';

const treasury = new TreasuryService(supabase);

// CHECK LIQUIDITY FIRST
const check = await treasury.checkLiquidity(
  PaymentRail.MTN,
  ngwee(500_00n) // 500 ZMW
);

if (check.canPayout) {
  // Proceed with payout
  await executePayout(...);
} else {
  console.error('Cannot payout:', check.reason);
  
  if (check.suggestedRail) {
    // Try alternative rail
    console.log('Try rail:', check.suggestedRail);
  }
}
```

### **Checks Performed:**

1. ✅ Rail must be ACTIVE
2. ✅ Available balance ≥ requested amount
3. ✅ After payout, balance ≥ minimum balance
4. ✅ Reversal buffer maintained
5. ✅ No critical discrepancy

---

## **Daily Reconciliation**

### **Purpose:**

Verify that **internal ledger balance = external API balance** for each rail.

### **Process:**

```typescript
import { TreasuryReconciliation } from '@enerlectra/core';

const reconciliation = new TreasuryReconciliation(supabase, treasury, config);

// Run daily at 2 AM
const report = await reconciliation.runDailyReconciliation();

if (!report.systemBalanced) {
  console.error('❌ System not balanced!');
  console.log('Discrepancy:', report.totalDiscrepancy);
  
  // Check if payouts frozen
  if (report.totalDiscrepancy > criticalThreshold) {
    console.log('🚨 PAYOUTS FROZEN');
    // Alert ops team
  }
}
```

### **Reconciliation Actions:**

| Discrepancy | Action |
|-------------|--------|
| < 10 ZMW | ✅ Normal - log only |
| 10-100 ZMW | ⚠️ Warning - notify ops team |
| 100-1000 ZMW | 🔴 Alert - require explanation |
| > 1000 ZMW | 🚨 **FREEZE PAYOUTS** - manual intervention |

---

## **Inbound Payment Flow**

### **User Pays (External → Internal):**

```typescript
import { TreasuryService, InboundPayment } from '@enerlectra/core';

// 1. User pays via MTN Mobile Money
// 2. MTN webhook confirms payment
const payment: InboundPayment = {
  paymentId: 'pay-123',
  rail: PaymentRail.MTN,
  externalReference: 'MTN-TXN-456',
  amountNgwee: ngwee(100_00n), // 100 ZMW
  buyerId: 'buyer-user-789',
  confirmedAt: new Date(),
  internallySettled: false,
  reversalWindowEndsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  reversalRisk: 'LOW'
};

// 3. Process into internal ledger
const operation = await treasury.processInboundPayment(payment);

// 4. Ledger operations (atomic):
//    DEBIT   SYSTEM_EXTERNAL (grid)
//    CREDIT  ESCROW_MTN
//    CREDIT  TREASURY_INTERNAL
//    CREDIT  BUYER_ACCOUNT
```

### **Reversal Risk:**

After confirmation, payment sits in **reversal buffer** for 48 hours (MTN/Airtel) before being fully available.

---

## **Outbound Payout Flow**

### **Contributor Payout (Internal → External):**

```typescript
import { TreasuryService, OutboundPayout } from '@enerlectra/core';

// 1. Settlement cycle finalizes
// 2. Contributor entitled to 50 ZMW

// 3. RESERVE LIQUIDITY FIRST
const reservation = await treasury.reservePayoutLiquidity(
  'payout-001',
  PaymentRail.MTN,
  ngwee(50_00n)
);

if (!reservation.success) {
  console.error('Liquidity unavailable:', reservation.reason);
  return;
}

// 4. SEND TO RAIL API
const payout: OutboundPayout = {
  payoutId: 'payout-001',
  rail: PaymentRail.MTN,
  amountNgwee: ngwee(50_00n),
  contributorId: 'contrib-123',
  destinationAccount: '+260971234567',
  status: PayoutStatus.INITIATED,
  initiatedAt: new Date()
};

// Call MTN API
const result = await mtnAdapter.sendPayout(payout);

if (result.success) {
  payout.status = PayoutStatus.COMPLETED;
  payout.completedAt = new Date();
  payout.externalReference = result.txnId;
  
  // 5. SETTLE IN LEDGER
  await treasury.confirmPayoutSettled(payout);
  
  // Ledger operations (atomic):
  //   DEBIT   CONTRIBUTOR_ACCOUNT
  //   DEBIT   TREASURY_INTERNAL
  //   DEBIT   ESCROW_MTN
  //   CREDIT  SYSTEM_EXTERNAL (grid)
  
} else {
  payout.status = PayoutStatus.FAILED;
  payout.failedAt = new Date();
  payout.errorMessage = result.error;
  
  // 6. RELEASE RESERVATION
  await treasury.releasePayoutReservation('payout-001');
}
```

---

## **Batch Payouts**

### **Check Multiple Payouts:**

```typescript
const payouts = [
  { rail: PaymentRail.MTN, amountNgwee: ngwee(100_00n) },
  { rail: PaymentRail.MTN, amountNgwee: ngwee(50_00n) },
  { rail: PaymentRail.AIRTEL, amountNgwee: ngwee(75_00n) }
];

const batchCheck = await treasury.checkBatchLiquidity(payouts);

if (batchCheck.canExecuteAll) {
  // Execute all payouts
  for (const payout of payouts) {
    await executePayout(payout);
  }
} else {
  // Execute only safe payouts
  console.log('Can execute:', batchCheck.safePayouts);
  console.log('Cannot execute:', batchCheck.unsafePayouts);
  
  // Execute safe ones
  for (const idx of batchCheck.safePayouts) {
    await executePayout(payouts[idx]);
  }
}
```

---

## **Treasury State**

### **Get Overall State:**

```typescript
const state = await treasury.getTreasuryState();

console.log('Treasury State:');
console.log(`  Total Internal: ${formatNgwee(state.totalInternalNgwee)}`);
console.log(`  Total External: ${formatNgwee(state.totalExternalNgwee)}`);
console.log(`  Discrepancy: ${formatNgwee(state.totalDiscrepancyNgwee)}`);
console.log(`  Balanced: ${state.isBalanced}`);
console.log(`  Can Payout: ${state.canPayout}`);

for (const [rail, liquidity] of state.rails) {
  console.log(`\n  ${rail}:`);
  console.log(`    Internal: ${formatNgwee(liquidity.internalBalanceNgwee)}`);
  console.log(`    External: ${formatNgwee(liquidity.externalBalanceNgwee)}`);
  console.log(`    Available: ${formatNgwee(liquidity.availableNgwee)}`);
  console.log(`    Reserved: ${formatNgwee(liquidity.reservedNgwee)}`);
  console.log(`    Status: ${liquidity.status}`);
}
```

---

## **Reserve Accounts**

### **Types:**

1. **FEE_RESERVE** - Collects platform fees
2. **INSURANCE_RESERVE** - Buffer for disputes/reversals
3. **OPERATIONAL_RESERVE** - Working capital

### **Usage:**

```typescript
// Allocate fees to reserve
await ledgerService.transfer({
  from_account_id: 'buyer-account',
  to_account_id: FEE_RESERVE_ACCOUNT,
  amount: feeAmount,
  unit: 'ZMW',
  settlement_cycle_id: cycleId,
  operation_type: 'FEE_COLLECTION'
});
```

---

## **Operational Procedures**

### **Daily Checklist:**

```
☐ 2:00 AM - Run daily reconciliation
☐ 2:15 AM - Review reconciliation report
☐ If discrepancy > 100 ZMW:
  ☐ Investigate cause
  ☐ Verify external API balances
  ☐ Check for missed webhooks
  ☐ Document findings
☐ If discrepancy > 1000 ZMW:
  ☐ PAYOUTS AUTO-FROZEN
  ☐ Alert CTO/CFO
  ☐ Manual intervention required
```

### **Freeze/Unfreeze Payouts:**

```typescript
// Freeze (done automatically on critical discrepancy)
await reconciliation.freezePayouts();

// Unfreeze (after manual resolution)
await reconciliation.unfreezePayouts(
  'cto@enerlectra.com',
  'Reconciliation completed. Discrepancy was due to delayed MTN webhook. All balances verified.'
);
```

---

## **Monitoring & Alerts**

### **Key Metrics:**

```typescript
// Check if payouts frozen
const frozen = await reconciliation.arePayoutsFrozen();

// Calculate drift trend
const drift = await reconciliation.calculateAverageDrift(30);

console.log(`Average Drift: ${formatNgwee(drift.averageDriftNgwee)}`);
console.log(`Max Drift: ${formatNgwee(drift.maxDriftNgwee)}`);
console.log(`Days Out of Balance: ${drift.daysOutOfBalance}/30`);
console.log(`Trend: ${drift.trend}`); // IMPROVING, STABLE, DEGRADING

if (drift.trend === 'DEGRADING') {
  // Alert: Trend worsening, investigate
}
```

### **Alerts to Configure:**

| Condition | Severity | Action |
|-----------|----------|--------|
| Discrepancy > 10 ZMW | INFO | Log only |
| Discrepancy > 100 ZMW | WARNING | Notify ops team |
| Discrepancy > 500 ZMW | ERROR | Notify CTO |
| Discrepancy > 1000 ZMW | CRITICAL | Freeze payouts + alert CTO/CFO |
| Payouts frozen > 4 hours | CRITICAL | Escalate to executive team |

---

## **Regulatory Reporting**

### **Generate Report:**

```typescript
const report = await reconciliation.generateRegulatoryReport(
  new Date('2026-01-01'),
  new Date('2026-01-31')
);

// Save to file
fs.writeFileSync('treasury-report-jan-2026.txt', report);
```

### **Report Contents:**

- Daily reconciliation status
- Per-rail balances (internal vs external)
- Discrepancies with explanations
- Actions taken
- Alerts triggered
- Overall system health

---

## **Database Schema**

### **Tables:**

```
treasury_reservations       → Liquidity locking
treasury_config            → System-wide settings
treasury_reconciliations   → Daily audit logs
inbound_payments           → External → Internal
outbound_payouts           → Internal → External
treasury_operations        → Full audit trail
```

### **Key Queries:**

```sql
-- Check if payouts frozen
SELECT are_payouts_frozen();

-- Get total reserved per rail
SELECT get_reserved_amount('MTN');

-- Recent reconciliations
SELECT * FROM treasury_reconciliations 
ORDER BY timestamp DESC 
LIMIT 10;

-- Treasury health dashboard
SELECT * FROM treasury_health;
```

---

## **Configuration**

### **Default Config:**

```typescript
const config: TreasuryConfig = {
  // Reversal buffers
  mtnReversalBufferHours: 48,
  airtelReversalBufferHours: 48,
  bankReversalBufferHours: 72,
  stablecoinReversalBufferHours: 1,
  
  // Minimum balances
  mtnMinimumBalanceNgwee: ngwee(100_00n), // 100 ZMW
  airtelMinimumBalanceNgwee: ngwee(100_00n),
  bankMinimumBalanceNgwee: ngwee(500_00n), // 500 ZMW
  stablecoinMinimumBalanceNgwee: ngwee(50_00n),
  
  // Reconciliation
  reconciliationToleranceNgwee: ngwee(10_00n), // 10 ZMW
  criticalDiscrepancyThreshold: ngwee(1000_00n), // 1000 ZMW
  
  // Auto-rebalancing (future)
  autoRebalanceEnabled: false
};
```

---

## **Integration Example**

```typescript
import { 
  TreasuryService, 
  TreasuryReconciliation,
  PaymentRail,
  ngwee
} from '@enerlectra/core';

// Initialize
const treasury = new TreasuryService(supabase);
const reconciliation = new TreasuryReconciliation(supabase, treasury, config);

// Daily reconciliation (cron job)
schedule('0 2 * * *', async () => {
  const report = await reconciliation.runDailyReconciliation();
  
  if (!report.systemBalanced) {
    await sendAlert({
      severity: 'WARNING',
      message: 'Treasury not balanced',
      report
    });
  }
});

// Before payout
async function payoutContributor(contributorId: string, amount: Ngwee) {
  // 1. Check if frozen
  const frozen = await reconciliation.arePayoutsFrozen();
  if (frozen) {
    throw new Error('Payouts are frozen');
  }
  
  // 2. Check liquidity
  const check = await treasury.checkLiquidity(PaymentRail.MTN, amount);
  if (!check.canPayout) {
    throw new Error(`Insufficient liquidity: ${check.reason}`);
  }
  
  // 3. Reserve
  const reservation = await treasury.reservePayoutLiquidity(
    `payout-${contributorId}-${Date.now()}`,
    PaymentRail.MTN,
    amount
  );
  
  if (!reservation.success) {
    throw new Error(`Reservation failed: ${reservation.reason}`);
  }
  
  // 4. Execute payout
  // ... (call rail API)
  
  // 5. Settle in ledger
  // ... (ledger operations)
}
```

---

## **What This Prevents**

✅ **Insolvency** - Never pay out more than available
✅ **Drift** - Daily verification catches discrepancies
✅ **Fraud** - Audit trail for every operation
✅ **Overdraft** - Liquidity guards enforce limits
✅ **Regulatory violations** - Complete audit trail

---

## **Files Delivered**

```
src/domain/treasury/
├── treasury-types.ts              ← Types & enums
├── treasury-service.ts            ← Core service
└── treasury-reconciliation.ts     ← Daily reconciliation

supabase-migrations/
└── 005_treasury_system.sql        ← Database schema
```

---

**The Treasury system is production-ready. This is what prevents insolvency.** 🔥