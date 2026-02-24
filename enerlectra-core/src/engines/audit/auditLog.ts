import { atomicWriteJson } from '../atomicWrite'
import { storeFile } from '../storePath'
import * as fs from 'fs'
import * as path from 'path'

export interface AuditEvent {
  timestamp: string
  eventType: string
  actor?: string
  clusterId?: string
  payload: any
}

const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  'store',
  'audit-log.json'
)

/**
 * Append-only audit log.
 * NEVER modify or delete entries.
 * This is the system ledger.
 */
export function appendAuditEvent(event: Omit<AuditEvent, 'timestamp'>) {
  const entry: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString()
  }

  let log: AuditEvent[] = []

  if (fs.existsSync(AUDIT_LOG_PATH)) {
    const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf8')
    log = raw.trim() ? JSON.parse(raw) : []
  }

  log.push(entry)

  fs.writeFileSync(
    AUDIT_LOG_PATH,
    JSON.stringify(log, null, 2)
  )
}

const FILE = storeFile('audit-log.json')
