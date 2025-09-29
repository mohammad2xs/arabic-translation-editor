export type SearchStatus = 'pending' | 'in-progress' | 'approved';

export interface SearchScriptureRef {
  raw: string;
  normalized?: string;
  arabicName?: string;
  englishName?: string;
  type?: 'quran' | 'hadith' | 'bible' | 'other';
}

export interface SearchIndexRecord {
  rowId: string;
  sectionId: string;
  sectionTitle: string;
  original: string;
  enhanced: string;
  english: string;
  normalizedArabic: string;
  normalizedEnglish: string;
  scriptureRefs: SearchScriptureRef[];
  status: SearchStatus;
  notesCount: number;
  metadata: {
    lpr?: number;
    confidence?: number;
    updatedAt?: string;
    completionRatio?: number;
  };
}

export interface SearchFilters {
  sectionIds?: string[];
  status?: SearchStatus | 'all';
  minNotes?: number;
  includeScriptureOnly?: boolean;
}

export interface SearchMatch {
  field: 'english' | 'original' | 'enhanced' | 'section' | 'scripture' | 'rowId';
  snippet: string;
  score: number;
}

export interface SearchHit {
  record: SearchIndexRecord;
  score: number;
  matches: SearchMatch[];
}

export interface SearchResponsePayload {
  query: string;
  tookMs: number;
  total: number;
  results: Array<{
    rowId: string;
    sectionId: string;
    sectionTitle: string;
    english: string;
    original: string;
    enhanced: string;
    status: SearchStatus;
    notesCount: number;
    score: number;
    highlights: SearchMatch[];
    metrics: {
      lpr?: number;
      confidence?: number;
      completionRatio?: number;
    };
    scriptureRefs: SearchScriptureRef[];
  }>;
  filtersApplied: SearchFilters;
}
