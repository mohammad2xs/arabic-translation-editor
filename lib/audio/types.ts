/**
 * Audio system type definitions
 * Single source of truth for all audio-related types
 */

export type Lane = 'en' | 'ar_enhanced' | 'ar_original';

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  clarity?: number;
}

export interface AudioJob {
  id: string;
  scope: 'section' | 'chapter' | 'book';
  lane: Lane;
  scopeId: string;
  scopeName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalSegments: number;
  processedSegments: number;
  audioUrl?: string;
  m4bUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  actualDuration?: number;
  metadata?: {
    totalCharacters: number;
    estimatedCost: number;
    voiceId: string;
    voiceName: string;
  };
}

export interface SSMLOptions {
  includeFootnotes?: boolean;
  customRate?: number;
  customPitch?: number;
}