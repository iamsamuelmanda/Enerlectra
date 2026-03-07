# Enerlectra Core Architecture

Deep dive into the system design.

---

## **The Big Picture**

Enerlectra Core is a **deterministic clearinghouse** for energy settlements.

It sits **between**:
- Production data (physical energy generation)
- Economic value (ZMW currency)
- Contributor entitlements (ownership stakes)

**It is NOT:**
- A payment processor (Stripe, PayPal)
- A blockchain (though it can record to one)
- A database (it uses Supabase/Postgres for storage)

**It IS:**
- A state machine (EE)
- A double-entry ledger
- An invariant enforcer
- An audit trail generator

---

## **Core Architecture Layers**

```
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                          │
│  ├─ runDailySettlement()     Single function call           │
│  ├─ attemptFinalization()    After challenge window         │
│  └─ replayCycle()            Verification                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER - SETTLEMENT                                  │
│  ├─ SettlementService        State machine orchestrator    │
│  ├─ SettlementCycle          Domain aggregate               │
│  ├─ EEState                  State enum                     │
│  ├─ Transitions              State transition rules         │
│  └─ FinalityDetector         Challenge window manager       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER - ACCOUNTS                                    │
│  ├─ AccountService           Account management             │
│  ├─ LedgerService            Double-entry operations        │
│  ├─ AccountInvariants        Σ = 0 enforcement              │
│  └─ AccountReconciliation    Imbalance handling             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STORAGE LAYER (Supabase/Postgres)                          │
│  ├─ accounts                 Account registry               │
│  ├─ ledger_entries           Append-only ledger             │
│  ├─ settlement_cycles        State records                  │
│  ├─ account_balances         Computed view                  │
│  └─ cycle_balances           Computed view                  │
└─────────────────────────────────────────────────────────────┘
```

---

## **The EE State Machine**

The Enerlectra Engine (EE) is a **deterministic state machine**.

### **States:**

```
OPERATIONAL
  ↓
PRODUCTION_REPORTED
  ↓
VALUE_COMPUTED
  ↓
ENTITLEMENTS_ALLOCATED
  ↓
SETTLEMENT_COMPUTED
  ↓
BALANCES_NETTED
  ↓
RECONCILIATION_COMPLETE
  ↓
FINALITY_PENDING (24h challenge window)
  ↓
SETTLEMENT_FINALIZED
```

### **Transition Rules:**

- Each state can only transition to **one specific next state**
- No skipping states
- No looping back
- Terminal state = SETTLEMENT_FINALIZED

### **Why This Matters:**

1. **Predictability** — Always know what happens next
2. **Auditability** — Every transition is logged
3. **Replay-ability** — Can rebuild entire history
4. **Testability** — Each transition can be unit tested

---

## **The Account Model**

### **Account Types:**

```
CONTRIBUTOR
├─ Represents individual contributor position
├─ One per (contributor_id, unit)
└─ Balance = Σ(credits) - Σ(debits) from ledger

CLUSTER_POOL
├─ Temporary holding account
├─ One per (cluster_id, settlement_cycle_id, unit)
└─ MUST be drained to zero each cycle

RESERVE
├─ Persistent surplus buffer
├─ One per (cluster_id, unit)
└─ Accumulates surpluses over time

IMBALANCE
├─ Scoped reconciliation account
├─ One per (settlement_cycle_id, unit)
└─ Tracks shortfalls/discrepancies

SYSTEM
├─ External energy/currency anchor
├─ Two total (KWH, ZMW)
└─ Allows open system (energy in/out)
```

### **Why Multiple Account Types:**

**Without account types:**
```
Problem: 100 kWh produced, only 98 kWh allocated
Question: Where do the 2 kWh go?
Answer: ???
Result: Drift, lost energy, broken invariants
```

**With account types:**
```
Problem: 100 kWh produced, only 98 kWh allocated
Answer: 2 kWh → IMBALANCE account
Result: Tracked, explained, auditable
```

---

## **The Ledger**

### **Double-Entry Principle:**

Every transaction creates **2 ledger entries**:

```sql
-- Transfer 50 kWh from pool to contributor
INSERT INTO ledger_entries VALUES
  ('entry-1', pool_account,        debit=50,  credit=0),  -- Debit pool
  ('entry-2', contributor_account, debit=0,   credit=50); -- Credit contributor
```

