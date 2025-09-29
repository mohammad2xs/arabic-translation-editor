// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type DadDensity = 'cozy' | 'compact' | 'super';
export type RowsPerViewOption = 10 | 20 | 40 | 'all';

export interface VisibleColumns {
  original: boolean;
  enhanced: boolean;
  english: boolean;
}

export interface DadPrefs {
  visibleColumns: VisibleColumns;
  density: DadDensity;
  rowsPerView: RowsPerViewOption;
  lastSectionId?: string;
}

const STORAGE_KEY = 'dad:prefs';
const REVIEW_PREFIX = 'dad:reviewed:';

const defaultPrefs: DadPrefs = {
  visibleColumns: {
    original: true,
    enhanced: true,
    english: true,
  },
  density: 'compact',
  rowsPerView: 20,
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function parseRowsPerView(value: unknown): RowsPerViewOption {
  if (value === 'all') return 'all';
  const num = Number(value);
  return (num === 10 || num === 20 || num === 40) ? num : 20;
}

function normalizePrefs(candidate: Partial<DadPrefs> | null | undefined): DadPrefs {
  if (!candidate || typeof candidate !== 'object') {
    return { ...defaultPrefs };
  }

  const visibleColumns = {
    original: candidate.visibleColumns?.original ?? true,
    enhanced: candidate.visibleColumns?.enhanced ?? true,
    english: candidate.visibleColumns?.english ?? true,
  } satisfies VisibleColumns;

  const density: DadDensity = candidate.density === 'cozy' || candidate.density === 'super'
    ? candidate.density
    : 'compact';

  const rowsPerView = parseRowsPerView(candidate.rowsPerView);

  return {
    visibleColumns,
    density,
    rowsPerView,
    lastSectionId: candidate.lastSectionId,
  };
}

function readPrefs(): DadPrefs {
  if (!isBrowser()) {
    return { ...defaultPrefs };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...defaultPrefs };
    const parsed = JSON.parse(stored);
    return normalizePrefs(parsed);
  } catch (error) {
    console.warn('Failed to parse dad prefs from storage', error);
    return { ...defaultPrefs };
  }
}

function writePrefs(next: DadPrefs) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Failed to persist dad prefs', error);
  }
}

export function useDadPrefs() {
  const [prefs, setPrefs] = useState<DadPrefs>(() => readPrefs());

  useEffect(() => {
    if (!isBrowser()) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setPrefs(readPrefs());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updatePrefs = useCallback((updates: Partial<DadPrefs>) => {
    setPrefs(prev => {
      const merged: DadPrefs = normalizePrefs({ ...prev, ...updates });
      writePrefs(merged);
      return merged;
    });
  }, []);

  const setVisibleColumns = useCallback((columns: Partial<VisibleColumns>) => {
    updatePrefs({ visibleColumns: { ...prefs.visibleColumns, ...columns } });
  }, [prefs.visibleColumns, updatePrefs]);

  const value = useMemo(() => ({
    prefs,
    updatePrefs,
    setVisibleColumns,
    setDensity: (density: DadDensity) => updatePrefs({ density }),
    setRowsPerView: (rowsPerView: RowsPerViewOption) => updatePrefs({ rowsPerView }),
    setLastSectionId: (lastSectionId: string | undefined) => updatePrefs({ lastSectionId }),
  }), [prefs, setVisibleColumns, updatePrefs]);

  return value;
}

export function getReviewedRows(sectionId: string): Set<string> {
  if (!isBrowser()) return new Set();
  try {
    const stored = localStorage.getItem(`${REVIEW_PREFIX}${sectionId}`);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    console.warn('Failed to read reviewed rows', error);
    return new Set();
  }
}

export function persistReviewedRows(sectionId: string, rows: Iterable<string>) {
  if (!isBrowser()) return;
  try {
    const unique = Array.from(new Set(rows)).filter(Boolean);
    localStorage.setItem(`${REVIEW_PREFIX}${sectionId}`, JSON.stringify(unique));
  } catch (error) {
    console.warn('Failed to persist reviewed rows', error);
  }
}

export function markRowReviewed(sectionId: string, rowId: string) {
  if (!isBrowser() || !rowId) return;
  const current = getReviewedRows(sectionId);
  current.add(rowId);
  persistReviewedRows(sectionId, current);
}

export function clearReviewedRows(sectionId: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(`${REVIEW_PREFIX}${sectionId}`);
  } catch (error) {
    console.warn('Failed to clear reviewed rows', error);
  }
}

export const dadDefaults = {
  prefs: defaultPrefs,
};
