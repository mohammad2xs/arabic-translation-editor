#!/usr/bin/env node

/**
 * Translation Gap Detection & Batch Builder
 * Identifies segments missing targets and creates batches for translation
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const GAPS_PATH = path.join(PROJECT_ROOT, '.cache/gaps.jsonl')
const GAPS_DIR = path.join(PROJECT_ROOT, 'artifacts/gaps')

const MAX_BATCH_SIZE = 60

async function loadParallelSegments() {
  try {
    const content = await fs.readFile(PARALLEL_PATH, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const segments = []

    for (const line of lines) {
      try {
        const seg = JSON.parse(line)
        segments.push(seg)
      } catch (parseError) {
        console.warn(`[gaps] Skipping malformed line: ${line.slice(0, 50)}...`)
        continue
      }
    }

    console.log(`[gaps] Loaded ${segments.length} parallel segments`)
    return segments
  } catch (error) {
    throw new Error(`Failed to load parallel segments: ${error.message}`)
  }
}

function identifyGaps(segments) {
  const gaps = []

  for (const seg of segments) {
    // Check if segment has Arabic source but missing or empty English target
    const hasArabicSrc = seg.src && seg.src.trim() && /[\u0600-\u06FF]/.test(seg.src)
    const missingTarget = !seg.tgt || !seg.tgt.trim() || seg.tgt.trim().length < 3

    if (hasArabicSrc && missingTarget) {
      // Get context from nearby segments
      const segIndex = segments.indexOf(seg)
      const contextPrev = segIndex > 0 ? segments[segIndex - 1]?.src || '' : ''
      const contextNext = segIndex < segments.length - 1 ? segments[segIndex + 1]?.src || '' : ''

      gaps.push({
        id: seg.id,
        fileRefs: seg.fileRefs || [],
        paraIndex: seg.paraIndex || 0,
        segIndex: seg.segIndex || 0,
        src: seg.src.trim(),
        contextPrev: contextPrev.trim(),
        contextNext: contextNext.trim()
      })
    }
  }

  console.log(`[gaps] Found ${gaps.length} segments needing translation`)
  return gaps
}

async function writeGapsFile(gaps) {
  const payload = gaps.map(gap => JSON.stringify(gap)).join('\n') + (gaps.length ? '\n' : '')
  await fs.mkdir(path.dirname(GAPS_PATH), { recursive: true })
  await fs.writeFile(GAPS_PATH, payload, 'utf8')
  console.log(`[gaps] Gaps written to: ${path.relative(PROJECT_ROOT, GAPS_PATH)}`)
}

async function createBatchFiles(gaps) {
  await fs.mkdir(GAPS_DIR, { recursive: true })

  // Clear existing batch files
  try {
    const existingFiles = await fs.readdir(GAPS_DIR)
    const batchFiles = existingFiles.filter(file => file.startsWith('batch-') && file.endsWith('.md'))
    for (const file of batchFiles) {
      await fs.unlink(path.join(GAPS_DIR, file))
    }
  } catch (error) {
    // Directory might not exist or be empty
  }

  if (gaps.length === 0) {
    console.log('[gaps] No gaps found - no batch files needed')
    return []
  }

  const batches = []
  for (let i = 0; i < gaps.length; i += MAX_BATCH_SIZE) {
    const batch = gaps.slice(i, i + MAX_BATCH_SIZE)
    batches.push(batch)
  }

  const batchFiles = []
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const batchNumber = String(batchIndex + 1).padStart(4, '0')
    const filename = `batch-${batchNumber}.md`
    const filepath = path.join(GAPS_DIR, filename)

    let content = `# Translation Batch ${batchNumber}\n\n`
    content += `*${batch.length} segments for translation*\n\n`
    content += `## Instructions\n\n`
    content += `Translate the Arabic text after each [EN]: marker. Follow the style profile:\n`
    content += `- Use western digits (0-9)\n`
    content += `- Use ASCII quotes for English\n`
    content += `- Use Arabic question mark ؟ in Arabic source\n`
    content += `- Preserve religious terms: الله، محمد، القرآن، etc.\n\n`
    content += `---\n\n`

    for (const gap of batch) {
      content += `**${gap.id}**\n\n`

      // Add context if available
      if (gap.contextPrev) {
        content += `*Previous:* ${gap.contextPrev}\n\n`
      }

      content += `**Arabic:**\n${gap.src}\n\n`

      if (gap.contextNext) {
        content += `*Next:* ${gap.contextNext}\n\n`
      }

      content += `[EN]:\n\n`
      content += `---\n\n`
    }

    await fs.writeFile(filepath, content, 'utf8')
    batchFiles.push(filename)
    console.log(`[gaps] Created batch file: ${filename} (${batch.length} segments)`)
  }

  return batchFiles
}

async function buildGaps() {
  const segments = await loadParallelSegments()
  const gaps = identifyGaps(segments)

  await writeGapsFile(gaps)
  const batchFiles = await createBatchFiles(gaps)

  const summary = {
    totalGaps: gaps.length,
    batchCount: batchFiles.length,
    maxBatchSize: MAX_BATCH_SIZE,
    batchFiles: batchFiles,
    generatedAt: new Date().toISOString()
  }

  console.log(`[gaps] Summary:`)
  console.log(`  Total gaps: ${summary.totalGaps}`)
  console.log(`  Batch files: ${summary.batchCount}`)
  console.log(`  Max batch size: ${summary.maxBatchSize}`)

  if (batchFiles.length > 0) {
    console.log(`[gaps] Next steps:`)
    console.log(`  1. Review and translate batch files in ${path.relative(PROJECT_ROOT, GAPS_DIR)}`)
    console.log(`  2. Run npm run translate:merge after completing translations`)
  }

  return summary
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildGaps().catch(error => {
    console.error('[gaps] Failed to build gaps:', error.message)
    process.exitCode = 1
  })
}

export { buildGaps }