// @ts-nocheck
import { detectScriptureRefs } from '../scripture/index';

export interface SegmentedRow {
  text: string;
  complexity: number;
  scriptureRefs: Array<{
    type: 'quran' | 'hadith';
    reference: string;
    normalized: string;
  }>;
  metadata: {
    isVerse?: boolean;
    hasScripture?: boolean;
    originalLength: number;
  };
}

// Arabic sentence-ending punctuation
const ARABIC_SENTENCE_ENDINGS = /([.؟!؛]+)/;

// Minimum segment length to avoid overly short segments
const MIN_SEGMENT_LENGTH = 40;

// Arabic text normalization
function normalizeArabicText(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Remove diacritics and tatweel
    .replace(/[ا]/g, 'ا') // Normalize alif variations
    .replace(/[ي]/g, 'ي') // Normalize ya variations
    .replace(/[ه]/g, 'ه') // Normalize heh variations
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Calculate text complexity based on vocabulary and structure
function calculateComplexity(text: string): number {
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

  // Base complexity on word length and sentence length
  let complexity = 1;

  if (avgWordLength > 6) complexity += 1; // Long words
  if (words.length > 15) complexity += 1; // Long sentences
  if (text.includes('قال تعالى') || text.includes('قال رسول الله')) complexity += 1; // Scripture quotes
  if (/[[\]()]/.test(text)) complexity += 1; // Contains references/citations

  return Math.min(complexity, 5); // Cap at 5
}

// Merge short segments with neighboring segments
function mergeShortSegments(segments: string[]): string[] {
  const merged: string[] = [];
  let current = '';

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if (current.length === 0) {
      current = trimmed;
    } else if (current.length < MIN_SEGMENT_LENGTH || trimmed.length < MIN_SEGMENT_LENGTH) {
      // Merge with current
      current += ' ' + trimmed;
    } else {
      // Start new segment
      merged.push(current);
      current = trimmed;
    }
  }

  if (current.length > 0) {
    merged.push(current);
  }

  return merged;
}

// Split text on Arabic punctuation while preserving scripture context
function splitIntoSegments(text: string): string[] {
  // First, protect scripture references and their context
  const scripturePattern = /(قال تعالى[^.؟!؛]*[.؟!؛]|قال رسول الله[^.؟!؛]*[.؟!؛]|\[\[[^\]]+\]\][^.؟!؛]*[.؟!؛]?)/g;
  const protectedSegments: string[] = [];
  let protectedText = text;
  let match;

  while ((match = scripturePattern.exec(text)) !== null) {
    const placeholder = `__SCRIPTURE_${protectedSegments.length}__`;
    protectedSegments.push(match[1]);
    protectedText = protectedText.replace(match[1], placeholder);
  }

  // Split on sentence endings while preserving delimiters and reassembling properly
  const parts = protectedText.split(ARABIC_SENTENCE_ENDINGS);
  const rawSegments: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Text part
      if (parts[i] && parts[i + 1]) {
        // Combine with following punctuation
        rawSegments.push(parts[i] + parts[i + 1]);
        i++; // Skip the punctuation part since we already used it
      } else if (parts[i]) {
        // Last part without punctuation
        rawSegments.push(parts[i]);
      }
    }
  }

  // Restore protected segments
  const restoredSegments = rawSegments.map(segment => {
    let restored = segment;
    protectedSegments.forEach((original, index) => {
      restored = restored.replace(`__SCRIPTURE_${index}__`, original);
    });
    return restored;
  });

  return mergeShortSegments(restoredSegments);
}

export async function segmentArabicText(text: string): Promise<SegmentedRow[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const normalizedText = normalizeArabicText(text);
  const segments = splitIntoSegments(normalizedText);

  const rows: SegmentedRow[] = [];

  for (const segment of segments) {
    const trimmedSegment = segment.trim();
    if (trimmedSegment.length === 0) continue;

    // Detect scripture references
    const scriptureRefs = await detectScriptureRefs(trimmedSegment);

    // Calculate complexity
    const complexity = calculateComplexity(trimmedSegment);

    // Determine if this is a verse or contains scripture
    const hasScripture = scriptureRefs.length > 0;
    const isVerse = /قال تعالى|قال رسول الله/.test(trimmedSegment);

    rows.push({
      text: trimmedSegment,
      complexity,
      scriptureRefs,
      metadata: {
        isVerse,
        hasScripture,
        originalLength: trimmedSegment.length
      }
    });
  }

  return rows;
}