import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { minimatch } from 'minimatch'
import { alignSegments } from '../lib/align'
import { detectLanguage, ensureLanguage, normalizeWhitespace, SupportedLanguage } from '../lib/lang'
import { normalizeParagraphs, segmentParagraph } from '../lib/segment'
import { readDocx } from '../lib/importers/docx'
import { ParallelSegment } from '../types/parallel'

interface CliOptions {
  mapPath?: string
  includes: string[]
  excludes: string[]
  docx: boolean
  preset?: string
}

interface FileInfo {
  path: string
  absolutePath: string
  extension: string
  language: SupportedLanguage | 'mixed'
  normalizedBase: string
  numericKey: string | null
  dirSignature: string
  size: number
  hasMarkers: boolean
  kind: 'text' | 'docx' | 'json' | 'jsonl'
}

interface DocumentPair {
  source: FileInfo
  target: FileInfo
  origin: 'map' | 'folder' | 'auto'
  confidence?: number
}

interface SingleFileEntry {
  file: FileInfo
  origin: 'marker' | 'json'
}

interface MissRecord {
  path: string
  reason: ReasonCode
}

interface CoverageTracker {
  sourcesFound: number
  targetsFound: number
  matchedSegments: number
}

interface MapPair {
  source: string
  target: string
}

interface FolderRule {
  sourceDir: string
  targetDir: string
  pattern: string
}

interface MapData {
  pairs: MapPair[]
  folders: FolderRule[]
  loaded: boolean
  path: string
}

type ReasonCode = 'no_target_match' | 'unsupported_format' | 'lang_detection_failed' | 'too_short'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.docx', '.json', '.jsonl'])
const DEFAULT_ROOTS = ['content', 'data', 'docs', 'outputs', 'dist']
const WILDCARD_REGEX = /[*?{[]/
const DEFAULT_SCAN_DEPTH = 8
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache')
const PARALLEL_PATH = path.join(CACHE_DIR, 'parallel.jsonl')
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json')
const DEFAULT_MAP_PATH = path.join(PROJECT_ROOT, 'config', 'translations-map.json')

const ROMAN_VALUES = new Map<string, number>([
  ['m', 1000],
  ['d', 500],
  ['c', 100],
  ['l', 50],
  ['x', 10],
  ['v', 5],
  ['i', 1]
])

async function parseArgs(argv: string[]): Promise<CliOptions> {
  const options: CliOptions = {
    includes: [],
    excludes: [],
    docx: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--preset') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --preset')
      options.preset = value
      continue
    }
    if (token === '--map') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --map')
      options.mapPath = value
      continue
    }
    if (token === '--include') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --include')
      options.includes.push(value)
      continue
    }
    if (token === '--exclude') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --exclude')
      options.excludes.push(value)
      continue
    }
    if (token === '--docx') {
      const value = argv[++index]
      if (!value) throw new Error('Missing value for --docx')
      options.docx = value.toLowerCase() === 'true'
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }

  // Load preset if specified
  if (options.preset === 'manuscript') {
    try {
      const corpusPath = path.join(PROJECT_ROOT, 'config', 'corpus.json')
      const corpusData = JSON.parse(await fs.readFile(corpusPath, 'utf8'))

      // Add preset includes/excludes first (they have lower priority)
      if (corpusData.includes) {
        options.includes.unshift(...corpusData.includes)
      }
      if (corpusData.excludes) {
        options.excludes.unshift(...corpusData.excludes)
      }

      console.log(`Loaded preset: manuscript`)
      console.log(`  Includes: ${corpusData.includes?.join(', ') || 'none'}`)
      console.log(`  Excludes: ${corpusData.excludes?.join(', ') || 'none'}`)
    } catch (error: any) {
      console.error(`Warning: Could not load preset 'manuscript': ${error.message}`)
    }
  }

  return options
}

function toAbsolute(targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath
  }
  return path.resolve(PROJECT_ROOT, targetPath)
}

function toProjectRelative(absolutePath: string): string {
  const relative = path.relative(PROJECT_ROOT, absolutePath)
  if (!relative || relative.startsWith('..')) {
    return absolutePath.split(path.sep).join('/')
  }
  return relative.split(path.sep).join('/')
}

function toPosix(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+/g, '/')
}

