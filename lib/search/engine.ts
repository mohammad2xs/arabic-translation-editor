import { performance } from 'perf_hooks';
import { buildSearchIndex, loadSearchIndexFromDisk, refreshSearchIndex } from './indexer';
import { SearchFilters, SearchHit, SearchResponsePayload, SearchIndexRecord } from './types';
import { normalizeEnglish, normalizeArabic, normalizeScriptureReference, replaceNumerals } from './normalizer';
import { createHighlightedSnippet, tokenOverlapScore, containsNormalized, rankBoost } from './utils';

interface ScriptureQuery {
  normalized: string;
  digitKey: string;
  tokens: string[];
}

interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
  forceRefresh?: boolean;
}

let indexCache: SearchIndexRecord[] | null = null;
let lastLoaded = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function ensureIndex(forceRefresh = false) {
  const now = Date.now();
  if (forceRefresh || !indexCache || now - lastLoaded > CACHE_TTL_MS) {
    if (!forceRefresh) {
      const diskIndex = await loadSearchIndexFromDisk();
      if (diskIndex?.records?.length) {
        indexCache = diskIndex.records;
        lastLoaded = now;
        return;
      }
    }

    // Build fresh index
    indexCache = await buildSearchIndex();
    lastLoaded = now;
  }
}

function detectScriptureQuery(query: string): ScriptureQuery | null {
  if (!query.trim()) return null;
  const normalized = normalizeScriptureReference(query);
  if (!normalized) return null;

  const hasVersePattern = /\d+\s*[:：\.\-]\s*\d+/.test(normalized);
  if (!hasVersePattern) return null;

  const digitKey = normalizeScriptureReference(query.replace(/[^\d:]/g, ' ')).replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(' ').filter(Boolean);

  return {
    normalized,
    digitKey,
    tokens,
  };
}

function passesFilters(record: SearchIndexRecord, filters?: SearchFilters): boolean {
  if (!filters) return true;

  if (filters.sectionIds && filters.sectionIds.length > 0) {
    if (!filters.sectionIds.includes(record.sectionId)) return false;
  }

  if (filters.status && filters.status !== 'all') {
    if (record.status !== filters.status) return false;
  }

  if (typeof filters.minNotes === 'number') {
    if ((record.notesCount ?? 0) < filters.minNotes) return false;
  }

  if (filters.includeScriptureOnly) {
    if (!record.scriptureRefs || record.scriptureRefs.length === 0) return false;
  }

  return true;
}

function scriptureMatchScore(record: SearchIndexRecord, scriptureQuery: ScriptureQuery): { score: number; matches: SearchHit['matches'] } {
  if (!record.scriptureRefs?.length) {
    return { score: 0, matches: [] };
  }

  const matches: SearchHit['matches'] = [];
  let topScore = 0;

  for (const ref of record.scriptureRefs) {
    const normalizedRef = ref.normalized || '';
    const digitMatch = ref.raw ? replaceNumerals(ref.raw).includes(scriptureQuery.digitKey.replace(/\s+/g, '')) : false;

    if (normalizedRef.includes(scriptureQuery.normalized) || digitMatch) {
      const score = 1.0;
      topScore = Math.max(topScore, score);
      matches.push({
        field: 'scripture',
        score,
        snippet: createHighlightedSnippet(ref.raw || ref.normalized || '', scriptureQuery.tokens, [scriptureQuery.normalized]),
      });
    }
  }

  return { score: topScore, matches };
}

function calculateTextScores(record: SearchIndexRecord, query: string) {
  const englishScore = containsNormalized(query, record.english)
    ? { score: 1.0, matchedTokens: [normalizeEnglish(query)], fuzzyMatches: [] }
    : tokenOverlapScore(query, record.english, { fuzzy: true });

  const arabicScore = containsNormalized(query, `${record.original} ${record.enhanced}`)
    ? { score: 1.0, matchedTokens: [normalizeArabic(query)], fuzzyMatches: [] }
    : tokenOverlapScore(query, `${record.original} ${record.enhanced}`, { fuzzy: true });

  return { englishScore, arabicScore };
}

function sectionScore(record: SearchIndexRecord, query: string): { score: number; matches: SearchHit['matches'] } {
  const matches: SearchHit['matches'] = [];
  let score = 0;

  if (containsNormalized(query, record.sectionTitle) || containsNormalized(query, record.sectionId)) {
    score = 0.35;
    matches.push({
      field: 'section',
      score,
      snippet: createHighlightedSnippet(record.sectionTitle, [query, record.sectionId], [record.sectionId]),
    });
  }

  return { score, matches };
}

