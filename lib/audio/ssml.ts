// Dynamic imports for Node.js modules (server-side only)
// These will be imported conditionally when needed

export type Lane = 'en' | 'ar_enhanced' | 'ar_original';

export interface SSMLOptions {
  lane: Lane;
  includeFootnotes?: boolean;
  customRate?: number; // Optional override for rate
  customPitch?: number; // Optional override for pitch
  lexiconOverrides?: Record<string, string>; // Custom pronunciation overrides
}

export interface ProsodySettings {
  rate: string; // e.g., '+6%', '-4%', '100%'
  pitch: string; // e.g., 'medium', '+10%', '-5%'
  volume: string; // e.g., 'medium', '+10%', '-5%'
  emphasis?: 'strong' | 'moderate' | 'none' | 'reduced';
}

// Lane-specific prosody defaults
const LANE_PROSODY_DEFAULTS: Record<Lane, ProsodySettings> = {
  en: {
    rate: '+6%', // Slightly faster for English
    pitch: 'medium', // Neutral pitch
    volume: 'medium',
    emphasis: 'moderate'
  },
  ar_enhanced: {
    rate: '-4%', // Slower for clearer articulation
    pitch: '+2%', // Slightly higher for clarity
    volume: 'medium',
    emphasis: 'strong'
  },
  ar_original: {
    rate: '-6%', // Slowest for maximum clarity of classical Arabic
    pitch: 'medium',
    volume: '+5%', // Slightly louder
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

// Load lexicon for pronunciation overrides (server-side only)
async function loadLexicon(): Promise<Record<string, { ipa: string; phoneme?: string }>> {
  // Only load lexicon on server-side
  if (typeof window !== 'undefined') {
    // Client-side: return empty lexicon
    return {};
  }

  try {
    // Dynamic import of Node.js modules
    const { readFileSync } = await import('fs');
    const { join } = await import('path');

    const lexiconPath = join(process.cwd(), 'lib', 'audio', 'lexicon.json');
    const lexiconData = JSON.parse(readFileSync(lexiconPath, 'utf8'));

    const lexiconMap: Record<string, { ipa: string; phoneme?: string }> = {};

    for (const entry of lexiconData.terms) {
      lexiconMap[entry.term] = {
        ipa: entry.ipa,
        phoneme: entry.phoneme
      };

      // Also add alternates
      if (entry.alternates) {
        for (const alt of entry.alternates) {
          lexiconMap[alt] = {
            ipa: entry.ipa,
            phoneme: entry.phoneme
          };
        }
      }
    }

    return lexiconMap;
  } catch (error) {
    console.warn('Could not load lexicon:', error);
    return {};
  }
}

// Generate SSML markup for text with lane-aware prosody
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

  // Use only lexicon overrides for client-side compatibility
  const lexicon = lexiconOverrides;

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
    // Remove footnote markers and content
    processedText = processedText.replace(/\[\d+\]/g, ''); // Remove [1], [2], etc.
    processedText = processedText.replace(/\(\d+\)/g, ''); // Remove (1), (2), etc.
  }

  // Apply pronunciation substitutions from lexicon overrides
  for (const [term, substitution] of Object.entries(lexicon)) {
    const replacement = typeof substitution === 'string'
      ? substitution
      : `<phoneme alphabet="ipa" ph="${substitution.ipa}">${term}</phoneme>`;

    // Use word boundary regex for exact matches
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    processedText = processedText.replace(regex, replacement);
  }

  // Add emphasis for Islamic terms
  for (const term of ISLAMIC_TERMS_EMPHASIS) {
    if (!lexicon[term]) { // Don't double-process terms already in lexicon
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

  // Sentence endings - use appropriate pause length based on lane
  const pauseLength = lane === 'en' ? '500ms' : '700ms'; // Longer pauses for Arabic

  // Add pauses after sentence endings
  if (lane === 'en') {
    // English: Look for punctuation followed by capital letters
    processedText = processedText.replace(/[.!?](?=\s+[A-Z])/g, `$&<break time="${pauseLength}"/>`);
  } else {
    // Arabic: Use different punctuation and patterns
    // Arabic question mark ؟ and regular punctuation followed by whitespace
    processedText = processedText.replace(/[.!؟](?=\s)/g, `$&<break time="${pauseLength}"/>`);
    // Also handle end of lines and Arabic sentence patterns
    processedText = processedText.replace(/[.!؟](?=\n)/g, `$&<break time="${pauseLength}"/>`);
    processedText = processedText.replace(/[.!؟]$/gm, `$&<break time="${pauseLength}"/>`);
  }

  // Add shorter pauses after commas and Arabic comma ،
  const commaLength = lane === 'en' ? '200ms' : '300ms';
  if (lane === 'en') {
    processedText = processedText.replace(/,(?=\s)/g, `$&<break time="${commaLength}"/>`);
  } else {
    // Handle both regular comma and Arabic comma
    processedText = processedText.replace(/[,،](?=\s)/g, `$&<break time="${commaLength}"/>`);
  }

  // Add longer pauses for paragraph breaks (indicated by double newlines)
  processedText = processedText.replace(/\n\s*\n/g, `<break time="1s"/>\n\n`);

  // Add emphasis breaks for colons (indicating explanations)
  processedText = processedText.replace(/:(?=\s)/g, `$&<break time="300ms"/>`);
  // Arabic colon is sometimes used differently
  if (lane !== 'en') {
    processedText = processedText.replace(/؛(?=\s)/g, `$&<break time="300ms"/>`); // Arabic semicolon
  }

  return processedText;
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build simple text-to-SSML for quick conversion
export function textToSSML(text: string, lane: Lane = 'en'): string {
  return generateSSML(text, { lane });
}

// Generate SSML with server-side lexicon loading (for API routes)
export async function generateSSMLWithLexicon(text: string, options: SSMLOptions): Promise<string> {
  // Load lexicon from file system (server-side only)
  const lexicon = await loadLexicon();

  // Merge with provided overrides
  const combinedOverrides = { ...lexicon, ...options.lexiconOverrides };

  // Generate SSML with full lexicon
  return generateSSML(text, { ...options, lexiconOverrides: combinedOverrides });
}

// Build SSML with custom prosody settings
export function buildSSMLWithProsody(
  text: string,
  lane: Lane,
  prosody: Partial<ProsodySettings>
): string {
  const options: SSMLOptions = {
    lane,
    customRate: prosody.rate ? parseFloat(prosody.rate.replace(/[+%]/g, '')) : undefined,
    customPitch: prosody.pitch ? parseFloat(prosody.pitch.replace(/[+%]/g, '')) : undefined
  };

  return generateSSML(text, options);
}

// Validate SSML markup
export function validateSSML(ssml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for required elements
  if (!ssml.includes('<speak')) {
    errors.push('Missing <speak> root element');
  }

  if (!ssml.includes('</speak>')) {
    errors.push('Missing closing </speak> tag');
  }

  // Check for unclosed tags (basic validation)
  const openTags = ssml.match(/<[^/][^>]*>/g) || [];
  const closeTags = ssml.match(/<\/[^>]*>/g) || [];

  if (openTags.length !== closeTags.length) {
    errors.push('Mismatched opening and closing tags');
  }

  // Check for invalid characters that might break TTS
  if (ssml.includes('&') && !ssml.includes('&amp;') && !ssml.includes('&lt;') && !ssml.includes('&gt;')) {
    errors.push('Unescaped ampersand detected - use &amp; instead');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Extract plain text from SSML for length estimation
export function extractTextFromSSML(ssml: string): string {
  return ssml
    .replace(/<[^>]*>/g, '') // Remove all XML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Estimate audio duration based on text length and lane settings
export function estimateAudioDuration(text: string, lane: Lane): number {
  const cleanText = extractTextFromSSML(text);
  const charCount = cleanText.length;

  // Base reading speed (characters per minute)
  const baseSpeed = {
    en: 1000, // ~200 words per minute
    ar_enhanced: 800, // Slower for enhanced clarity
    ar_original: 700 // Slowest for classical Arabic
  }[lane];

  // Apply prosody rate adjustments
  const prosody = LANE_PROSODY_DEFAULTS[lane];
  const rateMultiplier = parseFloat(prosody.rate.replace(/[+%]/g, '')) / 100 + 1;

  const adjustedSpeed = baseSpeed * rateMultiplier;
  const durationMinutes = charCount / adjustedSpeed;

  return Math.ceil(durationMinutes * 60); // Return seconds
}