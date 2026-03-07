# @enerlectra/core

**The Economic Engine for Fair Energy Ownership**

A deterministic settlement engine for energy clearinghouses. Built with double-entry accounting, immutable ledgers, and institutional-grade integrity.

---

## **What Is This?**

Enerlectra Core (EE) is the settlement infrastructure for energy marketplaces. It:

- ✅ Converts physical energy production → economic value
- ✅ Allocates value to contributors using double-entry accounting
- ✅ Enforces invariants (Σ debits = Σ credits, always)
- ✅ Provides replay verification (rebuild state from ledger)
- ✅ Manages 24-hour challenge windows before finality
- ✅ Creates tamper-evident audit trails

**NOT a payment app. A clearinghouse.**

---

## **Installation**

```bash
npm install @enerlectra/core
```

### **Database Setup**

Run these migrations in your Supabase/Postgres database:

```bash
psql $DATABASE_URL -f supabase/migrations/001_accounts_core.sql
psql $DATABASE_URL -f supabase/migrations/002_accounts_seed.sql
psql $DATABASE_URL -f supabase/migrations/003_accounts_indexes.sql
```

---

## **Quick Start**

```typescript
import { createClient } from '@supabase/supabase-js';
import { runDailySettlement } from '@enerlectra/core';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Run daily settlement
const result = await runDailySettlement(supabase, {
  cluster_id: 'cluster-uuid',
  settlement_date: '2026-02-25',
  production_report: {
    kwh_reported: 100,
    kwh_verified: 98,
    price_per_kwh: 0.50
  },
  contributor_allocations: [
    { contributor_id: 'user-1', kwh_share: 49, value_share: 24.50 },
    { contributor_id: 'user-2', kwh_share: 49, value_share: 24.50 }
  ]
});

console.log(result);
// {
//   success: true,
//   settlement_cycle_id: '9a3f...',
//   final_state: 'FINALITY_PENDING',
//   operations_completed: [...]
// }
```

---

## **The Settlement Lifecycle**

### **State Machine:**

```
OPERATIONAL
  → PRODUCTION_REPORTED   (kWh entered into system)
  → VALUE_COMPUTED        (kWh × price = value)
  → ENTITLEMENTS_ALLOCATED (distributed to contributors)
  → SETTLEMENT_COMPUTED
  → BALANCES_NETTED       (Σ debits = Σ credits verified)
  → RECONCILIATION_COMPLETE
  → FINALITY_PENDING      (24-hour challenge window)
  → SETTLEMENT_FINALIZED  (triggers payouts)
```

### **Account Operations:**

Every state transition performs ledger operations:

```
VALUE_COMPUTED:
  DEBIT  system_account (kWh)
  CREDIT cluster_pool_account (kWh)

ENTITLEMENTS_ALLOCATED:
  DEBIT  cluster_pool_account
  CREDIT contributor_accounts (pro-rata)

RECONCILIATION:
  Any pool remainder → reserve or imbalance accounts
```

---

## **Core Concepts**

### **1. Settlement Cycle**

A settlement cycle = 1 day of energy production for 1 cluster.

```typescript
import { computeSettlementCycleId } from '@enerlectra/core';

const cycle_id = computeSettlementCycleId('cluster-uuid', '2026-02-25');
// deterministic hash: '9a3f8b2c...'
```

### **2. Account Types**

```
CONTRIBUTOR   → Individual contributor positions
CLUSTER_POOL  → Temporary holding account (per cycle)
RESERVE       → Persistent surplus/buffer (per cluster)
IMBALANCE     → Shortfall tracking (per cycle)
SYSTEM        → External energy/currency anchor
```

### **3. Double-Entry Ledger**

Every transfer is atomic:

```typescript
import { LedgerService } from '@enerlectra/core';

const ledger = new LedgerService(supabase);

await ledger.transfer({
  from_account_id: pool_account,
  to_account_id: contributor_account,
  amount: 50,
  settlement_cycle_id: cycle_id,
  operation_type: 'ENTITLEMENT_ALLOCATION'
});
```

This creates **2 ledger entries**:
- Debit: pool_account
- Credit: contributor_account

### **4. Invariants**

At every state transition, invariants are enforced:

```typescript
import { AccountInvariants } from '@enerlectra/core';

const invariants = new AccountInvariants(supabase);

// Assert cycle balances to zero
await invariants.assertCycleBalanced(cycle_id, 'KWH');
await invariants.assertCycleBalanced(cycle_id, 'ZMW');

// If violated → throws error, state machine halts
```

### **5. Replay Verification**

Reconstruct state from ledger entries:

```typescript
import { replayCycle } from '@enerlectra/core';

const result = await replayCycle(supabase, cycle_id);

console.log(result);
// {
//   settlement_cycle_id: '9a3f...',
//   entry_count: 24,
//   balance_verified: true,
//   hash_verified: true,
//   issues: []
// }
```

---

## **Advanced Usage**

### **Manual State Transitions**

