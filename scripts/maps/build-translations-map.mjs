#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const INVENTORY_PATH = path.join('artifacts', 'reports', 'translation-inventory.json')
const MAP_PATH = path.join('config', 'translations-map.json')
const MAP_BACKUP_PREFIX = 'config/translations-map.backup'
const CONFIDENCE_THRESHOLD = 0.8
const SUPPORTED_LANGS = new Set(['ar', 'en'])

function fileExists(target) {
  return fs.access(target).then(() => true).catch(() => false)
}

async function loadInventory() {
  if (!(await fileExists(INVENTORY_PATH))) {
    throw new Error(`Inventory not found at ${INVENTORY_PATH}. Run npm run find:translations first.`)
  }
  const raw = await fs.readFile(INVENTORY_PATH, 'utf8')
  const payload = JSON.parse(raw)
  if (!Array.isArray(payload.entries)) {
    throw new Error('Inventory format invalid: missing entries array')
  }
  return payload.entries
}

function normalizeLanguage(entry) {
  if (!entry || typeof entry.language !== 'string') return 'unknown'
  const lang = entry.language.trim().toLowerCase()
  if (lang === 'ar' || lang === 'arabic') return 'ar'
  if (lang === 'en' || lang === 'english') return 'en'
  return lang
}

function cleanBasename(name) {
  const lowered = name.toLowerCase()
  return lowered
    .replace(/\.?(?:ar|en)(?=\.|-|_|\(|\)|$)/g, '')
    .replace(/(?:-|_|\s)(?:ar|en)(?:-|_|\s|$)/g, ' ')
    .replace(/\(\s*(?:ar|en)\s*\)/g, ' ')
    .replace(/\b(?:arabic|english)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function padNumericSegments(text) {
  return text.replace(/\b(\d{1,2})\b/g, match => match.padStart(2, '0'))
}

const ROMAN_VALUES = new Map([
  ['m', 1000],
  ['d', 500],
  ['c', 100],
  ['l', 50],
  ['x', 10],
  ['v', 5],
  ['i', 1]
])

function romanToInt(value) {
  const chars = value.toLowerCase()
  if (!/^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(chars)) {
    return null
  }
  let total = 0
  let current = 0
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]
    const val = ROMAN_VALUES.get(char)
    if (!val) return null
    if (val < current) {
      total -= val
    } else {
      total += val
      current = val
    }
  }
  return total
}

function convertRomanSegments(text) {
  return text.replace(/\b[ivxlcdm]{1,6}\b/gi, token => {
    const numeric = romanToInt(token)
    if (!numeric) return token
    return String(numeric).padStart(2, '0')
  })
}

function extractNumericKey(text) {
  const match = text.match(/(\d{1,3})/)
  if (match) {
    return match[1].padStart(match[1].length === 1 ? 2 : match[1].length, '0')
  }
  const romanMatch = text.match(/\b[ivxlcdm]{1,6}\b/i)
  if (romanMatch) {
    const converted = romanToInt(romanMatch[0])
    if (converted) {
      return String(converted).padStart(converted < 10 ? 2 : 0, '0')
    }
  }
  return null
}

function directorySignature(filePath) {
  const segments = filePath.split(/[\\/]/)
  const mapped = segments.map(segment => segment.toLowerCase().replace(/arabic|arab|ar/gi, '*').replace(/english|eng|en/gi, '*'))
  return mapped.join('/')
}

function parentDirectory(filePath) {
  return path.dirname(filePath)
}

function normaliseEntry(entry) {
  const extension = path.extname(entry.path || '').toLowerCase()
  const baseName = path.basename(entry.path || '', extension)

  const clean = padNumericSegments(convertRomanSegments(cleanBasename(baseName)))
  const numericKey = extractNumericKey(clean)
  const dirSignature = directorySignature(entry.path || '')

  return {
    path: entry.path,
    language: normalizeLanguage(entry),
    extension,
    normalizedBase: clean,
    numericKey,
    dirSignature,
    parentDir: parentDirectory(entry.path || ''),
    stats: entry
  }
}

function computeConfidence(arEntry, enEntry) {
  let score = 0
  if (arEntry.normalizedBase && arEntry.normalizedBase === enEntry.normalizedBase) {
    score += 0.65
  }
  if (arEntry.numericKey && arEntry.numericKey === enEntry.numericKey) {
    score += 0.15
  }
  if (arEntry.dirSignature && arEntry.dirSignature === enEntry.dirSignature) {
    score += 0.12
  }
  if (arEntry.extension && arEntry.extension === enEntry.extension) {
    score += 0.05
  }
  if (arEntry.parentDir === enEntry.parentDir) {
    score += 0.08
  }
  return Math.min(1, Number(score.toFixed(2)))
}

