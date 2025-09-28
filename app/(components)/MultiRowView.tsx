'use client';

import { useState, useEffect, useRef } from 'react';
import RowCard from './RowCard';

interface SectionRow {
  id: string;
  original: string;
  enhanced: string;
  english: string;
  complexity: number;
  scriptureRefs: Array<{
    type: 'quran' | 'hadith';
    reference: string;
    normalized: string;
  }>;
  metadata: {
    laneHash: string;
    sectionId: string;
    rowIndex: number;
    wordCount: number;
    charCount: number;
    lpr?: number;
    qualityGates?: {
      lpr: boolean;
      coverage: boolean;
      drift: boolean;
      semantic: boolean;
      scripture: boolean;
    };
    clauses?: number;
    processedAt?: string;
    needsExpand?: boolean;
    confidence?: number;
    tm?: {
      used: boolean;
      suggestionId?: string;
      similarity?: number;
    };
  };
}

interface MultiRowViewProps {
  rows: SectionRow[];
  startIndex: number;
  rowsToShow: number;
  onRowChange: (rowIndex: number, field: 'enhanced' | 'english', value: string) => void;
  onSave?: (rowIndex: number) => void;
  onUndo?: (rowIndex: number) => void;
  focusedRowIndex?: number;
  onFocusRow?: (rowIndex: number) => void;
  renderRow?: (row: SectionRow, index: number) => React.ReactNode;
}

