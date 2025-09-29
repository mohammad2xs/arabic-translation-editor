#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { minimatch } from 'minimatch'
import mammoth from 'mammoth'

const DEFAULT_ROOTS = ['content', 'data', 'docs', 'outputs', 'dist']
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.docx', '.json', '.jsonl'])
const DEFAULT_MAX_DEPTH = 6
const REPORT_DIR = path.join('artifacts', 'reports')
const CSV_PATH = path.join(REPORT_DIR, 'translation-inventory.csv')
const JSON_PATH = path.join(REPORT_DIR, 'translation-inventory.json')

const WILDCARD_REGEX = /[*?{[]/

async function parseArgs(argv) {
  const include = []
  const exclude = []
  let maxDepth = DEFAULT_MAX_DEPTH
  let preset = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--preset') {
      const value = argv[++index]
      if (!value) throw new Error('Expected value after --preset')
      preset = value
      continue
    }
    if (arg === '--include') {
      const value = argv[++index]
      if (!value) throw new Error('Expected value after --include')
      include.push(value)
      continue
    }
    if (arg === '--exclude') {
      const value = argv[++index]
      if (!value) throw new Error('Expected value after --exclude')
      exclude.push(value)
      continue
    }
    if (arg === '--maxDepth') {
      const value = argv[++index]
      if (!value) throw new Error('Expected value after --maxDepth')
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error(`Invalid --maxDepth value: ${value}`)
      }
      maxDepth = parsed
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  // Load preset if specified
  if (preset === 'manuscript') {
    try {
      const corpusPath = path.join(process.cwd(), 'config', 'corpus.json')
      const corpusData = JSON.parse(await fs.readFile(corpusPath, 'utf8'))

      // Add preset includes/excludes first (they have lower priority)
      if (corpusData.includes) {
        include.unshift(...corpusData.includes)
      }
      if (corpusData.excludes) {
        exclude.unshift(...corpusData.excludes)
      }

      console.log(`Loaded preset: manuscript`)
      console.log(`  Includes: ${corpusData.includes?.join(', ') || 'none'}`)
      console.log(`  Excludes: ${corpusData.excludes?.join(', ') || 'none'}`)
    } catch (error) {
      console.error(`Warning: Could not load preset 'manuscript': ${error.message}`)
    }
  }

  return { include, exclude, maxDepth }
}

function toProjectPath(targetPath) {
  const projectRoot = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(projectRoot, '..')
  try {
    const relative = path.relative(root, targetPath)
    if (!relative || relative.startsWith('..')) {
      return targetPath
    }
    return relative
  } catch (error) {
    return targetPath
  }
}

function isWildcard(pattern) {
  return WILDCARD_REGEX.test(pattern)
}

function patternBase(pattern) {
  if (!isWildcard(pattern)) {
    return pattern
  }
  const parts = pattern.split(/[/\\]/)
  const buffer = []
  for (const part of parts) {
    if (isWildcard(part)) break
    buffer.push(part)
  }
  if (buffer.length === 0) {
    return path.isAbsolute(pattern) ? path.parse(pattern).root : '.'
  }
  return path.join(...buffer)
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch (error) {
    return false
  }
}

function normalizePattern(pattern) {
  const normalized = pattern.replace(/\\/g, '/').replace(/\/+/g, '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

function matchesAny(patterns, filePath) {
  if (!patterns.length) return false
  const absolute = filePath.replace(/\\/g, '/').replace(/\/+/g, '/')
  const relative = normalizePattern(path.relative(process.cwd(), filePath) || filePath)
  return patterns.some(pattern => {
    const normalized = normalizePattern(pattern)
    if (/^\//.test(normalized) || /^[A-Za-z]:/.test(normalized)) {
      return minimatch(absolute, normalized, { dot: true })
    }
    return minimatch(relative, normalized, { dot: true })
  })
}

function computeLanguageStats(content) {
  const arabicMatch = content.match(/[\u0600-\u06FF]/g) || []
  const latinMatch = content.match(/[A-Za-z]/g) || []
  const arabicCount = arabicMatch.length
  const latinCount = latinMatch.length
  const total = arabicCount + latinCount
  if (total === 0) {
    return { language: 'unknown', score: 0, ratio: 0 }
  }
  const ratio = arabicCount / total
  if (ratio >= 0.6) {
    return { language: 'ar', score: Number((ratio).toFixed(2)), ratio }
  }
  if (ratio <= 0.4) {
    return { language: 'en', score: Number(((1 - ratio)).toFixed(2)), ratio }
  }
  return { language: 'mixed', score: Number((Math.abs(0.5 - ratio) * 2).toFixed(2)), ratio }
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function extractSnippet(content, extension) {
  const trimmed = content.trim()
  if (!trimmed) return ''
  if (extension === '.md') {
    const heading = trimmed.split(/\r?\n/).find(line => /^\s*#/.test(line))
    if (heading) {
      return normalizeWhitespace(heading).slice(0, 200)
    }
  }
  return normalizeWhitespace(trimmed.slice(0, 120))
}

function countLines(content) {
  if (!content) return 0
  return content.split(/\r?\n/).length
}

function countParagraphs(content) {
  if (!content) return 0
  return content.split(/\r?\n\s*\r?\n/).filter(Boolean).length
}

async function readDocx(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (error) {
    console.warn(`[discover] Failed to read DOCX ${filePath}:`, error)
    return ''
  }
}

async function collectEntriesFromDirectory(rootPath, options, aggregates, depth = 0) {
  if (depth > options.maxDepth) {
    return
  }
  let dir
  try {
    dir = await fs.opendir(rootPath)
  } catch (error) {
    return
  }

  for await (const entry of dir) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const absolute = path.join(rootPath, entry.name)
    const projectPath = toProjectPath(absolute)

    if (entry.isDirectory()) {
      await collectEntriesFromDirectory(absolute, options, aggregates, depth + 1)
      continue
    }

    if (!entry.isFile()) continue

    const ext = path.extname(entry.name).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue

    if (!options.shouldInclude(projectPath, absolute)) continue

    const record = await analyzeFile(absolute, ext)
    if (record) {
      aggregates.push(record)
    }
  }
}

async function analyzeFile(filePath, extension) {
  let stats
  try {
    stats = await fs.stat(filePath)
  } catch (error) {
    return null
  }

  let content = ''
  if (extension === '.docx') {
    content = await readDocx(filePath)
  } else {
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      console.warn(`[discover] Failed to read ${filePath}:`, error)
      content = ''
    }
  }

  const language = computeLanguageStats(content)
  const lineCount = countLines(content)
  const paragraphCount = countParagraphs(content)
  const snippet = extractSnippet(content, extension)

  return {
    path: toProjectPath(filePath),
    extension,
    sizeBytes: stats.size,
    lineCount,
    paragraphCount,
    modifiedAt: stats.mtime.toISOString(),
    language: language.language,
    languageRatio: Number(language.ratio.toFixed(2)),
    snippet
  }
}

function summarize(entries) {
  const byLanguage = new Map()
  const byExtension = new Map()
  let totalBytes = 0

  for (const entry of entries) {
    totalBytes += entry.sizeBytes
    byLanguage.set(entry.language, (byLanguage.get(entry.language) || 0) + 1)
    byExtension.set(entry.extension, (byExtension.get(entry.extension) || 0) + 1)
  }

  return {
    totalFiles: entries.length,
    totalBytes,
    byLanguage: Object.fromEntries(byLanguage),
    byExtension: Object.fromEntries(byExtension)
  }
}

async function ensureReportDirectory() {
  await fs.mkdir(REPORT_DIR, { recursive: true })
}

function toCsv(entries) {
  const header = ['path', 'extension', 'sizeBytes', 'lineCount', 'paragraphCount', 'modifiedAt', 'language', 'languageRatio', 'snippet']
  const rows = entries.map(entry => (
    header.map(key => {
      const value = entry[key] ?? ''
      const stringValue = typeof value === 'string' ? value : String(value)
      if (stringValue.includes('"') || stringValue.includes(',') || /\s/.test(stringValue)) {
        return '"' + stringValue.replace(/"/g, '""') + '"'
      }
      return stringValue
    }).join(',')
  ))
  return [header.join(','), ...rows].join('\n') + '\n'
}

async function writeReports(entries, summary, context) {
  await ensureReportDirectory()
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    maxDepth: context.maxDepth,
    roots: context.roots,
    include: context.includePatterns,
    exclude: context.excludePatterns,
    summary,
    entries
  }
  await fs.writeFile(JSON_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  await fs.writeFile(CSV_PATH, toCsv(entries), 'utf8')
}

function buildIncludeChecker(includePatterns, excludePatterns) {
  const normalizedIncludes = includePatterns.map(pattern => pattern.trim()).filter(Boolean)
  const normalizedExcludes = excludePatterns.map(pattern => pattern.trim()).filter(Boolean)

  return (projectPath, absolutePath) => {
    const targetPath = projectPath.startsWith('.') ? absolutePath : projectPath
    if (normalizedExcludes.length && matchesAny(normalizedExcludes, targetPath)) {
      return false
    }
    if (!normalizedIncludes.length) {
      return true
    }
    return matchesAny(normalizedIncludes, targetPath) || matchesAny(normalizedIncludes, projectPath)
  }
}

async function resolveRoots(customIncludePatterns) {
  const projectRoot = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(projectRoot, '..')
  const resolved = new Set()

  for (const rel of DEFAULT_ROOTS) {
    const candidate = path.join(root, rel)
    if (await pathExists(candidate)) {
      resolved.add(candidate)
    }
  }

  for (const pattern of customIncludePatterns) {
    if (!pattern) continue
    const base = patternBase(pattern)
    const absoluteBase = path.isAbsolute(base) ? base : path.join(root, base)
    if (await pathExists(absoluteBase)) {
      resolved.add(absoluteBase)
    }
  }

  return Array.from(resolved)
}

async function main() {
  try {
    const args = await parseArgs(process.argv.slice(2))
    const roots = await resolveRoots(args.include)
    const shouldInclude = buildIncludeChecker(args.include, args.exclude)

    const aggregates = []
    for (const rootPath of roots) {
      await collectEntriesFromDirectory(rootPath, { maxDepth: args.maxDepth, shouldInclude }, aggregates, 0)
    }

    const uniqueByPath = new Map()
    for (const entry of aggregates) {
      uniqueByPath.set(entry.path, entry)
    }
    const entries = Array.from(uniqueByPath.values()).sort((a, b) => a.path.localeCompare(b.path))
    const summary = summarize(entries)

    await writeReports(entries, summary, {
      roots: roots.map(toProjectPath),
      includePatterns: args.include,
      excludePatterns: args.exclude,
      maxDepth: args.maxDepth
    })

    console.log('[discover] Translation inventory generated:')
    console.log(`  Files: ${summary.totalFiles}`)
    console.log(`  Total size: ${summary.totalBytes.toLocaleString()} bytes`)

    if (Object.keys(summary.byLanguage).length) {
      console.log('  Languages:')
      for (const [language, count] of Object.entries(summary.byLanguage)) {
        console.log(`    ${language}: ${count}`)
      }
    }

    if (Object.keys(summary.byExtension).length) {
      console.log('  Extensions:')
      for (const [extension, count] of Object.entries(summary.byExtension)) {
        console.log(`    ${extension}: ${count}`)
      }
    }
  } catch (error) {
    console.error('[discover] Failed to build inventory:', error.message)
    process.exitCode = 1
  }
}

main()
