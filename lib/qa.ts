import { ParallelSegment } from '../types/parallel'

export type QAStatus = 'pass' | 'warn' | 'fail'

export interface QACheck {
  id: string
  label: string
  status: QAStatus
  message?: string
}

export interface QAResult {
  segmentId: string
  status: QAStatus
  score: number
  checks: QACheck[]
}

export interface QAOverview {
  averageScore: number
  status: QAStatus
}

const LENGTH_RATIO_MIN = 0.6
const LENGTH_RATIO_MAX = 1.6

function evaluateLengthRatio(segment: ParallelSegment): QACheck {
  if (!segment.src || !segment.tgt) {
    return {
      id: 'length_ratio',
      label: 'Length Ratio',
      status: 'warn',
      message: 'Missing source or target text'
    }
  }

  const srcLength = segment.src.replace(/\s+/g, '').length || 1
  const tgtLength = segment.tgt.replace(/\s+/g, '').length || 1
  const ratio = tgtLength / srcLength

  if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) {
    return {
      id: 'length_ratio',
      label: 'Length Ratio',
      status: 'warn',
      message: `Length ratio ${ratio.toFixed(2)} outside expected range`
    }
  }

  return {
    id: 'length_ratio',
    label: 'Length Ratio',
    status: 'pass'
  }
}

function normalizeDigits(text: string): string {
  const replacements: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9'
  }
  return text.replace(/[٠-٩]/g, digit => replacements[digit] ?? digit)
}

function evaluateNumberParity(segment: ParallelSegment): QACheck {
  const srcNumbers = (segment.src ? normalizeDigits(segment.src) : '').match(/[0-9]+/g) ?? []
  const tgtNumbers = (segment.tgt ? normalizeDigits(segment.tgt) : '').match(/[0-9]+/g) ?? []

  if (srcNumbers.length !== tgtNumbers.length) {
    return {
      id: 'numbers',
      label: 'Numeric Consistency',
      status: 'warn',
      message: 'Numeric references differ between source and target'
    }
  }

  return {
    id: 'numbers',
    label: 'Numeric Consistency',
    status: 'pass'
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countOccurrences(text: string, pattern: string): number {
  if (!text) return 0
  const regex = new RegExp(escapeRegExp(pattern), 'g')
  return (text.match(regex) || []).length
}

function evaluateBracketParity(segment: ParallelSegment): QACheck {
  const brackets = ['(', ')', '[', ']', '«', '»', '“', '”', '"']
  const imbalances = brackets.filter(bracket => {
    const srcCount = countOccurrences(segment.src ?? '', bracket)
    const tgtCount = countOccurrences(segment.tgt ?? '', bracket)
    return srcCount !== tgtCount
  })

  if (imbalances.length) {
    return {
      id: 'brackets',
      label: 'Bracket & Quote Parity',
      status: 'warn',
      message: `Mismatched punctuation: ${imbalances.join(', ')}`
    }
  }

  return {
    id: 'brackets',
    label: 'Bracket & Quote Parity',
    status: 'pass'
  }
}

function evaluatePunctuation(segment: ParallelSegment): QACheck {
  const srcEnd = segment.src?.trim().slice(-1) ?? ''
  const tgtEnd = segment.tgt?.trim().slice(-1) ?? ''
  const punctuation = new Set(['.', '!', '?', '؟', '؛', '،'])

  if (punctuation.has(srcEnd) && srcEnd !== tgtEnd) {
    return {
      id: 'punctuation',
      label: 'Ending Punctuation',
      status: 'warn',
      message: 'Ending punctuation differs between source and target'
    }
  }

  return {
    id: 'punctuation',
    label: 'Ending Punctuation',
    status: 'pass'
  }
}

const CHECKS = [
  evaluateLengthRatio,
  evaluateNumberParity,
  evaluateBracketParity,
  evaluatePunctuation
]

function scoreStatus(status: QAStatus): number {
  switch (status) {
    case 'pass':
      return 100
    case 'warn':
      return 70
    case 'fail':
      return 0
  }
}

function worstStatus(statuses: QAStatus[]): QAStatus {
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warn')) return 'warn'
  return 'pass'
}

export function evaluateSegmentQA(segment: ParallelSegment): QAResult {
  const checks = CHECKS.map(check => check(segment))
  const score = Math.round(
    checks.reduce((total, check) => total + scoreStatus(check.status), 0) / checks.length
  )
  const status = worstStatus(checks.map(check => check.status))

  return {
    segmentId: segment.id,
    status,
    score,
    checks
  }
}

export function summarizeQA(results: QAResult[]): QAOverview {
  if (!results.length) {
    return { averageScore: 0, status: 'warn' }
  }

  const averageScore = Math.round(
    results.reduce((total, result) => total + result.score, 0) / results.length
  )
  const status = worstStatus(results.map(result => result.status))

  return { averageScore, status }
}
