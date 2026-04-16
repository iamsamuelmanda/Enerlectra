/**
 * Background Jobs
 * Automated scheduled tasks for settlement, reconciliation, and maintenance
 */
import { ScheduledTask } from 'node-cron';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TreasuryReconciliation } from '../domain/treasury/treasury-reconciliation';
import { TreasuryService } from '../domain/treasury/treasury-service';
import { PaymentOrchestrator } from '../domain/payment/payment-orchestrator';
import { WebhookRetryScheduler } from '../adapters/webhooks/webhook-handler';
export interface JobResult {
    jobName: string;
    success: boolean;
    startedAt: Date;
    completedAt: Date;
    duration: number;
    result?: any;
    error?: string;
}
export interface JobSchedule {
    name: string;
    cron: string;
    enabled: boolean;
    task: ScheduledTask | null;
}
export declare class BackgroundJobScheduler {
    private services;
    private jobs;
    private supabase;
    constructor(supabase: SupabaseClient, services: {
        treasury: TreasuryService;
        reconciliation: TreasuryReconciliation;
        orchestrator: PaymentOrchestrator;
        webhookRetry: WebhookRetryScheduler;
    });
    /**
     * Register all background jobs
     */
    registerJobs(): void;
    /**
     * Register a single job
     */
    private registerJob;
    /**
     * Start all jobs
     */
    startAll(): void;
    /**
     * Start specific job
     */
    startJob(name: string): void;
    /**
     * Stop specific job
     */
    stopJob(name: string): void;
    /**
     * Stop all jobs
     */
    stopAll(): void;
    /**
     * Execute job manually (for testing)
     */
    runJobNow(name: string): Promise<JobResult>;
    /**
     * Execute a job and log results
     */
    private executeJob;
    /**
     * Get job handler function by name
     */
    private getJobHandler;
    /**
     * Health check
     */
    private performHealthCheck;
    /**
     * Save treasury snapshot
     */
    private saveTreasurySnapshot;
    /**
     * Cleanup old logs
     */
    private cleanupOldLogs;
    /**
     * Log job execution
     */
    private logJobExecution;
    /**
     * Check if job is critical
     */
    private isCriticalJob;
    /**
     * Alert on job failure
     */
    private alertJobFailure;
    /**
     * Get status of all jobs
     */
    getJobStatus(): Array<{
        name: string;
        cron: string;
        enabled: boolean;
    }>;
}
