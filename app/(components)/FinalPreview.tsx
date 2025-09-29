'use client';

import { useState, useEffect, useRef } from 'react';

interface PreviewRow {
  id: number;
  original: string;
  enhanced: string;
  english: string;
  approved: boolean;
  hasAudio?: boolean;
}

interface FinalPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  currentSection?: string;
  focusedRowId?: number;
  onAudioPlay?: (language: 'en' | 'ar', rowId?: number) => void;
}

type TabType = 'triview' | 'book';

export default function FinalPreview({
  isOpen,
  onClose,
  currentSection = 'current',
  focusedRowId,
  onAudioPlay,
}: FinalPreviewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('triview');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingRowId, setPlayingRowId] = useState<number | null>(null);
  const [playingLanguage, setPlayingLanguage] = useState<'ar' | 'en' | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const bookPreviewRef = useRef<HTMLDivElement>(null);

  // Fetch preview data
  const fetchPreviewData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch current section data
      const response = await fetch(`/api/sections/${currentSection}/preview`);
      if (!response.ok) {
        throw new Error('Failed to fetch preview data');
      }

      const data = await response.json();
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
      console.error('Error fetching preview:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when opened
  useEffect(() => {
    if (isOpen) {
      fetchPreviewData();
    }
  }, [isOpen, currentSection]);

  // Scroll to focused row in book preview
  useEffect(() => {
    if (activeTab === 'book' && focusedRowId && bookPreviewRef.current) {
      const rowElement = bookPreviewRef.current.querySelector(`[data-row-id="${focusedRowId}"]`);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeTab, focusedRowId]);

  // Handle audio playback
  const playAudio = async (rowId: number, language: 'ar' | 'en') => {
    // Notify parent component
    onAudioPlay?.(language === 'ar' ? 'ar' : 'en', rowId);

    if (isPlaying && playingRowId === rowId && playingLanguage === language) {
      // Stop if already playing the same audio
      audioRef.current?.pause();
      setIsPlaying(false);
      setPlayingRowId(null);
      setPlayingLanguage(null);
      return;
    }

    try {
      setIsPlaying(true);
      setPlayingRowId(rowId);
      setPlayingLanguage(language);

      // Try API endpoint first, then fallback to direct segment files
      let audioUrl = `/api/audio?row=${rowId}&lang=${language}`;

      // Probe for audio availability
      try {
        const response = await fetch(audioUrl, { method: 'HEAD' });
        if (!response.ok) {
          // Fallback to direct segment files
          audioUrl = `/segments/${rowId}_${language}.mp3`;

          // Try alternative format if that fails
          const altResponse = await fetch(audioUrl, { method: 'HEAD' });
          if (!altResponse.ok) {
            audioUrl = `/segments/${rowId}.mp3`;
          }
        }
      } catch (error) {
        // Fallback to original format
        audioUrl = `/segments/${rowId}_${language}.mp3`;
      }

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();

        // Highlight text during playback if in book view
        if (activeTab === 'book') {
          const rowElement = bookPreviewRef.current?.querySelector(`[data-row-id="${rowId}"]`);
          const textElement = rowElement?.querySelector(language === 'ar' ? '.arabic' : '.english');

          if (textElement) {
            textElement.classList.add('audio-highlight');

            // Remove highlight when audio ends
            audioRef.current.onended = () => {
              textElement.classList.remove('audio-highlight');
              setIsPlaying(false);
              setPlayingRowId(null);
              setPlayingLanguage(null);
            };
          }
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      setPlayingRowId(null);
      setPlayingLanguage(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-header">
          <h2 className="preview-title">Final Preview • معاينة نهائية</h2>
          <button
            type="button"
            onClick={onClose}
            className="preview-close dad-button-large"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="preview-tabs">
          <button
            type="button"
            className={`preview-tab dad-button-normal ${activeTab === 'triview' ? 'active' : ''}`}
            onClick={() => setActiveTab('triview')}
            aria-label="Switch to tri-view mode"
          >
            📊 Tri-View • عرض ثلاثي
          </button>
          <button
            type="button"
            className={`preview-tab dad-button-normal ${activeTab === 'book' ? 'active' : ''}`}
            onClick={() => setActiveTab('book')}
            aria-label="Switch to book preview mode"
          >
            📖 Book Preview • معاينة الكتاب
          </button>
        </div>

        <div className="preview-content">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500 dad-text-large">
                Loading preview... • جاري تحميل المعاينة...
              </div>
            </div>
          )}

          {error && (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-800 font-medium dad-text-normal">
                  Error loading preview • خطأ في تحميل المعاينة
                </div>
                <div className="text-red-600 text-sm mt-1 dad-text-small">{error}</div>
                <button
                  onClick={fetchPreviewData}
                  className="mt-2 text-red-600 text-sm underline hover:no-underline dad-text-small"
                >
                  Try again • حاول مرة أخرى
                </button>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'triview' && (
            <div className="space-y-4">
              {rows.map((row) => (
                <div
                  key={row.id}
                  data-row-id={row.id}
                  className={`border rounded-lg p-6 ${
                    row.id === focusedRowId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-700">Row {row.id}</span>
                      {row.approved && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          ✓ Approved
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {row.hasAudio && (
                        <>
                          <button
                            onClick={() => playAudio(row.id, 'ar')}
                            className={`px-3 py-1 text-sm rounded border ${
                              isPlaying && playingRowId === row.id && playingLanguage === 'ar'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            🔊 AR
                          </button>
                          <button
                            onClick={() => playAudio(row.id, 'en')}
                            className={`px-3 py-1 text-sm rounded border ${
                              isPlaying && playingRowId === row.id && playingLanguage === 'en'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            🔊 EN
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Original Arabic</h4>
                      <div className="text-right font-arabic text-lg leading-relaxed">
                        {row.original}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Enhanced Arabic</h4>
                      <div className="text-right font-arabic text-lg leading-relaxed">
                        {row.enhanced}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">English</h4>
                      <div className="text-left text-lg leading-relaxed">
                        {row.english}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && activeTab === 'book' && (
            <div ref={bookPreviewRef} className="book-preview">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">Book Title</h1>
                <p className="text-gray-600">Section: {currentSection}</p>
              </div>

              {rows.map((row) => (
                <div
                  key={row.id}
                  data-row-id={row.id}
                  className={`mb-8 ${row.id === focusedRowId ? 'ring-2 ring-blue-300 rounded-lg p-4' : ''}`}
                >
                  <div className="arabic mb-4" dir="rtl">
                    {row.enhanced || row.original}
                  </div>
                  <div className="english">
                    {row.english}
                  </div>

                  {row.hasAudio && (
                    <div className="flex gap-2 mt-3 text-sm">
                      <button
                        onClick={() => playAudio(row.id, 'ar')}
                        className={`px-2 py-1 rounded border text-xs ${
                          isPlaying && playingRowId === row.id && playingLanguage === 'ar'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        🔊 Arabic
                      </button>
                      <button
                        onClick={() => playAudio(row.id, 'en')}
                        className={`px-2 py-1 rounded border text-xs ${
                          isPlaying && playingRowId === row.id && playingLanguage === 'en'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        🔊 English
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-12 text-center text-gray-500 text-sm">
                End of Section
              </div>
            </div>
          )}
        </div>

        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          onEnded={() => {
            setIsPlaying(false);
            setPlayingRowId(null);
            setPlayingLanguage(null);
          }}
          onError={() => {
            setIsPlaying(false);
            setPlayingRowId(null);
            setPlayingLanguage(null);
            console.error('Audio playback error');
          }}
        />

        {/* Enhanced Cursor-style CSS */}
        <style jsx>{`
          .preview-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(4px);
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }

          .preview-modal {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 1200px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .preview-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          .preview-title {
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
          }

          .preview-close {
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            cursor: pointer;
            color: #6b7280;
            transition: all 0.2s;
          }

          .preview-close:hover {
            background: #f3f4f6;
            border-color: #9ca3af;
            color: #374151;
          }

          .preview-tabs {
            display: flex;
            padding: 1rem 2rem 0;
            background: #f9fafb;
            gap: 0.5rem;
          }

          .preview-tab {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: transparent;
            border: 1px solid #d1d5db;
            border-bottom: none;
            border-radius: 8px 8px 0 0;
            cursor: pointer;
            transition: all 0.2s;
            color: #6b7280;
            font-weight: 500;
          }

          .preview-tab:hover {
            background: #f3f4f6;
            color: #374151;
          }

          .preview-tab.active {
            background: white;
            border-color: #e5e7eb;
            color: #1f2937;
            border-bottom: 1px solid white;
            margin-bottom: -1px;
            z-index: 1;
            position: relative;
          }

          .preview-content {
            flex: 1;
            overflow: auto;
            padding: 2rem;
            background: white;
          }

          /* Book Preview Enhancements */
          .book-preview {
            max-width: 800px;
            margin: 0 auto;
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.8;
          }

          .arabic {
            direction: rtl;
            text-align: right;
            font-family: 'Amiri', 'Scheherazade New', 'Arial Unicode MS', serif;
            font-size: 20px; /* Dad-Mode friendly */
            line-height: 2;
            margin-bottom: 1rem;
            padding: 1rem;
            background: #fefbf3;
            border-right: 4px solid #f59e0b;
            border-radius: 6px;
          }

          .english {
            direction: ltr;
            text-align: left;
            font-size: 18px; /* Dad-Mode friendly */
            line-height: 1.7;
            color: #374151;
            padding: 1rem;
            background: #f0f9ff;
            border-left: 4px solid #3b82f6;
            border-radius: 6px;
          }

          /* Audio Highlighting */
          .audio-highlight {
            background: linear-gradient(120deg, #fef3c7 0%, #fcd34d 100%);
            border-radius: 4px;
            padding: 0.25rem;
            transition: all 0.3s ease;
            animation: audioGlow 2s infinite;
          }

          @keyframes audioGlow {
            0%, 100% {
              box-shadow: 0 0 5px rgba(245, 158, 11, 0.5);
            }
            50% {
              box-shadow: 0 0 20px rgba(245, 158, 11, 0.8);
            }
          }

          /* Tri-View Enhancements */
          .font-arabic {
            font-family: 'Amiri', 'Scheherazade New', 'Arial Unicode MS', serif;
            font-size: 18px; /* Dad-Mode friendly */
            line-height: 1.8;
          }

          /* Button Enhancements */
          button {
            min-height: 44px; /* Dad-Mode touch targets */
            font-size: 16px; /* Dad-Mode friendly */
          }

          button:focus {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
          }

          /* Mobile Responsive */
          @media (max-width: 768px) {
            .preview-modal {
              max-width: 100vw;
              max-height: 100vh;
              border-radius: 0;
            }

            .preview-header {
              padding: 1rem;
            }

            .preview-tabs {
              padding: 0.5rem 1rem 0;
              flex-direction: column;
              gap: 0.25rem;
            }

            .preview-tab {
              justify-content: center;
              border-radius: 6px;
              border-bottom: 1px solid #d1d5db;
            }

            .preview-content {
              padding: 1rem;
            }

            .arabic {
              font-size: 18px;
            }

            .english {
              font-size: 16px;
            }
          }

          /* Dad-Mode optimizations */
          @media (prefers-reduced-motion: reduce) {
            .preview-tab,
            .preview-close,
            .audio-highlight {
              transition: none;
              animation: none;
            }
          }

          /* High contrast mode */
          @media (prefers-contrast: high) {
            .preview-tab,
            .preview-close {
              border-width: 2px;
            }

            .arabic {
              border-right-width: 6px;
            }

            .english {
              border-left-width: 6px;
            }
          }

          /* Print styles */
          @media print {
            .preview-overlay {
              position: static;
              background: white;
            }

            .preview-modal {
              box-shadow: none;
              max-width: none;
              max-height: none;
            }

            .preview-header,
            .preview-tabs {
              display: none;
            }

            .arabic,
            .english {
              background: white;
              border: none;
              page-break-inside: avoid;
            }

            button {
              display: none;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
