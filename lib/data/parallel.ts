import fs from 'node:fs/promises'
import path from 'node:path'
import { ParallelDataset, ParallelManifest, ParallelRow, ParallelSegment } from '../../types/parallel'
import { AlignmentStatus } from '../align'
import { normalizeWhitespace } from '../lang'

const CACHE_DIR = path.join(process.cwd(), '.cache')
const PARALLEL_PATH = path.join(CACHE_DIR, 'parallel.jsonl')
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json')

async function readFileSafe(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

export async function readParallelSegments(): Promise<ParallelSegment[]> {
  try {
    const raw = await readFileSafe(PARALLEL_PATH)
    return raw
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as ParallelSegment)
  } catch (error) {
    console.error('[parallel] Failed to read segments', error)
    return []
  }
}

export async function readParallelManifest(): Promise<ParallelManifest | null> {
  try {
    const raw = await readFileSafe(MANIFEST_PATH)
    return JSON.parse(raw) as ParallelManifest
  } catch (error) {
    console.error('[parallel] Failed to read manifest', error)
    return null
  }
}

export function groupSegmentsByRow(segments: ParallelSegment[]): ParallelRow[] {
  const rows = new Map<string, ParallelRow>()

  segments
    .slice()
    .sort((a, b) => a.paraIndex - b.paraIndex || a.segIndex - b.segIndex)
    .forEach(segment => {
      const entry = rows.get(segment.rowId)
      if (!entry) {
        rows.set(segment.rowId, {
          rowId: segment.rowId,
          paraIndex: segment.paraIndex,
          segments: [segment],
          srcText: normalizeWhitespace(segment.src ?? ''),
          tgtText: normalizeWhitespace(segment.tgt ?? ''),
          statuses: [segment.status],
          lengthRatio: segment.lengthRatio || 0
        })
      } else {
        entry.segments.push(segment)
        if (segment.src) {
          entry.srcText = [entry.srcText, segment.src].filter(Boolean).join(' ').trim()
        }
        if (segment.tgt) {
          entry.tgtText = [entry.tgtText, segment.tgt].filter(Boolean).join(' ').trim()
        }
        entry.statuses.push(segment.status)
        entry.lengthRatio = segment.lengthRatio
      }
    })

  return Array.from(rows.values()).sort((a, b) => a.paraIndex - b.paraIndex)
}

export async function loadParallelDataset(): Promise<ParallelDataset> {
  const segments = await readParallelSegments()
  const manifest = (await readParallelManifest()) ?? {
    coveragePct: 0,
    sourcesFound: 0,
    targetsFound: 0,
    pairCount: 0,
    reasonsForMiss: {},
    updatedAt: new Date().toISOString(),
    usedMap: false
  }
  const rows = groupSegmentsByRow(segments)
  return { segments, manifest, rows }
}

async function writeParallelSegments(segments: ParallelSegment[]): Promise<void> {
  const payload = segments
    .slice()
    .sort((a, b) => a.paraIndex - b.paraIndex || a.segIndex - b.segIndex)
    .map(entry => JSON.stringify(entry))
    .join('\n') + (segments.length ? '\n' : '')

  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(PARALLEL_PATH, payload, 'utf8')
}

async function writeParallelManifest(manifest: ParallelManifest): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

function normalizeRowSegments(rowSegments: ParallelSegment[]): ParallelSegment[] {
  return rowSegments
    .slice()
    .sort((a, b) => a.segIndex - b.segIndex)
    .map((segment, index) => ({
      ...segment,
      segIndex: index,
      id: `${segment.rowId}#${index}`
    }))
}

function updateSegmentStatus(segment: ParallelSegment, status: AlignmentStatus): ParallelSegment {
  return { ...segment, status }
}

export interface MergeSegmentsPayload {
  rowId: string
  segmentIds: string[]
  srcOverride?: string
  tgtOverride?: string
}

export interface SplitSegmentPart {
  src: string
  tgt: string
}

export interface SplitSegmentPayload {
  rowId: string
  segIndex: number
  parts: SplitSegmentPart[]
}

