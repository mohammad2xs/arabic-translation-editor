export type SupportedLanguage = 'ar' | 'en' | 'unknown'

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/
const ARABIC_PUNCT_REGEX = /[\u061B\u061F\u066A-\u066D]/
const ENGLISH_CHAR_REGEX = /[A-Za-z]/
const ENGLISH_PUNCT_REGEX = /[\u0021-\u007E]/

interface DetectionResult {
  language: SupportedLanguage
  confidence: number
}

function scoreArabic(text: string): number {
  if (!text) return 0
  const normalized = stripArabicDiacritics(text)
  const arabicCount = (normalized.match(ARABIC_CHAR_REGEX) || []).length
  const arabicPunct = (normalized.match(ARABIC_PUNCT_REGEX) || []).length
  const total = normalized.length || 1
  return (arabicCount * 1.2 + arabicPunct * 0.5) / total
}

function stripArabicDiacritics(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
}

function scoreEnglish(text: string): number {
  if (!text) return 0
  const englishCount = (text.match(ENGLISH_CHAR_REGEX) || []).length
  const englishPunct = (text.match(ENGLISH_PUNCT_REGEX) || []).length
  const total = text.length || 1
  return (englishCount * 1.1 + englishPunct * 0.4) / total
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function detectLanguage(rawInput: string): DetectionResult {
  const text = normalizeText(rawInput)
  if (!text) {
    return { language: 'unknown', confidence: 0 }
  }

  const arabicScore = scoreArabic(text)
  const englishScore = scoreEnglish(text)

  if (arabicScore === 0 && englishScore === 0) {
    return { language: 'unknown', confidence: 0 }
  }

  if (arabicScore > englishScore * 1.1) {
    return { language: 'ar', confidence: clamp(arabicScore) }
  }

  if (englishScore > arabicScore * 1.1) {
    return { language: 'en', confidence: clamp(englishScore) }
  }

  if (arabicScore > englishScore) {
    return { language: 'ar', confidence: clamp(arabicScore - englishScore) }
  }

  if (englishScore > arabicScore) {
    return { language: 'en', confidence: clamp(englishScore - arabicScore) }
  }

  return { language: 'unknown', confidence: 0 }
}

export function isArabic(text: string): boolean {
  return detectLanguage(text).language === 'ar'
}

export function isEnglish(text: string): boolean {
  return detectLanguage(text).language === 'en'
}

export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function stripDirectionMarkers(text: string): string {
  return text.replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
}

export function normalizeWhitespace(text: string): string {
  return stripDirectionMarkers(text.replace(/\s+/g, ' ').trim())
}

export function ensureLanguage(text: string, fallback: SupportedLanguage): SupportedLanguage {
  const { language } = detectLanguage(text)
  return language === 'unknown' ? fallback : language
}