function isWildcard(pattern: string): boolean {
  return WILDCARD_REGEX.test(pattern)
}

function patternBase(pattern: string): string {
  if (!isWildcard(pattern)) {
    return pattern
  }
  const parts = pattern.split(/[/\\]/)
  const buffer: string[] = []
  for (const part of parts) {
    if (isWildcard(part)) break
    buffer.push(part)
  }
  if (buffer.length === 0) {
    if (/^[A-Za-z]:/.test(pattern)) {
      return pattern.slice(0, 2)
    }
    return '/'
  }
  return buffer.join(path.sep)
}

function cleanBasename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.?(?:ar|en)(?=\.|-|_|\(|\)|$)/g, '')
    .replace(/(?:-|_|\s)(?:ar|en)(?:-|_|\s|$)/g, ' ')
    .replace(/\(\s*(?:ar|en)\s*\)/g, ' ')
    .replace(/\b(?:arabic|english)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function romanToInt(token: string): number | null {
  const chars = token.toLowerCase()
  if (!/^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(chars)) {
    return null
  }
  let total = 0
  let current = 0
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const value = ROMAN_VALUES.get(chars[index] ?? '')
    if (!value) return null
    if (value < current) {
      total -= value
    } else {
      total += value
      current = value
    }
  }
  return total
}

function convertRomanSegments(text: string): string {
  return text.replace(/\b[ivxlcdm]{1,6}\b/gi, token => {
    const numericValue = romanToInt(token)
    if (numericValue === null) return token
    const paddedLength = numericValue < 10 ? 2 : String(numericValue).length
    return String(numericValue).padStart(paddedLength, '0')
  })
}

function padNumericSegments(text: string): string {
  return text.replace(/\b(\d{1,2})\b/g, match => match.padStart(match.length === 1 ? 2 : match.length, '0'))
}

function extractNumericKey(text: string): string | null {
  const numeric = text.match(/\b(\d{1,3})\b/)
  if (numeric) {
    const value = numeric[1]
    if (typeof value === 'string') {
      return value.padStart(value.length === 1 ? 2 : value.length, '0')
    }
  }
  const roman = text.match(/\b[ivxlcdm]{1,6}\b/i)
  if (roman && typeof roman[0] === 'string') {
    const converted = romanToInt(roman[0])
    if (converted) {
      return String(converted).padStart(converted < 10 ? 2 : String(converted).length, '0')
    }
  }
  return null
}

function directorySignature(relativePath: string): string {
  return relativePath
    .split('/')
    .map(segment => segment.toLowerCase().replace(/arabic|arab|ar/gi, '*').replace(/english|eng|en/gi, '*'))
    .join('/')
}

function sanitizeId(input: string): string {
  return input.replace(/[^A-Za-z0-9_-]/g, '-')
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch (error) {
    return false
  }
}

