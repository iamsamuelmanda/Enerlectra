// enerlectra-core/src/domain/Transaction.ts
export interface Transaction {
    id: string;        // DB row id
    userId: string;    // users.id
    clusterId: string; // clusters.id (your clusterId)
    amountPCU: number; // PCUs contributed
    createdAt: string; // ISO timestamp
  }
  