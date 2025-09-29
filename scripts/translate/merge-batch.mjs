#!/usr/bin/env node

/**
 * Batch Translation Merger
 * Merges completed translations back into parallel dataset
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const BACKUP_DIR = path.join(PROJECT_ROOT, '.cache/backups')
const OPUS_DIR = path.join(PROJECT_ROOT, '.cache/opus')
const TRANSLATED_PATH = path.join(OPUS_DIR, 'translated.jsonl')
const GAPS_DIR = path.join(PROJECT_ROOT, 'artifacts/gaps')

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `parallel.${timestamp}.jsonl`)

  await fs.mkdir(BACKUP_DIR, { recursive: true })
  await fs.copyFile(PARALLEL_PATH, backupPath)

  console.log(`[merge] Backup created: ${path.relative(PROJECT_ROOT, backupPath)}`)
  return backupPath
}

async function parseCompletedBatches() {
  const translations = new Map()

  try {
    const batchFiles = await fs.readdir(GAPS_DIR)
    const markdownFiles = batchFiles.filter(file => file.startsWith('batch-') && file.endsWith('.md'))

    for (const filename of markdownFiles) {
      const filepath = path.join(GAPS_DIR, filename)
      const content = await fs.readFile(filepath, 'utf8')

      // Parse markdown for completed translations
      const sections = content.split('---').slice(1) // Skip header

      for (const section of sections) {
        const lines = section.trim().split('\n')
        let currentId = null
        let englishText = ''
        let foundEN = false

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()

          // Extract ID from bold markdown
          const idMatch = line.match(/^\*\*(.+?)\*\*$/)
          if (idMatch) {
            currentId = idMatch[1]
            continue
          }

          // Check for [EN]: marker
          if (line === '[EN]:') {
            foundEN = true
            // Collect all non-empty lines after [EN]: until next section or end
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j].trim()
              if (nextLine === '---' || nextLine.startsWith('**')) break
              if (nextLine && nextLine !== '') {
                if (englishText) englishText += ' '
                englishText += nextLine
              }
            }
            break
          }
        }

        if (currentId && englishText.trim()) {
          translations.set(currentId, englishText.trim())
          console.log(`[merge] Found translation for ${currentId}: ${englishText.slice(0, 50)}...`)
        }
      }
    }

    console.log(`[merge] Parsed ${translations.size} completed translations from ${markdownFiles.length} batch files`)
    return translations

  } catch (error) {
    console.warn(`[merge] Could not parse batch files: ${error.message}`)
    return new Map()
  }
}

async function writeTranslatedEntries(translations) {
  await fs.mkdir(OPUS_DIR, { recursive: true })

  const entries = []
  for (const [id, tgt] of translations.entries()) {
    const styleDigest = 'auto-derived-v1' // From our style profile
    entries.push({
      id,
      tgt,
      flags: {
        fromOpus: true,
        styleDigest
      }
    })
  }

  const payload = entries.map(entry => JSON.stringify(entry)).join('\\n') + (entries.length ? '\\n' : '')
  await fs.writeFile(TRANSLATED_PATH, payload, 'utf8')

  console.log(`[merge] Wrote ${entries.length} translated entries to: ${path.relative(PROJECT_ROOT, TRANSLATED_PATH)}`)
  return entries
}

async function mergeIntoParallel(translations) {
  const content = await fs.readFile(PARALLEL_PATH, 'utf8')
  const lines = content.split('\\n').filter(Boolean)
  let mergedCount = 0

  const updatedLines = []

  for (const line of lines) {
    try {
      const segment = JSON.parse(line)

      if (translations.has(segment.id) && (!segment.tgt || segment.tgt.trim().length < 3)) {
        // Merge translation into segment
        segment.tgt = translations.get(segment.id)
        segment.status = 'reviewed' // Mark as reviewed since translated by Opus
        segment.lengthRatio = Number((segment.tgt.length / Math.max(segment.src.length, 1)).toFixed(3))

        // Add metadata about translation source
        segment.metadata = segment.metadata || {}
        segment.metadata.translatedBy = 'claude-opus'
        segment.metadata.translatedAt = new Date().toISOString()
        segment.metadata.styleProfile = 'auto-derived-v1'

        mergedCount++
        console.log(`[merge] Merged translation for ${segment.id}`)
      }

      updatedLines.push(JSON.stringify(segment))
    } catch (parseError) {
      // Keep malformed lines as-is
      updatedLines.push(line)
    }
  }

  const updatedContent = updatedLines.join('\\n') + '\\n'
  await fs.writeFile(PARALLEL_PATH, updatedContent, 'utf8')

  console.log(`[merge] Merged ${mergedCount} translations into parallel dataset`)
  return mergedCount
}

async function mergeBatch() {
  const backupPath = await createBackup()
  const translations = await parseCompletedBatches()

  if (translations.size === 0) {
    console.log('[merge] No completed translations found in batch files')
    return { mergedCount: 0, backupPath }
  }

  await writeTranslatedEntries(translations)
  const mergedCount = await mergeIntoParallel(translations)

  console.log(`[merge] Summary:`)
  console.log(`  Backup: ${path.relative(PROJECT_ROOT, backupPath)}`)
  console.log(`  Translations found: ${translations.size}`)
  console.log(`  Merged into dataset: ${mergedCount}`)
  console.log(`[merge] Next step: npm run index:manuscript`)

  return { mergedCount, backupPath, translationsFound: translations.size }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mergeBatch().catch(error => {
    console.error('[merge] Failed to merge batch:', error.message)
    process.exitCode = 1
  })
}

export { mergeBatch }