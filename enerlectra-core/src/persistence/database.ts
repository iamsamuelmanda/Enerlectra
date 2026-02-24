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

export class Database {
  private pool: Pool;
  
  constructor(config: DatabaseConfig) {
    // Prefer a full connection string (Supabase pooled URL)
    if (config.connectionString) {
      this.pool = new Pool({
        connectionString: config.connectionString,
        max: config.max || 15, // match Supabase Nano pool size by default[attached_file:1]
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
        ssl: { rejectUnauthorized: false }, // required by Supabase[attached_file:1][web:573]
      });
    } else {
      // Fallback: local Postgres with discrete params
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        max: config.max || 20,
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      });
    }
    
    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }
  
  /**
   * Get pool for repositories
   */
  getPool(): Pool {
    return this.pool;
  }
  
  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT NOW()');
      console.log('Database connected at:', result.rows[0].now);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }
  
  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create database instance from environment
 */
export function createDatabaseFromEnv(): Database {
  const supabaseUrl = process.env.SUPABASE_DB_URL;

  if (supabaseUrl) {
    // Use Supabase pooled connection string[attached_file:1][web:573]
    return new Database({
      connectionString: supabaseUrl,
      max: parseInt(process.env.DB_POOL_SIZE || '15', 10),
    });
  }

  // Fallback: local Postgres (for dev without Supabase)
  return new Database({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'enerlectra',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  });
}
