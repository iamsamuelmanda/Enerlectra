// src/engines/atomicWrite.ts
import fs from 'fs'
import path from 'path'

export function atomicWriteJson(
  filePath: string,
  data: unknown
) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  // 1) Write full content to temp file
  fs.writeFileSync(
    tmpPath,
    JSON.stringify(data, null, 2),
    'utf8'
  )

  // 2) Atomic replace
  fs.renameSync(tmpPath, filePath)
}
