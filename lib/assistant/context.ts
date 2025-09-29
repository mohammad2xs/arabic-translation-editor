// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';

interface RowData {
  id: string;
  ar_original: string;
  ar_enhanced: string;
  en_translation: string;
  scriptureRefs?: Array<{
    type: string;
    reference: string;
    normalized?: string;
  }>;
  metadata?: {
    lpr?: number;
    wordCount?: number;
    charCount?: number;
  };
}

interface RowHistory {
  version: number;
  en_translation: string;
  savedAt: string;
  origin?: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
  category?: string;
}

interface ScriptureEntry {
  reference: string;
  type: 'quran' | 'hadith';
  arabic: string;
  english?: string;
  transliteration?: string;
  metadata?: any;
}

interface AssistantContext {
  row: RowData;
  history?: RowHistory[];
  glossary?: GlossaryTerm[];
  scripture?: ScriptureEntry[];
  nearbyRows?: RowData[];
  selection?: string;
}

// Simple BM25-lite keyword matching for finding relevant content
function calculateRelevanceScore(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    const occurrences = (textLower.match(new RegExp(term, 'g')) || []).length;
    score += occurrences * Math.log(1 + text.length / 100);
  }

  return score;
}

// Extract Islamic terms and concepts from text
function extractIslamicTerms(text: string): string[] {
  const islamicTerms = [
    'allah', 'god', 'prophet', 'muhammad', 'quran', 'hadith', 'islam', 'muslim',
    'prayer', 'salah', 'zakah', 'hajj', 'umrah', 'ramadan', 'eid', 'jihad',
    'ummah', 'khalifa', 'imam', 'masjid', 'mosque', 'mecca', 'medina',
    'sunnah', 'sahaba', 'tabi', 'fiqh', 'sharia', 'halal', 'haram',
    'tawhid', 'shirk', 'kufr', 'iman', 'taqwa', 'barakah', 'fitrah',
    'dunya', 'akhirah', 'jannah', 'jahannam', 'paradise', 'hell',
    'angel', 'malak', 'jinn', 'shaytan', 'satan', 'iblis'
  ];

  const textLower = text.toLowerCase();
  return islamicTerms.filter(term => textLower.includes(term));
}

// Load scripture cache from local file
function loadScriptureCache(): Record<string, ScriptureEntry> {
  try {
    const cachePath = join(process.cwd(), 'data/scripture/quran_small.json');
    const cacheData = readFileSync(cachePath, 'utf-8');
    return JSON.parse(cacheData);
  } catch (error) {
    console.warn('Failed to load scripture cache:', error);
    return {};
  }
}

// Load triview data for nearby rows context
function loadTriviewData(): any {
  try {
    const triviewPath = join(process.cwd(), 'outputs/triview.json');
    const triviewData = readFileSync(triviewPath, 'utf-8');
    return JSON.parse(triviewData);
  } catch (error) {
    console.warn('Failed to load triview data:', error);
    return { rows: [] };
  }
}

// Load glossary terms (mock implementation - replace with actual glossary)
function loadGlossary(): GlossaryTerm[] {
  // Mock glossary terms for Islamic concepts
  return [
    { term: 'Allah', definition: 'The Arabic name for God, used by Muslims to refer to the one and only God', category: 'theology' },
    { term: 'Tawhid', definition: 'The Islamic concept of the oneness and uniqueness of God', category: 'theology' },
    { term: 'Ummah', definition: 'The global community of Muslims', category: 'community' },
    { term: 'Fiqh', definition: 'Islamic jurisprudence; the human understanding of Islamic law', category: 'law' },
    { term: 'Sunnah', definition: 'The practices and teachings of Prophet Muhammad', category: 'guidance' },
    { term: 'Taqwa', definition: 'God-consciousness; awareness and fear of God', category: 'spirituality' },
    { term: 'Barakah', definition: 'Divine blessing or grace', category: 'spirituality' },
    { term: 'Fitrah', definition: 'The innate human nature inclined toward truth and goodness', category: 'theology' },
    { term: 'Akhirah', definition: 'The Hereafter; the life after death', category: 'eschatology' },
    { term: 'Jannah', definition: 'Paradise; the eternal garden of the righteous', category: 'eschatology' },
  ];
}