function buildCandidates(entries) {
  const arabic = entries.filter(entry => entry.language === 'ar')
  const english = entries.filter(entry => entry.language === 'en')

  const englishByBase = new Map()
  for (const entry of english) {
    const bucket = englishByBase.get(entry.normalizedBase) || []
    bucket.push(entry)
    englishByBase.set(entry.normalizedBase, bucket)
  }

  const englishByNumeric = new Map()
  for (const entry of english) {
    if (!entry.numericKey) continue
    const bucket = englishByNumeric.get(entry.numericKey) || []
    bucket.push(entry)
    englishByNumeric.set(entry.numericKey, bucket)
  }

  const candidates = []
  const missReasons = new Map()

  for (const arEntry of arabic) {
    const potential = new Set()
    if (englishByBase.has(arEntry.normalizedBase)) {
      englishByBase.get(arEntry.normalizedBase).forEach(item => potential.add(item))
    }
    if (arEntry.numericKey && englishByNumeric.has(arEntry.numericKey)) {
      englishByNumeric.get(arEntry.numericKey).forEach(item => potential.add(item))
    }
    for (const enEntry of english) {
      if (enEntry.dirSignature === arEntry.dirSignature) {
        potential.add(enEntry)
      }
    }

    if (!potential.size) {
      missReasons.set(arEntry.path, 'no_target_match')
      continue
    }

    let bestScore = 0
    for (const candidate of potential) {
      const score = computeConfidence(arEntry, candidate)
      bestScore = Math.max(bestScore, score)
      candidates.push({ ar: arEntry, en: candidate, score })
    }

    if (bestScore < CONFIDENCE_THRESHOLD) {
      missReasons.set(arEntry.path, 'below_threshold')
    }
  }

  const englishWithoutPairs = new Set(english.map(entry => entry.path))

  candidates.sort((a, b) => b.score - a.score)
  const pairedArabic = new Set()
  const pairedEnglish = new Set()
  const pairs = []

  for (const candidate of candidates) {
    if (candidate.score < CONFIDENCE_THRESHOLD) continue
    if (pairedArabic.has(candidate.ar.path)) continue
    if (pairedEnglish.has(candidate.en.path)) continue
    pairs.push(candidate)
    pairedArabic.add(candidate.ar.path)
    pairedEnglish.add(candidate.en.path)
    missReasons.delete(candidate.ar.path)
    englishWithoutPairs.delete(candidate.en.path)
  }

  for (const enPath of englishWithoutPairs) {
    missReasons.set(enPath, 'no_source_match')
  }

  return { pairs, missReasons }
}

async function ensureMapSkeleton() {
  if (await fileExists(MAP_PATH)) {
    const raw = await fs.readFile(MAP_PATH, 'utf8')
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (!Array.isArray(parsed.pairs)) parsed.pairs = []
        if (!Array.isArray(parsed.folders)) parsed.folders = []
        if (!parsed.provenance) parsed.provenance = {}
        if (parsed.version === undefined) parsed.version = 1
        await fs.writeFile(MAP_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
        return parsed
      }
    } catch (error) {
      // fall through to rewrite skeleton
    }
  }

  const skeleton = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pairs: [],
    folders: [],
    provenance: {
      generatedBy: 'scripts/maps/build-translations-map.mjs',
      inventory: INVENTORY_PATH
    }
  }
  await fs.mkdir(path.dirname(MAP_PATH), { recursive: true })
  await fs.writeFile(MAP_PATH, JSON.stringify(skeleton, null, 2) + '\n', 'utf8')
  return skeleton
}

function deduplicatePairs(existingPairs, newPairs) {
  const seen = new Set(existingPairs.map(pair => `${pair.source}::${pair.target}`))
  const merged = [...existingPairs]
  let added = 0
  for (const pair of newPairs) {
    const key = `${pair.source}::${pair.target}`
    if (seen.has(key)) continue
    merged.push(pair)
    seen.add(key)
    added += 1
  }
  return { merged, added }
}

async function backupMap() {
  if (!(await fileExists(MAP_PATH))) return null
  const timestamp = new Date().toISOString().replace(/[:]/g, '-')
  const backupPath = `${MAP_BACKUP_PREFIX}.${timestamp}.json`
  await fs.copyFile(MAP_PATH, backupPath)
  return backupPath
}

function printSummary(pairs, missReasons) {
  console.log('[map] Candidate pairs above threshold:', pairs.length)
  const topPairs = pairs.slice(0, 10)
  if (topPairs.length) {
    console.log('[map] Top pairs:')
    for (const pair of topPairs) {
      console.log(`  ${pair.score.toFixed(2)} :: ${pair.ar.path} -> ${pair.en.path}`)
    }
  }

  if (missReasons.size) {
    const groups = {}
    for (const reason of missReasons.values()) {
      groups[reason] = (groups[reason] || 0) + 1
    }
    console.log('[map] Misses by reason:')
    for (const [reason, count] of Object.entries(groups)) {
      console.log(`  ${reason}: ${count}`)
    }
  }
}

async function main() {
  try {
    const inventoryEntries = await loadInventory()
    const normalizedEntries = inventoryEntries.map(normaliseEntry).filter(entry => SUPPORTED_LANGS.has(entry.language))
    const { pairs, missReasons } = buildCandidates(normalizedEntries)

    const baseMap = await ensureMapSkeleton()
    const backupPath = await backupMap()

    const simplifiedPairs = pairs.map(pair => ({ source: pair.ar.path, target: pair.en.path, confidence: pair.score }))
    const existingPairs = Array.isArray(baseMap.pairs) ? baseMap.pairs : []
    const { merged, added } = deduplicatePairs(existingPairs, simplifiedPairs.map(({ source, target }) => ({ source, target })))

    const updated = {
      ...baseMap,
      version: 1,
      generatedAt: new Date().toISOString(),
      pairs: merged,
      provenance: {
        generatedBy: 'scripts/maps/build-translations-map.mjs',
        inventory: INVENTORY_PATH,
        pairsAdded: added,
        pairsTotal: merged.length,
        confidenceThreshold: CONFIDENCE_THRESHOLD
      }
    }

    await fs.writeFile(MAP_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8')

    printSummary(pairs, missReasons)
    if (backupPath) {
      console.log(`[map] Backup created at ${backupPath}`)
    }
  } catch (error) {
    console.error('[map] Failed to build translations map:', error.message)
    process.exitCode = 1
  }
}

main()
