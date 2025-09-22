import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  getVoiceRegistry,
  getVoiceIdForLane,
  getVoiceSettingsForLane,
  getModelIdForLane,
  type Lane
} from '../../../lib/audio/voices';
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
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    // Rate limiting check for batch processing
    if (textArray.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 text segments allowed per request' },
        { status: 400 }
      );
    }

    const audioDir = join(process.cwd(), process.env.AUDIO_STORAGE_PATH || 'outputs/audio');
    const segmentsDir = join(audioDir, 'segments');
    const laneDir = join(audioDir, lane);

    // Ensure directories exist
    await fs.mkdir(segmentsDir, { recursive: true });
    await fs.mkdir(laneDir, { recursive: true });

    // Process each text segment
    const results = [];

    for (let i = 0; i < textArray.length; i++) {
      const text = textArray[i].trim();
      const segmentId = body.rowId
        ? `${body.rowId}_${lane}${textArray.length > 1 ? `_${i}` : ''}`
        : createHash('md5').update(`${text}-${lane}`).digest('hex');

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
        results.push(result);

        // Add delay between requests to respect rate limits
        if (i < textArray.length - 1 && textArray.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        console.error(`Error processing segment ${i}:`, error);
        results.push({
          success: false,
          segmentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Return single result for single text, array for batch
    if (textArray.length === 1) {
      return NextResponse.json(results[0]);
    } else {
      const successCount = results.filter(r => r.success).length;
      return NextResponse.json({
        success: successCount > 0,
        totalSegments: textArray.length,
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
    apiKey
  );

  // Save audio file to both locations
  await fs.writeFile(filePath, audioBuffer);
  if (laneDir) {
    await fs.writeFile(laneFilePath, audioBuffer);
  }

  return {
    success: true,
    segmentId,
    audioUrl: `/outputs/audio/segments/${fileName}`,
    laneUrl: `/outputs/audio/${lane}/${fileName}`,
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
  apiKey?: string
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
        ...ssmlOptions
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

// GET endpoint to retrieve available voices
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
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