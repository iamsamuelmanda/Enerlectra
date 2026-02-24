import fs from 'fs'
import path from 'path'

const STORE_DIR = path.join(process.cwd(), 'store')
const FILE = path.join(STORE_DIR, 'final-distributions.json')

export function getFinalDistributionById(
  distributionId: string
) {
  if (!fs.existsSync(FILE)) {
    throw new Error('No finalized distributions found')
  }

  const all = JSON.parse(fs.readFileSync(FILE, 'utf8'))

  const found = all.find(
    (d: any) => d.distributionId === distributionId
  )

  if (!found) {
    throw new Error(
      `Final distribution ${distributionId} not found`
    )
  }

  return found
}
