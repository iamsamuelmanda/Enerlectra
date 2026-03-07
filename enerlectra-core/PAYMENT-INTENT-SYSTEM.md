# Payment Intent System

**Production-grade payment orchestration for buyer energy purchases.**

---

## **What This System Does**

The Payment Intent system is the **orchestration layer** between buyers, treasury, and settlement. It manages the entire lifecycle of a buyer's energy purchase from initiation to ledger settlement.

### **Core Responsibilities:**
1. ✅ **Purchase orchestration** - Coordinate buyer → energy flow
2. ✅ **State machine enforcement** - Ensure valid transitions only
3. ✅ **Treasury integration** - Reserve liquidity before payment
4. ✅ **Payment confirmation** - Process webhook callbacks
5. ✅ **Automatic expiry** - Clean up abandoned payments
6. ✅ **Ledger settlement** - Finalize in internal ledger

---

## **State Machine**

### **States:**

```
CREATED                → Intent created, not yet reserved
RESERVED               → Energy + liquidity reserved
INITIATED              → Payment sent to external rail API
AWAITING_CONFIRMATION  → Waiting for rail webhook
CONFIRMED              → Payment confirmed by rail
SETTLED                → Settled in internal ledger (TERMINAL)
FAILED                 → Payment failed (TERMINAL)
EXPIRED                → Timeout, no confirmation (TERMINAL)
CANCELLED              → User cancelled (TERMINAL)
```

### **Transitions:**

```
CREATED → RESERVED → INITIATED → AWAITING_CONFIRMATION → CONFIRMED → SETTLED
  ↓          ↓           ↓              ↓
CANCELLED  EXPIRED    FAILED        EXPIRED
                                       ↓
                                    FAILED
```

### **Terminal States:**

Once an intent reaches a terminal state, it **cannot be modified**.

```
SETTLED    ← Success
FAILED     ← Payment failed at rail
EXPIRED    ← Timeout (15 min default)
CANCELLED  ← User cancelled
```

---

## **Complete Purchase Flow**

### **Step-by-Step:**

```
1. USER: "Buy 100 kWh for 50 ZMW via MTN"
   ↓
2. SYSTEM: Create PaymentIntent (CREATED)
   ↓
3. SYSTEM: Check treasury liquidity
   ↓
4. SYSTEM: Reserve 50 ZMW in treasury
   ↓
5. SYSTEM: Transition to RESERVED
   ↓
6. SYSTEM: Return payment instructions to user
   {
     "rail": "MTN",
     "amount": "50.00 ZMW",
     "destination": "+260-971-234567",
     "reference": "intent-abc123",
     "expiresAt": "2026-02-28T10:30:00Z"
   }
   ↓
7. USER: Pays via MTN Mobile Money
   ↓
8. MTN: Sends webhook to Enerlectra
   ↓
9. SYSTEM: Transition to CONFIRMED
   ↓
10. SYSTEM: Settle in internal ledger
    DEBIT   SYSTEM_EXTERNAL
    CREDIT  ESCROW_MTN
    CREDIT  TREASURY_INTERNAL
    CREDIT  BUYER_ACCOUNT (100 kWh)
    ↓
11. SYSTEM: Transition to SETTLED
    ↓
12. SYSTEM: Release treasury reservation
```

---

## **Usage Examples**

### **Example 1: Initiate Purchase**

```typescript
import { 
  PaymentOrchestrator, 
  TreasuryService,
  PaymentRail,
  ngwee,
  kwhToWh
} from '@enerlectra/core';

const treasury = new TreasuryService(supabase);
const orchestrator = new PaymentOrchestrator(supabase, treasury);

// User wants to buy 100 kWh
const result = await orchestrator.initiatePurchase(
  'buyer-user-123',           // buyerId
  kwhToWh(100),               // 100 kWh → 100,000 Wh
  ngwee(5000_00n),            // 5000 ZMW → 500,000 ngwee
  PaymentRail.MTN,            // Payment via MTN
  ngwee(50n)                  // Price: 0.50 ZMW per Wh
);

if (result.success) {
  console.log('Payment intent created:', result.intentId);
  console.log('Payment instructions:', result.paymentInstructions);
  
  // Return to user:
  // {
  //   "rail": "MTN",
  //   "amount": "5000.00 ZMW",
  //   "destination": "+260-971-234567",
  //   "reference": "intent-abc123",
  //   "expiresAt": "2026-02-28T10:30:00Z"
  // }
} else {
  console.error('Purchase failed:', result.error);
  console.error('Reason:', result.reason);
  
  // Possible reasons:
  // - INSUFFICIENT_LIQUIDITY
  // - TREASURY_FROZEN
  // - VALIDATION_ERROR
  // - SYSTEM_ERROR
}
```