export async function buildContext(
  rowId: string,
  sectionId: string,
  selection?: string,
  task?: string
): Promise<AssistantContext> {

  // Load current row data from triview
  const triviewData = loadTriviewData();
  const currentRow = triviewData.rows?.find((row: any) => row.id === rowId);

  if (!currentRow) {
    throw new Error(`Row ${rowId} not found in triview data`);
  }

  // Transform to our interface
  const row: RowData = {
    id: currentRow.id,
    ar_original: currentRow.original || '',
    ar_enhanced: currentRow.enhanced || currentRow.original || '',
    en_translation: currentRow.english || '',
    scriptureRefs: currentRow.scriptureRefs || [],
    metadata: {
      lpr: currentRow.metadata?.lpr,
      wordCount: currentRow.metadata?.wordCount,
      charCount: currentRow.metadata?.charCount,
    }
  };

  // Load row history (mock implementation - replace with actual history API)
  const history: RowHistory[] = [];
  // TODO: Load from actual history API when available

  // Find relevant glossary terms
  const allGlossary = loadGlossary();
  const searchText = `${row.ar_original} ${row.en_translation} ${selection || ''}`;
  const islamicTerms = extractIslamicTerms(searchText);

  const relevantGlossary = allGlossary.filter(term =>
    islamicTerms.some(islamicTerm =>
      term.term.toLowerCase().includes(islamicTerm) ||
      islamicTerm.includes(term.term.toLowerCase()) ||
      searchText.toLowerCase().includes(term.term.toLowerCase())
    )
  ).slice(0, 5); // Limit to 5 most relevant terms

  // Find relevant scripture from cache
  const scriptureCache = loadScriptureCache();
  const relevantScripture: ScriptureEntry[] = [];

  // Include scripture referenced in current row
  if (row.scriptureRefs?.length) {
    for (const ref of row.scriptureRefs) {
      const cacheEntry = scriptureCache[ref.reference];
      if (cacheEntry) {
        relevantScripture.push({
          reference: cacheEntry.reference,
          type: cacheEntry.type as 'quran' | 'hadith',
          arabic: cacheEntry.arabic,
          english: cacheEntry.english,
          transliteration: cacheEntry.transliteration,
          metadata: cacheEntry.metadata
        });
      }
    }
  }

  // Find scripture related to text content using keyword matching
  if (relevantScripture.length < 3) {
    const searchTerms = [...islamicTerms, ...relevantGlossary.map(g => g.term.toLowerCase())];
    const candidateRefs = Object.keys(scriptureCache);

    const scoredRefs = candidateRefs.map(ref => {
      const entry = scriptureCache[ref];
      const searchableText = `${entry.arabic} ${entry.english || ''}`;
      const score = calculateRelevanceScore(searchTerms.join(' '), searchableText);
      return { ref, score, entry };
    });

    // Add top-scoring scripture entries (excluding already included)
    const additionalScripture = scoredRefs
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3 - relevantScripture.length)
      .filter(s => !relevantScripture.some(rs => rs.reference === s.ref));

    for (const item of additionalScripture) {
      relevantScripture.push({
        reference: item.entry.reference,
        type: item.entry.type as 'quran' | 'hadith',
        arabic: item.entry.arabic,
        english: item.entry.english,
        transliteration: item.entry.transliteration,
        metadata: item.entry.metadata
      });
    }
  }

  // Find nearby rows for context (previous and next 2 rows)
  const currentIndex = triviewData.rows?.findIndex((r: any) => r.id === rowId) || 0;
  const nearbyRows: RowData[] = [];

  for (let i = Math.max(0, currentIndex - 2); i <= Math.min(triviewData.rows?.length - 1, currentIndex + 2); i++) {
    if (i !== currentIndex && triviewData.rows?.[i]) {
      const nearbyRow = triviewData.rows[i];
      nearbyRows.push({
        id: nearbyRow.id,
        ar_original: nearbyRow.original || '',
        ar_enhanced: nearbyRow.enhanced || nearbyRow.original || '',
        en_translation: nearbyRow.english || '',
        scriptureRefs: nearbyRow.scriptureRefs || []
      });
    }
  }

  return {
    row,
    history: history.length > 0 ? history : undefined,
    glossary: relevantGlossary.length > 0 ? relevantGlossary : undefined,
    scripture: relevantScripture.length > 0 ? relevantScripture : undefined,
    nearbyRows: nearbyRows.length > 0 ? nearbyRows : undefined,
    selection
  };
}

// Utility function to get compact context summary for token efficiency
export function getCompactContext(context: AssistantContext): string {
  const parts: string[] = [];

  // Essential row data
  parts.push(`CURRENT ROW: AR="${context.row.ar_original}" EN="${context.row.en_translation}"`);

  // Selection if provided
  if (context.selection) {
    parts.push(`SELECTION: "${context.selection}"`);
  }

  // Recent history (compact)
  if (context.history?.length) {
    const recentHistory = context.history.slice(0, 2);
    parts.push(`HISTORY: ${recentHistory.map(h => `v${h.version}="${h.en_translation.slice(0, 80)}..."`).join(' | ')}`);
  }

  // Relevant terms
  if (context.glossary?.length) {
    parts.push(`TERMS: ${context.glossary.map(g => `${g.term}=${g.definition.slice(0, 50)}...`).join('; ')}`);
  }

  // Scripture references
  if (context.scripture?.length) {
    parts.push(`SCRIPTURE: ${context.scripture.map(s => `${s.reference}="${s.english?.slice(0, 60) || s.arabic.slice(0, 60)}..."`).join(' | ')}`);
  }

  // Metadata
  if (context.row.metadata?.lpr) {
    parts.push(`LPR: ${context.row.metadata.lpr.toFixed(2)}`);
  }

  return parts.join('\n');
}

export default buildContext;