Same `transaction_id` links them atomically.

### **Append-Only:**

```sql
-- ALLOWED
INSERT INTO ledger_entries ...

-- BLOCKED by database trigger
UPDATE ledger_entries ...  ❌
DELETE FROM ledger_entries ...  ❌
```

Why? **Immutability = Auditability**

### **Computed Balances:**

Balances are **NOT stored**, they're **computed**:

```sql
CREATE VIEW account_balances AS
SELECT
  account_id,
  SUM(credit_amount) - SUM(debit_amount) AS balance
FROM ledger_entries
GROUP BY account_id;
```

Why? **Replay determinism**. Can rebuild state from scratch.

---

## **The Invariants**

### **Fundamental Invariant:**

```
Σ(all account balances) = 0
```

Always. Forever. Non-negotiable.

### **How It's Enforced:**

At every state transition:

```typescript
await invariants.assertCycleBalanced(cycle_id, 'KWH');
await invariants.assertCycleBalanced(cycle_id, 'ZMW');

// If violated → throws error → state machine halts
```

### **Per-Cycle Invariant:**

```sql
SELECT
  SUM(credit_amount) - SUM(debit_amount) AS net_balance
FROM ledger_entries
WHERE settlement_cycle_id = 'cycle-id';

-- Must equal 0 (within floating point error)
```

---

## **The Challenge Window**

### **Why 24 Hours?**

```
Scenario: Meter reports 500 kWh instead of 50 kWh (error)

Without challenge window:
  ↓
Settlement finalizes immediately
  ↓
Payouts executed
  ↓
Error discovered next day
  ↓
TOO LATE — irreversible

With challenge window:
  ↓
Settlement computes
  ↓
24-hour window opens
  ↓
Operator reviews: "Wait, 500 kWh is impossible"
  ↓
Challenge raised
  ↓
Settlement frozen
  ↓
Error corrected
  ↓
Re-compute settlement
  ↓
No harm done
```

### **Real-World Precedent:**

- **PJM Interconnection:** 60-day settlement cycle
- **California ISO:** 7-day preliminary, 55-day final
- **Enerlectra:** 24-hour challenge window (fast but safe)

---

## **Data Flow Example**

### **Day 1: Settlement Execution**

```
1. Production Report:
   100 kWh generated @ 0.50 ZMW/kWh

2. Value Computation:
   DEBIT  system_account (KWH): 100
   CREDIT cluster_pool (KWH):   100

   DEBIT  system_account (ZMW): 50
   CREDIT cluster_pool (ZMW):   50

3. Entitlement Allocation:
   Contributor A: 60% = 60 kWh, 30 ZMW
   Contributor B: 40% = 40 kWh, 20 ZMW

   DEBIT  cluster_pool (KWH): 60
   CREDIT contributor_A (KWH):  60

   DEBIT  cluster_pool (KWH): 40
   CREDIT contributor_B (KWH):  40

   (Same for ZMW)

4. Reconciliation:
   cluster_pool balance = 0 ✓

5. Finality Pending:
   Challenge window opens
   Ends: Tomorrow at 10:00 AM
```

### **Day 2: Finalization**

```
10:00 AM + 1 second:

1. Check for challenges → None
2. Transition to SETTLEMENT_FINALIZED
3. Emit event: 'settlement_finalized'
4. Payout executor triggered
5. Payouts sent:
   - Contributor A: 30 ZMW
   - Contributor B: 20 ZMW
```

---

## **Replay & Verification**

### **Replay Process:**

```typescript
// Get all ledger entries for cycle
const entries = await ledger.getCycleEntries(cycle_id);

// Recompute balances
const balances = {};
for (const entry of entries) {
  balances[entry.account_id] = 
    (balances[entry.account_id] || 0) +
    entry.credit_amount - entry.debit_amount;
}

// Verify sum = 0
const total = Object.values(balances).reduce((a, b) => a + b, 0);
assert(total === 0, 'Ledger imbalanced');

// Verify hash
const computed_hash = hash(cycle_state);
assert(computed_hash === stored_hash, 'Hash mismatch');
```

### **Why This Matters:**

