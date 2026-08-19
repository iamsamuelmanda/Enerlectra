// role.service.ts
// Core service for role management.

import { setUserRole } from 'enerlectra-core/src/core/services/identity.js';

interface RoleOption {
  id: string;
  label: string;
}

export class RoleService {
  private readonly ROLE_OPTIONS: RoleOption[] = [
    { id: 'installer', label: 'Installer' },
    { id: 'operator', label: 'Operator' },
    { id: 'customer', label: 'Customer' },
    { id: 'admin', label: 'Admin' }
  ];

  async validateRole(role: string): Promise<RoleOption | null> {
    return this.ROLE_OPTIONS.find(r => r.id === role) || null;
  }

  async setUserRole(userId: string, role: string): Promise<void> {
    await setUserRole(userId, role);
  }

  getRoleOptions(): RoleOption[] {
    return this.ROLE_OPTIONS;
  }
}