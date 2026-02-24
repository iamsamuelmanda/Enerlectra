import fs from 'fs'
import path from 'path'

const STORE_DIR = path.join(process.cwd(), 'store')
const CONTRIBUTIONS_FILE = path.join(
  STORE_DIR,
  'contributions.json'
)

/**
 * Throws if ownership snapshot is stale
 */
export function assertSnapshotIsFresh(
  clusterId: string,
  snapshotGeneratedAt: string
) {
  if (!fs.existsSync(CONTRIBUTIONS_FILE)) return

  const contributions = JSON.parse(
    fs.readFileSync(CONTRIBUTIONS_FILE, 'utf8')
  )

  const latestContribution = contributions
    .filter((c: any) => c.clusterId === clusterId)
    .sort(
      (a: any, b: any) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    )[0]

  if (!latestContribution) return

  const snapshotTime = new Date(
    snapshotGeneratedAt
  ).getTime()

  const contributionTime = new Date(
    latestContribution.timestamp
  ).getTime()

  if (snapshotTime < contributionTime) {
    throw new Error(
      'Ownership snapshot is stale. Recompute required.'
    )
  }
}
