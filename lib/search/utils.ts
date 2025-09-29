import { normalizeAny, normalizeEnglish, normalizeArabic, tokenize, sanitizeSnippet } from './normalizer';

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function tokenOverlapScore(query: string, text: string, { fuzzy = true }: { fuzzy?: boolean } = {}): { score: number; matchedTokens: string[]; fuzzyMatches: string[] } {
  const normalizedText = normalizeAny(text);
  const textTokens = new Set(tokenize(normalizedText));

  const normalizedQuery = normalizeAny(query);
  const queryTokens = tokenize(normalizedQuery);

  if (queryTokens.length === 0 || textTokens.size === 0) {
    return { score: 0, matchedTokens: [], fuzzyMatches: [] };
  }

  let directMatches = 0;
  const matchedTokens: string[] = [];
  const fuzzyMatches: string[] = [];

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      directMatches += 1;
      matchedTokens.push(token);
      continue;
    }

    if (!fuzzy || token.length < 3) continue;

    const hasApproximate = Array.from(textTokens).some(candidate => {
      const distance = levenshtein(token, candidate);
      if (candidate.length <= 4) {
        return distance <= 1;
      }
      return distance <= 2;
    });

    if (hasApproximate) {
      directMatches += 0.5;
      fuzzyMatches.push(token);
    }
  }

  const score = Math.min(1, directMatches / queryTokens.length);

  return { score, matchedTokens, fuzzyMatches };
}

export function containsNormalized(query: string, text: string): boolean {
  if (!query.trim() || !text.trim()) return false;
  const normalizedQuery = normalizeAny(query);
  const normalizedText = normalizeAny(text);
  return normalizedText.includes(normalizedQuery);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createHighlightedSnippet(text: string, tokens: string[], fallbackTokens: string[] = [], maxLength = 160): string {
  const cleanedTokens = Array.from(new Set(tokens.filter(Boolean)));
  const fallback = Array.from(new Set(fallbackTokens.filter(Boolean)));
  const searchTokens = cleanedTokens.length > 0 ? cleanedTokens : fallback.length > 0 ? fallback : [];

  const lowerText = text.toLowerCase();
  let firstMatchIndex = -1;

  for (const token of searchTokens) {
    const index = lowerText.indexOf(token.toLowerCase());
    if (index !== -1) {
      firstMatchIndex = index;
      break;
    }
  }

  let snippetStart = 0;
  if (firstMatchIndex !== -1) {
    snippetStart = Math.max(0, firstMatchIndex - Math.floor(maxLength / 2));
  }

  let snippetEnd = Math.min(text.length, snippetStart + maxLength);
  snippetStart = Math.max(0, snippetEnd - maxLength);

  let snippet = text.slice(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = `…${snippet}`;
  if (snippetEnd < text.length) snippet = `${snippet}…`;

  let highlighted = sanitizeSnippet(snippet);

  const tokensToHighlight = searchTokens.length > 0 ? searchTokens : [snippet.trim().split(' ')[0] || ''];

  for (const token of tokensToHighlight) {
    if (!token) continue;
    const regex = new RegExp(`(${escapeRegExp(token)})`, 'gi');
    highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
  }

  return highlighted;
}

export function rankBoost(base: number, weight: number): number {
  return base + weight;
}

export function computeCompletionRatio(record: { metadata: { completionRatio?: number; lpr?: number; confidence?: number }; status: string; english: string }): number {
  if (typeof record?.metadata?.completionRatio === 'number') {
    return record.metadata.completionRatio;
  }

  const hasEnglish = record.english?.trim()?.length > 0;
  const base = hasEnglish ? 0.5 : 0;
  const lpr = record.metadata?.lpr ?? 0;
  const confidence = record.metadata?.confidence ?? 0;
  const statusBonus = record.status === 'approved' ? 0.4 : record.status === 'in-progress' ? 0.2 : 0;

  return Math.min(1, base + (lpr > 0 ? Math.min(lpr, 1) * 0.25 : 0) + confidence * 0.15 + statusBonus);
}
