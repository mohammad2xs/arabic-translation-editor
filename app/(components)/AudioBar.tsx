'use client';

import { useState, useRef, useEffect } from 'react';
import { canPlayAudio, getUserRole } from '../../lib/dadmode/access';
// import { generateSSML } from '../../lib/audio/ssml';
import type { Lane } from '../../lib/audio/types';
import { getVoiceRegistry } from '../../lib/audio/voices';

export interface SectionNarrationOptions {
  sectionId: string;
  rows: Array<{
    id: string;
    original?: string;
    enhanced?: string;
    english?: string;
  }>;
  lane: Lane;
  mode: 'play' | 'generate';
  scopeName?: string;
}

export interface SectionNarrationResult {
  status: 'playing' | 'ready' | 'queued';
  message?: string;
  audioUrl?: string;
}

let activeSectionAudio: HTMLAudioElement | null = null;

function buildSectionText(rows: SectionNarrationOptions['rows'], lane: Lane): string {
  const lines = rows.map(row => {
    if (lane === 'en') return row.english?.trim() ?? '';
    if (lane === 'ar_enhanced') return row.enhanced?.trim() ?? row.original?.trim() ?? '';
    if (lane === 'ar_original') return row.original?.trim() ?? row.enhanced?.trim() ?? '';
    return '';
  }).filter(Boolean);

  return lines.join('\n\n').trim();
}

export async function playSectionNarration(options: SectionNarrationOptions): Promise<SectionNarrationResult | undefined> {
  const { sectionId, rows, lane, mode, scopeName } = options;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 'queued', message: 'No rows available for narration.' };
  }

  const text = buildSectionText(rows, lane);
  if (!text) {
    return { status: 'queued', message: 'Section has no text for the selected lane.' };
  }

  if (mode === 'generate') {
    const response = await fetch('/api/audio/job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'section',
        lane,
        scopeId: sectionId,
        scopeName: scopeName ?? `Section ${sectionId}`,
      }),
    });

    if (!response.ok) {
      const errorInfo = await response.json().catch(() => ({}));
      throw new Error(errorInfo.error || 'Failed to request section audio.');
    }

    const data = await response.json();
    return {
      status: 'ready',
      message: data?.job?.id ? `Audio queued (job ${data.job.id}).` : 'Audio generation requested.',
    };
  }

  const voiceRegistry = getVoiceRegistry();
  const voiceConfig = voiceRegistry.getVoiceConfig(lane);
  const voiceSettings = voiceRegistry.getOptimizedSettings(lane, voiceConfig.settings);

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      lane,
      rowId: `${sectionId}_${lane}_section`,
      voiceKey: voiceConfig.voiceId,
      voiceSettings,
      language: voiceConfig.locale === 'en-US' ? 'en' : 'ar',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.audioUrl) {
    throw new Error(payload?.error || 'Failed to generate playback audio.');
  }

  try {
    if (activeSectionAudio) {
      activeSectionAudio.pause();
      activeSectionAudio.currentTime = 0;
    }

    activeSectionAudio = new Audio(payload.audioUrl);
    await activeSectionAudio.play();

    activeSectionAudio.onended = () => {
      activeSectionAudio = null;
    };

    return { status: 'playing', message: 'Playing section narration…', audioUrl: payload.audioUrl };
  } catch (error) {
    activeSectionAudio = null;
    throw error instanceof Error ? error : new Error('Playback failed.');
  }
}

interface AudioBarProps {
  text: string;
  originalText?: string; // For ar_original lane
  enhancedText?: string; // For ar_enhanced lane
  rowId: string;
  sectionId?: string;
}

interface PlaybackQueue {
  type: 'row' | 'section' | 'chapter' | 'book';
  id: string;
  currentIndex: number;
  items: Array<{
    text: string;
    rowId: string;
    sectionId?: string;
  }>;
}

