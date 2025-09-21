'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  large = true,
  compact = false,
  showFocusButton = false,
  onFocus,
  isFocused = false,
}: RowCardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('original');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<{ field: 'enhanced' | 'english'; text: string } | null>(null);

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
    if (!canEditContent || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = field === 'enhanced' ? 'ar-SA' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
      setPendingTranscript(null);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setPendingTranscript({ field, text: transcript });
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      setPendingTranscript(null);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const acceptTranscript = () => {
    if (pendingTranscript) {
      onRowChange(pendingTranscript.field, row[pendingTranscript.field] + ' ' + pendingTranscript.text);
      setPendingTranscript(null);
    }
  };

  const rejectTranscript = () => {
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
    flex-1 py-4 px-6 text-xl font-medium rounded-t-lg transition-all duration-200
    ${activeTab === tab
      ? 'bg-white text-blue-700 border-b-4 border-blue-500 shadow-lg -mb-[2px]'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
    }
    focus:outline-none focus:ring-4 focus:ring-blue-200
  `;

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
        bg-white rounded-lg shadow-lg border-2
        ${isFocused ? 'border-blue-500 ring-4 ring-blue-200' : 'border-gray-200'}
        ${compact ? 'shadow-md' : 'shadow-lg'}
      `}>
        {/* Header with quality indicator and actions */}
        <div className={`border-b border-gray-200 ${compact ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h3 className={`font-bold text-gray-900 ${compact ? 'text-lg' : 'text-2xl'}`}>
                Row {row.id}
                {isFocused && <span className="ml-2 text-blue-600">⭐</span>}
              </h3>
              <QualityChipSimple status={getQualityStatus(row)} large />
            </div>

            <div className="flex items-center space-x-3">
              {/* Focus button for multi-row mode */}
              {showFocusButton && (
                <button
                  onClick={onFocus}
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
              )}

              {/* Note indicator */}
              <StickyNoteIndicator
                noteCount={noteCount}
                onClick={() => setShowNotes(true)}
                large={!compact}
              />

              {/* Action buttons */}
              {canEditContent && (
                <>
                  {onUndo && (
                    <button
                      onClick={onUndo}
                      className={`
                        bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors focus:ring-4 focus:ring-gray-200
                        ${compact ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-lg'}
                      `}
                    >
                      ↶ Undo
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={onSave}
                      disabled={saveStatus === 'saving'}
                      className={`
                        bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors focus:ring-4 focus:ring-blue-200
                        ${compact ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-lg'}
                      `}
                    >
                      {saveStatus === 'saving' ? '💾 Saving...' : '💾 Save'}
                    </button>
                  )}
                </>
              )}

              {canApproveContent && onApprove && (
                <button
                  onClick={onApprove}
                  className={`
                    bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors focus:ring-4 focus:ring-green-200
                    ${compact ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-lg'}
                  `}
                >
                  ✅ Approve
                </button>
              )}

              <button
                onClick={() => setShowNotes(true)}
                className={`
                  bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 transition-colors focus:ring-4 focus:ring-yellow-200
                  ${compact ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-lg'}
                `}
              >
                📝 Add Note
              </button>
            </div>
          </div>

          {/* Save status */}
          {saveStatus !== 'idle' && (
            <div className="mt-3">
              <span className={`text-sm font-medium ${
                saveStatus === 'saved' ? 'text-green-600' :
                saveStatus === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {getSaveStatusMessage()}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('original')}
              className={tabClasses('original')}
            >
              📖 Original Arabic
            </button>
            <button
              onClick={() => setActiveTab('enhanced')}
              className={tabClasses('enhanced')}
            >
              ✨ Enhanced Arabic
            </button>
            <button
              onClick={() => setActiveTab('english')}
              className={tabClasses('english')}
            >
              🌍 English Translation
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className={`${compact ? 'p-4' : 'p-6'}`}>
          {/* Original Arabic (Read-only) */}
          {activeTab === 'original' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-semibold text-gray-800">
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
                <h4 className="text-xl font-semibold text-gray-800">
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
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors
                        ${isRecording
                          ? 'bg-red-500 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }
                        focus:ring-4 focus:ring-blue-200
                      `}
                    >
                      {isRecording ? '🎤 Recording...' : '🎤 Voice'}
                    </button>
                  )}
                </div>
              </div>

              {canEditContent ? (
                <textarea
                  ref={enhancedTextareaRef}
                  value={row.enhanced}
                  onChange={(e) => onRowChange('enhanced', e.target.value)}
                  className={`
                    w-full border-2 border-gray-300 rounded-lg font-arabic resize-none focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500
                    ${compact
                      ? 'h-32 p-3 text-lg leading-relaxed'
                      : 'h-64 p-6 text-xl leading-relaxed'
                    }
                  `}
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
                <h4 className="text-xl font-semibold text-gray-800">
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
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors
                        ${isRecording
                          ? 'bg-red-500 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }
                        focus:ring-4 focus:ring-blue-200
                      `}
                    >
                      {isRecording ? '🎤 Recording...' : '🎤 Voice'}
                    </button>
                  )}
                </div>
              </div>

              {canEditContent ? (
                <textarea
                  ref={englishTextareaRef}
                  value={row.english}
                  onChange={(e) => onRowChange('english', e.target.value)}
                  className={`
                    w-full border-2 border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500
                    ${compact
                      ? 'h-32 p-3 text-lg leading-relaxed'
                      : 'h-64 p-6 text-xl leading-relaxed'
                    }
                  `}
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
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors focus:ring-4 focus:ring-green-200"
              >
                ✅ Accept
              </button>
              <button
                onClick={rejectTranscript}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-200"
              >
                🎤 Try Again
              </button>
              <button
                onClick={() => setPendingTranscript(null)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors focus:ring-4 focus:ring-gray-200"
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