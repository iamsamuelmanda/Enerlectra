/** * Startup validation - validates environment and dependencies before server starts */
import { createClient } from '@supabase/supabase-js'
import pino from 'pino'
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export interface StartupCheckResult {
  success: boolean
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message?: string }>
}

function validateEnvironmentVariables(): { status: 'pass' | 'fail'; message?: string } {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    return { status: 'fail', message: `Missing required environment variables: ${missing.join(', ')}` }
  }
  return { status: 'pass' }
}

export async function runStartupChecks(): Promise<StartupCheckResult> {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message?: string }> = []
  
  // 1. Validate environment variables
  const envCheck = validateEnvironmentVariables()
  checks.push({ name: 'Environment Variables', status: envCheck.status, message: envCheck.message })
  
  // 2. Test Supabase connection
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    const { error } = await supabase.from('pcu_balances').select('count').limit(1)
    if (error) {
      checks.push({ name: 'Supabase Connection', status: 'fail', message: error.message })
    } else {
      checks.push({ name: 'Supabase Connection', status: 'pass' })
    }
  } catch (error: any) {
    checks.push({ name: 'Supabase Connection', status: 'fail', message: error.message })
  }
  
  // 3. Test Redis connection (if configured)
  if (process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL) {
    try {
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL
      if (redisUrl) {
        // @ts-ignore - redis types may not be installed
        const { createClient } = await import('redis')
        const client = createClient({ url: redisUrl })
        await client.connect()
        await client.ping()
        await client.disconnect()
        checks.push({ name: 'Redis Connection', status: 'pass' })
      }
    } catch (error: any) {
      checks.push({ name: 'Redis Connection', status: 'fail', message: error.message })
    }
  } else {
    checks.push({ name: 'Redis Connection', status: 'warn', message: 'Redis not configured - caching disabled' })
  }
  
  // 4. Check Lenco API configuration
  if (process.env.LENCO_SECRET_KEY && process.env.LENCO_ACCOUNT_ID) {
    checks.push({ name: 'Lenco API', status: 'pass' })
  } else {
    checks.push({ name: 'Lenco API', status: 'warn', message: 'Lenco credentials not configured - payouts disabled' })
  }
  
  // 5. Check exchange rate API
  if (process.env.EXCHANGE_RATE_API_KEY) {
    checks.push({ name: 'Exchange Rate API', status: 'pass' })
  } else {
    checks.push({ name: 'Exchange Rate API', status: 'warn', message: 'Exchange rate API not configured - using fallback rates' })
  }
  
  const success = checks.every(check => check.status !== 'fail')
  return { success, checks }
}

export async function assertStartupChecks(): Promise<void> {
  const result = await runStartupChecks()
  
  // Log all checks
  for (const check of result.checks) {
    switch (check.status) {
      case 'pass':
        logger.info({ check: check.name }, 'Startup check passed')
        break
      case 'fail':
        logger.error({ check: check.name, message: check.message }, 'Startup check failed')
        break
      case 'warn':
        logger.warn({ check: check.name, message: check.message }, 'Startup check warning')
        break
    }
  }
  
  if (!result.success) {
    throw new Error('Startup checks failed. Please fix the errors above.')
  }
  logger.info('All critical startup checks passed')
}