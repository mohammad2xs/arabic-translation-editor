/**
 * Lightweight fuzzy search matcher for command palette
 * Supports Arabic and English text matching with Unicode handling
 */

export interface FuzzyMatch<T> {
  item: T;
  score: number;
  matches: number[];
}

export interface Searchable {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
}

/**
 * Simple fuzzy search without external dependencies
 * Scores based on consecutive matches and position
 */
export function fuzzySearch<T extends Searchable>(
  items: T[],
  query: string,
  limit = 50
): FuzzyMatch<T>[] {
  if (!query.trim()) {
    return items.slice(0, limit).map(item => ({
      item,
      score: 0,
      matches: []
    }));
  }

  const normalizedQuery = normalizeText(query);
  const results: FuzzyMatch<T>[] = [];

  for (const item of items) {
    const searchText = [
      item.title,
      item.subtitle || '',
      ...(item.keywords || [])
    ].join(' ');

    const normalizedText = normalizeText(searchText);
    const match = scoreMatch(normalizedText, normalizedQuery);

    if (match.score > 0) {
      results.push({
        item,
        score: match.score,
        matches: match.matches
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Normalize text for consistent matching across Arabic and English
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep letters, numbers, spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a match based on consecutive characters and position
 */
function scoreMatch(text: string, query: string): { score: number; matches: number[] } {
  const matches: number[] = [];
  let score = 0;
  let textIndex = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;

  while (textIndex < text.length && queryIndex < query.length) {
    if (text[textIndex] === query[queryIndex]) {
      matches.push(textIndex);
      consecutiveMatches++;
      queryIndex++;

      // Bonus for consecutive matches
      if (consecutiveMatches > 1) {
        score += consecutiveMatches * 2;
      } else {
        score += 1;
      }

      // Bonus for matches at word boundaries
      if (textIndex === 0 || text[textIndex - 1] === ' ') {
        score += 5;
      }
    } else {
      consecutiveMatches = 0;
    }
    textIndex++;
  }

  // Must match all query characters
  if (queryIndex < query.length) {
    return { score: 0, matches: [] };
  }

  // Bonus for exact matches
  if (text.includes(query)) {
    score += query.length * 10;
  }

  // Penalty for long text (favor shorter matches)
  score = score / (text.length * 0.1 + 1);

  return { score, matches };
}

/**
 * Highlight matched characters in text
 */
export function highlightMatches(text: string, matches: number[]): string {
  if (!matches.length) return text;

  let result = '';
  let lastIndex = 0;

  for (const index of matches) {
    result += text.slice(lastIndex, index);
    result += `<mark class="fuzzy-match">${text[index]}</mark>`;
    lastIndex = index + 1;
  }

  result += text.slice(lastIndex);
  return result;
}