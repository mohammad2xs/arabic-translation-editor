// Client-safe SSML utilities (no file system access)

export type Lane = 'en' | 'ar_enhanced' | 'ar_original';

export interface SSMLOptions {
  lane: Lane;
  includeFootnotes?: boolean;
  customRate?: number;
  customPitch?: number;
  lexiconOverrides?: Record<string, string>;
}

export interface ProsodySettings {
  rate: string;
  pitch: string;
  volume: string;
  emphasis?: 'strong' | 'moderate' | 'none' | 'reduced';
}

// Lane-specific prosody defaults
const LANE_PROSODY_DEFAULTS: Record<Lane, ProsodySettings> = {
  en: {
    rate: '+6%',
    pitch: 'medium',
    volume: 'medium',
    emphasis: 'moderate'
  },
  ar_enhanced: {
    rate: '-4%',
    pitch: '+2%',
    volume: 'medium',
    emphasis: 'strong'
  },
  ar_original: {
    rate: '-6%',
    pitch: 'medium',
    volume: '+5%',
    emphasis: 'strong'
  }
};

// Islamic terms that should have special pronunciation emphasis
const ISLAMIC_TERMS_EMPHASIS = [
  'Allah',
  'Qur\'an',
  'Prophet',
  'Muhammad',
  'hadith',
  'sunnah',
  'fitrah',
  'taqwā',
  'nafs',
  'rūḥ',
  'qalb',
  'dunyā',
  'ākhirah',
  'jihād',
  'sabr',
  'dhikr',
  'salāh',
  'zakāh',
  'hajj',
  'sawm',
  'shahādah',
  'ummah',
  'sīrah'
];

// Generate SSML markup for text with lane-aware prosody (client-safe)
export function generateSSML(text: string, options: SSMLOptions): string {
  const { lane, includeFootnotes = false, customRate, customPitch, lexiconOverrides = {} } = options;

  // Get prosody settings for the lane
  const prosodySettings = { ...LANE_PROSODY_DEFAULTS[lane] };

  // Apply custom overrides
  if (customRate !== undefined) {
    prosodySettings.rate = `${customRate > 0 ? '+' : ''}${customRate}%`;
  }
  if (customPitch !== undefined) {
    prosodySettings.pitch = `${customPitch > 0 ? '+' : ''}${customPitch}%`;
  }

  // Start building SSML
  let ssml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  ssml += '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="';

  // Set language based on lane
  switch (lane) {
    case 'en':
      ssml += 'en-US';
      break;
    case 'ar_enhanced':
    case 'ar_original':
      ssml += 'ar-SA';
      break;
  }

  ssml += '">\n';

  // Apply overall prosody
  ssml += `  <prosody rate="${prosodySettings.rate}" pitch="${prosodySettings.pitch}" volume="${prosodySettings.volume}">\n`;

  // Process text content
  let processedText = text;

  // Handle footnotes
  if (!includeFootnotes) {
    processedText = processedText.replace(/\[\d+\]/g, '');
    processedText = processedText.replace(/\(\d+\)/g, '');
  }

  // Apply pronunciation substitutions from lexicon overrides
  for (const [term, substitution] of Object.entries(lexiconOverrides)) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    processedText = processedText.replace(regex, substitution);
  }

  // Add emphasis for Islamic terms
  for (const term of ISLAMIC_TERMS_EMPHASIS) {
    if (!lexiconOverrides[term]) {
      const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
      processedText = processedText.replace(regex, `<emphasis level="${prosodySettings.emphasis}">${term}</emphasis>`);
    }
  }

  // Add natural pauses
  processedText = addNaturalPauses(processedText, lane);

  // Add the processed text
  ssml += `    ${processedText}\n`;

  // Close prosody and speak tags
  ssml += '  </prosody>\n';
  ssml += '</speak>';

  return ssml;
}

// Add natural pauses for better narration flow
function addNaturalPauses(text: string, lane: Lane): string {
  let processedText = text;

  const pauseLength = lane === 'en' ? '500ms' : '700ms';
  processedText = processedText.replace(/[.!?](?=\s+[A-Z])/g, `$&<break time="${pauseLength}"/>`);

  const commaLength = lane === 'en' ? '200ms' : '300ms';
  processedText = processedText.replace(/,(?=\s)/g, `$&<break time="${commaLength}"/>`);

  processedText = processedText.replace(/\n\s*\n/g, `<break time="1s"/>\n\n`);
  processedText = processedText.replace(/:(?=\s)/g, `$&<break time="300ms"/>`);

  return processedText;
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple text-to-SSML conversion
export function textToSSML(text: string, lane: Lane = 'en'): string {
  return generateSSML(text, { lane });
}

// Extract plain text from SSML
export function extractTextFromSSML(ssml: string): string {
  return ssml
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Estimate audio duration
export function estimateAudioDuration(text: string, lane: Lane): number {
  const cleanText = extractTextFromSSML(text);
  const charCount = cleanText.length;

  const baseSpeed = {
    en: 1000,
    ar_enhanced: 800,
    ar_original: 700
  }[lane];

  const prosody = LANE_PROSODY_DEFAULTS[lane];
  const rateMultiplier = parseFloat(prosody.rate.replace(/[+%]/g, '')) / 100 + 1;

  const adjustedSpeed = baseSpeed * rateMultiplier;
  const durationMinutes = charCount / adjustedSpeed;

  return Math.ceil(durationMinutes * 60);
}