- External auditors can verify correctness
- Regulators can replay history
- Bugs can be detected retroactively
- Trust is algorithmic, not faith-based

---

## **Comparison to Other Systems**

### **vs. Payment Processors (Stripe, PayPal)**

| Feature | Payment Processor | Enerlectra Core |
|---------|------------------|-----------------|
| Purpose | Move money | Allocate value deterministically |
| Ledger | Implicit | Explicit double-entry |
| Finality | Immediate | 24-hour challenge window |
| Replay | No | Yes |
| Invariants | None enforced | Σ = 0 always |

### **vs. Blockchains (Ethereum)**

| Feature | Blockchain | Enerlectra Core |
|---------|-----------|-----------------|
| Consensus | Distributed (PoS/PoW) | Single authority |
| Speed | Slow (seconds/minutes) | Fast (milliseconds) |
| Cost | Gas fees | Zero (database operations) |
| Mutability | Immutable | Immutable ledger |
| Determinism | Yes | Yes |
| Use case | Trustless systems | Regulated clearinghouse |

### **vs. Traditional Accounting Systems**

| Feature | Traditional | Enerlectra Core |
|---------|------------|-----------------|
| Double-entry | Sometimes | Always |
| Immutability | No (edits allowed) | Yes (append-only) |
| Replay | No | Yes |
| State machine | No | Yes |
| Real-time | No | Yes |

---

## **Design Philosophy**

### **1. Determinism Over Flexibility**

```
❌ Bad: "Let's add a flag to skip validation"
✅ Good: "Validation always runs"
```

### **2. Immutability Over Convenience**

```
❌ Bad: "Let's update the ledger entry"
✅ Good: "Let's insert a reversal entry"
```

### **3. Invariants Over Performance**

```
❌ Bad: "Skip balance check for speed"
✅ Good: "Always check, optimize the check"
```

### **4. Auditability Over Simplicity**

```
❌ Bad: "Just store the final balance"
✅ Good: "Store every ledger entry"
```

---

## **Scaling Considerations**

### **Current Design:**

- ✅ Handles 1000s of contributors per cluster
- ✅ Handles 100s of clusters per day
- ✅ Ledger entries: ~10-50 per settlement

### **Future Optimizations:**

If you scale to 10,000+ clusters:

1. **Batch processing** — Process multiple clusters in parallel
2. **Partitioning** — Partition ledger by settlement_cycle_id
3. **Archive old cycles** — Move finalized cycles to cold storage
4. **Async reconciliation** — Decouple reconciliation from settlement

But don't premature optimize. Current design is **proven at scale** (similar to PJM, DTCC).

---

## **Security Model**

### **Threats:**

1. **Ledger Tampering** → Prevented by immutability + replay verification
2. **State Corruption** → Prevented by hash chain
3. **Invariant Violation** → Prevented by enforcement at every transition
4. **Unauthorized Finalization** → Prevented by challenge window
5. **Double Spending** → Prevented by double-entry + balance checks

### **Trust Boundaries:**

```
TRUSTED:
- Database (Supabase/Postgres)
- Enerlectra Core code
- Operator (who runs runDailySettlement)

NOT TRUSTED:
- Production reports (verified before use)
- Contributor allocations (checked against invariants)
- External systems (isolated via SYSTEM accounts)
```

---

## **Future Extensions**

Once this foundation is solid, you can add:

1. **Secondary Trading** — Transfer between contributor accounts
2. **Derivatives** — Forward contracts, options
3. **Margin** — Collateral accounts for trading
4. **Carbon Credits** — Additional account unit type
5. **Tokenization** — 1 account balance = 1 NFT
6. **Multi-Currency** — Add USD, EUR units
7. **Real-Time Settlement** — Sub-daily cycles

**All of these are trivial** once the account model is correct.

---

## **Conclusion**

Enerlectra Core is **infrastructure**.

It's not flashy. It's not a product. It's a **foundation**.

Like:
- **PG&E's grid** (infrastructure for electricity)
- **SWIFT** (infrastructure for bank transfers)
- **DTCC** (infrastructure for stock settlement)

**Enerlectra Core** = infrastructure for energy value settlement.

Once you have this, everything else is layering.

---

**Questions? Read the code. It's the source of truth.** 📖