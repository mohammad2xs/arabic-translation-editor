// @ts-nocheck
export interface Searchable {
  [key: string]: any;
}

export interface FuzzyMatch {
  item: any;
  score: number;
  matches: Array<{
    indices: number[];
    value: string;
  }>;
}

export function fuzzySearch<T>(
  query: string,
  items: T[],
  options: {
    key?: string | ((item: T) => string);
    threshold?: number;
    includeScore?: boolean;
    includeMatches?: boolean;
  } = {}
): FuzzyMatch[] {
  const {
    key = (item: T) => String(item),
    threshold = 0.6,
    includeScore = true,
    includeMatches = true
  } = options;

  if (!query.trim()) {
    return items.map((item, index) => ({
      item,
      score: 1,
      matches: []
    }));
  }

  const results: FuzzyMatch[] = [];

  for (const item of items) {
    const text = typeof key === 'function' ? key(item) : (item as any)[key];
    const score = calculateScore(query, text);
    
    if (score >= threshold) {
      results.push({
        item,
        score,
        matches: includeMatches ? findMatches(query, text) : []
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function calculateScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (textLower.includes(queryLower)) {
    return 1.0;
  }
  
  let score = 0;
  let queryIndex = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += 1;
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length ? score / queryLower.length : 0;
}

function findMatches(query: string, text: string): Array<{ indices: number[]; value: string }> {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matches: Array<{ indices: number[]; value: string }> = [];
  
  let startIndex = 0;
  let matchIndex = textLower.indexOf(queryLower, startIndex);
  
  while (matchIndex !== -1) {
    const indices: number[] = [];
    for (let i = 0; i < queryLower.length; i++) {
      indices.push(matchIndex + i);
    }
    
    matches.push({
      indices,
      value: text.substring(matchIndex, matchIndex + queryLower.length)
    });
    
    startIndex = matchIndex + 1;
    matchIndex = textLower.indexOf(queryLower, startIndex);
  }
  
  return matches;
}

export function highlightMatches(text: string, matches: Array<{ indices: number[]; value: string }>): string {
  if (!matches.length) return text;
  
  let highlighted = text;
  let offset = 0;
  
  // Sort matches by start index to process them in order
  const sortedMatches = matches.sort((a, b) => a.indices[0] - b.indices[0]);
  
  for (const match of sortedMatches) {
    const start = match.indices[0] + offset;
    const end = match.indices[match.indices.length - 1] + 1 + offset;
    const before = highlighted.substring(0, start);
    const matched = highlighted.substring(start, end);
    const after = highlighted.substring(end);
    
    highlighted = before + `<mark class="bg-yellow-200 px-1 rounded">${matched}</mark>` + after;
    offset += 47; // Length of the added HTML markup
  }
  
  return highlighted;
}