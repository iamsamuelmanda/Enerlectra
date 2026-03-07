/**
 * Background Jobs
 * Automated scheduled tasks for settlement, reconciliation, and maintenance
 */

import { schedule, ScheduledTask } from 'node-cron';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TreasuryReconciliation } from '../domain/treasury/treasury-reconciliation';
import { TreasuryService } from '../domain/treasury/treasury-service';
import { PaymentOrchestrator } from '../domain/payment/payment-orchestrator';
import { WebhookRetryScheduler } from '../adapters/webhooks/webhook-handler';

// ═══════════════════════════════════════════════════════════════
// JOB DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface JobResult {
  jobName: string;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  duration: number; // milliseconds
  result?: any;
  error?: string;
}

export interface JobSchedule {
  name: string;
  cron: string;
  enabled: boolean;
  task: ScheduledTask | null;
}

// ═══════════════════════════════════════════════════════════════
// BACKGROUND JOB SCHEDULER
// ═══════════════════════════════════════════════════════════════

export class BackgroundJobScheduler {
  private jobs: Map<string, JobSchedule> = new Map();
  private supabase: SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private services: {
      treasury: TreasuryService;
      reconciliation: TreasuryReconciliation;
      orchestrator: PaymentOrchestrator;
      webhookRetry: WebhookRetryScheduler;
    }
  ) {
    this.supabase = supabase;
  }

  // ═══════════════════════════════════════════════════════════
  // JOB REGISTRATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Register all background jobs
   */
  registerJobs(): void {
    // Daily treasury reconciliation (2 AM)
    this.registerJob(
      'daily_reconciliation',
      '0 2 * * *', // Every day at 2 AM
      async () => {
        return await this.services.reconciliation.runDailyReconciliation();
      }
    );

    // Payment intent expiry processor (every minute)
    this.registerJob(
      'process_expired_intents',
      '* * * * *', // Every minute
      async () => {
        return await this.services.orchestrator.processExpiredIntents();
      }
    );

    // Webhook retry (every 5 minutes)
    this.registerJob(
      'retry_failed_webhooks',
      '*/5 * * * *', // Every 5 minutes
      async () => {
        return await this.services.webhookRetry.processFailedWebhooks();
      }
    );

    // Treasury reservation expiry (every 15 minutes)
    this.registerJob(
      'expire_old_reservations',
      '*/15 * * * *', // Every 15 minutes
      async () => {
        const { data } = await this.supabase.rpc('expire_old_reservations');
        return { expired: data };
      }
    );

    // Health check / heartbeat (every 5 minutes)
    this.registerJob(
      'system_heartbeat',
      '*/5 * * * *',
      async () => {
        return await this.performHealthCheck();
      }
    );

    // Treasury state snapshot (every hour)
    this.registerJob(
      'treasury_snapshot',
      '0 * * * *', // Top of every hour
      async () => {
        const state = await this.services.treasury.getTreasuryState();
        await this.saveTreasurySnapshot(state);
        return { snapshotted: true, timestamp: new Date() };
      }
    );

    // Cleanup old logs (daily at 3 AM)
    this.registerJob(
      'cleanup_old_logs',
      '0 3 * * *',
      async () => {
        return await this.cleanupOldLogs();
      }
    );

    console.log(`✅ Registered ${this.jobs.size} background jobs`);
  }

  /**
   * Register a single job
   */
  private registerJob(
    name: string,
    cronExpression: string,
    handler: () => Promise<any>
  ): void {
    const job: JobSchedule = {
      name,
      cron: cronExpression,
      enabled: false,
      task: null
    };

    this.jobs.set(name, job);
  }

  // ═══════════════════════════════════════════════════════════
  // JOB CONTROL
  // ═══════════════════════════════════════════════════════════

  /**
   * Start all jobs
   */
  startAll(): void {
    for (const [name, job] of this.jobs) {
      this.startJob(name);
    }

    console.log(`🚀 Started ${this.jobs.size} background jobs`);
  }

  /**
   * Start specific job
   */
  startJob(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }

    if (job.enabled) {
      console.log(`⚠️  Job already running: ${name}`);
      return;
    }

    job.task = schedule(job.cron, async () => {
      await this.executeJob(name);
    });

    job.enabled = true;
    console.log(`✅ Started job: ${name} (${job.cron})`);
  }

  /**
   * Stop specific job
   */
  stopJob(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }

    if (job.task) {
      job.task.stop();
      job.task = null;
    }

    job.enabled = false;
    console.log(`⏸️  Stopped job: ${name}`);
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const [name] of this.jobs) {
      this.stopJob(name);
    }

    console.log(`⏸️  Stopped all background jobs`);
  }

  /**
   * Execute job manually (for testing)
   */
  async runJobNow(name: string): Promise<JobResult> {
    return await this.executeJob(name);
  }

  // ═══════════════════════════════════════════════════════════
  // JOB EXECUTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute a job and log results
   */
  private async executeJob(name: string): Promise<JobResult> {
    const startedAt = new Date();
    console.log(`🔄 Running job: ${name} at ${startedAt.toISOString()}`);

    try {
      // Get job handler based on name
      const handler = this.getJobHandler(name);

      // Execute
      const result = await handler();

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      const jobResult: JobResult = {
        jobName: name,
        success: true,
        startedAt,
        completedAt,
        duration,
        result
      };

      // Log successful execution
      await this.logJobExecution(jobResult);

      console.log(`✅ Completed job: ${name} in ${duration}ms`);

      return jobResult;

    } catch (error: any) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      const jobResult: JobResult = {
        jobName: name,
        success: false,
        startedAt,
        completedAt,
        duration,
        error: error.message
      };

      // Log failed execution
      await this.logJobExecution(jobResult);

      console.error(`❌ Job failed: ${name} - ${error.message}`);

      // Alert on critical job failures
      if (this.isCriticalJob(name)) {
        await this.alertJobFailure(jobResult);
      }

      return jobResult;
    }
  }

  /**
   * Get job handler function by name
   */
  private getJobHandler(name: string): () => Promise<any> {
    switch (name) {
      case 'daily_reconciliation':
        return async () => this.services.reconciliation.runDailyReconciliation();

      case 'process_expired_intents':
        return async () => this.services.orchestrator.processExpiredIntents();

      case 'retry_failed_webhooks':
        return async () => this.services.webhookRetry.processFailedWebhooks();

      case 'expire_old_reservations':
        return async () => {
          const { data } = await this.supabase.rpc('expire_old_reservations');
          return { expired: data };
        };

      case 'system_heartbeat':
        return async () => this.performHealthCheck();

      case 'treasury_snapshot':
        return async () => {
          const state = await this.services.treasury.getTreasuryState();
          await this.saveTreasurySnapshot(state);
          return { snapshotted: true };
        };

      case 'cleanup_old_logs':
        return async () => this.cleanupOldLogs();

      default:
        throw new Error(`Unknown job: ${name}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPER JOBS
  // ═══════════════════════════════════════════════════════════

  /**
   * Health check
   */
  private async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: any;
  }> {
    const checks: any = {};

    // Check database
    try {
      await this.supabase.from('accounts').select('account_id').limit(1);
      checks.database = 'ok';
    } catch (error) {
      checks.database = 'failed';
    }

    // Check treasury state
    try {
      const state = await this.services.treasury.getTreasuryState();
      checks.treasury = state.isBalanced ? 'ok' : 'degraded';
    } catch (error) {
      checks.treasury = 'failed';
    }

    // Determine overall status
    const failedChecks = Object.values(checks).filter(v => v === 'failed').length;
    const degradedChecks = Object.values(checks).filter(v => v === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (failedChecks > 0) {
      status = 'unhealthy';
    } else if (degradedChecks > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return { status, checks };
  }

  /**
   * Save treasury snapshot
   */
  private async saveTreasurySnapshot(state: any): Promise<void> {
    await this.supabase
      .from('treasury_snapshots')
      .insert({
        timestamp: new Date().toISOString(),
        state: state
      });
  }

  /**
   * Cleanup old logs
   */
  private async cleanupOldLogs(): Promise<{
    webhookLogs: number;
    jobLogs: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days

    // Delete old webhook logs
    const { count: webhookCount } = await this.supabase
      .from('webhook_logs')
      .delete()
      .lt('received_at', cutoffDate.toISOString());

    // Delete old job execution logs
    const { count: jobCount } = await this.supabase
      .from('job_executions')
      .delete()
      .lt('started_at', cutoffDate.toISOString());

    return {
      webhookLogs: webhookCount || 0,
      jobLogs: jobCount || 0
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LOGGING & ALERTING
  // ═══════════════════════════════════════════════════════════

  /**
   * Log job execution
   */
  private async logJobExecution(result: JobResult): Promise<void> {
    await this.supabase
      .from('job_executions')
      .insert({
        job_name: result.jobName,
        success: result.success,
        started_at: result.startedAt.toISOString(),
        completed_at: result.completedAt.toISOString(),
        duration_ms: result.duration,
        result: result.result,
        error_message: result.error
      });
  }

  /**
   * Check if job is critical
   */
  private isCriticalJob(name: string): boolean {
    const criticalJobs = [
      'daily_reconciliation',
      'process_expired_intents'
    ];

    return criticalJobs.includes(name);
  }

  /**
   * Alert on job failure
   */
  private async alertJobFailure(result: JobResult): Promise<void> {
    // In production, send to PagerDuty, Slack, etc.
    console.error(`🚨 CRITICAL JOB FAILED: ${result.jobName}`);
    console.error(`Error: ${result.error}`);

    // Log alert
    await this.supabase
      .from('alerts')
      .insert({
        severity: 'CRITICAL',
        source: 'background_jobs',
        message: `Job ${result.jobName} failed: ${result.error}`,
        metadata: result
      });
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════

  /**
   * Get status of all jobs
   */
  getJobStatus(): Array<{
    name: string;
    cron: string;
    enabled: boolean;
  }> {
    return Array.from(this.jobs.values()).map(job => ({
      name: job.name,
      cron: job.cron,
      enabled: job.enabled
    }));
  }
}