export default function AudioBar({
  text,
  originalText,
  enhancedText,
  rowId,
  sectionId
}: AudioBarProps) {
  const [currentLane, setCurrentLane] = useState<Lane>('en');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1.0);
  const [showControls, setShowControls] = useState(false);
  const [includeFootnotes, setIncludeFootnotes] = useState(true);
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackQueue | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRegistry = getVoiceRegistry();

  const userRole = getUserRole();

  // Check if user can play audio
  if (!canPlayAudio(userRole)) {
    return null;
  }

  // Get current text based on selected lane
  const getCurrentText = (): string => {
    let currentText: string;
    switch (currentLane) {
      case 'en':
        currentText = text;
        break;
      case 'ar_enhanced':
        currentText = enhancedText || text;
        if (!enhancedText) {
          console.warn(`No enhanced Arabic text available for row ${rowId}, falling back to base text`);
        }
        break;
      case 'ar_original':
        currentText = originalText || enhancedText || text;
        if (!originalText) {
          console.warn(`No original Arabic text available for row ${rowId}, falling back to ${enhancedText ? 'enhanced' : 'base'} text`);
        }
        break;
      default:
        currentText = text;
    }

    return currentText || '';
  };

  // Generate audio for current text and lane
  const generateAudio = async (textToSpeak?: string): Promise<string> => {
    const currentText = textToSpeak || getCurrentText();

    if (!currentText || currentText.trim().length === 0) {
      throw new Error('No text available for audio generation');
    }

    // Get voice configuration for current lane
    const voiceConfig = voiceRegistry.getVoiceConfig(currentLane);
    const voiceSettings = voiceRegistry.getOptimizedSettings(currentLane, {
      stability: rate > 1.2 ? 0.3 : voiceConfig.settings.stability,
      similarity_boost: voiceConfig.settings.similarity_boost,
      style: voiceConfig.settings.style,
      use_speaker_boost: voiceConfig.settings.use_speaker_boost
    });

    // Call TTS API with lane information - server will generate SSML with lexicon
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: currentText,
        lane: currentLane,
        rowId: `${rowId}_${currentLane}`,
        voiceKey: voiceConfig.voiceId,
        voiceSettings,
        language: voiceConfig.locale === 'en-US' ? 'en' : 'ar',
        // Pass SSML options for server-side generation
        ssmlOptions: {
          includeFootnotes,
          customRate: rate !== 1.0 ? (rate - 1) * 100 : undefined
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Handle preview mode (503 status)
      if (response.status === 503 && errorData.previewMode) {
        throw new Error(`${errorData.message}\n${errorData.guidance?.solution || 'Configure ElevenLabs API key to enable audio generation'}`);
      }

      throw new Error(errorData.error || 'Failed to generate audio');
    }

    const data = await response.json();
    if (!data.success || !data.audioUrl) {
      throw new Error('Invalid response from TTS service');
    }

    return data.audioUrl;
  };

  // Play audio for current row and lane
  const handlePlay = async () => {
    if (isPlaying) {
      handleStop();
      return;
    }

    setIsLoading(true);

    try {
      const audioUrl = await generateAudio();
      await playAudio(audioUrl);
    } catch (error) {
      console.error('Audio playback error:', error);
      alert(`Audio playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Play audio from URL
  const playAudio = async (audioUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.volume = volume;
      audio.playbackRate = rate;

      audio.onloadstart = () => setIsLoading(true);
      audio.oncanplay = () => {
        setIsLoading(false);
        setDuration(audio.duration);
      };

      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);

      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        resolve();

        // Auto-play next in queue if available
        if (playbackQueue && playbackQueue.currentIndex < playbackQueue.items.length - 1) {
          playNextInQueue();
        }
      };

      audio.onerror = (error) => {
        setIsPlaying(false);
        setIsLoading(false);
        setProgress(0);
        reject(error);
      };

      audio.play().catch(reject);
    });
  };

  // Stop current audio
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
    setPlaybackQueue(null);
  };

  // Play next item in queue
  const playNextInQueue = async () => {
    if (!playbackQueue || playbackQueue.currentIndex >= playbackQueue.items.length - 1) {
      setPlaybackQueue(null);
      return;
    }

    const nextIndex = playbackQueue.currentIndex + 1;
    const nextItem = playbackQueue.items[nextIndex];
    if (!nextItem) {
      setPlaybackQueue(null);
      return;
    }

    setPlaybackQueue(prev => prev ? { ...prev, currentIndex: nextIndex } : null);

    try {
      const audioUrl = await generateAudio(nextItem.text);
      await playAudio(audioUrl);
    } catch (error) {
      console.error('Queue playback error:', error);
      setPlaybackQueue(null);
    }
  };

  // Start section playback
  const playSection = async () => {
    if (!sectionId) {
      alert('No section ID available for section playback');
      return;
    }

    setIsLoading(true);
    try {
      // Trigger audiobook job for the current section
      const response = await fetch('/api/audio/job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'section',
          lane: currentLane,
          scopeId: sectionId,
          scopeName: `Section ${sectionId}`
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create section audio job');
      }

      const data = await response.json();
      alert(`Section audio generation started! Job ID: ${data.job.id}. Check the Audiobook Panel for progress.`);
    } catch (error) {
      console.error('Section playback error:', error);
      alert(`Failed to start section playback: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Start chapter playback
  // TODO: Add chapter-level playback once audiobook generation supports it.

  // Download current audio
  const downloadAudio = async () => {
    try {
      setIsLoading(true);
      const audioUrl = await generateAudio();

      // Create more descriptive filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const laneConfig = voiceRegistry.getLaneConfig(currentLane);
      const fileName = `${rowId}_${currentLane}_${laneConfig.displayName.replace(/\s+/g, '_')}_${timestamp}.mp3`;

      // Create download link
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success message with filename
      alert(`Audio downloaded: ${fileName}`);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Failed to download audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle lane change
  const handleLaneChange = (newLane: Lane) => {
    handleStop(); // Stop current playback
    setCurrentLane(newLane);
  };

  // Handle volume change
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // Handle rate change
  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  // Handle progress seek
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;

      audioRef.current.currentTime = newTime;
      setProgress(percentage * 100);
    }
  };

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleStop();
    };
  }, [handleStop]);

  const currentText = getCurrentText();
  const laneConfig = voiceRegistry.getLaneConfig(currentLane);

  return (
    <div className="bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Main Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Lane Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Lane:</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => handleLaneChange('en')}
                  className={`px-3 py-1 text-sm transition-colors ${
                    currentLane === 'en'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => handleLaneChange('ar_enhanced')}
                  className={`px-3 py-1 text-sm transition-colors border-l border-gray-300 ${
                    currentLane === 'ar_enhanced'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  disabled={!enhancedText}
                >
                  AR+
                </button>
                <button
                  onClick={() => handleLaneChange('ar_original')}
                  className={`px-3 py-1 text-sm transition-colors border-l border-gray-300 ${
                    currentLane === 'ar_original'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  disabled={!originalText}
                >
                  AR
                </button>
              </div>
            </div>

            {/* Play Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePlay}
                disabled={isLoading || !currentText.trim()}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isPlaying
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } ${
                  isLoading || !currentText.trim()
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-lg'
                } focus:ring-4 focus:ring-blue-200`}
                aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
              >
                {isLoading ? (
                  <div className="text-sm animate-spin">⏳</div>
                ) : isPlaying ? (
                  <div className="text-sm">⏹️</div>
                ) : (
                  <div className="text-sm">▶️</div>
                )}
              </button>

              <button
                onClick={playSection}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                title="Play entire section"
              >
                Section
              </button>

              <button
                onClick={() => alert('Chapter playback is coming soon!')}
                disabled={true}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-400 rounded cursor-not-allowed opacity-50"
                title="Chapter playback coming soon"
              >
                Chapter
              </button>
            </div>
          </div>

          {/* Progress and Info */}
          <div className="flex items-center space-x-4">
            {/* Progress Bar */}
            {(isPlaying || progress > 0) && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">
                  {formatTime((progress / 100) * duration)}
                </span>
                <div
                  className="w-32 h-2 bg-gray-200 rounded-full cursor-pointer"
                  onClick={handleProgressClick}
                >
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {formatTime(duration)}
                </span>
              </div>
            )}

            {/* Lane Info */}
            <div className="text-xs text-gray-600">
              <span className="font-medium">{laneConfig.displayName}</span>
              <br />
              <span>{laneConfig.primaryVoice.name}</span>
            </div>

            {/* Settings and Download */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowControls(!showControls)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                title="Audio settings"
              >
                <span className="text-sm">⚙️</span>
              </button>

              <button
                onClick={downloadAudio}
                disabled={isLoading}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors disabled:opacity-50"
                title="Download audio"
              >
                <span className="text-sm">⬇️</span>
              </button>
            </div>
          </div>
        </div>

        {/* Queue Info */}
        {playbackQueue && (
          <div className="mt-2 text-xs text-gray-600">
            Playing {playbackQueue.type}: {playbackQueue.currentIndex + 1} of {playbackQueue.items.length}
          </div>
        )}

        {/* Advanced Controls */}
        {showControls && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Volume Control */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔊 Volume: {Math.round(volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Speed Control */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ⚡ Speed: {rate}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Footnotes Toggle */}
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={includeFootnotes}
                    onChange={(e) => setIncludeFootnotes(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Include footnotes</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