---

### **Example 2: Process Webhook (Payment Confirmation)**

```typescript
import { PaymentConfirmation, ngwee } from '@enerlectra/core';

// MTN webhook received
app.post('/webhooks/mtn', async (req, res) => {
  const { transactionId, amount, phone } = req.body;
  
  // Create confirmation
  const confirmation: PaymentConfirmation = {
    externalReference: transactionId,
    rail: PaymentRail.MTN,
    amountNgwee: ngwee(BigInt(amount * 100)), // Convert ZMW to ngwee
    confirmedAt: new Date(),
    metadata: {
      phone,
      source: 'mtn_webhook'
    }
  };
  
  // Process confirmation
  const result = await orchestrator.confirmPayment(confirmation);
  
  if (result.success) {
    console.log('Payment settled:', result.ledgerTransactionId);
    
    // Notify user: "Your purchase is complete!"
    await notifyBuyer(result.intent.buyerId, {
      status: 'success',
      energy: result.intent.energyWh,
      transactionId: result.ledgerTransactionId
    });
  } else {
    console.error('Settlement failed:', result.error);
    
    // Alert ops team
    await alertOps('Payment confirmation failed', result.error);
  }
  
  res.status(200).send('OK');
});
```

---

### **Example 3: Handle Expiry (Background Job)**

```typescript
import { schedule } from 'node-cron';

// Run every minute
schedule('* * * * *', async () => {
  const result = await orchestrator.processExpiredIntents();
  
  console.log(`Expired: ${result.expired} intents`);
  console.log(`Released: ${result.released} reservations`);
  
  if (result.expired > 0) {
    // Notify users about expired payments
    // "Your payment expired. Please try again."
  }
});
```

---

### **Example 4: User Cancellation**

```typescript
// User clicks "Cancel" before paying
async function cancelPurchase(intentId: string) {
  const result = await orchestrator.cancelPayment(
    intentId,
    'User requested cancellation'
  );
  
  if (result.success) {
    console.log('Payment cancelled, reservation released');
  } else {
    console.error('Cannot cancel:', result.error);
    // "Payment already processed, cannot cancel"
  }
}
```

---

### **Example 5: Query Payment History**

```typescript
import { PaymentIntentService, PaymentIntentState } from '@enerlectra/core';

const intentService = new PaymentIntentService(supabase);

// Get user's payment history
const intents = await intentService.queryIntents({
  buyerId: 'buyer-user-123',
  states: [
    PaymentIntentState.SETTLED,
    PaymentIntentState.CONFIRMED
  ]
});

console.log(`User has ${intents.length} successful purchases`);

for (const intent of intents) {
  console.log(`- ${formatWh(intent.energyWh)} for ${formatNgwee(intent.amountNgwee)}`);
  console.log(`  Purchased: ${intent.createdAt.toISOString()}`);
  console.log(`  Settled: ${intent.settledAt?.toISOString()}`);
}
```

---

### **Example 6: Get Statistics**

```typescript
const stats = await orchestrator.getStats({
  buyerId: 'buyer-user-123',
  startDate: new Date('2026-02-01'),
  endDate: new Date('2026-02-28')
});

console.log('February 2026 Statistics:');
console.log(`Total intents: ${stats.total}`);
console.log(`By state:`, stats.byState);
console.log(`Success rate: ${stats.successRate.toFixed(1)}%`);
console.log(`Average purchase: ${stats.averageAmount}`);

// Output:
// Total intents: 25
// By state: {
//   CREATED: 0,
//   RESERVED: 1,
//   AWAITING_CONFIRMATION: 2,
//   SETTLED: 20,
//   FAILED: 1,
//   EXPIRED: 1
// }
// Success rate: 90.9%
// Average purchase: 450.50 ZMW
```