export default function MultiRowView({
  rows,
  startIndex,
  rowsToShow,
  onRowChange,
  onSave,
  onUndo,
  focusedRowIndex,
  onFocusRow,
  renderRow,
}: MultiRowViewProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showAllRowsConfirmed, setShowAllRowsConfirmed] = useState(false);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Performance optimization: Simple windowing for large datasets
  const isAllRowsMode = rowsToShow >= rows.length;
  const shouldUseWindowing = isAllRowsMode && rows.length > 50; // Lower threshold for better UX
  const windowSize = 30; // Show ±30 items around focused

  let effectiveStartIndex = startIndex;
  let effectiveRowsToShow = rowsToShow;
  let topPadding = 0;
  let bottomPadding = 0;

  if (shouldUseWindowing && showAllRowsConfirmed) {
    const focusedIndex = focusedRowIndex || startIndex;
    const halfWindow = Math.floor(windowSize / 2);

    effectiveStartIndex = Math.max(0, focusedIndex - halfWindow);
    const maxEndIndex = Math.min(rows.length, focusedIndex + halfWindow);
    effectiveRowsToShow = maxEndIndex - effectiveStartIndex;

    // Calculate padding to preserve scroll height
    const estimatedRowHeight = 200; // Estimated height per row in pixels
    topPadding = effectiveStartIndex * estimatedRowHeight;
    bottomPadding = (rows.length - effectiveStartIndex - effectiveRowsToShow) * estimatedRowHeight;
  }

  // Get the visible rows
  const visibleRows = rows.slice(effectiveStartIndex, effectiveStartIndex + effectiveRowsToShow);

  // Scroll to focused row when it changes
  useEffect(() => {
    if (focusedRowIndex !== undefined && rowRefs.current[focusedRowIndex]) {
      rowRefs.current[focusedRowIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [focusedRowIndex]);

  const handleToggleExpanded = (rowIndex: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  };

  const handleFocusRow = (rowIndex: number) => {
    if (onFocusRow) {
      onFocusRow(rowIndex);
    }
    // Scroll to the row
    if (rowRefs.current[rowIndex]) {
      rowRefs.current[rowIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  // Show confirmation dialog for large datasets
  if (shouldUseWindowing && !showAllRowsConfirmed) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <div className="text-2xl mb-4">⚠️ Performance Warning</div>
          <div className="text-lg text-yellow-800 mb-4">
            You're about to view {rows.length} rows in All Rows mode. For better performance, we'll use windowing.
          </div>
          <div className="text-sm text-yellow-700 mb-6">
            We'll show 30 rows at a time around your focused position. Use J/K or navigation to move through rows.
          </div>
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => setShowAllRowsConfirmed(true)}
              className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors"
            >
              Continue with Windowing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="text-lg font-medium text-blue-900">
            📊 Multi-Row View: Showing {visibleRows.length} rows
            {shouldUseWindowing && showAllRowsConfirmed
              ? `(${effectiveStartIndex + 1}-${effectiveStartIndex + visibleRows.length} of ${rows.length}, windowed view)`
              : `(${effectiveStartIndex + 1}-${effectiveStartIndex + visibleRows.length} of ${rows.length})`
            }
          </div>
          <div className="text-sm text-blue-700">
            💡 Tip: Use Focus buttons to navigate and highlight specific rows
            {shouldUseWindowing && showAllRowsConfirmed && (
              <div className="mt-1 text-xs">🔄 Windowed view for performance - use J/K to navigate</div>
            )}
          </div>
        </div>
      </div>

      {/* Top padding for virtualization */}
      {topPadding > 0 && <div style={{ height: `${topPadding}px` }} className="w-full" />}

      {visibleRows.map((row, index) => {
        const actualRowIndex = effectiveStartIndex + index;
        const isExpanded = expandedRows.has(actualRowIndex);
        const isFocused = focusedRowIndex === actualRowIndex;

        return (
          <div
            key={row.id}
            ref={(el) => {
              rowRefs.current[actualRowIndex] = el;
            }}
            className={`
              transition-all duration-300 rounded-lg
              ${isFocused
                ? 'ring-4 ring-blue-300 bg-blue-50 shadow-lg scale-[1.02]'
                : 'hover:shadow-md'
              }
            `}
          >
            {/* Row header with focus and expand controls */}
            <div className="bg-gray-100 border-2 border-gray-200 rounded-t-lg px-6 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Row {row.id} ({actualRowIndex + 1} of {rows.length})
                </h3>
                {isFocused && (
                  <span className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-full">
                    ⭐ Focused
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleFocusRow(actualRowIndex)}
                  className={`
                    px-4 py-2 text-sm font-medium rounded-lg transition-colors
                    ${isFocused
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }
                  `}
                >
                  {isFocused ? '⭐ Focused' : '🎯 Focus'}
                </button>

                <button
                  onClick={() => handleToggleExpanded(actualRowIndex)}
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {isExpanded ? '📄 Compact' : '📋 Expand'}
                </button>
              </div>
            </div>

            {/* Row content - either compact or expanded */}
            {isExpanded ? (
              // Full RowCard for expanded view
              <RowCard
                row={row}
                onRowChange={(field, value) => onRowChange(actualRowIndex, field, value)}
                onSave={() => onSave && onSave(actualRowIndex)}
                onUndo={() => onUndo && onUndo(actualRowIndex)}
                large={true}
              />
            ) : (
              // Compact view
              <div className="bg-white border-2 border-gray-200 border-t-0 rounded-b-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* English Translation - Editable (First Column) */}
                  <div className="space-y-2 column-english">
                    <h4 id={`english-heading-${row.id}`} className="text-sm font-semibold text-gray-700 flex items-center">
                      🌍 English Translation
                    </h4>
                    <textarea
                      id={`english-translation-multirow-${row.id}`}
                      name={`english-translation-multirow-${row.id}`}
                      value={row.english}
                      onChange={(e) => onRowChange(actualRowIndex, 'english', e.target.value)}
                      className="w-full h-20 p-3 border border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                      placeholder="Enter English translation..."
                      aria-labelledby={`english-heading-${row.id}`}
                    />
                  </div>

                  {/* Enhanced Arabic - Editable (Second Column) */}
                  <div className="space-y-2 column-arabic-enhanced">
                    <h4 id={`enhanced-heading-${row.id}`} className="text-sm font-semibold text-gray-700 flex items-center">
                      ✨ Enhanced Arabic
                    </h4>
                    <textarea
                      id={`enhanced-arabic-multirow-${row.id}`}
                      name={`enhanced-arabic-multirow-${row.id}`}
                      value={row.enhanced}
                      onChange={(e) => onRowChange(actualRowIndex, 'enhanced', e.target.value)}
                      className="w-full h-20 p-3 border border-gray-300 rounded-lg text-sm leading-relaxed font-arabic resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                      dir="rtl"
                      placeholder="Enter enhanced Arabic text..."
                      aria-labelledby={`enhanced-heading-${row.id}`}
                    />
                  </div>

                  {/* Original Arabic - Read only (Third Column) */}
                  <div className="space-y-2 column-arabic-original">
                    <h4 id={`original-heading-${row.id}`} className="text-sm font-semibold text-gray-700 flex items-center">
                      📖 Original Arabic
                    </h4>
                    <div
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm leading-relaxed font-arabic min-h-[80px] max-h-[120px] overflow-y-auto"
                      dir="rtl"
                      aria-labelledby={`original-heading-${row.id}`}
                    >
                      {row.original}
                    </div>
                    <div className="text-xs text-gray-500">
                      📊 {row.metadata.wordCount} words • {row.metadata.charCount} chars
                    </div>
                  </div>
                </div>

                {/* Scripture references in compact view */}
                {row.scriptureRefs && row.scriptureRefs.length > 0 && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-sm font-medium text-blue-900 mb-2">
                      📖 Scripture References:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.scriptureRefs.map((ref, refIndex) => (
                        <span
                          key={refIndex}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          <span className="mr-1">{ref.type === 'quran' ? '📖' : '📝'}</span>
                          {ref.normalized}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick action buttons in compact view */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Last updated: Auto-save enabled
                  </div>
                  <div className="flex items-center space-x-2">
                    {onUndo && (
                      <button
                        onClick={() => onUndo(actualRowIndex)}
                        className="px-3 py-1 bg-gray-500 text-white text-xs font-medium rounded hover:bg-gray-600 transition-colors"
                      >
                        ↶ Undo
                      </button>
                    )}
                    {onSave && (
                      <button
                        onClick={() => onSave(actualRowIndex)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                      >
                        💾 Save
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom padding for virtualization */}
      {bottomPadding > 0 && <div style={{ height: `${bottomPadding}px` }} className="w-full" />}

      {/* Navigation help at bottom */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <div className="text-sm text-gray-600">
          💡 <strong>Multi-Row Navigation:</strong> Use Focus buttons to highlight rows • Expand for full editing • All changes auto-save
        </div>
      </div>
    </div>
  );
}