function normalizePatternValue(pattern: string): string {
  const normalized = toPosix(pattern)
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

function matchesPattern(patterns: string[], absolutePath: string, relativePath: string): boolean {
  if (!patterns.length) return false
  const posixAbsolute = toPosix(absolutePath)
  const posixRelative = toPosix(relativePath)
  return patterns.some(pattern => {
    const normalized = normalizePatternValue(pattern)
    if (/^\//.test(normalized) || /^[A-Za-z]:/.test(normalized)) {
      return minimatch(posixAbsolute, normalized, { dot: true })
    }
    return minimatch(posixRelative, normalized, { dot: true })
  })
}

async function expandIncludePatterns(patterns: string[]): Promise<string[]> {
  const matches = new Set<string>()
  await Promise.all(patterns.map(async pattern => {
    if (!isWildcard(pattern)) {
      matches.add(toAbsolute(pattern))
      return
    }
    const base = toAbsolute(patternBase(pattern))
    if (!(await pathExists(base))) return
    await walkDirectory(base, async absolutePath => {
      const relative = toProjectRelative(absolutePath)
      if (matchesPattern([pattern], absolutePath, relative)) {
        matches.add(absolutePath)
      }
    })
  }))
  return Array.from(matches)
}

async function walkDirectory(rootPath: string, visitor: (absolutePath: string) => Promise<void>, depth = 0, maxDepth = DEFAULT_SCAN_DEPTH): Promise<void> {
  if (depth > maxDepth) return
  let directoryHandle
  try {
    directoryHandle = await fs.opendir(rootPath)
  } catch (error) {
    return
  }

  for await (const dirent of directoryHandle) {
    if (dirent.name === '.git' || dirent.name === 'node_modules') continue
    const absolute = path.join(rootPath, dirent.name)
    if (dirent.isDirectory()) {
      await walkDirectory(absolute, visitor, depth + 1, maxDepth)
    } else if (dirent.isFile()) {
      await visitor(absolute)
    }
  }
}

async function analyzeFile(absolutePath: string, options: CliOptions): Promise<FileInfo | null> {
  const extension = path.extname(absolutePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return null
  }
  if (!options.docx && extension === '.docx') {
    return null
  }

  let stats
  try {
    stats = await fs.stat(absolutePath)
  } catch (error) {
    return null
  }

  let language: SupportedLanguage | 'mixed' = 'unknown'
  let hasMarkers = false
  let kind: FileInfo['kind'] = 'text'
  let sample = ''

  try {
    if (extension === '.docx') {
      const { paragraphs } = await readDocx(absolutePath)
      sample = paragraphs.slice(0, 8).join(' ')
      kind = 'docx'
    } else {
      const raw = await fs.readFile(absolutePath, 'utf8')
      sample = raw.slice(0, 4000)
      if (extension === '.json' || extension === '.jsonl') {
        kind = extension === '.json' ? 'json' : 'jsonl'
        language = 'mixed'
      } else {
        hasMarkers = /(##\s*AR|##\s*EN)/i.test(raw)
      }
      if (!hasMarkers) {
        hasMarkers = /(\\u0600|\u0600|\u06FF)/i.test(sample) && /(##\s*AR|##\s*EN)/i.test(sample)
      }
    }
  } catch (error) {
    return null
  }

  if (language !== 'mixed') {
    const detection = detectLanguage(sample)
    language = detection.language
    const hasArabic = /[\u0600-\u06FF]/u.test(sample)
    const hasLatin = /[A-Za-z]{3}/.test(sample)
    if (hasArabic && hasLatin) {
      language = 'mixed'
    }
    if (hasMarkers && language !== 'mixed') {
      language = 'mixed'
    }
  }

  const relative = toProjectRelative(absolutePath)
  const baseName = path.basename(relative, extension)
  const normalizedBase = padNumericSegments(convertRomanSegments(cleanBasename(baseName)))
  const numericKey = extractNumericKey(normalizedBase)
  const dirSignatureValue = directorySignature(relative)

  return {
    path: relative,
    absolutePath,
    extension,
    language,
    normalizedBase,
    numericKey,
    dirSignature: dirSignatureValue,
    size: stats.size,
    hasMarkers,
    kind
  }
}

async function loadTranslationMap(mapPath?: string): Promise<MapData> {
  const resolved = mapPath ? toAbsolute(mapPath) : DEFAULT_MAP_PATH
  if (!(await pathExists(resolved))) {
    return { pairs: [], folders: [], loaded: false, path: resolved }
  }
  try {
    const raw = await fs.readFile(resolved, 'utf8')
    const parsed = JSON.parse(raw)
    const pairs: MapPair[] = Array.isArray((parsed as any).pairs)
      ? ((parsed as any).pairs as unknown[])
          .map((value): MapPair => {
            const record = (value ?? {}) as Record<string, unknown>
            const source = typeof record.source === 'string' ? record.source : ''
            const target = typeof record.target === 'string' ? record.target : ''
            return { source, target }
          })
          .filter((entry: MapPair) => entry.source && entry.target)
      : []
    const folders: FolderRule[] = Array.isArray((parsed as any).folders)
      ? ((parsed as any).folders as unknown[])
          .map((value): FolderRule => {
            const record = (value ?? {}) as Record<string, unknown>
            return {
              sourceDir: typeof record.sourceDir === 'string' ? record.sourceDir : '',
              targetDir: typeof record.targetDir === 'string' ? record.targetDir : '',
              pattern: typeof record.pattern === 'string' ? record.pattern : '**/*'
            }
          })
          .filter((entry: FolderRule) => entry.sourceDir && entry.targetDir)
      : []
    return { pairs, folders, loaded: true, path: resolved }
  } catch (error) {
    console.warn(`[index] Failed to parse translation map at ${resolved}: ${(error as Error).message}`)
    return { pairs: [], folders: [], loaded: false, path: resolved }
  }
}

function computeConfidence(source: FileInfo, target: FileInfo): number {
  let score = 0
  if (source.normalizedBase && source.normalizedBase === target.normalizedBase) {
    score += 0.65
  }
  if (source.numericKey && source.numericKey === target.numericKey) {
    score += 0.15
  }
  if (source.dirSignature === target.dirSignature) {
    score += 0.12
  }
  if (source.extension === target.extension) {
    score += 0.05
  }
  if (path.dirname(source.path) === path.dirname(target.path)) {
    score += 0.08
  }
  return Math.min(1, Number(score.toFixed(2)))
}

async function loadTextDocument(info: FileInfo): Promise<string[]> {
  if (info.extension === '.docx') {
    const { paragraphs } = await readDocx(info.absolutePath)
    return normalizeParagraphs(paragraphs)
  }
  const raw = await fs.readFile(info.absolutePath, 'utf8')
  const paragraphs = raw.split(/\r?\n\s*\r?\n/) || []
  return normalizeParagraphs(paragraphs)
}

interface JsonRecord {
  id: string
  src: string
  tgt: string
}

async function loadJsonRecords(info: FileInfo): Promise<JsonRecord[]> {
  try {
    const raw = await fs.readFile(info.absolutePath, 'utf8')
    if (info.extension === '.jsonl') {
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .map((entry: any, index) => ({
          id: String(entry.id ?? `${info.path}#${index}`),
          src: String(entry.src ?? entry.arabic ?? ''),
          tgt: String(entry.tgt ?? entry.english ?? entry.en ?? '')
        }))
        .filter(record => record.src && record.tgt)
    }
    const parsed = JSON.parse(raw)
    const records: JsonRecord[] = []
    const walk = (value: any) => {
      if (!value) return
      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }
      if (typeof value === 'object') {
        const record = value as Record<string, unknown>
        const src = record.src ?? record.original ?? record.arabic
        const tgt = record.tgt ?? record.target ?? record.translation ?? record.english
        if (typeof src === 'string' && typeof tgt === 'string') {
          const id = typeof record.id === 'string' ? record.id : `${info.path}#${records.length}`
          records.push({ id, src, tgt })
        }
        Object.values(record).forEach(walk)
      }
    }
    walk(parsed)
    return records
  } catch (error) {
    console.warn(`[index] Failed to parse JSON ${info.path}: ${(error as Error).message}`)
    return []
  }
}

function recordReason(map: Map<string, ReasonCode>, list: MissRecord[], path: string, reason: ReasonCode): void {
  if (map.has(path)) return
  map.set(path, reason)
  list.push({ path, reason })
}

function summarizeReasons(map: Map<string, ReasonCode>): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const reason of map.values()) {
    summary[reason] = (summary[reason] ?? 0) + 1
  }
  return summary
}

