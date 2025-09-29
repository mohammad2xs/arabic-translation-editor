'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import clsx from 'clsx';
import { sanitizeSnippet } from '@/lib/search/normalizer';
import type { SearchResponsePayload, SearchStatus } from '@/lib/search/types';

interface SectionOption {
  id: string;
  title: string;
}

interface PanelFilters {
  status: SearchStatus | 'all';
  sectionIds: string[];
  minNotes: number;
  includeScriptureOnly: boolean;
}

interface SearchHistoryEntry {
  id: string;
  query: string;
  filters: PanelFilters;
  timestamp: number;
}

interface SearchSelection {
  rowId: string;
  sectionId: string;
  sectionTitle: string;
  score: number;
}

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sections: SectionOption[];
  onSelect: (selection: SearchSelection) => void;
  defaultFilters?: Partial<PanelFilters>;
}

const HISTORY_STORAGE_KEY = 'tri-search-history';
const SAVED_STORAGE_KEY = 'tri-search-saved';
const HISTORY_LIMIT = 15;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `search-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSectionIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function defaultFiltersWith(overrides?: Partial<PanelFilters>): PanelFilters {
  return {
    status: overrides?.status ?? 'all',
    sectionIds: normalizeSectionIds(overrides?.sectionIds ?? []),
    minNotes: overrides?.minNotes ?? 0,
    includeScriptureOnly: overrides?.includeScriptureOnly ?? false,
  };
}

function filtersEqual(a: PanelFilters, b: PanelFilters): boolean {
  if (a.status !== b.status) return false;
  if (a.minNotes !== b.minNotes) return false;
  if (a.includeScriptureOnly !== b.includeScriptureOnly) return false;
  if (a.sectionIds.length !== b.sectionIds.length) return false;
  return a.sectionIds.every((value, index) => value === b.sectionIds[index]);
}

function buildSearchParams(query: string, filters: PanelFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', '25');

  if (filters.status && filters.status !== 'all') {
    params.set('status', filters.status);
  }
  if (filters.sectionIds.length > 0) {
    filters.sectionIds.forEach(section => params.append('section', section));
  }
  if (filters.minNotes > 0) {
    params.set('minNotes', String(filters.minNotes));
  }
  if (filters.includeScriptureOnly) {
    params.set('scriptureOnly', 'true');
  }

  return params;
}

function resultSnippet(result: SearchResponsePayload['results'][number]): string {
  const preferredOrder: Array<typeof result.highlights[number]['field']> = ['english', 'original', 'enhanced'];
  const match = preferredOrder
    .map(field => result.highlights.find(item => item.field === field))
    .find(Boolean);

  if (match?.snippet) {
    return match.snippet;
  }

  if (result.highlights[0]?.snippet) {
    return result.highlights[0].snippet;
  }

  const base = result.english || result.original || result.enhanced || '';
  if (!base) return '';
  const excerpt = base.slice(0, 160);
  const truncated = base.length > 160 ? `${excerpt}…` : excerpt;
  return sanitizeSnippet(truncated);
}

function loadStoredEntries(key: string): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(entry => typeof entry?.query === 'string')
      .map(entry => ({
        id: entry.id ?? makeId(),
        query: entry.query,
        filters: defaultFiltersWith(entry.filters),
        timestamp: entry.timestamp ?? Date.now(),
      }))
      .slice(0, HISTORY_LIMIT);
  } catch (error) {
    console.warn('[SearchPanel] Failed to load stored entries', error);
    return [];
  }
}

function persistEntries(key: string, entries: SearchHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch (error) {
    console.warn('[SearchPanel] Failed to persist entries', error);
  }
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '';
  return `${Math.round(score * 100)}%`; // approximate relevance percentage
}

export default function SearchPanel({
  isOpen,
  onClose,
  sections,
  onSelect,
  defaultFilters,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PanelFilters>(() => defaultFiltersWith(defaultFilters));
  const [results, setResults] = useState<SearchResponsePayload['results']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [saved, setSaved] = useState<SearchHistoryEntry[]>([]);
  const [lastTook, setLastTook] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const resetSelection = useCallback(() => setSelectedIndex(0), []);

  const registerHistory = useCallback((entry: SearchHistoryEntry) => {
    setHistory(prev => {
      const filtered = prev.filter(item => !(item.query === entry.query && filtersEqual(item.filters, entry.filters)));
      const updated = [entry, ...filtered].slice(0, HISTORY_LIMIT);
      persistEntries(HISTORY_STORAGE_KEY, updated);
      return updated;
    });
  }, []);

    const loadSuggestions = useCallback(async (activeQuery: string, activeFilters: PanelFilters) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = buildSearchParams(activeQuery, activeFilters);
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const payload = (await response.json()) as SearchResponsePayload;
      setResults(payload.results);
      setLastTook(payload.tookMs);
      resetSelection();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      console.error('[SearchPanel] Search request failed', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [resetSelection]);

  const debouncedSearch = useCallback((nextQuery: string, nextFilters: PanelFilters) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      loadSuggestions(nextQuery, nextFilters);
    }, 220);
  }, [loadSuggestions]);

  const handleSelectResult = useCallback((result: SearchResponsePayload['results'][number]) => {
    if (!result) return;

    const entry: SearchHistoryEntry = {
      id: makeId(),
      query: query.trim() || result.sectionTitle,
      filters: defaultFiltersWith(filters),
      timestamp: Date.now(),
    };
    registerHistory(entry);

    onSelect({
      rowId: result.rowId,
      sectionId: result.sectionId,
      sectionTitle: result.sectionTitle,
      score: result.score,
    });
    onClose();
  }, [filters, onSelect, onClose, query, registerHistory]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      const activeElement = document.activeElement;
      const isInput = activeElement === inputRef.current;
      if (isInput) {
        event.preventDefault();
        const target = results[selectedIndex];
        if (target) {
          handleSelectResult(target);
        }
      }
    }
  }, [handleSelectResult, isOpen, onClose, results, selectedIndex]);

  const handleSaveSearch = useCallback(() => {
    if (!query.trim()) return;
    const entry: SearchHistoryEntry = {
      id: makeId(),
      query: query.trim(),
      filters: defaultFiltersWith(filters),
      timestamp: Date.now(),
    };

    setSaved(prev => {
      const filtered = prev.filter(item => !(item.query === entry.query && filtersEqual(item.filters, entry.filters)));
      const updated = [entry, ...filtered].slice(0, HISTORY_LIMIT);
      persistEntries(SAVED_STORAGE_KEY, updated);
      return updated;
    });
  }, [filters, query]);

  useEffect(() => {
    if (!isOpen || !defaultFilters) return;
    const normalized = defaultFiltersWith(defaultFilters);
    setFilters(prev => (filtersEqual(prev, normalized) ? prev : normalized));
  }, [defaultFilters, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!initializedRef.current) {
      const storedHistory = loadStoredEntries(HISTORY_STORAGE_KEY);
      const storedSaved = loadStoredEntries(SAVED_STORAGE_KEY);
      setHistory(storedHistory);
      setSaved(storedSaved);
      initializedRef.current = true;
    }

    inputRef.current?.focus();
    loadSuggestions(query, filters);
  }, [filters, isOpen, loadSuggestions, query]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [handleKeyDown, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    debouncedSearch(query, filters);
  }, [query, filters, isOpen, debouncedSearch]);

  useEffect(() => () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
  }, []);

  const handleStatusChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = event.target.value as SearchStatus | 'all';
    setFilters(prev => ({ ...prev, status: nextStatus }));
  }, []);

  const handleSectionChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setFilters(prev => ({
      ...prev,
      sectionIds: value === 'all' ? [] : normalizeSectionIds([value]),
    }));
  }, []);

  const handleNotesChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setFilters(prev => ({
      ...prev,
      minNotes: value === 'with-notes' ? 1 : 0,
    }));
  }, []);

  const handleScriptureToggle = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setFilters(prev => ({
      ...prev,
      includeScriptureOnly: checked,
    }));
  }, []);

  const suggestedSections = useMemo(() => {
    return sections.slice(0, 12);
  }, [sections]);

  const currentSectionValue = filters.sectionIds.length === 1 ? filters.sectionIds[0] : 'all';

  return !isOpen ? null : (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mt-16 w-full max-w-4xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="border-b border-gray-200 bg-slate-50 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Global Search • البحث الشامل</h2>
              <p className="mt-1 text-sm text-slate-600">Find any verse, translation, or note across the project. Use Cmd/Ctrl + K to open quickly.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Esc
            </button>
          </div>
          <div className="mt-4">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search Arabic, English, or Scripture references… | ابحث في العربية أو الإنجليزية أو المراجع"
                className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-12 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              {loading && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">Loading…</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Status</span>
                <select value={filters.status} onChange={handleStatusChange} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
                  <option value="all">All statuses</option>
                  <option value="approved">Approved</option>
                  <option value="in-progress">In progress</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Section</span>
                <select value={currentSectionValue} onChange={handleSectionChange} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
                  <option value="all">All sections</option>
                  {suggestedSections.map(section => (
                    <option key={section.id} value={section.id}>{section.id} • {section.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Notes</span>
                <select value={filters.minNotes > 0 ? 'with-notes' : 'all'} onChange={handleNotesChange} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
                  <option value="all">All rows</option>
                  <option value="with-notes">With reviewer notes</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.includeScriptureOnly}
                  onChange={handleScriptureToggle}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Scripture only
              </label>
              <button
                type="button"
                onClick={handleSaveSearch}
                disabled={!query.trim()}
                className={clsx('ml-auto rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition',
                  query.trim()
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                )}
              >
                Save search
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-1">
          {error && (
            <div className="mx-5 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!error && results.length === 0 && !loading && (
            <div className="mx-5 my-10 text-center text-sm text-slate-500">
              No matches yet. Try searching for a keyword or scripture reference.
            </div>
          )}

          <ul className="space-y-2 pb-6 pr-4">
            {results.map((result, index) => (
              <li key={result.rowId}
                className={clsx(
                  'cursor-pointer rounded-xl border border-transparent px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50',
                  index === selectedIndex && 'border-indigo-300 bg-indigo-50 shadow-sm'
                )}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => handleSelectResult(result)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {result.sectionId} • {result.sectionTitle}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {result.status !== 'pending' && (
                      <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                        result.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {result.status === 'approved' ? 'Approved' : 'In progress'}
                      </span>
                    )}
                    {result.notesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                        📝 {result.notesCount}
                      </span>
                    )}
                    {Number.isFinite(result.metrics.completionRatio) && (
                      <span className="text-slate-400">{formatScore(result.metrics.completionRatio ?? 0)}</span>
                    )}
                    <span className="text-slate-400">Score {result.score.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-2 text-[15px] leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: resultSnippet(result) }} />
                {result.scriptureRefs?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-indigo-600">
                    {result.scriptureRefs.map(ref => (
                      <span key={`${result.rowId}-${ref.raw}`} className="rounded-full bg-indigo-50 px-2 py-0.5">
                        📖 {ref.raw || ref.normalized}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {(history.length > 0 || saved.length > 0) && (
          <div className="border-t border-slate-200 bg-white px-6 py-4">
            {saved.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="text-xs uppercase tracking-wide text-slate-500">Saved searches</span>
                {saved.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setQuery(entry.query);
                      setFilters(defaultFiltersWith(entry.filters));
                      debouncedSearch(entry.query, defaultFiltersWith(entry.filters));
                    }}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100"
                  >
                    {entry.query}
                  </button>
                ))}
              </div>
            )}

            {history.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="text-xs uppercase tracking-wide text-slate-500">Recent</span>
                {history.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setQuery(entry.query);
                      setFilters(defaultFiltersWith(entry.filters));
                      debouncedSearch(entry.query, defaultFiltersWith(entry.filters));
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    {entry.query}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 bg-slate-50 px-6 py-3 text-xs text-slate-500 flex items-center justify-between">
          <div>
            {lastTook !== null ? `Last query: ${lastTook}ms` : 'Ready'} • {results.length} results
          </div>
          <div className="flex items-center gap-4">
            <span>↩︎ Select • Enter</span>
            <span>↑↓ Navigate</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
