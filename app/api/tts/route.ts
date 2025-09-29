// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  getVoiceRegistry,
  getVoiceIdForLane,
  getVoiceSettingsForLane,
  getModelIdForLane
} from '../../../lib/audio/voices';
import type { Lane } from '../../../lib/audio/types';
import { generateSSMLWithLexicon, extractTextFromSSML } from '../../../lib/audio/ssml';

interface TTSRequest {
  text: string | string[]; // Support batch processing
  language?: 'ar' | 'en'; // Made optional for backward compatibility
  lane?: Lane; // New lane-based parameter
  rowId?: string;
  ssml?: string; // Pre-generated SSML
  voiceKey?: string; // Override voice ID
  scopeId?: string; // For batch processing identification
  ssmlOptions?: { // Options for server-side SSML generation
    includeFootnotes?: boolean;
    customRate?: number;
    customPitch?: number;
  };
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    clarity?: number;
  };
}

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: TTSRequest = await request.json();

    // Handle both single text and batch processing
    const textArray = Array.isArray(body.text) ? body.text : [body.text];

    if (textArray.length === 0 || textArray.some(text => !text || text.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Text is required for text-to-speech generation' },
        { status: 400 }
      );
    }

    // Determine lane from either new lane parameter or legacy language parameter
    let lane: Lane;
    if (body.lane) {
      lane = body.lane;
    } else if (body.language) {
      // Backward compatibility mapping
      lane = body.language === 'en' ? 'en' : 'ar_enhanced';
    } else {
      return NextResponse.json(
        { error: 'Either lane or language parameter is required' },
        { status: 400 }
      );
    }

    // Check if we have the ElevenLabs API key
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      // Detect environment for context-aware messaging
      const isProduction = process.env.NODE_ENV === 'production';
      const isDevelopment = process.env.NODE_ENV === 'development';

      // Check if TTS_PREVIEW_RETURNS_200 flag is set
      const previewReturns200 = process.env.TTS_PREVIEW_RETURNS_200 === 'true';

      const responseData = {
        success: false,
        previewMode: true,
        message: "TTS features are in preview-only mode",
        guidance: {
          reason: "ELEVENLABS_API_KEY not configured",
          impact: "Audio generation is unavailable",
          solution: isProduction
            ? "Contact your administrator to configure the ElevenLabs API key"
            : "Set ELEVENLABS_API_KEY environment variable to enable full functionality",
          documentation: "See DEPLOYMENT.md for setup instructions",
          environment: isProduction ? "production" : isDevelopment ? "development" : "unknown"
        },
        alternatives: [
          "Use text-only mode for content review",
          "Configure API key for audio generation",
          ...(isProduction ? ["Contact administrator for access"] : ["Check .env.local file for missing variables"])
        ],
        // Legacy error field for backward compatibility
        error: 'ElevenLabs API key not configured'
      };

      return NextResponse.json(
        responseData,
        { status: previewReturns200 ? 200 : 503 } // Return 200 if flag is set, otherwise 503
      );
    }

    // Enhanced rate limiting with dynamic limits based on text complexity
    const maxSegments = textArray.length > 1 ? 50 : 1; // Lower limit for batch requests
    const totalCharacters = textArray.reduce((sum, text) => sum + text.length, 0);
    const maxCharacters = 50000; // 50K characters max per request

    if (textArray.length > maxSegments) {
      return NextResponse.json(
        { error: `Maximum ${maxSegments} text segments allowed per request for batch processing` },
        { status: 400 }
      );
    }

    if (totalCharacters > maxCharacters) {
      return NextResponse.json(
        { error: `Total text length (${totalCharacters}) exceeds maximum of ${maxCharacters} characters` },
        { status: 400 }
      );
    }

    const audioDir = join(process.cwd(), process.env.AUDIO_STORAGE_PATH || 'outputs/audio');
    const segmentsDir = join(audioDir, 'segments');
    const laneDir = join(audioDir, lane);

    // Ensure directories exist
    await fs.mkdir(segmentsDir, { recursive: true });
    await fs.mkdir(laneDir, { recursive: true });

    // Pre-process texts for optimal chunk sizes
    const processedTexts = await preprocessTextsForOptimalProcessing(textArray, lane);

    // Process each text segment with improved batch handling
    const results = [];
    const batchSize = Math.min(5, textArray.length); // Process in smaller batches

    for (let batchStart = 0; batchStart < processedTexts.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, processedTexts.length);
      const batch = processedTexts.slice(batchStart, batchEnd);

      // Process batch concurrently but with controlled concurrency
      const batchPromises = batch.map(async (textInfo, localIndex) => {
        const globalIndex = batchStart + localIndex;
        const text = textInfo.text.trim();
        const segmentId = body.rowId
          ? `${body.rowId}_${lane}${processedTexts.length > 1 ? `_${globalIndex}` : ''}`
          : createHash('md5').update(`${text}-${lane}-${globalIndex}`).digest('hex');

        try {
          const result = await processSingleText(
            text,
            lane,
            segmentId,
            body.ssml,
            body.voiceKey,
            body.voiceSettings,
            segmentsDir,
            laneDir,
            apiKey,
            body.ssmlOptions
          );
          return { ...result, originalIndex: textInfo.originalIndex };
        } catch (error) {
          console.error(`Error processing segment ${globalIndex}:`, error);
          return {
            success: false,
            segmentId,
            originalIndex: textInfo.originalIndex,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches for rate limiting
      if (batchEnd < processedTexts.length) {
        const delayMs = calculateBatchDelay(batchSize, lane);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Return single result for single text, array for batch
    // Fix: When single input text is chunked, return all segments
    if (textArray.length === 1 && processedTexts.length === 1) {
      return NextResponse.json(results[0]);
    } else {
      const successCount = results.filter(r => r.success).length;
      return NextResponse.json({
        success: successCount > 0,
        totalSegments: processedTexts.length,
        successfulSegments: successCount,
        results,
        manifest: results.filter(r => r.success).map(r => ({
          segmentId: r.segmentId,
          audioUrl: r.audioUrl,
          duration: r.duration
        }))
      });
    }

  } catch (error) {
    console.error('TTS generation error:', error);

    if (error instanceof Error) {
      if (error.message.includes('quota')) {
        return NextResponse.json(
          { error: 'ElevenLabs quota exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      if (error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Invalid ElevenLabs API key' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate audio. Please try again.' },
      { status: 500 }
    );
  }
}

// Process a single text segment with the new lane-based system
async function processSingleText(
  text: string,
  lane: Lane,
  segmentId: string,
  ssml?: string,
  voiceKey?: string,
  customVoiceSettings?: Partial<ElevenLabsVoiceSettings>,
  segmentsDir?: string,
  laneDir?: string,
  apiKey?: string,
  ssmlOptions?: { includeFootnotes?: boolean; customRate?: number; customPitch?: number }
) {
  // Generate cache key
  const cacheKey = createHash('md5')
    .update(`${text}-${lane}-${voiceKey || ''}-${JSON.stringify(customVoiceSettings || {})}`)
    .digest('hex');

  const fileName = `${segmentId}.mp3`;
  const filePath = join(segmentsDir || join(process.cwd(), 'outputs/audio/segments'), fileName);
  const laneFilePath = join(laneDir || join(process.cwd(), 'outputs/audio', lane), fileName);

  try {
    // Check if file exists and is recent (within cache duration)
    const stats = await fs.stat(filePath);
    const cacheHours = parseInt(process.env.AUDIO_CACHE_DURATION_HOURS || '24');
    const maxAge = cacheHours * 60 * 60 * 1000;

    if (Date.now() - stats.mtime.getTime() < maxAge) {
      // On cache hit, ensure lane copy exists if laneDir is provided
      if (laneDir) {
        try {
          await fs.access(laneFilePath);
        } catch {
          // Lane copy doesn't exist, copy from segments directory
          await fs.mkdir(join(laneDir, '..'), { recursive: true });
          await fs.copyFile(filePath, laneFilePath);
        }
      }

      return {
        success: true,
        segmentId,
        audioUrl: `/api/files/audio/segments/${fileName}`,
        cached: true,
        generatedAt: stats.mtime.toISOString(),
      };
    }
  } catch {
    // File doesn't exist, continue with generation
  }

  // Generate audio using the new lane-based system
  const audioBuffer = await generateAudioWithElevenLabs(
    text,
    lane,
    ssml,
    voiceKey,
    customVoiceSettings,
    apiKey,
    ssmlOptions
  );

  // Save audio file to both locations
  await fs.writeFile(filePath, audioBuffer);
  if (laneDir) {
    await fs.writeFile(laneFilePath, audioBuffer);
  }

  return {
    success: true,
    segmentId,
    audioUrl: `/api/files/audio/segments/${fileName}`,
    laneUrl: `/api/files/audio/${lane}/${fileName}`,
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

async function generateAudioWithElevenLabs(
  text: string,
  lane: Lane,
  ssml?: string,
  voiceKey?: string,
  customVoiceSettings?: Partial<ElevenLabsVoiceSettings>,
  apiKey?: string,
  ssmlOptions?: { includeFootnotes?: boolean; customRate?: number; customPitch?: number }
): Promise<Buffer> {
  const key = apiKey || process.env.ELEVENLABS_API_KEY!;

  // Get voice configuration for the lane
  const voiceRegistry = getVoiceRegistry();
  const voiceId = voiceKey || getVoiceIdForLane(lane);
  const modelId = getModelIdForLane(lane);
  const laneVoiceSettings = getVoiceSettingsForLane(lane, customVoiceSettings);

  // Convert to ElevenLabs format
  const voiceSettings: ElevenLabsVoiceSettings = {
    stability: laneVoiceSettings.stability,
    similarity_boost: laneVoiceSettings.similarity_boost,
    style: laneVoiceSettings.style,
    use_speaker_boost: laneVoiceSettings.use_speaker_boost,
  };

  // Prepare the text/SSML content
  let content: string;
  let contentType: 'text' | 'ssml';

  if (ssml) {
    content = ssml;
    contentType = 'ssml';
  } else {
    // Generate SSML using the lane-aware system with full lexicon
    try {
      content = await generateSSMLWithLexicon(text, {
        lane,
        ...(ssmlOptions || {})
      });
      contentType = 'ssml';
    } catch (error) {
      console.warn('SSML generation failed, falling back to plain text:', error);
      content = text;
      contentType = 'text';
    }
  }

  // Prepare payload based on content type
  const payload: any = {
    model_id: modelId,
    voice_settings: voiceSettings,
  };

  if (contentType === 'ssml') {
    payload.text = extractTextFromSSML(content); // ElevenLabs expects text, not SSML directly
    // Note: ElevenLabs doesn't fully support SSML, but we can use the processed text
  } else {
    payload.text = content;
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': key,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ElevenLabs API error:', response.status, errorText);

    if (response.status === 401) {
      throw new Error('unauthorized');
    } else if (response.status === 429) {
      throw new Error('quota');
    } else {
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Helper function to preprocess texts for optimal processing
async function preprocessTextsForOptimalProcessing(textArray: string[], lane: Lane): Promise<Array<{text: string, originalIndex: number}>> {
  const maxChunkSize = 2000; // Max characters per chunk
  const processedTexts: Array<{text: string, originalIndex: number}> = [];

  for (let i = 0; i < textArray.length; i++) {
    const text = textArray[i];

    if (text.length <= maxChunkSize) {
      processedTexts.push({ text, originalIndex: i });
    } else {
      // Split long texts into smaller chunks at sentence boundaries
      const chunks = splitTextIntoOptimalChunks(text, maxChunkSize, lane);
      chunks.forEach(chunk => {
        processedTexts.push({ text: chunk, originalIndex: i });
      });
    }
  }

  return processedTexts;
}

// Split text into optimal chunks respecting sentence boundaries
function splitTextIntoOptimalChunks(text: string, maxSize: number, lane: Lane): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let currentChunk = '';

  // Different sentence splitting patterns for different lanes with capturing groups to preserve punctuation
  const sentenceDelimiters = lane === 'en'
    ? /([.!?])\s+/g
    : /([.!؟])\s+/g; // Include Arabic question mark

  // Split text while preserving punctuation using capturing groups
  const parts = text.split(sentenceDelimiters);
  const sentences: string[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const punctuation = parts[i + 1];
    if (sentence) {
      sentences.push(sentence + (punctuation || ''));
    }
  }

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length <= maxSize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If single sentence is too long, split by words
      if (sentence.length > maxSize) {
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (currentChunk.length + word.length + 1 <= maxSize) {
            currentChunk += (currentChunk ? ' ' : '') + word;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length > 0);
}

// Calculate appropriate delay between batches based on lane and batch size
function calculateBatchDelay(batchSize: number, lane: Lane): number {
  // Base delay in milliseconds
  const baseDelay = 500;

  // Lane-specific multipliers (Arabic processing might need more time)
  const laneMultiplier = {
    'en': 1.0,
    'ar_enhanced': 1.2,
    'ar_original': 1.5
  }[lane] || 1.0;

  // Batch size multiplier (larger batches need longer delays)
  const batchMultiplier = Math.min(batchSize / 5, 2.0);

  return Math.round(baseDelay * laneMultiplier * batchMultiplier);
}

// GET endpoint to retrieve available voices
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      // Detect environment for context-aware messaging
      const isProduction = process.env.NODE_ENV === 'production';
      const isDevelopment = process.env.NODE_ENV === 'development';

      // Check if TTS_PREVIEW_RETURNS_200 flag is set
      const previewReturns200 = process.env.TTS_PREVIEW_RETURNS_200 === 'true';

      const responseData = {
        success: false,
        previewMode: true,
        message: "Voice configuration is in preview-only mode",
        guidance: {
          reason: "ELEVENLABS_API_KEY not configured",
          impact: "Voice listing and configuration features are unavailable",
          solution: isProduction
            ? "Contact your administrator to configure the ElevenLabs API key"
            : "Set ELEVENLABS_API_KEY environment variable to enable voice management",
          documentation: "See DEPLOYMENT.md for setup instructions",
          environment: isProduction ? "production" : isDevelopment ? "development" : "unknown"
        },
        voices: [],
        currentConfig: {
          english_voice: "preview-mode",
          arabic_voice: "preview-mode",
          model: "preview-mode"
        },
        // Legacy error field for backward compatibility
        error: 'ElevenLabs API key not configured'
      };

      return NextResponse.json(
        responseData,
        { status: previewReturns200 ? 200 : 503 } // Return 200 if flag is set, otherwise 503
      );
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      voices: data.voices.map((voice: any) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
        description: voice.description,
        language: voice.labels?.language || 'unknown',
        accent: voice.labels?.accent || 'unknown',
        age: voice.labels?.age || 'unknown',
        gender: voice.labels?.gender || 'unknown',
      })),
      currentConfig: {
        english_voice: process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM',
        arabic_voice: process.env.ELEVENLABS_VOICE_ID_AR || 'pMsXgVXv3BLzUgSXRplE',
        model: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      },
    });

  } catch (error) {
    console.error('Error fetching voices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available voices' },
      { status: 500 }
    );
  }
}