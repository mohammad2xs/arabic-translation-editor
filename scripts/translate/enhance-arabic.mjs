#!/usr/bin/env node

/**
 * Arabic Text Enhancement Script
 * Applies orthography and typography normalization to Arabic texts in parallel dataset
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const BACKUP_DIR = path.join(PROJECT_ROOT, '.cache/backups')
const STYLE_PROFILE_PATH = path.join(PROJECT_ROOT, '.cache/style-profile.json')

// Enhancement options based on derived style profile
const ENHANCEMENT_OPTIONS = {
  normalizeDigits: true,      // Convert to western digits per style profile
  normalizePunctuation: true, // Normalize Arabic punctuation
  removeTatweel: true,        // Remove kashida elongation
  normalizeSpacing: true,     // Fix spacing around punctuation
  normalizeQuotes: true,      // Use ASCII quotes per style profile
  preserveBalance: true       // Maintain bracket/quote balance
}

// Arabic-Indic digit mappings
const ARABIC_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
}

// Eastern Arabic-Indic digit mappings
const EASTERN_ARABIC_DIGITS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
}

// Punctuation normalizations
const PUNCTUATION_MAP = {
  '؟': '?',    // Arabic question mark
  '؛': ';',    // Arabic semicolon
  '،': ',',    // Arabic comma
  '٪': '%',    // Arabic percent sign
  '٫': ',',    // Arabic decimal separator
  '٬': ',',    // Arabic thousands separator
}

// Quote normalizations
const QUOTE_MAP = {
  '"': '"',    // Left double quotation mark
  '"': '"',    // Right double quotation mark
  "'": "'",    // Left single quotation mark
  "'": "'",    // Right single quotation mark
  '„': '"',    // Double low-9 quotation mark
  '‚': "'",    // Single low-9 quotation mark
  '«': '"',    // Left-pointing double angle quotation mark
  '»': '"',    // Right-pointing double angle quotation mark
  '‹': "'",    // Single left-pointing angle quotation mark
  '›': "'",    // Single right-pointing angle quotation mark
}

// Tatweel character (Arabic Kashida)
const TATWEEL = 'ـ'

/**
 * Check if brackets and quotes are balanced in text
 */
function checkBalance(text) {
  const stack = []
  const pairs = {
    '(': ')', '[': ']', '{': '}', '"': '"', "'": "'"
  }

  for (const char of text) {
    if (char in pairs) {
      if (char === '"' || char === "'") {
        // Handle quotes (toggle behavior)
        const lastIndex = stack.lastIndexOf(char)
        if (lastIndex !== -1) {
          stack.splice(lastIndex, 1)
        } else {
          stack.push(char)
        }
      } else {
        // Handle brackets
        stack.push(char)
      }
    } else if (Object.values(pairs).includes(char)) {
      if (stack.length === 0) return false
      const last = stack.pop()
      if (pairs[last] !== char) return false
    }
  }

  return stack.length === 0
}

/**
 * Enhanced Arabic text normalization
 */
function enhanceArabicText(text, options = ENHANCEMENT_OPTIONS) {
  const changes = []
  const warnings = []
  let result = text

  // Check initial balance
  const initialBalance = checkBalance(text)
  if (!initialBalance) {
    warnings.push('Input text has unbalanced brackets or quotes')
  }

  // Normalize digits
  if (options.normalizeDigits) {
    for (const [arabic, western] of Object.entries(ARABIC_DIGITS)) {
      if (result.includes(arabic)) {
        const count = (result.match(new RegExp(arabic, 'g')) || []).length
        result = result.replace(new RegExp(arabic, 'g'), western)
        changes.push(`${arabic}→${western} (${count}x)`)
      }
    }

    for (const [arabic, western] of Object.entries(EASTERN_ARABIC_DIGITS)) {
      if (result.includes(arabic)) {
        const count = (result.match(new RegExp(arabic, 'g')) || []).length
        result = result.replace(new RegExp(arabic, 'g'), western)
        changes.push(`${arabic}→${western} (${count}x)`)
      }
    }
  }

  // Normalize punctuation
  if (options.normalizePunctuation) {
    for (const [arabic, latin] of Object.entries(PUNCTUATION_MAP)) {
      if (result.includes(arabic)) {
        const count = (result.match(new RegExp(arabic, 'g')) || []).length
        result = result.replace(new RegExp(arabic, 'g'), latin)
        changes.push(`${arabic}→${latin} (${count}x)`)
      }
    }
  }

  // Remove tatweel
  if (options.removeTatweel) {
    const tatweelCount = (result.match(new RegExp(TATWEEL, 'g')) || []).length
    if (tatweelCount > 0) {
      result = result.replace(new RegExp(TATWEEL, 'g'), '')
      changes.push(`Removed ${tatweelCount} tatweel characters`)
    }
  }

  // Normalize spacing
  if (options.normalizeSpacing) {
    const originalLength = result.length
    // Remove extra spaces before punctuation
    result = result.replace(/\\s+([.!?;:,])/g, '$1')
    // Ensure single space after punctuation (except at end)
    result = result.replace(/([.!?;:,])(\\S)/g, '$1 $2')
    // Normalize multiple spaces to single space
    result = result.replace(/  +/g, ' ')

    const newLength = result.length
    if (originalLength !== newLength) {
      changes.push(`Normalized spacing (${originalLength - newLength} chars removed)`)
    }
  }

  // Normalize quotes
  if (options.normalizeQuotes) {
    for (const [fancy, ascii] of Object.entries(QUOTE_MAP)) {
      if (result.includes(fancy)) {
        const count = (result.match(new RegExp(fancy, 'g')) || []).length
        result = result.replace(new RegExp(fancy, 'g'), ascii)
        changes.push(`${fancy}→${ascii} (${count}x)`)
      }
    }
  }

  // Check final balance
  const finalBalance = checkBalance(result)
  const balancePreserved = !options.preserveBalance || (initialBalance === finalBalance)

  if (options.preserveBalance && !balancePreserved) {
    warnings.push('Enhancement process affected bracket/quote balance')
  }

  return {
    enhanced: result,
    original: text,
    changes,
    warnings,
    balancePreserved,
    hasChanges: changes.length > 0 || result !== text
  }
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `parallel.${timestamp}.jsonl`)

  await fs.mkdir(BACKUP_DIR, { recursive: true })
  await fs.copyFile(PARALLEL_PATH, backupPath)

  console.log(`[enhance-arabic] Backup created: ${path.relative(PROJECT_ROOT, backupPath)}`)
  return backupPath
}

