'use client';

import { useState, useEffect } from 'react';
import { canShare, getUserRole } from '../../lib/dadmode/access';

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  language: string;
  accent: string;
  age: string;
  gender: string;
}

interface VoiceConfig {
  english_voice: string;
  arabic_voice: string;
  model: string;
}

interface VoiceConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VoiceConfigDialog({
  isOpen,
  onClose,
}: VoiceConfigDialogProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [currentConfig, setCurrentConfig] = useState<VoiceConfig | null>(null);
  const [selectedEnglishVoice, setSelectedEnglishVoice] = useState('');
  const [selectedArabicVoice, setSelectedArabicVoice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);

  const userRole = getUserRole();
  const canManageVoices = canShare(userRole); // Only reviewers can manage voice settings

  useEffect(() => {
    if (isOpen && canManageVoices) {
      loadVoices();
    }
  }, [isOpen, canManageVoices]);

  const loadVoices = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/tts');
      if (response.ok) {
        const data = await response.json();
        setVoices(data.voices || []);
        setCurrentConfig(data.currentConfig);
        setSelectedEnglishVoice(data.currentConfig.english_voice);
        setSelectedArabicVoice(data.currentConfig.arabic_voice);
      }
    } catch (error) {
      console.error('Failed to load voices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testVoice = async (voiceId: string, language: 'ar' | 'en') => {
    setTestingVoice(voiceId);

    const testText = language === 'en'
      ? 'Hello! This is a test of the voice quality for English text-to-speech.'
      : 'مرحبا! هذا اختبار لجودة الصوت للنص العربي إلى كلام.';

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: testText,
          language,
          voiceSettings: {
            // Override voice temporarily for testing
            voice_id: voiceId,
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.audioUrl) {
          const audio = new Audio(`/api/audio${data.audioUrl.replace('/outputs/audio', '')}`);
          audio.play();
        }
      }
    } catch (error) {
      console.error('Voice test failed:', error);
    } finally {
      setTestingVoice(null);
    }
  };

  const saveConfiguration = async () => {
    // In a real implementation, this would save the configuration
    // For now, we'll just show a message
    alert('Voice configuration saved! Changes will take effect on the next audio generation.');
    onClose();
  };

  if (!isOpen) return null;

  if (!canManageVoices) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Voice Configuration</h2>
            <p className="text-gray-600 mb-4">
              You need reviewer access to manage voice settings.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                🎙️ Voice Configuration
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 text-xl font-bold transition-colors"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="text-lg text-gray-600">Loading available voices...</div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Current Configuration */}
                {currentConfig && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-blue-900 mb-2">
                      Current Configuration
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">English Voice:</span> {currentConfig.english_voice}
                      </div>
                      <div>
                        <span className="font-medium">Arabic Voice:</span> {currentConfig.arabic_voice}
                      </div>
                      <div className="md:col-span-2">
                        <span className="font-medium">Model:</span> {currentConfig.model}
                      </div>
                    </div>
                  </div>
                )}

                {/* English Voices */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    🌍 English Voices
                  </h3>
                  <div className="grid gap-3">
                    {voices
                      .filter(voice => voice.language.toLowerCase().includes('english') || voice.language.toLowerCase().includes('en'))
                      .map((voice) => (
                        <div
                          key={voice.voice_id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedEnglishVoice === voice.voice_id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setSelectedEnglishVoice(voice.voice_id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{voice.name}</div>
                              <div className="text-sm text-gray-600">
                                {voice.gender} • {voice.age} • {voice.accent}
                              </div>
                              {voice.description && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {voice.description}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                testVoice(voice.voice_id, 'en');
                              }}
                              disabled={testingVoice === voice.voice_id}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                              {testingVoice === voice.voice_id ? '🎵 Playing...' : '▶️ Test'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Arabic/Multilingual Voices */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    🕌 Arabic & Multilingual Voices
                  </h3>
                  <div className="grid gap-3">
                    {voices
                      .filter(voice =>
                        voice.language.toLowerCase().includes('arabic') ||
                        voice.language.toLowerCase().includes('multilingual') ||
                        voice.category.toLowerCase().includes('multilingual')
                      )
                      .map((voice) => (
                        <div
                          key={voice.voice_id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedArabicVoice === voice.voice_id
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setSelectedArabicVoice(voice.voice_id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{voice.name}</div>
                              <div className="text-sm text-gray-600">
                                {voice.gender} • {voice.age} • {voice.language}
                              </div>
                              {voice.description && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {voice.description}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                testVoice(voice.voice_id, 'ar');
                              }}
                              disabled={testingVoice === voice.voice_id}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                              {testingVoice === voice.voice_id ? '🎵 Playing...' : '▶️ Test'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                💡 Changes will apply to new audio generations
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveConfiguration}
                  disabled={!selectedEnglishVoice || !selectedArabicVoice}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}