async function updateDataset(
  updater: (segments: ParallelSegment[]) => ParallelSegment[]
): Promise<ParallelDataset> {
  const current = await loadParallelDataset()
  const updatedSegments = updater(current.segments)
  const manifest = current.manifest
  manifest.updatedAt = new Date().toISOString()
  await Promise.all([writeParallelSegments(updatedSegments), writeParallelManifest(manifest)])
  const rows = groupSegmentsByRow(updatedSegments)
  return { segments: updatedSegments, manifest, rows }
}

export async function mergeSegments(payload: MergeSegmentsPayload): Promise<ParallelDataset> {
  return updateDataset(segments => {
    const targetSegments = segments.filter(segment => segment.rowId === payload.rowId)
    if (!targetSegments.length) return segments

    const idSet = new Set(payload.segmentIds)
    const toMerge = targetSegments.filter(segment => idSet.has(segment.id))
    if (toMerge.length <= 1) return segments

    const startIndex = Math.min(...toMerge.map(segment => segment.segIndex))
    const endIndex = Math.max(...toMerge.map(segment => segment.segIndex))

    const mergedSrc = payload.srcOverride ?? toMerge.map(segment => segment.src).filter(Boolean).join(' ')
    const mergedTgt = payload.tgtOverride ?? toMerge.map(segment => segment.tgt).filter(Boolean).join(' ')

    const baseSegment = toMerge[0]!
    const mergedSegment: ParallelSegment = {
      ...baseSegment,
      id: `${baseSegment.rowId}#${startIndex}`,
      segIndex: startIndex,
      src: normalizeWhitespace(mergedSrc),
      tgt: normalizeWhitespace(mergedTgt),
      status: 'needs_review',
      lengthRatio: mergedSrc && mergedTgt ? mergedTgt.length / mergedSrc.length : 0
    }

    const remaining = segments.filter(segment => segment.rowId !== payload.rowId || segment.segIndex < startIndex || segment.segIndex > endIndex)
    const updatedRow = normalizeRowSegments(
      remaining
        .filter(segment => segment.rowId === payload.rowId)
        .concat(mergedSegment)
    )

    return remaining
      .filter(segment => segment.rowId !== payload.rowId)
      .concat(updatedRow)
  })
}

export async function splitSegment(payload: SplitSegmentPayload): Promise<ParallelDataset> {
  return updateDataset(segments => {
    const rowSegments = segments.filter(segment => segment.rowId === payload.rowId)
    if (!rowSegments.length) return segments

    const target = rowSegments.find(segment => segment.segIndex === payload.segIndex)
    if (!target) return segments

    const sanitizedParts = payload.parts
      .map(part => ({
        src: normalizeWhitespace(part.src),
        tgt: normalizeWhitespace(part.tgt)
      }))
      .filter(part => part.src || part.tgt)

    if (!sanitizedParts.length) return segments

    const newSegments: ParallelSegment[] = sanitizedParts.map((part, index) => ({
      ...target,
      id: `${target.rowId}#${payload.segIndex + index}`,
      segIndex: payload.segIndex + index,
      src: part.src,
      tgt: part.tgt,
      status: 'needs_review',
      lengthRatio: part.src && part.tgt ? part.tgt.length / part.src.length : 0
    }))

    const remaining = segments.filter(segment => !(segment.rowId === payload.rowId && segment.segIndex === payload.segIndex))
    const updatedRow = normalizeRowSegments(
      remaining
        .filter(segment => segment.rowId === payload.rowId)
        .concat(newSegments)
    )

    return remaining
      .filter(segment => segment.rowId !== payload.rowId)
      .concat(updatedRow)
  })
}

export async function updateSegmentStatusAction(rowId: string, segmentId: string, status: AlignmentStatus): Promise<ParallelDataset> {
  return updateDataset(segments => segments.map(segment => {
    if (segment.rowId === rowId && segment.id === segmentId) {
      return updateSegmentStatus(segment, status)
    }
    return segment
  }))
}

export async function updateSegmentText(rowId: string, segmentId: string, tgt: string): Promise<ParallelDataset> {
  return updateDataset(segments => segments.map(segment => {
    if (segment.rowId === rowId && segment.id === segmentId) {
      const sanitized = normalizeWhitespace(tgt)
      return {
        ...segment,
        tgt: sanitized,
        status: 'needs_review',
        lengthRatio: segment.src ? sanitized.length / segment.src.length : segment.lengthRatio
      }
    }
    return segment
  }))
}
