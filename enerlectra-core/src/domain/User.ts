// enerlectra-core/src/domain/User.ts
export interface User {
    id: string;          // Supabase user id or your own UUID
    displayName: string; // What you show in UI
    createdAt: string;   // ISO timestamp
  }
  