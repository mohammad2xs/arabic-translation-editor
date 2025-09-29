#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'glob'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAP_PATH = path.join(PROJECT_ROOT, 'config', 'translations-map.json')
const CORPUS_PATH = path.join(PROJECT_ROOT, 'config', 'corpus.json')

// Normalizers for filename matching
const LANG_PATTERNS = [
  /\.(ar|arabic|en|english)\./gi,
  /-(ar|arabic|en|english)-/gi,
  /_(ar|arabic|en|english)_/gi,
  /\((ar|arabic|en|english)\)/gi,
  /\bar-SA\b/gi,
  /\ben-US\b/gi,
  /\bar\b/gi,
  /\ben\b/gi
]

// Directory synonyms
const DIR_SYNONYMS = {
  ar: ['arabic', 'ar', 'source', 'العربية'],
  en: ['english', 'en', 'target', 'الإنجليزية']
}

// File families (don't cross-match)
const FILE_FAMILIES = {
  text: ['.md', '.txt', '.docx'],
  data: ['.json', '.jsonl']
}

function normalizeFilename(name) {
  let normalized = name.toLowerCase()

  // Strip language markers
  for (const pattern of LANG_PATTERNS) {
    normalized = normalized.replace(pattern, '')
  }

  // Convert numerals
  normalized = normalized.replace(/\b0?1\b/g, '1')
    .replace(/\b0?2\b/g, '2')
    .replace(/\b0?3\b/g, '3')
    .replace(/\bi+\b/gi, match => match.length.toString())

  // Slugify
  normalized = normalized.replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized
}

function getFileFamily(extension) {
  for (const [family, extensions] of Object.entries(FILE_FAMILIES)) {
    if (extensions.includes(extension)) {
      return family
    }
  }
  return null
}

function detectLanguageFromPath(filePath) {
  const lower = filePath.toLowerCase()

  // Check directory names
  const parts = filePath.split(path.sep)
  for (const part of parts) {
    const lowerPart = part.toLowerCase()
    for (const [lang, synonyms] of Object.entries(DIR_SYNONYMS)) {
      if (synonyms.some(syn => lowerPart.includes(syn))) {
        return lang
      }
    }
  }

  // Check filename
  if (lower.includes('arabic') || lower.includes('-ar') || lower.includes('_ar')) return 'ar'
  if (lower.includes('english') || lower.includes('-en') || lower.includes('_en')) return 'en'

  return null
}

function levenshteinDistance(str1, str2) {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

function calculateSimilarity(str1, str2) {
  const distance = levenshteinDistance(str1, str2)
  const maxLength = Math.max(str1.length, str2.length)
  return maxLength > 0 ? 1 - (distance / maxLength) : 1
}

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath)
    return stats.size
  } catch {
    return 0
  }
}

async function detectBilingualJson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const data = JSON.parse(content)

    // Check for {en, ar} structure
    if (data.en && data.ar) {
      return 'bilingual-object'
    }

    // Check for array of {lang, text} entries
    if (Array.isArray(data)) {
      const hasLangText = data.some(item => item.lang && item.text)
      if (hasLangText) {
        return 'bilingual-array'
      }
    }

    // Check for nested structures
    const keys = Object.keys(data)
    const hasArAndEn = keys.some(k => k.toLowerCase().includes('ar')) &&
                       keys.some(k => k.toLowerCase().includes('en'))
    if (hasArAndEn) {
      return 'bilingual-nested'
    }
  } catch {
    // Not valid JSON or read error
  }

  return null
}

async function loadCorpusExcludes() {
  try {
    const corpus = JSON.parse(await fs.readFile(CORPUS_PATH, 'utf8'))
    return corpus.excludes || []
  } catch {
    return []
  }
}

async function loadExistingMap() {
  try {
    const content = await fs.readFile(MAP_PATH, 'utf8')
    return JSON.parse(content)
  } catch {
    return { pairs: [], folders: [] }
  }
}

async function backupExistingMap() {
  try {
    const existing = await fs.readFile(MAP_PATH, 'utf8')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const backupPath = MAP_PATH.replace('.json', `.backup.${timestamp}.json`)
    await fs.writeFile(backupPath, existing)
    console.log(`Backed up existing map to: ${path.basename(backupPath)}`)
  } catch {
    // No existing map to backup
  }
}

async function discoverFiles() {
  const excludes = await loadCorpusExcludes()
  const allFiles = await glob('**/*.{md,txt,docx,json,jsonl}', {
    cwd: PROJECT_ROOT,
    ignore: ['node_modules/**', '.git/**', '.next/**', 'dist/**', ...excludes]
  })

  const fileInfos = []
  const bilinguals = []

  for (const file of allFiles) {
    const fullPath = path.join(PROJECT_ROOT, file)
    const extension = path.extname(file)
    const basename = path.basename(file, extension)
    const normalized = normalizeFilename(basename)
    const family = getFileFamily(extension)
    const lang = detectLanguageFromPath(file)
    const size = await getFileSize(fullPath)

    // Check if JSON/JSONL is bilingual
    if (extension === '.json' || extension === '.jsonl') {
      const bilingualType = await detectBilingualJson(fullPath)
      if (bilingualType) {
        bilinguals.push({
          path: file,
          type: bilingualType,
          size
        })
        continue
      }
    }

    fileInfos.push({
      path: file,
      basename,
      normalized,
      extension,
      family,
      lang,
      size,
      fullPath
    })
  }

  return { fileInfos, bilinguals }
}

