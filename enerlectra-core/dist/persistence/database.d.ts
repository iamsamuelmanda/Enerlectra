/**
 * Database connection and initialization
 */
import { Pool } from 'pg';
export interface DatabaseConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    connectionString?: string;
}
export declare class Database {
    private pool;
    constructor(config: DatabaseConfig);
    /**
     * Get pool for repositories
     */
    getPool(): Pool;
    /**
     * Test connection
     */
    testConnection(): Promise<boolean>;
    /**
     * Close all connections
     */
    close(): Promise<void>;
}
/**
 * Create database instance from environment
 */
export declare function createDatabaseFromEnv(): Database;
