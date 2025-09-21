import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

interface TTSRequest {
  text: string;
  language: 'ar' | 'en';
  rowId?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
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

    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required for text-to-speech generation' },
        { status: 400 }
      );
    }

    if (!body.language || !['ar', 'en'].includes(body.language)) {
      return NextResponse.json(
        { error: 'Language must be either "ar" or "en"' },
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

    // Generate a hash for caching
    const textHash = createHash('md5')
      .update(`${body.text}-${body.language}`)
      .digest('hex');

    const audioDir = join(process.cwd(), process.env.AUDIO_STORAGE_PATH || 'outputs/audio');
    const segmentsDir = join(audioDir, 'segments');

    // Ensure directories exist
    await fs.mkdir(segmentsDir, { recursive: true });

    // Check if we have a cached audio file
    const fileName = body.rowId ? `${body.rowId}.mp3` : `${textHash}.mp3`;
    const filePath = join(segmentsDir, fileName);

    try {
      // Check if file exists and is recent (within cache duration)
      const stats = await fs.stat(filePath);
      const cacheHours = parseInt(process.env.AUDIO_CACHE_DURATION_HOURS || '24');
      const maxAge = cacheHours * 60 * 60 * 1000; // Convert to milliseconds

      if (Date.now() - stats.mtime.getTime() < maxAge) {
        // Return cached file URL
        return NextResponse.json({
          success: true,
          audioUrl: `/outputs/audio/segments/${fileName}`,
          cached: true,
          generatedAt: stats.mtime.toISOString(),
        });
      }
    } catch {
      // File doesn't exist, continue with generation
    }

    // Generate audio using ElevenLabs API
    const audioBuffer = await generateAudioWithElevenLabs(body.text, body.language, body.voiceSettings);

    // Save audio file
    await fs.writeFile(filePath, audioBuffer);

    // Return the audio URL
    return NextResponse.json({
      success: true,
      audioUrl: `/outputs/audio/segments/${fileName}`,
      cached: false,
      generatedAt: new Date().toISOString(),
    });

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

async function generateAudioWithElevenLabs(
  text: string,
  language: 'ar' | 'en',
  customVoiceSettings?: Partial<ElevenLabsVoiceSettings>
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;

  // Select voice ID based on language
  const voiceId = language === 'en'
    ? process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM'  // Rachel (English)
    : process.env.ELEVENLABS_VOICE_ID_AR || 'pMsXgVXv3BLzUgSXRplE'; // Adam (Multilingual)

  // Voice settings with environment defaults
  const voiceSettings: ElevenLabsVoiceSettings = {
    stability: customVoiceSettings?.stability ?? parseFloat(process.env.ELEVENLABS_STABILITY || '0.4'),
    similarity_boost: customVoiceSettings?.similarity_boost ?? parseFloat(process.env.ELEVENLABS_SIMILARITY_BOOST || '0.85'),
    style: customVoiceSettings?.style ?? parseFloat(process.env.ELEVENLABS_STYLE || '0.1'),
    use_speaker_boost: customVoiceSettings?.use_speaker_boost ?? (process.env.ELEVENLABS_USE_SPEAKER_BOOST === 'true'),
  };

  const payload = {
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    voice_settings: voiceSettings,
  };

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
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