// installer.service.ts
// Core service for installer-specific operations.

import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';
import { logMetric } from './metrics.js';

interface Asset {
  id: string;
  type: string;
  serial_number: string;
  status: string;
}

interface Fault {
  id: string;
  event_type: string;
  created_at: string;
}

export class InstallerService {
  async getInstalls(orgId: string): Promise<Asset[] | null> {
    const { data: assets, error } = await supabase
      .from('assets')
      .select('id, type, serial_number, status')
      .eq('organisation_id', orgId)
      .limit(10);

    if (error) {
      logger.error({ error, orgId }, 'Failed to fetch installs');
      return null;
    }

    return assets;
  }

  async getFaults(orgId: string): Promise<Fault[] | null> {
    const { data: faults, error } = await supabase
      .from('events')
      .select('*')
      .eq('organisation_id', orgId)
      .in('event_type', ['fault_reported', 'battery_fault', 'overload'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      logger.error({ error, orgId }, 'Failed to fetch faults');
      return null;
    }

    return faults;
  }

  async logInstallerInstallsViewed(userId: string, orgId: string): Promise<void> {
    await logMetric('installer_installs_viewed', userId, orgId);
  }

  async logInstallerFaultsViewed(userId: string, orgId: string): Promise<void> {
    await logMetric('installer_faults_viewed', userId, orgId);
  }

  async logInstallerReportFaultClicked(userId: string, orgId: string): Promise<void> {
    await logMetric('installer_report_fault_clicked', userId, orgId);
  }
}