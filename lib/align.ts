import { normalizeWhitespace } from './lang'

export type AlignmentStatus = 'aligned' | 'needs_review' | 'missing_src' | 'missing_tgt'

export interface AlignmentOptions {
  minRatio?: number
  maxRatio?: number
  maxMergeSpan?: number
}

export interface AlignmentPair {
  src: string
  tgt: string
  srcSpan: [number, number]
  tgtSpan: [number, number]
  ratio: number
  status: AlignmentStatus
}

const DEFAULT_OPTIONS: Required<AlignmentOptions> = {
  minRatio: 0.6,
  maxRatio: 1.6,
  maxMergeSpan: 3
}

export function alignSegments(srcSegments: string[], tgtSegments: string[], options: AlignmentOptions = {}): AlignmentPair[] {
  const settings = { ...DEFAULT_OPTIONS, ...options }
  const pairs: AlignmentPair[] = []

  let srcIndex = 0
  let tgtIndex = 0

  while (srcIndex < srcSegments.length && tgtIndex < tgtSegments.length) {
    let srcEnd = srcIndex + 1
    let tgtEnd = tgtIndex + 1

    let srcText = joinSegments(srcSegments, srcIndex, srcEnd)
    let tgtText = joinSegments(tgtSegments, tgtIndex, tgtEnd)
    let ratio = computeRatio(srcText, tgtText)

    let srcSpanMerged = 1
    let tgtSpanMerged = 1

    while (ratio < settings.minRatio && tgtEnd < tgtSegments.length && tgtSpanMerged < settings.maxMergeSpan) {
      tgtEnd += 1
      tgtSpanMerged += 1
      tgtText = joinSegments(tgtSegments, tgtIndex, tgtEnd)
      ratio = computeRatio(srcText, tgtText)
    }

    while (ratio > settings.maxRatio && srcEnd < srcSegments.length && srcSpanMerged < settings.maxMergeSpan) {
      srcEnd += 1
      srcSpanMerged += 1
      srcText = joinSegments(srcSegments, srcIndex, srcEnd)
      ratio = computeRatio(srcText, tgtText)
    }

    const status: AlignmentStatus = withinBounds(ratio, settings.minRatio, settings.maxRatio) ? 'aligned' : 'needs_review'

    pairs.push({
      src: srcText,
      tgt: tgtText,
      srcSpan: [srcIndex, srcEnd],
      tgtSpan: [tgtIndex, tgtEnd],
      ratio,
      status
    })

    srcIndex = srcEnd
    tgtIndex = tgtEnd
  }

  while (srcIndex < srcSegments.length) {
    const srcEnd = srcIndex + 1
    pairs.push({
      src: normalizeWhitespace(srcSegments[srcIndex] ?? ''),
      tgt: '',
      srcSpan: [srcIndex, srcEnd],
      tgtSpan: [tgtSegments.length, tgtSegments.length],
      ratio: 0,
      status: 'missing_tgt'
    })
    srcIndex = srcEnd
  }

  while (tgtIndex < tgtSegments.length) {
    const tgtEnd = tgtIndex + 1
    pairs.push({
      src: '',
      tgt: normalizeWhitespace(tgtSegments[tgtIndex] ?? ''),
      srcSpan: [srcSegments.length, srcSegments.length],
      tgtSpan: [tgtIndex, tgtEnd],
      ratio: 0,
      status: 'missing_src'
    })
    tgtIndex = tgtEnd
  }

  return pairs
}

function withinBounds(value: number, min: number, max: number): boolean {
  if (!Number.isFinite(value)) return false
  return value >= min && value <= max
}

function joinSegments(segments: Array<string | undefined>, start: number, end: number): string {
  return normalizeWhitespace(segments.slice(start, end).filter(Boolean).join(' '))
}

function computeRatio(src: string, tgt: string): number {
  const srcLength = Math.max(1, textLength(src))
  const tgtLength = Math.max(1, textLength(tgt))
  return tgtLength / srcLength
}

function textLength(text: string): number {
  return normalizeWhitespace(text).replace(/[\s\p{P}]/gu, '').length
}
