import path from 'path'
import fs from 'fs'

export const STORE_DIR = path.join(process.cwd(), 'enerlectra-core', 'store')

export function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
}

export function storeFile(filename: string): string {
  ensureStoreDir()
  return path.join(STORE_DIR, filename)
}
