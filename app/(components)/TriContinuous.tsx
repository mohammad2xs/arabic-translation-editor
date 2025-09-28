'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { DadPrefs, RowsPerViewOption, VisibleColumns } from '../../lib/state/dad';

interface TriRow {
  id: string;
  original: string;
  enhanced: string;
  english: string;
  metadata?: Record<string, any>;
}

const ROW_HEIGHT_MAP: Record<DadPrefs['density'], number> = {
  cozy: 112,
  compact: 96,
  super: 84,
};

const ROWS_PER_VIEW_OPTIONS: RowsPerViewOption[] = [10, 20, 40, 'all'];

const COLUMNS: Array<{
  key: keyof VisibleColumns;
  label: string;
  dir: 'rtl' | 'ltr';
  description: string;
}> = [
  { key: 'original', label: 'Original Arabic', dir: 'rtl', description: 'Source text' },
  { key: 'enhanced', label: 'Enhanced Arabic', dir: 'rtl', description: 'Refined Arabic lane' },
  { key: 'english', label: 'English', dir: 'ltr', description: 'Final English output' },
];

interface TriContinuousProps {
  sectionId: string;
  rows: TriRow[];
  prefs: DadPrefs;
  updatePrefs: (updates: Partial<DadPrefs>) => void;
  setVisibleColumns: (columns: Partial<VisibleColumns>) => void;
  setRowsPerView: (value: RowsPerViewOption) => void;
  reviewedRows: Set<string>;
  onMarkReviewed?: (rowId: string) => void;
}

function nextRowsPerView(current: RowsPerViewOption, direction: 1 | -1): RowsPerViewOption {
  if (current === 'all') {
    return direction === -1 ? 40 : 'all';
  }
  const index = ROWS_PER_VIEW_OPTIONS.findIndex((value) => value === current);
  const nextIndex = Math.min(
    ROWS_PER_VIEW_OPTIONS.length - 1,
    Math.max(0, index + direction),
  );
  return ROWS_PER_VIEW_OPTIONS[nextIndex];
}

export default function TriContinuous({
  sectionId,
  rows,
  prefs,
  updatePrefs,
  setVisibleColumns,
  setRowsPerView,
  reviewedRows,
  onMarkReviewed,
}: TriContinuousProps) {
  const [focusedColumn, setFocusedColumn] = useState<keyof VisibleColumns>('english');

  const toggleColumn = useCallback((key: keyof VisibleColumns) => {
    const current = prefs.visibleColumns[key];
    setVisibleColumns({ [key]: !current });
    setFocusedColumn(key);
  }, [prefs.visibleColumns, setVisibleColumns]);

  const focusActiveColumn = useCallback(() => {
    if (!focusedColumn) return;
    const visibleKeys = Object.entries(prefs.visibleColumns)
      .filter(([, value]) => value)
      .map(([key]) => key as keyof VisibleColumns);

    if (visibleKeys.length === 1 && visibleKeys[0] === focusedColumn) {
      updatePrefs({
        visibleColumns: { original: true, enhanced: true, english: true },
      });
      return;
    }

    updatePrefs({
      visibleColumns: {
        original: focusedColumn === 'original',
        enhanced: focusedColumn === 'enhanced',
        english: focusedColumn === 'english',
      },
    });
  }, [focusedColumn, prefs.visibleColumns, updatePrefs]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }

      if (event.key === '1') {
        event.preventDefault();
        toggleColumn('original');
      }
      if (event.key === '2') {
        event.preventDefault();
        toggleColumn('enhanced');
      }
      if (event.key === '3') {
        event.preventDefault();
        toggleColumn('english');
      }

      if (event.key === '[') {
        event.preventDefault();
        const next = nextRowsPerView(prefs.rowsPerView, -1);
        setRowsPerView(next);
      }
      if (event.key === ']') {
        event.preventDefault();
        const next = nextRowsPerView(prefs.rowsPerView, 1);
        setRowsPerView(next);
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
        event.preventDefault();
        focusActiveColumn();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [focusActiveColumn, prefs.rowsPerView, setRowsPerView, toggleColumn]);

  const densityClass = `dad-density-${prefs.density}`;
  const maxHeight = useMemo(() => {
    if (prefs.rowsPerView === 'all') return undefined;
    const baseHeight = ROW_HEIGHT_MAP[prefs.density] ?? 96;
    return baseHeight * prefs.rowsPerView;
  }, [prefs.density, prefs.rowsPerView]);

  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <div className={clsx('dad-tri', densityClass)}>
      <div
        className="space-y-4 overflow-y-auto pr-2"
        style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined }}
        aria-live="polite"
      >
        {visibleRows.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
            No rows found for section {sectionId}.
          </div>
        )}

        {visibleRows.map((row) => {
          const isReviewed = reviewedRows.has(row.id);
          return (
            <article
              key={row.id}
              className={clsx(
                'dad-row rounded-xl border border-gray-200 bg-white shadow-sm transition-transform',
                isReviewed ? 'ring-2 ring-green-200' : 'hover:-translate-y-0.5 hover:shadow-md',
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Row</span>
                  <span className="text-sm font-mono text-gray-900">{row.id}</span>
                  {isReviewed && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Reviewed</span>}
                </div>
                {onMarkReviewed && (
                  <button
                    onClick={() => onMarkReviewed(row.id)}
                    className="dad-header-button rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    Mark as reviewed
                  </button>
                )}
              </header>

              <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
                {COLUMNS.map((column) => {
                  const laneVisible = prefs.visibleColumns[column.key];
                  const value = (row as any)[column.key] as string | undefined;
                  return (
                    <div
                      key={column.key}
                      className={clsx(
                        'dad-col flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2 transition-all',
                        focusedColumn === column.key ? 'bg-slate-50' : 'bg-transparent',
                        laneVisible ? 'opacity-100' : 'hidden opacity-0',
                      )}
                      dir={column.dir}
                      tabIndex={laneVisible ? 0 : -1}
                      aria-hidden={!laneVisible}
                      onClick={() => setFocusedColumn(column.key)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700">{column.label}</h3>
                          <p className="text-xs text-gray-500">{column.description}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleColumn(column.key);
                          }}
                        >
                          {prefs.visibleColumns[column.key] ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="whitespace-pre-wrap text-base text-gray-900" lang={column.dir === 'rtl' ? 'ar' : 'en'}>
                        {value?.trim() || <span className="text-sm text-gray-400">No {column.label.toLowerCase()} provided.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
