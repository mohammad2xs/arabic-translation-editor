import { SupportedLanguage, detectLanguage, ensureLanguage, normalizeWhitespace } from './lang'

export interface SegmentOptions {
  minimumLength?: number
}

export interface SegmentedParagraph {
  locale: SupportedLanguage
  segments: string[]
}

const sentenceSegmenters: Partial<Record<SupportedLanguage, Intl.Segmenter>> = {}

function getSegmenter(lang: SupportedLanguage): Intl.Segmenter {
  const map: Record<SupportedLanguage, string> = {
    ar: 'ar',
    en: 'en',
    unknown: 'en'
  }

  if (!sentenceSegmenters[lang]) {
    sentenceSegmenters[lang] = new Intl.Segmenter(map[lang], { granularity: 'sentence' })
  }

  return sentenceSegmenters[lang] as Intl.Segmenter
}

function fallbackSentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[\.!؟؟!؟؛\?])/u)
    .map(segment => normalizeWhitespace(segment))
    .filter(Boolean)
}

function collapseBlankLines(paragraph: string): string {
  return paragraph.replace(/\r?\n\s*\r?\n/g, '\n\n')
}

export function normalizeParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map(paragraph => normalizeWhitespace(collapseBlankLines(paragraph).replace(/\r?\n/g, ' ')))
    .filter(Boolean)
}

export function segmentParagraph(paragraph: string, language?: SupportedLanguage, options: SegmentOptions = {}): SegmentedParagraph {
  const cleaned = normalizeWhitespace(collapseBlankLines(paragraph).replace(/\r?\n/g, ' '))
  const detected = language ?? ensureLanguage(cleaned, detectLanguage(cleaned).language)
  const segmenter = getSegmenter(detected)
  const minimumLength = options.minimumLength ?? 2

  try {
    const segments: string[] = Array.from(segmenter.segment(cleaned))
      .map(entry => normalizeWhitespace(entry.segment))
      .filter(Boolean)

    const filtered = segments.filter(segment => segment.length >= minimumLength)
    if (filtered.length) {
      return { locale: detected, segments: filtered }
    }
  } catch (error) {
    // Intl segmentation can throw for unsupported locales; fall back to regex splitting.
  }

  return {
    locale: detected,
    segments: fallbackSentenceSplit(paragraph).filter(segment => segment.length >= minimumLength)
  }
}

export function segmentParagraphs(paragraphs: string[], language?: SupportedLanguage, options: SegmentOptions = {}): SegmentedParagraph[] {
  return paragraphs.map(paragraph => segmentParagraph(paragraph, language, options))
}