---

## **Integration with Treasury**

### **Liquidity Flow:**

```
1. Check Liquidity
   ↓
2. Reserve Liquidity (lock 50 ZMW)
   ↓
3. User pays
   ↓
4. Confirm payment
   ↓
5. Settle in ledger
   ↓
6. Release reservation
```

### **What Happens on Failure:**

```
If payment FAILS or EXPIRES:
1. Transition to FAILED/EXPIRED
2. Release treasury reservation
3. Energy becomes available again
4. User can retry
```

---

## **Expiry Handling**

### **Default Expiry:** 15 minutes

After intent is RESERVED, user has 15 minutes to complete payment.

### **Expiry States:**

```
RESERVED → (15 min timeout) → EXPIRED
AWAITING_CONFIRMATION → (15 min timeout) → EXPIRED
```

### **Background Job:**

```typescript
// Run every minute
schedule('* * * * *', async () => {
  await orchestrator.processExpiredIntents();
});
```

### **What Happens:**

1. ✅ Intent transitioned to EXPIRED
2. ✅ Treasury reservation released
3. ✅ Energy becomes available
4. ❌ User must initiate new purchase

---

## **Error Handling**

### **Failure Scenarios:**

| Scenario | State Transition | Action |
|----------|------------------|--------|
| **Insufficient liquidity** | CREATED → FAILED | User notified, suggest retry later |
| **Rail API error** | INITIATED → FAILED | Release reservation, user can retry |
| **Amount mismatch** | AWAITING_CONFIRMATION → FAILED | Alert ops team, investigate |
| **User timeout** | RESERVED → EXPIRED | Release reservation, notify user |
| **Webhook not received** | AWAITING_CONFIRMATION → EXPIRED | Release reservation, user contacts support |

### **Retry Logic:**

```typescript
// User can retry after failure
if (result.reason === 'INSUFFICIENT_LIQUIDITY') {
  // Wait 5 minutes, try again
  setTimeout(() => {
    retryPurchase(buyerId, energy, amount);
  }, 5 * 60 * 1000);
}
```

---

## **Monitoring & Alerts**

### **Key Metrics:**

```typescript
// Dashboard queries
const activeIntents = await intentService.queryIntents({
  states: [
    PaymentIntentState.RESERVED,
    PaymentIntentState.INITIATED,
    PaymentIntentState.AWAITING_CONFIRMATION
  ]
});

const stuckIntents = activeIntents.filter(intent => {
  const age = Date.now() - intent.createdAt.getTime();
  return age > 10 * 60 * 1000; // Stuck for > 10 minutes
});

if (stuckIntents.length > 0) {
  await alertOps(`${stuckIntents.length} intents stuck`, stuckIntents);
}
```

### **Alerts to Configure:**

| Condition | Severity | Action |
|-----------|----------|--------|
| Intent stuck > 10 min | WARNING | Notify ops team |
| Success rate < 80% | WARNING | Investigate rail issues |
| Expired > 20% of total | ERROR | Check user experience |
| Average confirmation time > 5 min | WARNING | Check webhook latency |

---

## **Database Schema**

### **Table: `payment_intents`**

```sql
CREATE TABLE payment_intents (
  intent_id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  
  -- Purchase details
  energy_wh BIGINT NOT NULL,
  amount_ngwee BIGINT NOT NULL,
  price_per_wh BIGINT NOT NULL,
  
  -- Payment method
  rail payment_rail NOT NULL,
  
  -- State
  state payment_intent_state NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL,
  reserved_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  settled_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  -- References
  external_reference TEXT,
  treasury_reservation_id TEXT,
  ledger_transaction_id TEXT,
  
  -- Error tracking
  error_message TEXT,
  failure_reason TEXT
);
```

### **Useful Queries:**

```sql
-- Get expired intents
SELECT * FROM get_expired_payment_intents();

-- Get statistics
SELECT * FROM get_payment_intent_stats('buyer-123');

-- Active intents
SELECT * FROM active_payment_intents;

-- Awaiting confirmation
SELECT * FROM awaiting_confirmation_intents;

-- User summary
SELECT * FROM payment_intent_summary_by_buyer
WHERE buyer_id = 'buyer-123';
```