async function loadStyleProfile() {
  try {
    const content = await fs.readFile(STYLE_PROFILE_PATH, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.log(`[enhance-arabic] Style profile not found, using defaults`)
    return null
  }
}

async function enhanceArabicTexts() {
  const backupPath = await createBackup()
  const styleProfile = await loadStyleProfile()

  // Adjust options based on style profile
  const options = { ...ENHANCEMENT_OPTIONS }
  if (styleProfile) {
    console.log(`[enhance-arabic] Using style profile: ${styleProfile.digitsPolicy}`)
    if (styleProfile.digitsPolicy !== 'western_digits') {
      options.normalizeDigits = false
    }
    if (styleProfile.quoteStyle !== 'ascii_quotes') {
      options.normalizeQuotes = false
    }
  }

  const content = await fs.readFile(PARALLEL_PATH, 'utf8')
  const lines = content.split('\n').filter(Boolean)

  let enhancedCount = 0
  let totalChanges = 0
  let balanceIssues = 0
  const updatedLines = []

  const changeStats = {}

  console.log(`[enhance-arabic] Processing ${lines.length} segments...`)

  for (const line of lines) {
    try {
      const segment = JSON.parse(line)

      if (segment.src && typeof segment.src === 'string') {
        // Only enhance if Arabic content is detected
        const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(segment.src)

        if (hasArabic) {
          const result = enhanceArabicText(segment.src, options)

          if (result.hasChanges) {
            segment.src = result.enhanced
            enhancedCount++
            totalChanges += result.changes.length

            // Track change statistics
            for (const change of result.changes) {
              const changeType = change.split(' ')[0]
              changeStats[changeType] = (changeStats[changeType] || 0) + 1
            }

            // Add enhancement metadata
            segment.metadata = segment.metadata || {}
            segment.metadata.enhancedAt = new Date().toISOString()
            segment.metadata.enhancementChanges = result.changes

            if (result.warnings.length > 0) {
              segment.metadata.enhancementWarnings = result.warnings
            }

            if (!result.balancePreserved) {
              balanceIssues++
            }

            console.log(`[enhance-arabic] Enhanced ${segment.id}: ${result.changes.length} changes`)
          }
        }
      }

      updatedLines.push(JSON.stringify(segment))
    } catch (parseError) {
      console.warn(`[enhance-arabic] Parse error for line: ${parseError.message}`)
      updatedLines.push(line)
    }
  }

  const updatedContent = updatedLines.join('\n') + '\n'
  await fs.writeFile(PARALLEL_PATH, updatedContent, 'utf8')

  // Generate enhancement report
  const report = {
    timestamp: new Date().toISOString(),
    backup: path.relative(PROJECT_ROOT, backupPath),
    summary: {
      totalSegments: lines.length,
      enhancedSegments: enhancedCount,
      totalChanges,
      balanceIssues
    },
    changeStatistics: changeStats,
    options: options
  }

  const reportPath = path.join(PROJECT_ROOT, 'artifacts/reports/arabic-enhancement.json')
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(`[enhance-arabic] Summary:`)
  console.log(`  Backup: ${path.relative(PROJECT_ROOT, backupPath)}`)
  console.log(`  Segments enhanced: ${enhancedCount}/${lines.length}`)
  console.log(`  Total changes: ${totalChanges}`)
  console.log(`  Balance issues: ${balanceIssues}`)
  console.log(`  Report: ${path.relative(PROJECT_ROOT, reportPath)}`)

  if (Object.keys(changeStats).length > 0) {
    console.log(`  Change breakdown:`)
    for (const [type, count] of Object.entries(changeStats)) {
      console.log(`    ${type}: ${count}`)
    }
  }

  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enhanceArabicTexts().catch(error => {
    console.error('[enhance-arabic] Failed:', error.message)
    process.exitCode = 1
  })
}

export { enhanceArabicTexts }