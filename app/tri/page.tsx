'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { scoreArabicRow, calculateLPR } from '../../lib/complexity';

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

interface SectionData {
  id: string;
  title: string;
  rows: SectionRow[];
  metadata: {
    contentHash: string;
    rowCount: number;
    wordCount: number;
    processedAt: string;
  };
}

interface ManifestSection {
  id: string;
  title: string;
  rowCount: number;
  wordCount: number;
  contentHash: string;
  type: string;
}

interface DevRow {
  id: string;
  arabic_original: string;
  arabic_enhanced: string;
  english: string;
  section: string;
  complexity_score?: number;
  scripture_refs?: string[];
  metadata?: {
    section_ref?: string;
    complexity_score?: number;
    scripture_refs?: string[];
    notes?: string;
  };
}

type FocusColumn = 'arabic' | 'enhanced' | 'translation';

type ScriptureReference = {
  reference: string;
  type: 'quran' | 'hadith';
  surah?: number;
  ayah?: number;
  arabic: string;
  english: string;
  metadata: {
    surahName?: string;
    surahNameEn?: string;
    revelationType?: 'meccan' | 'medinan';
    collection?: string;
    narrator?: string;
    grading?: string;
  };
};

export default function TriViewPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [focusedColumn, setFocusedColumn] = useState<FocusColumn>('arabic');
  const [showColumns, setShowColumns] = useState({
    arabic: true,
    enhanced: true,
    translation: true
  });
  const [loading, setLoading] = useState(true);
  const [scriptureTooltip, setScriptureTooltip] = useState<{
    ref: string;
    x: number;
    y: number;
    data: ScriptureReference;
  } | null>(null);
  const [findPanelOpen, setFindPanelOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [currentSectionId, setCurrentSectionId] = useState<string>('S001');
  const [availableSections, setAvailableSections] = useState<ManifestSection[]>([]);
  const [sectionData, setSectionData] = useState<SectionData | null>(null);
  const [expandStatus, setExpandStatus] = useState<Record<string, boolean>>({});
  const findInputRef = useRef<HTMLInputElement>(null);
  const arabicScrollRef = useRef<HTMLDivElement>(null);
  const enhancedScrollRef = useRef<HTMLDivElement>(null);
  const translationScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const enhancedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const translationTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentRow = rows[currentRowIndex];

  // Calculate quality metrics for current row
  const getQualityMetrics = (row: SectionRow) => {
    const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
    const hasAllGates = row.metadata?.qualityGates ?
      Object.values(row.metadata.qualityGates).every(gate => gate) : false;
    const confidence = row.metadata?.confidence || 0;

    return {
      lpr,
      hasAllGates,
      confidence,
      needsExpand: lpr < 0.95 || row.metadata?.needsExpand || false,
      hasScripture: (row.scriptureRefs?.length || 0) > 0,
      isProcessed: !!row.metadata?.processedAt
    };
  };

  const handleExpandRow = async (rowId: string) => {
    try {
      const response = await fetch(`/api/rows/${rowId}/expand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'insufficient_length_preservation',
          targetLPR: 1.05
        })
      });

      if (response.ok) {
        setExpandStatus(prev => ({ ...prev, [rowId]: true }));
      }
    } catch (error) {
      console.error('Failed to mark row for expansion:', error);
    }
  };

  // Load manifest on component mount
  useEffect(() => {
    const loadManifest = async () => {
      try {
        const response = await fetch('/data/manifest.json');
        if (response.ok) {
          const manifest = await response.json();
          setAvailableSections(manifest.sections || []);
        }
      } catch (error) {
        console.error('Error loading manifest:', error);
      }
    };

    loadManifest();
  }, []);

  // Set initial section from URL params
  useEffect(() => {
    const sectionParam = searchParams.get('section');
    if (sectionParam && /^S\d{3}$/.test(sectionParam)) {
      setCurrentSectionId(sectionParam);
    }
  }, [searchParams]);

  // Load section data when section changes
  useEffect(() => {
    const loadSectionData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/sections/${currentSectionId}`);
        if (response.ok) {
          const data: SectionData = await response.json();
          setSectionData(data);
          setRows(data.rows || []);
          setCurrentRowIndex(0);
        } else if (response.status === 404) {
          // Fallback to dev data if section not found
          console.warn(`Section ${currentSectionId} not found, trying dev data`);
          const devResponse = await fetch('/data/dev_rows.json');
          if (devResponse.ok) {
            const devData = await devResponse.json();
            const processedRows = devData.map((row: any) => ({
              id: row.id,
              original: row.arabic_original,
              enhanced: row.arabic_enhanced,
              english: row.english,
              complexity: row.complexity_score || 1,
              scriptureRefs: row.scripture_refs || [],
              metadata: {
                laneHash: 'dev-hash',
                sectionId: 'dev',
                rowIndex: 0,
                wordCount: row.arabic_original?.split(' ').length || 0,
                charCount: row.arabic_original?.length || 0
              }
            }));
            setRows(processedRows);
          } else {
            setRows([]);
          }
        }
      } catch (error) {
        console.error('Error loading section data:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    if (currentSectionId) {
      loadSectionData();
    }
  }, [currentSectionId]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.code) {
      case 'KeyJ':
        event.preventDefault();
        setCurrentRowIndex(prev => Math.min(prev + 1, rows.length - 1));
        break;
      case 'KeyK':
        event.preventDefault();
        setCurrentRowIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'KeyA':
        event.preventDefault();
        setFocusedColumn('arabic');
        break;
      case 'KeyE':
        event.preventDefault();
        setFocusedColumn('enhanced');
        break;
      case 'KeyT':
        event.preventDefault();
        setFocusedColumn('translation');
        break;
      case 'Digit1':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, arabic: !prev.arabic }));
        break;
      case 'Digit2':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, enhanced: !prev.enhanced }));
        break;
      case 'Digit3':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, translation: !prev.translation }));
        break;
      case 'KeyF':
        event.preventDefault();
        setFindPanelOpen(prev => !prev);
        break;
    }
  }, [rows.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (findPanelOpen && findInputRef.current) {
      findInputRef.current.focus();
    }
  }, [findPanelOpen]);

  const handleSyncScroll = useCallback((sourceRef: React.RefObject<HTMLDivElement>) => {
    if (isScrollingRef.current) return;

    isScrollingRef.current = true;
    const scrollTop = sourceRef.current?.scrollTop || 0;

    // Sync to other visible columns
    if (showColumns.arabic && arabicScrollRef.current && sourceRef !== arabicScrollRef) {
      arabicScrollRef.current.scrollTop = scrollTop;
    }
    if (showColumns.enhanced && enhancedScrollRef.current && sourceRef !== enhancedScrollRef) {
      enhancedScrollRef.current.scrollTop = scrollTop;
    }
    if (showColumns.translation && translationScrollRef.current && sourceRef !== translationScrollRef) {
      translationScrollRef.current.scrollTop = scrollTop;
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  }, [showColumns]);

  useEffect(() => {
    // Focus textarea when column focus changes
    if (focusedColumn === 'enhanced' && enhancedTextareaRef.current) {
      enhancedTextareaRef.current.focus();
    } else if (focusedColumn === 'translation' && translationTextareaRef.current) {
      translationTextareaRef.current.focus();
    }
  }, [focusedColumn]);

  const handleScriptureClick = async (ref: string, event: React.MouseEvent) => {
    try {
      const response = await fetch(`/api/scripture/resolve?ref=${encodeURIComponent(ref)}`);
      if (response.ok) {
        const data = await response.json();
        setScriptureTooltip({
          ref,
          x: event.clientX,
          y: event.clientY,
          data
        });
      }
    } catch (error) {
      console.error('Error fetching scripture:', error);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const escape = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escape(query)})`, 'gi'));

    return parts.map((part, idx) => (
      idx % 2 === 1 ? (
        <mark key={idx} className="bg-yellow-200 text-yellow-900">{part}</mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    ));
  };

  const renderTextWithScriptureLinks = (text: string) => {
    const scripturePattern = /\b\d{1,3}:\d{1,3}\b/g;
    const parts = text.split(scripturePattern);
    const matches = text.match(scripturePattern) || [];

    return parts.reduce((acc: (string | JSX.Element)[], part, index) => {
      const highlightedPart = findQuery ? highlightText(part, findQuery) : part;
      acc.push(
        <span key={`text-${index}`}>{highlightedPart}</span>
      );
      if (matches[index]) {
        acc.push(
          <button
            key={`scripture-${index}`}
            className="text-blue-600 underline hover:text-blue-800"
            onClick={(e) => handleScriptureClick(matches[index], e)}
          >
            {matches[index]}
          </button>
        );
      }
      return acc;
    }, []);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading translation editor...</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-red-600">No data available</div>
      </div>
    );
  }

  const visibleColumns = Object.entries(showColumns).filter(([, visible]) => visible).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Al-Insān Translation Editor
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="sectionSelect" className="text-sm text-gray-600">
                  Section:
                </label>
                <select
                  id="sectionSelect"
                  value={currentSectionId}
                  onChange={(e) => {
                    const newSectionId = e.target.value;
                    setCurrentSectionId(newSectionId);
                    // Update URL without page reload
                    const url = new URL(window.location.href);
                    url.searchParams.set('section', newSectionId);
                    window.history.pushState({}, '', url.toString());
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.id}: {section.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-600">
                Row {currentRowIndex + 1} of {rows.length}
              </div>
              {sectionData && (
                <div className="text-sm text-gray-600">
                  {sectionData.metadata.rowCount} rows, {sectionData.metadata.wordCount} words
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Quality Indicators */}
        {currentRow && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Quality Assessment</h3>
              <span className="text-sm text-gray-500">Row {currentRow.id}</span>
            </div>

            {(() => {
              const metrics = getQualityMetrics(currentRow);
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* LPR Indicator */}
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.lpr >= 1.05 ? 'bg-green-500' :
                      metrics.lpr >= 0.95 ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">LPR</div>
                      <div className="text-xs text-gray-500">
                        {metrics.lpr.toFixed(3)}
                      </div>
                    </div>
                  </div>

                  {/* Quality Gates */}
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.hasAllGates ? 'bg-green-500' : 'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Gates</div>
                      <div className="text-xs text-gray-500">
                        {currentRow.metadata?.qualityGates ?
                          `${Object.values(currentRow.metadata.qualityGates).filter(Boolean).length}/5` :
                          'N/A'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Scripture Verification */}
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.hasScripture ?
                        (currentRow.metadata?.qualityGates?.scripture ? 'bg-green-500' : 'bg-yellow-500') :
                        'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Scripture</div>
                      <div className="text-xs text-gray-500">
                        {metrics.hasScripture ?
                          `${currentRow.scriptureRefs?.length || 0} refs` : 'None'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Processing Status */}
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.isProcessed ? 'bg-green-500' : 'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Status</div>
                      <div className="text-xs text-gray-500">
                        {metrics.isProcessed ? 'Processed' : 'Pending'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            {(() => {
              const metrics = getQualityMetrics(currentRow);
              return metrics.needsExpand && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-md">
                      ⚠️ Translation needs expansion (LPR: {metrics.lpr.toFixed(3)})
                    </div>
                    <button
                      onClick={() => handleExpandRow(currentRow.id)}
                      disabled={expandStatus[currentRow.id]}
                      className={clsx(
                        'px-3 py-1 text-sm rounded-md font-medium',
                        expandStatus[currentRow.id] ?
                          'bg-green-100 text-green-800 cursor-default' :
                          'bg-blue-600 text-white hover:bg-blue-700'
                      )}
                    >
                      {expandStatus[currentRow.id] ? '✓ Marked for Expansion' : 'Mark for Expansion'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Additional Metrics */}
            {currentRow.metadata && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                  {currentRow.metadata.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {(currentRow.metadata.confidence * 100).toFixed(1)}%
                    </div>
                  )}
                  {currentRow.metadata.clauses && (
                    <div>
                      <span className="font-medium">Clauses:</span> {currentRow.metadata.clauses}
                    </div>
                  )}
                  {currentRow.metadata.processedAt && (
                    <div>
                      <span className="font-medium">Processed:</span> {new Date(currentRow.metadata.processedAt).toLocaleTimeString()}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">TM Usage:</span> {
                      currentRow.metadata?.tm ? (
                        currentRow.metadata.tm.used ? (
                          `${(currentRow.metadata.tm.similarity || 0).toFixed(2)} (${currentRow.metadata.tm.suggestionId || 'N/A'})`
                        ) : 'Not used'
                      ) : 'N/A'
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Hotkeys: J/K (navigate), A/E/T (focus), 1/2/3 (toggle columns), F (find)
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Focus:</span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'arabic' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              Arabic-Original
            </span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'enhanced' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              Arabic-Enhanced
            </span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'translation' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              English
            </span>
          </div>
        </div>

        {findPanelOpen && (
          <div className="mb-4 bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
            <div className="flex items-center space-x-4">
              <label htmlFor="findInput" className="text-sm font-medium text-gray-700">
                Find:
              </label>
              <input
                ref={findInputRef}
                id="findInput"
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFindPanelOpen(false);
                    setFindQuery('');
                  }
                }}
                className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search in focused column..."
              />
              <button
                onClick={() => {
                  setFindPanelOpen(false);
                  setFindQuery('');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        )}

        <div className={clsx(
          'grid gap-6',
          visibleColumns === 1 ? 'grid-cols-1' :
          visibleColumns === 2 ? 'grid-cols-2' : 'grid-cols-3'
        )}>
          {showColumns.arabic && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6',
              focusedColumn === 'arabic' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Arabic-Original
                </h2>
                <span className="text-xs text-gray-500">Read-only</span>
              </div>
              <div
                ref={arabicScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                dir="rtl"
                onScroll={() => handleSyncScroll(arabicScrollRef)}
              >
                <p className="text-xl leading-relaxed font-arabic">
                  {renderTextWithScriptureLinks(currentRow.original)}
                </p>
              </div>
            </div>
          )}

          {showColumns.enhanced && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6',
              focusedColumn === 'enhanced' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Arabic-Enhanced
                </h2>
                <span className="text-xs text-gray-500">Editable</span>
              </div>
              <div
                ref={enhancedScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                dir="rtl"
                onScroll={() => handleSyncScroll(enhancedScrollRef)}
              >
                <div className="relative">
                  <textarea
                    ref={enhancedTextareaRef}
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none font-arabic text-xl leading-relaxed"
                    value={currentRow.enhanced}
                    onChange={(e) => {
                      const updatedRows = [...rows];
                      updatedRows[currentRowIndex].enhanced = e.target.value;
                      setRows(updatedRows);
                    }}
                    dir="rtl"
                  />
                  {findQuery && focusedColumn === 'enhanced' && (
                    <div className="absolute inset-0 pointer-events-none p-3 font-arabic text-xl leading-relaxed overflow-hidden">
                      <div className="text-transparent" dir="rtl">
                        {highlightText(currentRow.enhanced, findQuery)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showColumns.translation && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6',
              focusedColumn === 'translation' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  English
                </h2>
                <span className="text-xs text-gray-500">Editable</span>
              </div>
              <div
                ref={translationScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                onScroll={() => handleSyncScroll(translationScrollRef)}
              >
                <div className="relative">
                  <textarea
                    ref={translationTextareaRef}
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none text-lg leading-relaxed"
                    value={currentRow.english}
                    onChange={(e) => {
                      const updatedRows = [...rows];
                      updatedRows[currentRowIndex].english = e.target.value;
                      setRows(updatedRows);
                    }}
                  />
                  {findQuery && focusedColumn === 'translation' && (
                    <div className="absolute inset-0 pointer-events-none p-3 text-lg leading-relaxed overflow-hidden">
                      <div className="text-transparent">
                        {highlightText(currentRow.english, findQuery)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {currentRow.scriptureRefs && currentRow.scriptureRefs.length > 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-900 mb-2">Scripture References:</div>
            <div className="flex flex-wrap gap-2">
              {currentRow.scriptureRefs.map((ref, index) => (
                <button
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
                  onClick={(e) => handleScriptureClick(ref.reference, e)}
                >
                  <span className="mr-1">{ref.type === 'quran' ? '📖' : '📝'}</span>
                  {ref.normalized}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentRowIndex(prev => Math.max(prev - 1, 0))}
            disabled={currentRowIndex === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-300"
          >
            Previous
          </button>

          <div className="flex items-center space-x-2">
            {rows.map((row, index) => {
              const metrics = getQualityMetrics(row);
              return (
                <button
                  key={index}
                  onClick={() => setCurrentRowIndex(index)}
                  className={clsx(
                    'w-3 h-3 rounded-full relative',
                    index === currentRowIndex ? 'bg-blue-600' : 'bg-gray-300'
                  )}
                  title={`Row ${row.id} - LPR: ${metrics.lpr.toFixed(3)} - ${metrics.isProcessed ? 'Processed' : 'Pending'}`}
                >
                  {metrics.needsExpand && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                  {metrics.hasAllGates && (
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentRowIndex(prev => Math.min(prev + 1, rows.length - 1))}
            disabled={currentRowIndex === rows.length - 1}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-300"
          >
            Next
          </button>
        </div>

        {currentRow.complexity !== undefined && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Complexity Level: {currentRow.complexity}/5
            {currentRow.metadata && (
              <span className="ml-4">
                {currentRow.metadata.wordCount} words, {currentRow.metadata.charCount} chars
              </span>
            )}
          </div>
        )}
      </div>

      {scriptureTooltip && (
        <div
          className="fixed z-50 bg-black text-white p-4 rounded-lg shadow-lg max-w-md"
          style={{
            left: scriptureTooltip.x,
            top: scriptureTooltip.y + 10
          }}
        >
          <div className="text-sm font-medium mb-2">
            {scriptureTooltip.data.type === 'quran' ? 'Qur\'an' : 'Hadith'} {scriptureTooltip.ref}
          </div>
          <div className="text-xs mb-2" dir="rtl">
            {scriptureTooltip.data.arabic}
          </div>
          <div className="text-xs">
            {scriptureTooltip.data.english}
          </div>
          <button
            onClick={() => setScriptureTooltip(null)}
            className="mt-2 text-xs text-gray-300 hover:text-white"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}