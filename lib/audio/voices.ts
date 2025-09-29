// @ts-nocheck
export type { Lane, VoiceSettings } from './types';

export interface VoiceConfig {
  voiceId: string;
  name: string;
  description: string;
  language: string;
  locale: string;
  gender: 'male' | 'female' | 'neutral';
  age: 'young' | 'middle_aged' | 'old' | 'unknown';
  accent: string;
  category: 'premade' | 'cloned' | 'professional' | 'instant';
  settings: VoiceSettings;
  fallbackVoiceId?: string; // Fallback if primary voice unavailable
  modelId?: string; // ElevenLabs model ID override
}

export interface LaneConfig {
  lane: Lane;
  displayName: string;
  description: string;
  primaryVoice: VoiceConfig;
  fallbackVoices: VoiceConfig[];
  language: string;
  locale: string;
  optimizations: {
    rate_adjustment: number; // Percentage adjustment for SSML rate
    pitch_adjustment: number; // Percentage adjustment for SSML pitch
    volume_adjustment: number; // Percentage adjustment for SSML volume
    emphasis_level: 'none' | 'reduced' | 'moderate' | 'strong';
    pause_multiplier: number; // Multiplier for natural pauses
  };
}

// Default voice configurations for each lane
const DEFAULT_VOICE_CONFIGS: Record<Lane, VoiceConfig> = {
  en: {
    voiceId: process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM', // Rachel
    name: 'Rachel',
    description: 'Clear, professional English voice suitable for narration',
    language: 'English',
    locale: 'en-US',
    gender: 'female',
    age: 'middle_aged',
    accent: 'American',
    category: 'premade',
    settings: {
      stability: 0.45,
      similarity_boost: 0.85,
      style: 0.15,
      use_speaker_boost: true,
      clarity: 0.70
    },
    fallbackVoiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - multilingual
    modelId: 'eleven_multilingual_v2'
  },
  ar_enhanced: {
    voiceId: process.env.ELEVENLABS_VOICE_ID_AR_ENHANCED || 'pNInz6obpgDQGcFmaJgB', // Adam
    name: 'Adam',
    description: 'Multilingual voice optimized for enhanced Arabic readability',
    language: 'Arabic',
    locale: 'ar-SA',
    gender: 'male',
    age: 'middle_aged',
    accent: 'Neutral Arabic',
    category: 'premade',
    settings: {
      stability: 0.55,
      similarity_boost: 0.90,
      style: 0.10,
      use_speaker_boost: true,
      clarity: 0.85
    },
    fallbackVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel as emergency fallback
    modelId: 'eleven_multilingual_v2'
  },
  ar_original: {
    voiceId: process.env.ELEVENLABS_VOICE_ID_AR_ORIGINAL || 'pNInz6obpgDQGcFmaJgB', // Adam
    name: 'Adam (Classical)',
    description: 'Multilingual voice optimized for classical Arabic pronunciation',
    language: 'Arabic',
    locale: 'ar-SA',
    gender: 'male',
    age: 'middle_aged',
    accent: 'Classical Arabic',
    category: 'premade',
    settings: {
      stability: 0.65, // Higher stability for formal pronunciation
      similarity_boost: 0.95,
      style: 0.05, // Lower style for more formal delivery
      use_speaker_boost: true,
      clarity: 0.90 // Maximum clarity for classical Arabic
    },
    fallbackVoiceId: 'pMsXgVXv3BLzUgSXRplE', // Another multilingual option
    modelId: 'eleven_multilingual_v2'
  }
};

// Lane configurations with optimizations
const LANE_CONFIGS: Record<Lane, LaneConfig> = {
  en: {
    lane: 'en',
    displayName: 'English',
    description: 'Original English translation with natural pacing',
    primaryVoice: DEFAULT_VOICE_CONFIGS.en,
    fallbackVoices: [
      {
        ...DEFAULT_VOICE_CONFIGS.ar_enhanced,
        voiceId: 'pNInz6obpgDQGcFmaJgB',
        name: 'Adam (Multilingual)'
      }
    ],
    language: 'English',
    locale: 'en-US',
    optimizations: {
      rate_adjustment: 6, // +6% faster for English fluency
      pitch_adjustment: 0, // Neutral pitch
      volume_adjustment: 0, // Standard volume
      emphasis_level: 'moderate',
      pause_multiplier: 1.0
    }
  },
  ar_enhanced: {
    lane: 'ar_enhanced',
    displayName: 'Arabic Enhanced',
    description: 'Enhanced Arabic with improved readability and flow',
    primaryVoice: DEFAULT_VOICE_CONFIGS.ar_enhanced,
    fallbackVoices: [
      {
        ...DEFAULT_VOICE_CONFIGS.ar_original,
        name: 'Adam (Original)'
      }
    ],
    language: 'Arabic',
    locale: 'ar-SA',
    optimizations: {
      rate_adjustment: -4, // -4% slower for clarity
      pitch_adjustment: 2, // +2% higher for clarity
      volume_adjustment: 0,
      emphasis_level: 'strong',
      pause_multiplier: 1.2 // 20% longer pauses
    }
  },
  ar_original: {
    lane: 'ar_original',
    displayName: 'Arabic Original',
    description: 'Original classical Arabic with maximum pronunciation accuracy',
    primaryVoice: DEFAULT_VOICE_CONFIGS.ar_original,
    fallbackVoices: [
      {
        ...DEFAULT_VOICE_CONFIGS.ar_enhanced,
        name: 'Adam (Enhanced)'
      }
    ],
    language: 'Arabic',
    locale: 'ar-SA',
    optimizations: {
      rate_adjustment: -6, // -6% slowest for maximum clarity
      pitch_adjustment: 0, // Neutral pitch for formal tone
      volume_adjustment: 5, // +5% louder for emphasis
      emphasis_level: 'strong',
      pause_multiplier: 1.4 // 40% longer pauses for classical Arabic
    }
  }
};

