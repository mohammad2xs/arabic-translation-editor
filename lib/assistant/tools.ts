import { createHash } from 'crypto';

// Interface for diff segments
export interface DiffSegment {
  type: 'add' | 'remove' | 'keep';
  content: string;
}

// Generate a simple word-level diff between two texts
export function generateWordDiff(original: string, revised: string): DiffSegment[] {
  const originalWords = original.split(/(\s+)/);
  const revisedWords = revised.split(/(\s+)/);

  const diff: DiffSegment[] = [];

  // Simple LCS-based diff algorithm
  const lcs = computeLCS(originalWords, revisedWords);

  let i = 0, j = 0, k = 0;

  while (i < originalWords.length || j < revisedWords.length) {
    if (k < lcs.length && i < originalWords.length && j < revisedWords.length &&
        originalWords[i] === revisedWords[j] && originalWords[i] === lcs[k]) {
      // Words match - keep
      diff.push({ type: 'keep', content: originalWords[i] });
      i++; j++; k++;
    } else if (i < originalWords.length &&
               (k >= lcs.length || originalWords[i] !== lcs[k])) {
      // Word removed from original
      diff.push({ type: 'remove', content: originalWords[i] });
      i++;
    } else if (j < revisedWords.length) {
      // Word added in revised
      diff.push({ type: 'add', content: revisedWords[j] });
      j++;
    }
  }

  // Merge consecutive segments of same type
  return mergeDiffSegments(diff);
}

// Compute Longest Common Subsequence for diff
function computeLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Build LCS table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Reconstruct LCS
  const lcs: string[] = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// Merge consecutive diff segments of the same type
function mergeDiffSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return segments;

  const merged: DiffSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const current = segments[i];
    const last = merged[merged.length - 1];

    if (current.type === last.type) {
      // Merge with previous segment
      last.content += current.content;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// Apply suggestion to text with range support
export function applyTextChange(
  originalText: string,
  suggestion: string,
  range?: string
): string {
  if (!range || range === 'all') {
    return suggestion;
  }

  if (range === 'selection') {
    // This would need selection boundaries passed from client
    // For now, return the suggestion as-is
    return suggestion;
  }

  if (range === 'paragraph') {
    // Apply to current paragraph - simplified implementation
    // In a real implementation, you'd need paragraph boundaries
    return suggestion;
  }

  return suggestion;
}

// Generate undo token for reverting changes
export function generateUndoToken(rowId: string, originalText: string, timestamp: Date): string {
  const payload = JSON.stringify({
    rowId,
    originalText: originalText.slice(0, 100), // Truncated for space
    timestamp: timestamp.toISOString(),
  });

  return Buffer.from(payload).toString('base64');
}

// Parse undo token to extract information
export function parseUndoToken(token: string): {
  rowId: string;
  originalText: string;
  timestamp: Date;
} | null {
  try {
    const payload = Buffer.from(token, 'base64').toString('utf-8');
    const data = JSON.parse(payload);

    return {
      rowId: data.rowId,
      originalText: data.originalText,
      timestamp: new Date(data.timestamp),
    };
  } catch (error) {
    console.error('Failed to parse undo token:', error);
    return null;
  }
}

// Format scripture footnote references
export function formatScriptureFootnote(
  reference: string,
  arabic?: string,
  english?: string,
  transliteration?: string
): string {
  const parts: string[] = [reference];

  if (arabic) {
    parts.push(arabic);
  }

  if (transliteration) {
    parts.push(`(${transliteration})`);
  }

  if (english) {
    parts.push(`"${english}"`);
  }

  return parts.join(' - ');
}

// Calculate confidence score for suggestions
export function calculateConfidence(
  originalLength: number,
  suggestedLength: number,
  preservesScripture: boolean,
  hasValidTerminology: boolean
): number {
  let score = 0.5; // Base confidence

  // Length preservation factor
  const lengthRatio = suggestedLength / originalLength;
  if (lengthRatio >= 0.95 && lengthRatio <= 1.3) {
    score += 0.2; // Good length preservation
  } else if (lengthRatio < 0.95) {
    score -= 0.3; // Penalize shrinkage
  } else if (lengthRatio > 1.5) {
    score -= 0.1; // Penalize excessive expansion
  }

  // Scripture preservation
  if (preservesScripture) {
    score += 0.2;
  } else {
    score -= 0.3;
  }

  // Terminology consistency
  if (hasValidTerminology) {
    score += 0.1;
  } else {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

// Extract text selection from a larger text based on start/end positions
export function extractSelection(
  text: string,
  startIndex: number,
  endIndex: number
): string {
  if (startIndex < 0 || endIndex > text.length || startIndex >= endIndex) {
    return '';
  }

  return text.slice(startIndex, endIndex);
}

// Find word boundaries for precise text replacement
export function findWordBoundaries(text: string, position: number): {
  start: number;
  end: number;
} {
  let start = position;
  let end = position;

  // Find start of word
  while (start > 0 && /\w/.test(text[start - 1])) {
    start--;
  }

  // Find end of word
  while (end < text.length && /\w/.test(text[end])) {
    end++;
  }

  return { start, end };
}

// Generate hash for caching based on content
export function generateContentHash(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 16);
}

// Validate Islamic terminology against known terms
export function validateIslamicTerminology(text: string): {
  isValid: boolean;
  invalidTerms: string[];
  suggestions: string[];
} {
  // Mock validation - in real implementation, this would check against glossary
  const knownTerms = [
    'Allah', 'God', 'Prophet Muhammad', 'Quran', 'Islam', 'Muslim',
    'prayer', 'zakah', 'hajj', 'umrah', 'Ramadan', 'jihad',
    'ummah', 'imam', 'mosque', 'Mecca', 'Medina', 'Paradise', 'Hell'
  ];

  const textLower = text.toLowerCase();
  const foundTerms = knownTerms.filter(term =>
    textLower.includes(term.toLowerCase())
  );

  return {
    isValid: foundTerms.length > 0,
    invalidTerms: [], // Would check for problematic terms
    suggestions: foundTerms
  };
}

// Calculate Length Preservation Ratio (LPR)
export function calculateLPR(arabicText: string, englishText: string): number {
  return englishText.length / arabicText.length;
}

// Check if text preserves scripture references
export function preservesScriptureReferences(
  originalText: string,
  revisedText: string,
  scriptureRefs: Array<{ reference: string; type: string }>
): boolean {
  if (!scriptureRefs.length) return true;

  for (const ref of scriptureRefs) {
    // Check if reference pattern is preserved
    const refPattern = new RegExp(ref.reference.replace(':', '[:\\.\\s]'), 'i');
    const originalHasRef = refPattern.test(originalText);
    const revisedHasRef = refPattern.test(revisedText);

    // If original had reference, revised should too
    if (originalHasRef && !revisedHasRef) {
      return false;
    }
  }

  return true;
}

// Text selection utilities for frontend
export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export function parseTextRange(rangeData: string): TextRange | null {
  try {
    const data = JSON.parse(rangeData);
    return {
      start: data.start || 0,
      end: data.end || 0,
      text: data.text || ''
    };
  } catch {
    return null;
  }
}

export function serializeTextRange(range: TextRange): string {
  return JSON.stringify({
    start: range.start,
    end: range.end,
    text: range.text
  });
}