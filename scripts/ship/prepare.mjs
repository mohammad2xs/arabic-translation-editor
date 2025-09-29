import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const CACHE_DIR = path.join(ROOT, '.cache')
const REQUIRED_FILES = ['parallel.jsonl', 'manifest.json']
const OUTPUT_DIRS = [
  path.join(ROOT, 'artifacts'),
  path.join(ROOT, 'artifacts', 'reports'),
  path.join(ROOT, 'artifacts', 'reports', 'screens')
]

async function ensureCache() {
  for (const file of REQUIRED_FILES) {
    const target = path.join(CACHE_DIR, file)
    try {
      await fs.access(target)
    } catch (error) {
      throw new Error(`Missing required cache file: ${path.relative(ROOT, target)}. Run \`npm run index\`.`)
    }
  }
}

async function ensureDirectories() {
  for (const dir of OUTPUT_DIRS) {
    await fs.mkdir(dir, { recursive: true })
  }
}

async function main() {
  await ensureCache()
  await ensureDirectories()
  console.log('[ship/prepare] Cache verified and artifact directories ready.')
}

main().catch(error => {
  console.error('[ship/prepare] Failed:', error.message)
  process.exitCode = 1
})