function buildFileRefs(source: FileInfo, target: FileInfo, srcSpan: [number, number], tgtSpan: [number, number]) {
  return [
    { path: source.path, span: srcSpan },
    { path: target.path, span: tgtSpan }
  ]
}

async function alignDocuments(
  pair: DocumentPair,
  tracker: CoverageTracker,
  segments: ParallelSegment[],
  reasonMap: Map<string, ReasonCode>,
  misses: MissRecord[]
): Promise<void> {
  let sourceParagraphs: string[] = []
  let targetParagraphs: string[] = []
  try {
    sourceParagraphs = await loadTextDocument(pair.source)
  } catch (error) {
    recordReason(reasonMap, misses, pair.source.path, 'unsupported_format')
    return
  }
  try {
    targetParagraphs = await loadTextDocument(pair.target)
  } catch (error) {
    recordReason(reasonMap, misses, pair.target.path, 'unsupported_format')
    return
  }

  if (!sourceParagraphs.length) {
    recordReason(reasonMap, misses, pair.source.path, 'too_short')
    return
  }

  const maxParagraphs = Math.max(sourceParagraphs.length, targetParagraphs.length)
  let localSegIndex = 0

  for (let index = 0; index < maxParagraphs; index += 1) {
    const sourceParagraph = sourceParagraphs[index] ?? ''
    const targetParagraph = targetParagraphs[index] ?? ''

    if (!sourceParagraph && !targetParagraph) continue

    const srcSegments = sourceParagraph ? segmentParagraph(sourceParagraph, 'ar').segments : []
    const tgtSegments = targetParagraph ? segmentParagraph(targetParagraph, 'en').segments : []

    if (!srcSegments.length && !tgtSegments.length) {
      recordReason(reasonMap, misses, pair.source.path, 'too_short')
      continue
    }

    const aligned = alignSegments(srcSegments.length ? srcSegments : [''], tgtSegments.length ? tgtSegments : [''])

    aligned.forEach(entry => {
      const rowId = `${sanitizeId(pair.source.path)}:${String(index).padStart(4, '0')}`
      const srcText = entry.src ?? ''
      const tgtText = entry.tgt ?? ''

      if (srcText) tracker.sourcesFound += 1
      if (tgtText) tracker.targetsFound += 1
      if (srcText && tgtText) tracker.matchedSegments += 1

      segments.push({
        id: `${rowId}#${localSegIndex}`,
        rowId,
        paraIndex: index,
        segIndex: localSegIndex,
        src: srcText,
        tgt: tgtText,
        srcLang: ensureLanguage(srcText, 'ar'),
        tgtLang: tgtText ? ensureLanguage(tgtText, 'en') : 'unknown',
        status: entry.status,
        lengthRatio: Number(entry.ratio.toFixed(3)),
        fileRefs: buildFileRefs(pair.source, pair.target, entry.srcSpan, entry.tgtSpan)
      })

      localSegIndex += 1
    })
  }
}

