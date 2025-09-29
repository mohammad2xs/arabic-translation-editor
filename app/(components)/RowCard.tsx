'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from '@/lib/hooks/useSpeechRecognition';
import { getUserRole, canEdit, canApprove } from '../../lib/dadmode/access';
import { QualityChipSimple } from './QualityChip';
import { calculateLPR } from '../../lib/complexity';
import AudioControls from './AudioControls';
import { StickyNoteIndicator, default as StickyNoteDrawer } from './StickyNoteDrawer';

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

interface RowCardProps {
  row: SectionRow;
  onRowChange: (field: 'enhanced' | 'english', value: string) => void;
  onSave?: () => void;
  onApprove?: () => void;
  onUndo?: () => void;
  large?: boolean;
  compact?: boolean;
  showFocusButton?: boolean;
  onFocus?: () => void;
  isFocused?: boolean;
}

type ActiveTab = 'original' | 'enhanced' | 'english';

export default function RowCard({
  row,
  onRowChange,
  onSave,
  onApprove,
  onUndo,
  compact = false,
  showFocusButton = false,
  onFocus,
  isFocused = false,
}: RowCardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('english');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<{ field: 'enhanced' | 'english'; text: string } | null>(null);

  const srEnhanced = useSpeechRecognition({ lang: 'ar-SA', interimResults: false, continuous: false });
  const srEnglish = useSpeechRecognition({ lang: 'en-US', interimResults: false, continuous: false });
  const isRecording = srEnhanced.listening || srEnglish.listening;

  const stopVoiceInput = () => {
    if (srEnhanced.listening) {
      srEnhanced.stop();
    }
    if (srEnglish.listening) {
      srEnglish.stop();
    }
  };

  const enhancedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const englishTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userRole = getUserRole();
  const canEditContent = canEdit(userRole);
  const canApproveContent = canApprove(userRole);

  // Helper function to derive quality status
  const getQualityStatus = useCallback((row: SectionRow): 'good' | 'needs-work' | 'scripture' | 'pending' => {
    const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
    const confidence = row.metadata?.confidence || 0;
    const hasScripture = (row.scriptureRefs?.length || 0) > 0;
    const isProcessed = !!row.metadata?.processedAt;

    // Scripture notes take priority
    if (hasScripture && row.metadata?.qualityGates?.scripture) {
      return 'scripture';
    }

    // Not processed yet
    if (!isProcessed || !row.english) {
      return 'pending';
    }

    // Good quality (high LPR and confidence)
    if (lpr >= 0.8 && confidence >= 0.8) {
      return 'good';
    }

    // Needs improvement
    return 'needs-work';
  }, []);

  // Auto-save functionality
  const autoSave = useCallback(async () => {
    if (!canEditContent) return;

    setSaveStatus('saving');
    try {
      const response = await fetch(`/api/rows/${row.id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arEnhanced: row.enhanced,
          en: row.english,
          action: 'save',
        }),
      });

      if (response.ok) {
        setSaveStatus('saved');
        setLastSaved(new Date());
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [row.id, row.enhanced, row.english, canEditContent]);

  // Debounced auto-save
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 400); // 400ms debounce

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [row.enhanced, row.english, autoSave]);

  // Voice-to-text functionality
  const startVoiceInput = (field: 'enhanced' | 'english') => {
    if (!canEditContent) {
      alert('Voice input is not supported in this browser');
      return;
    }

    const sr = field === 'enhanced' ? srEnhanced : srEnglish;
    if (!sr.supported) {
      alert('Voice input is not supported in this browser');
      return;
    }

    setPendingTranscript(null);

    try {
      sr.start((event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript ?? '';
        if (!transcript) return;
        setPendingTranscript({ field, text: transcript });
      });
    } catch (error) {
      console.error('Speech recognition error:', error);
      setPendingTranscript(null);
      stopVoiceInput();
    }
  };

  const acceptTranscript = () => {
    stopVoiceInput();
    if (pendingTranscript) {
      onRowChange(pendingTranscript.field, row[pendingTranscript.field] + ' ' + pendingTranscript.text);
      setPendingTranscript(null);
    }
  };

  const rejectTranscript = () => {
    stopVoiceInput();
    setPendingTranscript(null);
    // Restart voice input for the same field
    if (pendingTranscript) {
      startVoiceInput(pendingTranscript.field);
    }
  };

  // Load note count
  useEffect(() => {
    const loadNoteCount = async () => {
      try {
        const response = await fetch(`/api/notes/${row.id}`);
        if (response.ok) {
          const data = await response.json();
          setNoteCount(data.count || 0);
        }
      } catch (error) {
        console.error('Failed to load note count:', error);
      }
    };

    loadNoteCount();
  }, [row.id]);

  const tabClasses = (tab: ActiveTab) => `
    terminal-tab
    ${activeTab === tab ? 'active' : ''}
    ${compact ? 'text-lg py-3 px-4' : 'text-xl py-4 px-6'}
  `;

  const getLaneBadgeClass = (tab: ActiveTab) => {
    switch (tab) {
      case 'english':
        return 'lane-badge lane-badge-english';
      case 'enhanced':
        return 'lane-badge lane-badge-arabic-enhanced';
      case 'original':
        return 'lane-badge lane-badge-arabic-original';
      default:
        return 'lane-badge';
    }
  };

  const getSaveStatusMessage = () => {
    switch (saveStatus) {
      case 'saving':
        return '💾 Saving...';
      case 'saved':
        return '✅ Saved';
      case 'error':
        return '❌ Save failed';
      default:
        return lastSaved ? `💾 Last saved ${lastSaved.toLocaleTimeString()}` : '';
    }
  };

  return (
    <>
      <div className={`
        terminal-panel terminal-theme
        ${isFocused ? 'terminal-focus-ring' : ''}
        ${compact ? 'shadow-md' : 'shadow-lg'}
      `}>
        {/* Header with quality indicator and actions */}
        <div className={`terminal-scanline-header ${compact ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h3 className={`font-bold ${compact ? 'text-lg' : 'text-2xl'}`} style={{ color: 'var(--ink)' }}>
                Row {row.id}
                {isFocused && <span className="ml-2" style={{ color: 'var(--blue)' }}>⭐</span>}
              </h3>
              <span className={getLaneBadgeClass(activeTab)}>
                {activeTab === 'english' ? 'EN' : activeTab === 'enhanced' ? 'AR-E' : 'AR-O'}
              </span>
              <QualityChipSimple status={getQualityStatus(row)} large />
            </div>

            <div className="flex items-center space-x-3">
              {/* Focus button for multi-row mode */}
              {showFocusButton && (
                <button
                  onClick={onFocus}
                  className={`terminal-button ${isFocused ? 'terminal-button-primary' : 'terminal-button-ghost'}`}
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                >
                  {isFocused ? '⭐ Focused' : '🎯 Focus'}
                </button>
              )}

              {/* Note indicator */}
              <StickyNoteIndicator
                noteCount={noteCount}
                onClick={() => setShowNotes(true)}
                large={!compact}
              />

              {/* Action buttons - sticky actions intentionally omitted as actions are provided in header */}
              {canEditContent && (
                <>
                  {onUndo && (
                    <button
                      onClick={onUndo}
                      className="terminal-button terminal-button-ghost"
                      style={{ minHeight: 'var(--dad-touch-target)' }}
                    >
                      ↶ Undo
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={onSave}
                      disabled={saveStatus === 'saving'}
                      className="terminal-button terminal-button-primary"
                      style={{ minHeight: 'var(--dad-touch-target)' }}
                    >
                      {saveStatus === 'saving' ? '💾 Saving...' : '💾 Save'}
                    </button>
                  )}
                </>
              )}

              {canApproveContent && onApprove && (
                <button
                  onClick={onApprove}
                  className="terminal-button terminal-button-success"
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                >
                  ✅ Approve
                </button>
              )}

              <button
                onClick={() => setShowNotes(true)}
                className="terminal-button"
                style={{
                  minHeight: 'var(--dad-touch-target)',
                  background: 'var(--amber)',
                  color: 'var(--bg0)',
                  borderColor: 'var(--amber)'
                }}
              >
                📝 Add Note
              </button>
            </div>
          </div>

          {/* Save status */}
          {saveStatus !== 'idle' && (
            <div className="mt-3">
              <span className="text-sm font-medium" style={{
                color: saveStatus === 'saved' ? 'var(--green)' :
                       saveStatus === 'error' ? 'var(--red)' :
                       'var(--blue)'
              }}>
                {getSaveStatusMessage()}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="terminal-tabs">
          <button
            onClick={() => setActiveTab('english')}
            className={tabClasses('english')}
            style={{ minHeight: 'var(--dad-touch-target)' }}
          >
            <span className={getLaneBadgeClass('english')}>EN</span>
            🌍 English Translation
          </button>
          <button
            onClick={() => setActiveTab('enhanced')}
            className={tabClasses('enhanced')}
            style={{ minHeight: 'var(--dad-touch-target)' }}
          >
            <span className={getLaneBadgeClass('enhanced')}>AR-E</span>
            ✨ Enhanced Arabic
          </button>
          <button
            onClick={() => setActiveTab('original')}
            className={tabClasses('original')}
            style={{ minHeight: 'var(--dad-touch-target)' }}
          >
            <span className={getLaneBadgeClass('original')}>AR-O</span>
            📖 Original Arabic
          </button>
        </div>

        {/* Content area */}
        <div className={`${compact ? 'p-4' : 'p-6'}`}>
          {/* Original Arabic (Read-only) */}
          {activeTab === 'original' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                  📖 Original Arabic Text
                </h4>
                <AudioControls
                  text={row.original}
                  language="ar"
                  rowId={row.id}
                  large={true}
                  label="Play"
                />
              </div>
              <div
                className="bg-gray-50 border border-gray-200 rounded-lg p-6 min-h-[200px] text-xl leading-relaxed font-arabic"
                dir="rtl"
              >
                {row.original}
              </div>
              <div className="text-sm text-gray-500">
                📊 {row.metadata.wordCount} words • {row.metadata.charCount} characters
              </div>
            </div>
          )}

          {/* Enhanced Arabic (Editable) */}
          {activeTab === 'enhanced' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                  ✨ Enhanced Arabic Text
                </h4>
                <div className="flex items-center space-x-3">
                  <AudioControls
                    text={row.enhanced}
                    language="ar"
                    rowId={row.id}
                    large={true}
                    label="Play"
                  />
                  {canEditContent && (
                    <button
                      onClick={() => startVoiceInput('enhanced')}
                      disabled={isRecording}
                      className={`terminal-button ${isRecording ? '' : 'terminal-button-primary'}`}
                      style={{
                        minHeight: 'var(--dad-touch-target)',
                        ...(isRecording ? {
                          background: 'var(--red)',
                          color: 'var(--bg0)',
                          borderColor: 'var(--red)'
                        } : {})
                      }}
                    >
                      {isRecording ? '🎤 Recording...' : '🎤 Voice'}
                    </button>
                  )}
                </div>
              </div>

              {canEditContent ? (
                <textarea
                  id={`enhanced-arabic-${row.id}`}
                  name={`enhanced-arabic-${row.id}`}
                  ref={enhancedTextareaRef}
                  value={row.enhanced}
                  onChange={(e) => onRowChange('enhanced', e.target.value)}
                  className={`terminal-input terminal-arabic ${compact ? 'h-32' : 'h-64'}`}
                  dir="rtl"
                  placeholder="Enter enhanced Arabic text..."
                />
              ) : (
                <div
                  className="bg-gray-50 border border-gray-200 rounded-lg p-6 min-h-[200px] text-xl leading-relaxed font-arabic"
                  dir="rtl"
                >
                  {row.enhanced || 'No enhanced text available'}
                </div>
              )}
            </div>
          )}

          {/* English Translation (Editable) */}
          {activeTab === 'english' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                  🌍 English Translation
                </h4>
                <div className="flex items-center space-x-3">
                  <AudioControls
                    text={row.english}
                    language="en"
                    rowId={row.id}
                    large={true}
                    label="Play"
                  />
                  {canEditContent && (
                    <button
                      onClick={() => startVoiceInput('english')}
                      disabled={isRecording}
                      className={`terminal-button ${isRecording ? '' : 'terminal-button-primary'}`}
                      style={{
                        minHeight: 'var(--dad-touch-target)',
                        ...(isRecording ? {
                          background: 'var(--red)',
                          color: 'var(--bg0)',
                          borderColor: 'var(--red)'
                        } : {})
                      }}
                    >
                      {isRecording ? '🎤 Recording...' : '🎤 Voice'}
                    </button>
                  )}
                </div>
              </div>

              {canEditContent ? (
                <textarea
                  id={`english-translation-${row.id}`}
                  name={`english-translation-${row.id}`}
                  ref={englishTextareaRef}
                  value={row.english}
                  onChange={(e) => onRowChange('english', e.target.value)}
                  className={`terminal-input ${compact ? 'h-32' : 'h-64'}`}
                  placeholder="Enter English translation..."
                />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 min-h-[200px] text-xl leading-relaxed">
                  {row.english || 'No English translation available'}
                </div>
              )}
            </div>
          )}

          {/* Scripture references */}
          {row.scriptureRefs && row.scriptureRefs.length > 0 && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-lg font-medium text-blue-900 mb-3">
                📖 Scripture References:
              </div>
              <div className="flex flex-wrap gap-2">
                {row.scriptureRefs.map((ref, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-base font-medium bg-blue-100 text-blue-800"
                  >
                    <span className="mr-2">{ref.type === 'quran' ? '📖' : '📝'}</span>
                    {ref.normalized}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Notes Drawer */}
      <StickyNoteDrawer
        rowId={row.id}
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
        large={true}
      />

      {/* Voice Transcript Confirmation Overlay */}
      {pendingTranscript && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Voice Input Result
            </h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Field: {pendingTranscript.field === 'enhanced' ? 'Enhanced Arabic' : 'English Translation'}
              </p>
              <div
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-lg leading-relaxed"
                dir={pendingTranscript.field === 'enhanced' ? 'rtl' : 'ltr'}
              >
                "{pendingTranscript.text}"
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={acceptTranscript}
                className="flex-1 terminal-button terminal-button-success"
                style={{ minHeight: 'var(--dad-touch-target)' }}
              >
                ✅ Accept
              </button>
              <button
                onClick={rejectTranscript}
                className="flex-1 terminal-button terminal-button-primary"
                style={{ minHeight: 'var(--dad-touch-target)' }}
              >
                🎤 Try Again
              </button>
              <button
                onClick={() => setPendingTranscript(null)}
                className="terminal-button terminal-button-ghost"
                style={{ minHeight: 'var(--dad-touch-target)' }}
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
