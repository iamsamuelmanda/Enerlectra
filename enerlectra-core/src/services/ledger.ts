import { atomicWriteJson } from '../engines/atomicWrite'
import { storeFile } from '../engines/storePath'
import * as fs from 'fs'
import * as path from 'path'



export type ContributionEntry = {
  contributionId: string
  clusterId: string
  userId: string
  amountZMW: number
  timestamp: string
}

export function recordContribution(entry: ContributionEntry): void {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    atomicWriteJson(file, [])
  }

  const raw = fs.readFileSync(file, 'utf8')
  const data: ContributionEntry[] = raw.trim() ? JSON.parse(raw) : []

  data.push(entry)

  atomicWriteJson(file, data)
}

const file = storeFile('contributions.json')
