'use client';

import { useState, useRef, useEffect } from 'react';
import { canPlayAudio, getUserRole } from '../../lib/dadmode/access';
import { generateSSML, type Lane } from '../../lib/audio/ssml';
import { getVoiceRegistry, type VoiceSettings } from '../../lib/audio/voices';

interface AudioBarProps {
  text: string;
  originalText?: string;
  enhancedText?: string;
  rowId: string;
  sectionId?: string;
  chapterId?: string;
  contextData?: any; // Context7 integration
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

export default function EnhancedAudioBar({
  text,
  originalText,
  enhancedText,
  rowId,
  sectionId,
  chapterId,
  contextData
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
  const [visualizer, setVisualizer] = useState<number[]>(new Array(20).fill(0));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRegistry = getVoiceRegistry();
  const userRole = getUserRole();

  // Check if user can play audio
  if (!canPlayAudio(userRole)) {
    return null;
  }

  // Audio visualizer effect
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setVisualizer(prev => prev.map(() => Math.random() * 100));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setVisualizer(new Array(20).fill(0));
    }
  }, [isPlaying]);

  // Smart lane suggestion based on context
  const getSmartLaneSuggestion = (): Lane => {
    if (contextData?.userPreference) return contextData.userPreference;
    if (contextData?.previousLane) return contextData.previousLane;
    if (contextData?.textLanguage === 'ar') return 'ar_enhanced';
    return 'en';
  };

  // Get current text based on selected lane
  const getCurrentText = (): string => {
    switch (currentLane) {
      case 'en':
        return text;
      case 'ar_enhanced':
        return enhancedText || text;
      case 'ar_original':
        return originalText || enhancedText || text;
      default:
        return text;
    }
  };

  // Enhanced audio generation with context awareness
  const generateAudio = async (textToSpeak?: string): Promise<string> => {
    const currentText = textToSpeak || getCurrentText();

    if (!currentText || currentText.trim().length === 0) {
      throw new Error('No text available for audio generation');
    }

    const voiceConfig = voiceRegistry.getVoiceConfig(currentLane);
    const voiceSettings = voiceRegistry.getOptimizedSettings(currentLane, {
      stability: rate > 1.2 ? 0.3 : voiceConfig.settings.stability,
      similarity_boost: voiceConfig.settings.similarity_boost,
      style: voiceConfig.settings.style,
      use_speaker_boost: voiceConfig.settings.use_speaker_boost
    });

    // Enhanced TTS API call with context data
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
        ssmlOptions: {
          includeFootnotes,
          customRate: rate !== 1.0 ? (rate - 1) * 100 : undefined
        },
        contextData: {
          userRole,
          previousPlaybacks: contextData?.audioHistory,
          preferredSpeed: contextData?.preferredSpeed || rate,
          emotionalTone: contextData?.emotionalTone
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate audio');
    }

    const data = await response.json();
    if (!data.success || !data.audioUrl) {
      throw new Error('Invalid response from TTS service');
    }

    return data.audioUrl;
  };

  // Enhanced play audio with smooth transitions
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

  // Play with enhanced feedback
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
      // Enhanced error notification
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Could integrate with notification system here
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced stop with fade out
  const handleStop = () => {
    if (audioRef.current) {
      const audio = audioRef.current;
      const fadeOut = setInterval(() => {
        if (audio.volume > 0.01) {
          audio.volume -= 0.1;
        } else {
          clearInterval(fadeOut);
          audio.pause();
          audio.currentTime = 0;
          audio.volume = volume;
          audioRef.current = null;
        }
      }, 50);
    }
    setIsPlaying(false);
    setProgress(0);
    setPlaybackQueue(null);
  };

  // Smart lane change with context preservation
  const handleLaneChange = (newLane: Lane) => {
    handleStop();
    setCurrentLane(newLane);

    // Save preference to context
    if (contextData?.savePreference) {
      contextData.savePreference('audioLane', newLane);
    }
  };

  // Enhanced volume control with visual feedback
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // Smart rate adjustment
  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  // Enhanced progress seeking
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
  }, []);

  const currentText = getCurrentText();
  const laneConfig = voiceRegistry.getLaneConfig(currentLane);
  const smartSuggestion = getSmartLaneSuggestion();

  return (
    <div className="cursor-audio-bar cursor-ui">
      <div className="cursor-audio-controls">
        {/* Enhanced Lane Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Audio</span>
          <div className="cursor-lane-selector">
            <button
              onClick={() => handleLaneChange('en')}
              className={`cursor-lane-button ${currentLane === 'en' ? 'data-active' : ''}`}
              data-active={currentLane === 'en' ? 'true' : undefined}
            >
              EN
            </button>
            <button
              onClick={() => handleLaneChange('ar_enhanced')}
              className={`cursor-lane-button ${currentLane === 'ar_enhanced' ? 'data-active' : ''}`}
              data-active={currentLane === 'ar_enhanced' ? 'true' : undefined}
              disabled={!enhancedText}
            >
              AR+
            </button>
            <button
              onClick={() => handleLaneChange('ar_original')}
              className={`cursor-lane-button ${currentLane === 'ar_original' ? 'data-active' : ''}`}
              data-active={currentLane === 'ar_original' ? 'true' : undefined}
              disabled={!originalText}
            >
              AR
            </button>
          </div>
          {/* Smart suggestion indicator */}
          {smartSuggestion !== currentLane && (
            <button
              onClick={() => handleLaneChange(smartSuggestion)}
              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
              title={`Switch to ${smartSuggestion.toUpperCase()} (suggested)`}
            >
              Try {smartSuggestion.toUpperCase()}
            </button>
          )}
        </div>

        {/* Enhanced Play Button */}
        <button
          onClick={handlePlay}
          disabled={isLoading || !currentText.trim()}
          className={`cursor-play-button ${isLoading ? 'opacity-75' : ''}`}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Enhanced Progress Bar with Visualizer */}
        <div className="flex-1 flex items-center gap-4">
          {/* Time Display */}
          <span className="text-xs text-gray-500 font-mono min-w-[3rem]">
            {formatTime((progress / 100) * duration)}
          </span>

          {/* Progress Bar */}
          <div className="flex-1 relative">
            <div
              className="cursor-progress-bar"
              onClick={handleProgressClick}
            >
              <div
                className="cursor-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Audio Visualizer */}
            {isPlaying && (
              <div className="absolute top-2 left-0 right-0 flex items-end justify-center gap-1 h-6">
                {visualizer.map((height, i) => (
                  <div
                    key={i}
                    className="w-1 bg-blue-400 rounded-full transition-all duration-100"
                    style={{ height: `${Math.max(2, height * 0.2)}px` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Duration */}
          <span className="text-xs text-gray-500 font-mono min-w-[3rem]">
            {formatTime(duration)}
          </span>
        </div>

        {/* Voice Info */}
        <div className="text-xs text-gray-600 text-right min-w-[8rem]">
          <div className="font-medium">{laneConfig.displayName}</div>
          <div className="text-gray-500">{laneConfig.primaryVoice.name}</div>
        </div>

        {/* Enhanced Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowControls(!showControls)}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            title="Audio settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="m12 1 4 6-4 6-4-6z"/>
              <path d="m21 12-6-4v8z"/>
              <path d="m3 12 6-4v8z"/>
            </svg>
          </button>

          <button
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            title="Download audio"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Queue Indicator */}
      {playbackQueue && (
        <div className="mt-3 px-4 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
          Playing {playbackQueue.type}: {playbackQueue.currentIndex + 1} of {playbackQueue.items.length}
        </div>
      )}

      {/* Advanced Controls Panel */}
      {showControls && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
  );
}