function findBestMatch(sourceFile, targetFiles) {
  let bestMatch = null
  let bestScore = 0

  for (const target of targetFiles) {
    // Skip if different file families
    if (sourceFile.family !== target.family) continue

    // Skip if same language
    if (sourceFile.lang === target.lang && sourceFile.lang !== null) continue

    // Calculate similarity
    const similarity = calculateSimilarity(sourceFile.normalized, target.normalized)

    // Check size ratio
    const sizeRatio = Math.min(sourceFile.size, target.size) /
                     Math.max(sourceFile.size, target.size)

    // Combined score
    const score = similarity * 0.8 + (sizeRatio > 0.5 ? 0.2 : 0)

    if (score > bestScore && score > 0.82) {
      bestMatch = target
      bestScore = score
    }
  }

  return { match: bestMatch, confidence: bestScore }
}

async function buildAutoPairs(fileInfos) {
  const pairs = []
  const matched = new Set()
  const unmatched = []

  // Separate by detected language
  const arFiles = fileInfos.filter(f => f.lang === 'ar')
  const enFiles = fileInfos.filter(f => f.lang === 'en')
  const unknownFiles = fileInfos.filter(f => f.lang === null)

  // Match AR files with EN files
  for (const arFile of arFiles) {
    if (matched.has(arFile.path)) continue

    const result = findBestMatch(arFile, enFiles.filter(f => !matched.has(f.path)))
    if (result.match) {
      pairs.push({
        source: arFile.path,
        target: result.match.path,
        confidence: result.confidence,
        method: 'fuzzy'
      })
      matched.add(arFile.path)
      matched.add(result.match.path)
    } else {
      unmatched.push({ path: arFile.path, reason: 'no_match' })
    }
  }

  // Try to match remaining unknown files
  const unmatchedUnknown = unknownFiles.filter(f => !matched.has(f.path))
  for (let i = 0; i < unmatchedUnknown.length; i++) {
    for (let j = i + 1; j < unmatchedUnknown.length; j++) {
      const file1 = unmatchedUnknown[i]
      const file2 = unmatchedUnknown[j]

      if (file1.family !== file2.family) continue

      const similarity = calculateSimilarity(file1.normalized, file2.normalized)
      if (similarity > 0.85) {
        pairs.push({
          source: file1.path,
          target: file2.path,
          confidence: similarity,
          method: 'similarity'
        })
        matched.add(file1.path)
        matched.add(file2.path)
        break
      }
    }
  }

  // Collect remaining unmatched
  for (const file of fileInfos) {
    if (!matched.has(file.path)) {
      unmatched.push({ path: file.path, reason: 'no_partner' })
    }
  }

  return { pairs, unmatched }
}

async function main() {
  console.log('Building enhanced translation map...')

  // Backup existing map
  await backupExistingMap()

  // Load existing map
  const existingMap = await loadExistingMap()

  // Discover files
  const { fileInfos, bilinguals } = await discoverFiles()
  console.log(`Found ${fileInfos.length} files and ${bilinguals.length} bilingual files`)

  // Build auto pairs
  const { pairs: autoPairs, unmatched } = await buildAutoPairs(fileInfos)

  // Merge with existing pairs (existing takes precedence)
  const existingPairKeys = new Set(
    existingMap.pairs.map(p => `${p.source}|${p.target}`)
  )

  const newPairs = autoPairs
    .filter(p => !existingPairKeys.has(`${p.source}|${p.target}`))
    .map(p => ({ source: p.source, target: p.target }))

  const finalMap = {
    pairs: [...existingMap.pairs, ...newPairs],
    folders: existingMap.folders || [],
    bilingual: bilinguals.map(b => b.path)
  }

  // Write updated map
  await fs.writeFile(MAP_PATH, JSON.stringify(finalMap, null, 2))

  // Print summary
  console.log('\nSummary:')
  console.log(`  Total pairs: ${finalMap.pairs.length}`)
  console.log(`  New pairs added: ${newPairs.length}`)
  console.log(`  Bilingual files: ${bilinguals.length}`)
  console.log(`  Unmatched files: ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log('\nTop 10 unmatched files:')
    unmatched.slice(0, 10).forEach(u => {
      console.log(`  ${u.path} → ${u.reason}`)
    })
  }

  console.log(`\nMap saved to: ${path.relative(PROJECT_ROOT, MAP_PATH)}`)
}

main().catch(console.error)