// Voice registry class for managing voice configurations
export class VoiceRegistry {
  private static instance: VoiceRegistry;
  private configs: Record<Lane, LaneConfig>;
  private customVoices: Map<string, VoiceConfig> = new Map();

  private constructor() {
    this.configs = { ...LANE_CONFIGS };
    this.loadCustomVoices();
  }

  public static getInstance(): VoiceRegistry {
    if (!VoiceRegistry.instance) {
      VoiceRegistry.instance = new VoiceRegistry();
    }
    return VoiceRegistry.instance;
  }

  // Get voice configuration for a specific lane
  public getVoiceConfig(lane: Lane): VoiceConfig {
    return this.configs[lane].primaryVoice;
  }

  // Get lane configuration
  public getLaneConfig(lane: Lane): LaneConfig {
    return this.configs[lane];
  }

  // Get all available lanes
  public getAvailableLanes(): Lane[] {
    return Object.keys(this.configs) as Lane[];
  }

  // Get fallback voice for a lane
  public getFallbackVoice(lane: Lane): VoiceConfig | null {
    const laneConfig = this.configs[lane];
    return laneConfig.fallbackVoices.length > 0 ? laneConfig.fallbackVoices[0] : null;
  }

  // Select best voice for lane based on availability
  public async selectVoiceForLane(lane: Lane): Promise<VoiceConfig> {
    const primaryVoice = this.getVoiceConfig(lane);

    // TODO: In a real implementation, check if voice is available via ElevenLabs API
    // For now, return primary voice
    return primaryVoice;
  }

  // Update voice configuration for a lane
  public updateVoiceConfig(lane: Lane, voiceConfig: Partial<VoiceConfig>): void {
    this.configs[lane].primaryVoice = {
      ...this.configs[lane].primaryVoice,
      ...voiceConfig
    };
  }

  // Add custom voice to registry
  public addCustomVoice(voiceId: string, config: VoiceConfig): void {
    this.customVoices.set(voiceId, config);
  }

  // Get custom voice by ID
  public getCustomVoice(voiceId: string): VoiceConfig | undefined {
    return this.customVoices.get(voiceId);
  }

  // Load custom voices from storage (localStorage or database)
  private loadCustomVoices(): void {
    try {
      // In a real implementation, this would load from persistent storage
      // For now, use environment variables if available
      const customVoiceData = process.env.CUSTOM_VOICES;
      if (customVoiceData) {
        const voices = JSON.parse(customVoiceData);
        for (const [id, config] of Object.entries(voices)) {
          this.customVoices.set(id, config as VoiceConfig);
        }
      }
    } catch (error) {
      console.warn('Failed to load custom voices:', error);
    }
  }

  // Get voice settings optimized for a specific lane
  public getOptimizedSettings(lane: Lane, baseSettings?: Partial<VoiceSettings>): VoiceSettings {
    const laneConfig = this.getLaneConfig(lane);
    const voiceConfig = this.getVoiceConfig(lane);

    return {
      ...voiceConfig.settings,
      ...baseSettings,
      // Apply any lane-specific optimizations here
      stability: Math.min(1, Math.max(0, voiceConfig.settings.stability)),
      similarity_boost: Math.min(1, Math.max(0, voiceConfig.settings.similarity_boost)),
      style: Math.min(1, Math.max(0, voiceConfig.settings.style)),
    };
  }

  // Check if a voice supports a specific language
  public isVoiceCompatible(voiceConfig: VoiceConfig, lane: Lane): boolean {
    const laneConfig = this.getLaneConfig(lane);
    return voiceConfig.language === laneConfig.language ||
           voiceConfig.locale === laneConfig.locale ||
           voiceConfig.category === 'professional'; // Professional voices usually support multiple languages
  }
}

// Utility functions for voice management

// Get the default voice registry instance
export function getVoiceRegistry(): VoiceRegistry {
  return VoiceRegistry.getInstance();
}

// Get voice ID for a specific lane
export function getVoiceIdForLane(lane: Lane): string {
  const registry = getVoiceRegistry();
  return registry.getVoiceConfig(lane).voiceId;
}

// Get optimized voice settings for a lane
export function getVoiceSettingsForLane(lane: Lane, overrides?: Partial<VoiceSettings>): VoiceSettings {
  const registry = getVoiceRegistry();
  return registry.getOptimizedSettings(lane, overrides);
}

// Get ElevenLabs model ID for a lane
export function getModelIdForLane(lane: Lane): string {
  const registry = getVoiceRegistry();
  const voiceConfig = registry.getVoiceConfig(lane);
  return voiceConfig.modelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
}

// Get locale for a lane
export function getLocaleForLane(lane: Lane): string {
  const registry = getVoiceRegistry();
  return registry.getLaneConfig(lane).locale;
}

// Validate voice configuration
export function validateVoiceConfig(config: VoiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.voiceId || config.voiceId.trim() === '') {
    errors.push('Voice ID is required');
  }

  if (!config.name || config.name.trim() === '') {
    errors.push('Voice name is required');
  }

  if (config.settings.stability < 0 || config.settings.stability > 1) {
    errors.push('Stability must be between 0 and 1');
  }

  if (config.settings.similarity_boost < 0 || config.settings.similarity_boost > 1) {
    errors.push('Similarity boost must be between 0 and 1');
  }

  if (config.settings.style < 0 || config.settings.style > 1) {
    errors.push('Style must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}