function parseMarkerSections(content: string): Array<{ ar: string; en: string }> {
  const lines = content.split(/\r?\n/)
  const sections: Array<{ type: 'ar' | 'en'; content: string[] }> = []
  let current: { type: 'ar' | 'en'; content: string[] } | null = null

  for (const line of lines) {
    const headingMatch = /^##+\s*(AR|EN)\b/i.exec(line)
    if (headingMatch) {
      const type = headingMatch[1]?.toLowerCase() === 'ar' ? 'ar' : 'en'
      current = { type, content: [] }
      sections.push(current)
      continue
    }
    if (!current) continue
    current.content.push(line)
  }

  const pairs: Array<{ ar: string; en: string }> = []
  for (let index = 0; index < sections.length; index += 1) {
    const entry = sections[index]
    if (!entry) continue
    if (entry.type === 'ar') {
      const next = sections[index + 1]
      if (next && next.type === 'en') {
        pairs.push({
          ar: normalizeWhitespace(entry.content.join('\n')),
          en: normalizeWhitespace(next.content.join('\n'))
        })
        index += 1
      }
    }
  }
  return pairs
}

async function processMarkerFile(
  entry: SingleFileEntry,
  tracker: CoverageTracker,
  segments: ParallelSegment[],
  reasonMap: Map<string, ReasonCode>,
  misses: MissRecord[]
): Promise<void> {
  let raw: string
  try {
    raw = await fs.readFile(entry.file.absolutePath, 'utf8')
  } catch (error) {
    recordReason(reasonMap, misses, entry.file.path, 'unsupported_format')
    return
  }

  const pairs = parseMarkerSections(raw)
  if (!pairs.length) {
    recordReason(reasonMap, misses, entry.file.path, 'no_target_match')
    return
  }

  let segIndex = 0
  pairs.forEach((pair, index) => {
    if (!pair.ar) {
      recordReason(reasonMap, misses, entry.file.path, 'too_short')
      return
    }
    const srcSegments = segmentParagraph(pair.ar, 'ar').segments
    const tgtSegments = segmentParagraph(pair.en, 'en').segments
    const aligned = alignSegments(srcSegments.length ? srcSegments : [''], tgtSegments.length ? tgtSegments : [''])
    aligned.forEach(item => {
      const rowId = `${sanitizeId(entry.file.path)}:marker-${String(index).padStart(3, '0')}`
      const srcText = item.src ?? ''
      const tgtText = item.tgt ?? ''
      if (srcText) tracker.sourcesFound += 1
      if (tgtText) tracker.targetsFound += 1
      if (srcText && tgtText) tracker.matchedSegments += 1
      segments.push({
        id: `${rowId}#${segIndex}`,
        rowId,
        paraIndex: index,
        segIndex,
        src: srcText,
        tgt: tgtText,
        srcLang: ensureLanguage(srcText, 'ar'),
        tgtLang: tgtText ? ensureLanguage(tgtText, 'en') : 'unknown',
        status: item.status,
        lengthRatio: Number(item.ratio.toFixed(3)),
        fileRefs: [{ path: entry.file.path }]
      })
      segIndex += 1
    })
  })
}