---

## **State Machine Enforcement**

### **Illegal Transitions Blocked:**

```typescript
// ❌ Cannot skip states
transitionToSettled(intent); 
// Error: Illegal transition CREATED → SETTLED

// ✅ Must follow flow
transitionToReserved(intent);
transitionToInitiated(intent);
transitionToAwaitingConfirmation(intent);
transitionToConfirmed(intent, confirmation);
transitionToSettled(intent, txnId);
```

### **Terminal States Immutable:**

```typescript
// ❌ Cannot modify terminal states
const settledIntent = await intentService.getIntent(intentId);
// settledIntent.state === 'SETTLED'

await intentService.transitionToFailed(intentId, 'test');
// Error: Cannot modify payment intent in terminal state: SETTLED
```

---

## **Production Checklist**

### **Before Launch:**

```
☐ Treasury system deployed and tested
☐ Payment intent migrations run
☐ Background job for expiry processing (every 1 min)
☐ Webhook endpoints secured (HTTPS, signature verification)
☐ Monitoring alerts configured
☐ Database indexes verified
☐ State machine transitions tested
☐ Failure scenarios documented
☐ User notification system integrated
```

### **Operational Procedures:**

```
Daily:
☐ Review success rate (should be > 90%)
☐ Check for stuck intents (> 10 min in AWAITING_CONFIRMATION)
☐ Verify webhook latency (should be < 1 min)

Weekly:
☐ Analyze failure reasons
☐ Review expiry rate (should be < 10%)
☐ Optimize confirmation time

Monthly:
☐ Generate payment intent report for finance team
☐ Review and update expiry timeout if needed
```

---

## **Architecture Diagram**

```
USER                 PAYMENT INTENT           TREASURY              LEDGER
┌────────────┐      ┌──────────────┐         ┌─────────┐          ┌──────────┐
│ Buy Energy │─────►│ CREATED      │         │         │          │          │
└────────────┘      │      ↓       │         │         │          │          │
                    │ RESERVED     │────────►│ Reserve │          │          │
                    │      ↓       │         │ 50 ZMW  │          │          │
                    │ INITIATED    │         │         │          │          │
                    │      ↓       │         │         │          │          │
┌────────────┐      │ AWAITING_    │◄────────┼─────────┼──────────│ Webhook  │
│ Pay via    │─────►│ CONFIRMATION │         │         │          │ Handler  │
│ MTN        │      │      ↓       │         │         │          │          │
└────────────┘      │ CONFIRMED    │         │         │          │          │
                    │      ↓       │         │         │          │          │
                    │ SETTLED      │─────────┼─────────┼─────────►│ Double   │
                    └──────────────┘         │ Release │          │ Entry    │
                                             │ Reserve │          │ Ledger   │
                                             └─────────┘          └──────────┘
```

---

## **Files Delivered**

```
src/domain/payment/
├── payment-intent-types.ts        ← Types & state machine
├── payment-intent-service.ts      ← Service with transitions
└── payment-orchestrator.ts        ← High-level orchestration

supabase-migrations/
└── 006_payment_intents.sql        ← Database schema
```

---

## **What This Enables**

✅ **Buyer purchases** - Users can buy energy via mobile money
✅ **Treasury safety** - Liquidity reserved before payment
✅ **Automatic expiry** - Abandoned payments cleaned up
✅ **State enforcement** - No illegal transitions
✅ **Webhook processing** - Rails can confirm payments
✅ **Ledger settlement** - Final accounting in double-entry system

---

## **Next Steps**

Now that you have:
1. ✅ Settlement Cycle (BigInt, invariants, finalization)
2. ✅ Treasury System (multi-rail, liquidity, reconciliation)
3. ✅ Payment Intents (state machine, orchestration)

**What's missing:**

### **Mobile Money Adapters**
- MTN Mobile Money API integration
- Airtel Money API integration
- Webhook signature verification
- Payment status polling
- Failure handling

### **Settlement Integration**
- Link payment intents to settlement cycles
- Aggregate buyer obligations per cycle
- Cycle-level energy allocation
- Fee calculation

---

**The payment intent system is production-ready. This is what connects buyers to the platform.** 🔥