```typescript
import { SettlementService } from '@enerlectra/core';

const service = new SettlementService(supabase);

// Step 1: Report production
let cycle = await service.reportProduction({
  cluster_id: 'cluster-uuid',
  settlement_date: '2026-02-25',
  kwh_reported: 100,
  kwh_verified: 98,
  price_per_kwh: 0.50
});

// Step 2: Compute value
cycle = await service.computeValue(cycle.settlement_cycle_id);

// Step 3: Allocate entitlements
cycle = await service.allocateEntitlements(cycle.settlement_cycle_id, [
  { contributor_id: 'user-1', kwh_share: 49, value_share: 24.50 },
  { contributor_id: 'user-2', kwh_share: 49, value_share: 24.50 }
]);

// Step 4: Reconcile
cycle = await service.reconcileBalances(cycle.settlement_cycle_id);

// Step 5: Enter finality window
cycle = await service.enterFinalityWindow(cycle.settlement_cycle_id);

// Wait 24 hours...

// Step 6: Finalize (after challenge window)
cycle = await service.finalizeSettlement(cycle.settlement_cycle_id);
```

### **Account Management**

```typescript
import { AccountService } from '@enerlectra/core';

const accounts = new AccountService(supabase);

// Get contributor account
const account_id = await accounts.getContributorAccount('user-id', 'KWH');

// Get balance
const balance = await accounts.getBalance(account_id);

// Get balance details
const details = await accounts.getBalanceDetails(account_id);
console.log(details);
// {
//   account_id: '...',
//   account_type: 'CONTRIBUTOR',
//   unit: 'KWH',
//   balance: 150.5,
//   entry_count: 12,
//   last_entry_at: Date
// }
```

### **Reconciliation Reports**

```typescript
import { AccountReconciliation } from '@enerlectra/core';

const reconciliation = new AccountReconciliation(supabase);

const report = await reconciliation.getReconciliationReport(cycle_id);

console.log(report);
// {
//   cycle_id: '9a3f...',
//   balanced: true,
//   units: [
//     { unit: 'KWH', total_credits: 100, total_debits: 100, net_balance: 0 },
//     { unit: 'ZMW', total_credits: 50, total_debits: 50, net_balance: 0 }
//   ]
// }
```

---

## **Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│  Application Layer                                          │
│  ├─ runDailySettlement()     ← Main entry point            │
│  ├─ replayCycle()            ← Verification                 │
│  └─ attemptFinalization()    ← After challenge window      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Domain Layer                                               │
│  ├─ SettlementService        ← State machine orchestration │
│  ├─ AccountService           ← Account management          │
│  ├─ LedgerService            ← Double-entry operations     │
│  ├─ AccountInvariants        ← Integrity checks            │
│  └─ AccountReconciliation    ← Imbalance handling          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Storage Layer (Supabase/Postgres)                          │
│  ├─ accounts                 ← Account registry            │
│  ├─ ledger_entries           ← Append-only ledger          │
│  ├─ settlement_cycles        ← State machine records       │
│  └─ Views & Functions        ← Computed balances           │
└─────────────────────────────────────────────────────────────┘
```

---

## **Key Principles**

### **1. Determinism**
Same inputs → same outputs, always. No randomness. No timestamps in business logic.

### **2. Immutability**
Ledger is append-only. No updates. No deletes. Only inserts.

### **3. Double-Entry**
Every debit has matching credit. Σ(all accounts) = 0, always.

### **4. Replay-ability**
State can be reconstructed from ledger entries alone. No stored balances.

### **5. Finality Window**
24-hour challenge period before irreversible settlement.

---

## **Deployment Checklist**

- [ ] Run database migrations
- [ ] Verify SYSTEM accounts created
- [ ] Test full settlement cycle (staging)
- [ ] Verify replay verification works
- [ ] Set up worker for automatic finalization (after 24h)
- [ ] Set up monitoring for invariant violations
- [ ] Set up alerts for failed settlements

---

## **FAQ**

### **Q: Can I skip the challenge window?**
No. The 24-hour finality window is fundamental to institutional trust. Immediate finality would make errors irreversible.

### **Q: What if contributors don't sum to 100%?**
The reconciliation step handles this. Surplus → reserve account. Shortfall → imbalance account. Pool always drains to zero.

### **Q: Can accounts go negative?**
Only SYSTEM accounts. All other accounts enforce non-negative balances at invariant check.

### **Q: How do I handle rounding errors?**
They accumulate in the imbalance account, which must be explained and cleared periodically.

### **Q: Can I use this without Supabase?**
Yes, but you'll need to implement the storage layer functions (find_or_create_account, check_cycle_balanced, etc.) for your database.

---

## **Support**

- Docs: [docs.enerlectra.com](https://docs.enerlectra.com)
- Issues: [github.com/enerlectra/core/issues](https://github.com/enerlectra/core/issues)
- Community: [discord.gg/enerlectra](https://discord.gg/enerlectra)

---

## **License**

MIT