function rowIdScore(record: SearchIndexRecord, query: string): { score: number; matches: SearchHit['matches'] } {
  const normalizedQuery = normalizeEnglish(query);
  if (!normalizedQuery) return { score: 0, matches: [] };

  if (record.rowId.toLowerCase().includes(normalizedQuery)) {
    return {
      score: 0.25,
      matches: [{
        field: 'rowId',
        score: 0.25,
        snippet: createHighlightedSnippet(record.rowId, [query], [record.rowId]),
      }],
    };
  }

  return { score: 0, matches: [] };
}

function buildHit(record: SearchIndexRecord, query: string, filters?: SearchFilters): SearchHit | null {
  const scriptureQuery = detectScriptureQuery(query);

  let score = 0;
  const matches: SearchHit['matches'] = [];

  if (!passesFilters(record, filters)) {
    return null;
  }

  if (scriptureQuery) {
    const scriptureResult = scriptureMatchScore(record, scriptureQuery);
    if (scriptureResult.score <= 0) {
      return null;
    }
    score += scriptureResult.score;
    matches.push(...scriptureResult.matches);
  }

  const { englishScore, arabicScore } = calculateTextScores(record, query);

  if (!scriptureQuery) {
    if (englishScore.score > 0) {
      score = Math.max(score, englishScore.score);
      matches.push({
        field: 'english',
        score: englishScore.score,
        snippet: createHighlightedSnippet(record.english, englishScore.matchedTokens, [query]),
      });
    }

    if (arabicScore.score > 0) {
      score = Math.max(score, arabicScore.score);
      matches.push({
        field: 'original',
        score: arabicScore.score,
        snippet: createHighlightedSnippet(record.original || record.enhanced, arabicScore.matchedTokens, [query]),
      });
    }

    const sectionResult = sectionScore(record, query);
    if (sectionResult.score > 0) {
      score = rankBoost(score, sectionResult.score / 2);
      matches.push(...sectionResult.matches);
    }

    const rowIdResult = rowIdScore(record, query);
    if (rowIdResult.score > 0) {
      score = rankBoost(score, rowIdResult.score / 2);
      matches.push(...rowIdResult.matches);
    }
  }

  if (score <= 0) {
    return null;
  }

  // Slight boost for higher completion rows so high-quality content surfaces first
  const completion = record.metadata?.completionRatio ?? 0;
  score = Math.min(1.6, score + completion * 0.2);

  return {
    record,
    score,
    matches,
  };
}

function defaultSuggestions(records: SearchIndexRecord[], filters?: SearchFilters, limit = 10): SearchHit[] {
  const filtered = records.filter(record => passesFilters(record, filters));
  const sorted = filtered.sort((a, b) => (b.metadata?.completionRatio ?? 0) - (a.metadata?.completionRatio ?? 0));
  return sorted.slice(0, limit).map(record => ({
    record,
    score: record.metadata?.completionRatio ?? 0.2,
    matches: [],
  }));
}

export async function runSearch(query: string, options: SearchOptions = {}): Promise<SearchResponsePayload> {
  await ensureIndex(options.forceRefresh ?? false);
  const records = indexCache ?? [];
  const start = performance.now();

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = options.filters ?? {};

  let hits: SearchHit[] = [];

  if (!query.trim()) {
    hits = defaultSuggestions(records, filters, limit + offset);
  } else {
    hits = records
      .map(record => buildHit(record, query, filters))
      .filter((hit): hit is SearchHit => Boolean(hit))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const completionDiff = (b.record.metadata?.completionRatio ?? 0) - (a.record.metadata?.completionRatio ?? 0);
        if (completionDiff !== 0) return completionDiff;
        return (b.record.notesCount ?? 0) - (a.record.notesCount ?? 0);
      });
  }

  const paginated = hits.slice(offset, offset + limit);

  const tookMs = performance.now() - start;

  const results = paginated.map(hit => ({
    rowId: hit.record.rowId,
    sectionId: hit.record.sectionId,
    sectionTitle: hit.record.sectionTitle,
    english: hit.record.english,
    original: hit.record.original,
    enhanced: hit.record.enhanced,
    status: hit.record.status,
    notesCount: hit.record.notesCount,
    score: Number(hit.score.toFixed(3)),
    highlights: hit.matches,
    metrics: {
      lpr: hit.record.metadata?.lpr,
      confidence: hit.record.metadata?.confidence,
      completionRatio: hit.record.metadata?.completionRatio,
    },
    scriptureRefs: hit.record.scriptureRefs,
  }));

  return {
    query,
    tookMs: Math.round(tookMs),
    total: hits.length,
    results,
    filtersApplied: filters,
  };
}

export async function forceReindex(): Promise<SearchResponsePayload> {
  const records = await refreshSearchIndex();
  indexCache = records;
  lastLoaded = Date.now();
  return {
    query: '',
    tookMs: 0,
    total: records.length,
    results: [],
    filtersApplied: {},
  };
}