async function processJsonFile(
  entry: SingleFileEntry,
  tracker: CoverageTracker,
  segments: ParallelSegment[],
  reasonMap: Map<string, ReasonCode>,
  misses: MissRecord[]
): Promise<void> {
  const records = await loadJsonRecords(entry.file)
  if (!records.length) {
    recordReason(reasonMap, misses, entry.file.path, 'no_target_match')
    return
  }

  let segIndex = 0
  records.forEach((record, index) => {
    if (!record.src) {
      recordReason(reasonMap, misses, entry.file.path, 'too_short')
      return
    }
    const srcSegments = segmentParagraph(record.src, 'ar').segments
    const tgtSegments = segmentParagraph(record.tgt, 'en').segments
    const aligned = alignSegments(srcSegments.length ? srcSegments : [''], tgtSegments.length ? tgtSegments : [''])

    aligned.forEach(item => {
      const rowId = `${sanitizeId(record.id || entry.file.path)}:json-${String(index).padStart(3, '0')}`
      const srcText = item.src ?? ''
      const tgtText = item.tgt ?? ''
      if (srcText) tracker.sourcesFound += 1
      if (tgtText) tracker.targetsFound += 1
      if (srcText && tgtText) tracker.matchedSegments += 1
      segments.push({
        id: `${rowId}#${segIndex}`,
        rowId,
        paraIndex: index,
        segIndex,
        src: srcText,
        tgt: tgtText,
        srcLang: ensureLanguage(srcText, 'ar'),
        tgtLang: tgtText ? ensureLanguage(tgtText, 'en') : 'unknown',
        status: item.status,
        lengthRatio: Number(item.ratio.toFixed(3)),
        fileRefs: [{ path: entry.file.path }]
      })
      segIndex += 1
    })
  })
}

async function writeParallelSegments(segments: ParallelSegment[]): Promise<void> {
  const payload = segments.map(segment => JSON.stringify(segment)).join('\n') + (segments.length ? '\n' : '')
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(PARALLEL_PATH, payload, 'utf8')
}

async function writeManifest(manifest: any): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function formatMisses(misses: MissRecord[]): MissRecord[] {
  const unique = new Map<string, MissRecord>()
  misses.forEach(miss => {
    if (!unique.has(miss.path)) {
      unique.set(miss.path, miss)
    }
  })
  return Array.from(unique.values())
    .sort((a, b) => (a.reason === b.reason ? a.path.localeCompare(b.path) : a.reason.localeCompare(b.reason)))
    .slice(0, 10)
}

async function buildFileCatalog(options: CliOptions, includeMatches: string[]): Promise<Map<string, FileInfo>> {
  const catalog = new Map<string, FileInfo>()
  const visited = new Set<string>()

  const includeSet = includeMatches.map(toAbsolute)

  const processFile = async (absolutePath: string) => {
    if (visited.has(absolutePath)) return
    visited.add(absolutePath)
    const info = await analyzeFile(absolutePath, options)
    if (!info) return
    catalog.set(info.path, info)
  }

  for (const root of DEFAULT_ROOTS) {
    const absoluteRoot = path.join(PROJECT_ROOT, root)
    if (!(await pathExists(absoluteRoot))) continue
    await walkDirectory(absoluteRoot, async filePath => {
      const relative = toProjectRelative(filePath)
      if (options.includes.length && !matchesPattern(options.includes, filePath, relative)) {
        return
      }
      if (options.excludes.length && matchesPattern(options.excludes, filePath, relative)) {
        return
      }
      await processFile(filePath)
    })
  }

  for (const match of includeSet) {
    if (!(await pathExists(match))) continue
    const stats = await fs.stat(match)
    if (stats.isDirectory()) {
      await walkDirectory(match, processFile)
    } else if (stats.isFile()) {
      await processFile(match)
    }
  }

  return catalog
}

