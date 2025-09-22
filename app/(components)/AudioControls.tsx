'use client';

import { useState, useRef, useEffect } from 'react';
import { canPlayAudio, canShare, getUserRole } from '../../lib/dadmode/access';
import VoiceConfigDialog from './VoiceConfigDialog';

interface AudioControlsProps {
  text: string;
  language: 'ar' | 'en';
  rowId: string;
  large?: boolean;
  label?: string;
}

export default function AudioControls({
  text,
  language,
  rowId,
  large = false,
  label,
}: AudioControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1.0);
  const [showControls, setShowControls] = useState(false);
  const [audioSource, setAudioSource] = useState<'elevenlabs' | 'webspeech' | null>(null);
  const [showVoiceConfig, setShowVoiceConfig] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const userRole = getUserRole();
  const canManageVoices = canShare(userRole);

  // Check if user can play audio
  if (!canPlayAudio(userRole)) {
    return null;
  }

  const handlePlay = async () => {
    if (!text || text.trim().length === 0) {
      return;
    }

    if (isPlaying) {
      handleStop();
      return;
    }

    setIsLoading(true);

    try {
      // First, check if existing ElevenLabs MP3 exists
      const existingMp3Response = await fetch(`/api/audio/segments/${rowId}.mp3`, {
        method: 'HEAD'
      });

      if (existingMp3Response.ok) {
        // Existing ElevenLabs MP3 found, use it
        await playElevenLabsAudio(`/api/audio/segments/${rowId}.mp3`);
        setAudioSource('elevenlabs');
      } else {
        // No existing MP3, fallback to Web Speech API
        await playWebSpeechAudio();
        setAudioSource('webspeech');
      }
    } catch (error) {
      console.error('Audio playback error:', error);
      // Fallback to Web Speech API
      try {
        await playWebSpeechAudio();
        setAudioSource('webspeech');
      } catch (speechError) {
        console.error('Web Speech API error:', speechError);
        alert('Audio playback failed. Please check your internet connection and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const generateElevenLabsAudio = async () => {
    if (!text || text.trim().length === 0) {
      return;
    }

    setIsLoading(true);

    try {
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          language,
          rowId,
          voiceSettings: {
            stability: rate > 1 ? 0.3 : 0.4, // Lower stability for faster speech
            similarity_boost: 0.85,
            style: 0.1,
            use_speaker_boost: true,
          }
        }),
      });

      if (ttsResponse.ok) {
        const ttsData = await ttsResponse.json();

        if (ttsData.success && ttsData.audioUrl) {
          // Play the newly generated ElevenLabs audio
          await playElevenLabsAudio(`/api/audio${ttsData.audioUrl.replace('/outputs/audio', '')}`);
          setAudioSource('elevenlabs');
        } else {
          throw new Error('TTS generation failed');
        }
      } else {
        // Handle preview mode and other non-2xx responses
        const errorData = await ttsResponse.json();
        if (ttsResponse.status === 503 && errorData.previewMode) {
          throw new Error(`Professional audio unavailable: ${errorData.message}\n\n${errorData.guidance?.solution || 'Configure ElevenLabs API key to enable professional audio generation'}`);
        } else {
          throw new Error(errorData.error || 'TTS generation failed');
        }
      }
    } catch (error) {
      console.error('ElevenLabs generation error:', error);
      alert('Failed to generate professional audio. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const playElevenLabsAudio = async (audioPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioPath);
      audioRef.current = audio;

      audio.volume = volume;
      audio.playbackRate = rate;

      audio.onloadstart = () => setIsLoading(true);
      audio.oncanplay = () => setIsLoading(false);

      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => {
        setIsPlaying(false);
        resolve();
      };

      audio.onerror = (error) => {
        setIsPlaying(false);
        setIsLoading(false);
        reject(error);
      };

      audio.play().catch(reject);
    });
  };

  const playWebSpeechAudio = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      speechRef.current = utterance;

      // Set language and voice
      utterance.lang = language === 'ar' ? 'ar-SA' : 'en-US';
      utterance.volume = volume;
      utterance.rate = rate;

      // Try to find appropriate voice
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice =>
        voice.lang.startsWith(language === 'ar' ? 'ar' : 'en')
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => {
        setIsPlaying(false);
        resolve();
      };
      utterance.onerror = (error) => {
        setIsPlaying(false);
        reject(error);
      };

      speechSynthesis.speak(utterance);
    });
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    if (speechRef.current) {
      speechSynthesis.cancel();
      speechRef.current = null;
    }

    setIsPlaying(false);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);

    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }

    if (speechRef.current) {
      // Can't change volume of ongoing speech, will apply to next playback
    }
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);

    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }

    if (speechRef.current) {
      // Can't change rate of ongoing speech, will apply to next playback
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      handleStop();
    };
  }, []);

  const buttonSize = large ? 'w-16 h-16' : 'w-12 h-12';
  const iconSize = large ? 'text-2xl' : 'text-lg';

  return (
    <div className="relative">
      <div className="flex items-center space-x-2">
        {label && (
          <span className={`font-medium text-gray-700 ${large ? 'text-lg' : 'text-sm'}`}>
            {label}:
          </span>
        )}

        <button
          onClick={handlePlay}
          disabled={isLoading || !text.trim()}
          className={`
            ${buttonSize} rounded-full flex items-center justify-center transition-all duration-200
            ${isPlaying
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
            }
            ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}
            ${!text.trim() ? 'opacity-30 cursor-not-allowed' : ''}
            focus:ring-4 focus:ring-blue-200
          `}
          aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
          title={isPlaying ? 'Stop audio' : 'Play audio'}
        >
          {isLoading ? (
            <div className={`${iconSize} animate-spin`}>⏳</div>
          ) : isPlaying ? (
            <div className={iconSize}>⏹️</div>
          ) : (
            <div className={iconSize}>▶️</div>
          )}
        </button>

        <button
          onClick={() => setShowControls(!showControls)}
          className={`
            ${large ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-gray-200 hover:bg-gray-300
            flex items-center justify-center transition-colors focus:ring-4 focus:ring-gray-200
          `}
          aria-label="Audio settings"
          title="Audio settings"
        >
          <span className={large ? 'text-lg' : 'text-sm'}>⚙️</span>
        </button>

        {canManageVoices && (
          <button
            onClick={() => setShowVoiceConfig(true)}
            className={`
              ${large ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-purple-200 hover:bg-purple-300
              flex items-center justify-center transition-colors focus:ring-4 focus:ring-purple-200
            `}
            aria-label="Voice configuration"
            title="Configure voices"
          >
            <span className={large ? 'text-lg' : 'text-sm'}>🎙️</span>
          </button>
        )}

        {audioSource && (
          <div className={`px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 ${large ? 'text-sm' : ''}`}>
            {audioSource === 'elevenlabs' ? '🎙️ Pro Audio' : '🔊 Browser TTS'}
          </div>
        )}
      </div>

      {showControls && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 min-w-[280px]">
          <div className="space-y-4">
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
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

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
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {language === 'ar' ? '🇸🇦 Arabic (Saudi)' : '🇺🇸 English (US)'}
              </p>
              {audioSource === 'webspeech' && (
                <p className="text-xs text-gray-400 mt-1">
                  Using browser text-to-speech
                </p>
              )}
              {audioSource === 'elevenlabs' && (
                <p className="text-xs text-green-600 mt-1">
                  Using professional audio
                </p>
              )}

              {/* Generate ElevenLabs Audio button */}
              <div className="mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={generateElevenLabsAudio}
                  disabled={isLoading || !text.trim()}
                  className="w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white text-xs rounded-md transition-colors focus:ring-2 focus:ring-purple-200"
                >
                  {isLoading ? 'Generating...' : '🎙️ Generate Professional Audio'}
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  Generate high-quality audio with ElevenLabs
                </p>
              </div>
            </div>
          </div>

          {/* Click outside to close */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setShowControls(false)}
          />
        </div>
      )}

      <VoiceConfigDialog
        isOpen={showVoiceConfig}
        onClose={() => setShowVoiceConfig(false)}
      />
    </div>
  );
}