async function ensureFileInfo(pathOrAbsolute: string, catalog: Map<string, FileInfo>, options: CliOptions): Promise<FileInfo | null> {
  const absolute = toAbsolute(pathOrAbsolute)
  const relative = toProjectRelative(absolute)
  if (catalog.has(relative)) {
    return catalog.get(relative) ?? null
  }
  const info = await analyzeFile(absolute, options)
  if (!info) return null
  catalog.set(info.path, info)
  return info
}

async function run(): Promise<void> {
  const options = await parseArgs(process.argv.slice(2))
  const map = await loadTranslationMap(options.mapPath)
  const includeMatches = await expandIncludePatterns(options.includes)
  const catalog = await buildFileCatalog(options, includeMatches)

  const reasonMap = new Map<string, ReasonCode>()
  const misses: MissRecord[] = []
  const pairs: DocumentPair[] = []
  const singleEntries: SingleFileEntry[] = []

  const pairedSources = new Set<string>()
  const pairedTargets = new Set<string>()

  const stats = {
    mapPairs: 0,
    folderPairs: 0,
    autoPairs: 0,
    singleFileEntries: 0
  }

  for (const info of catalog.values()) {
    if (info.kind === 'json' || info.kind === 'jsonl' || info.language === 'mixed' || info.hasMarkers) {
      singleEntries.push({ file: info, origin: info.kind === 'json' || info.kind === 'jsonl' ? 'json' : 'marker' })
    }
  }

  for (const entry of map.pairs) {
    const source = await ensureFileInfo(entry.source, catalog, options)
    const target = await ensureFileInfo(entry.target, catalog, options)
    if (!source || !target) {
      if (source) recordReason(reasonMap, misses, source.path, 'no_target_match')
      if (target) recordReason(reasonMap, misses, target.path, 'no_target_match')
      continue
    }
    if (source.extension === '.docx' && !options.docx) {
      recordReason(reasonMap, misses, source.path, 'unsupported_format')
      continue
    }
    if (target.extension === '.docx' && !options.docx) {
      recordReason(reasonMap, misses, target.path, 'unsupported_format')
      continue
    }
    pairs.push({ source, target, origin: 'map', confidence: computeConfidence(source, target) })
    pairedSources.add(source.path)
    pairedTargets.add(target.path)
    stats.mapPairs += 1
  }

  for (const rule of map.folders) {
    const sourceDir = toAbsolute(rule.sourceDir)
    const targetDir = toAbsolute(rule.targetDir)
    if (!(await pathExists(sourceDir)) || !(await pathExists(targetDir))) continue

    await walkDirectory(sourceDir, async sourcePath => {
      const relative = path.relative(sourceDir, sourcePath)
      const posixRelative = toPosix(relative)
      if (!matchesPattern([rule.pattern], sourcePath, posixRelative)) return
      const targetPath = path.join(targetDir, relative)
      if (!(await pathExists(targetPath))) {
        const sourceInfo = await ensureFileInfo(sourcePath, catalog, options)
        if (sourceInfo && !pairedSources.has(sourceInfo.path)) {
          recordReason(reasonMap, misses, sourceInfo.path, 'no_target_match')
        }
        return
      }
      const sourceInfo = await ensureFileInfo(sourcePath, catalog, options)
      const targetInfo = await ensureFileInfo(targetPath, catalog, options)
      if (!sourceInfo || !targetInfo) return
      if (pairedSources.has(sourceInfo.path) || pairedTargets.has(targetInfo.path)) return
      if (sourceInfo.extension === '.docx' && !options.docx) {
        recordReason(reasonMap, misses, sourceInfo.path, 'unsupported_format')
        return
      }
      if (targetInfo.extension === '.docx' && !options.docx) {
        recordReason(reasonMap, misses, targetInfo.path, 'unsupported_format')
        return
      }
      pairs.push({ source: sourceInfo, target: targetInfo, origin: 'folder', confidence: computeConfidence(sourceInfo, targetInfo) })
      pairedSources.add(sourceInfo.path)
      pairedTargets.add(targetInfo.path)
      stats.folderPairs += 1
    })
  }

  const arabicCandidates: FileInfo[] = []
  const englishCandidates: FileInfo[] = []

  for (const info of catalog.values()) {
    if (pairedSources.has(info.path) || pairedTargets.has(info.path)) continue
    if (info.language === 'ar') {
      arabicCandidates.push(info)
    }
    if (info.language === 'en') {
      englishCandidates.push(info)
    }
  }

  const autoCandidates: Array<{ source: FileInfo; target: FileInfo; score: number }> = []
  for (const source of arabicCandidates) {
    for (const target of englishCandidates) {
      const score = computeConfidence(source, target)
      if (score >= 0.6) {
        autoCandidates.push({ source, target, score })
      }
    }
  }

  autoCandidates
    .sort((a, b) => b.score - a.score)
    .forEach(candidate => {
      if (pairedSources.has(candidate.source.path) || pairedTargets.has(candidate.target.path)) return
      if (candidate.source.extension === '.docx' && !options.docx) return
      if (candidate.target.extension === '.docx' && !options.docx) return
      pairs.push({ source: candidate.source, target: candidate.target, origin: 'auto', confidence: candidate.score })
      pairedSources.add(candidate.source.path)
      pairedTargets.add(candidate.target.path)
      stats.autoPairs += 1
    })

  const tracker: CoverageTracker = {
    sourcesFound: 0,
    targetsFound: 0,
    matchedSegments: 0
  }

  const segments: ParallelSegment[] = []

  for (const pair of pairs) {
    await alignDocuments(pair, tracker, segments, reasonMap, misses)
  }

  for (const entry of singleEntries) {
    if (pairedSources.has(entry.file.path) || pairedTargets.has(entry.file.path)) continue
    if (entry.file.extension === '.docx' && !options.docx) {
      recordReason(reasonMap, misses, entry.file.path, 'unsupported_format')
      continue
    }
    if (entry.origin === 'marker') {
      await processMarkerFile(entry, tracker, segments, reasonMap, misses)
      stats.singleFileEntries += 1
    } else {
      await processJsonFile(entry, tracker, segments, reasonMap, misses)
      stats.singleFileEntries += 1
    }
  }

  for (const info of catalog.values()) {
    if (pairedSources.has(info.path) || pairedTargets.has(info.path)) continue
    if (reasonMap.has(info.path)) continue
    if (info.kind === 'json' || info.kind === 'jsonl' || info.language === 'mixed') continue
    if (info.language === 'unknown') {
      recordReason(reasonMap, misses, info.path, 'lang_detection_failed')
      continue
    }
    recordReason(reasonMap, misses, info.path, 'no_target_match')
  }

  const coveragePct = tracker.sourcesFound === 0 ? 0 : Number(((tracker.matchedSegments / tracker.sourcesFound) * 100).toFixed(2))
  const reasonsForMiss = summarizeReasons(reasonMap)
  const manifest = {
    coveragePct,
    sourcesFound: tracker.sourcesFound,
    targetsFound: tracker.targetsFound,
    pairCount: pairs.length + stats.singleFileEntries,
    reasonsForMiss,
    updatedAt: new Date().toISOString(),
    usedMap: map.loaded,
    summary: { ...stats, matchedSegments: tracker.matchedSegments }
  }

  await writeParallelSegments(segments)
  await writeManifest(manifest)

  console.log(`[index] Coverage: ${coveragePct.toFixed(2)}% (${tracker.matchedSegments}/${Math.max(tracker.sourcesFound, 1)} aligned segments)`) // eslint-disable-line no-console
  console.log(`[index] Pairs total: ${manifest.pairCount} (map: ${stats.mapPairs}, folder: ${stats.folderPairs}, auto: ${stats.autoPairs}, single: ${stats.singleFileEntries})`)
  if (Object.keys(reasonsForMiss).length) {
    console.log('[index] Miss reasons:')
    for (const [reason, count] of Object.entries(reasonsForMiss)) {
      console.log(`  ${reason}: ${count}`)
    }
  }
  const topMisses = formatMisses(misses)
  if (topMisses.length) {
    console.log('[index] Top misses:')
    topMisses.forEach(miss => {
      console.log(`  ${miss.path} -> ${miss.reason}`)
    })
  }

  console.log(`[index] Parallel entries written: ${segments.length}`)
  console.log(`[index] Manifest path: ${toProjectRelative(MANIFEST_PATH)}`)
}

run().catch(error => {
  console.error('[index] Failed to index manuscript:', error)
  process.exitCode = 1
})
