// @ts-nocheck
// Dynamic imports for Node.js modules (server-side only)
// These will be imported conditionally when needed

export type { Lane } from './types';

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

// Lane-specific prosody defaults optimized for ElevenLabs voices
const LANE_PROSODY_DEFAULTS: Record<Lane, ProsodySettings> = {
  en: {
    rate: '+8%', // Slightly faster for English fluency
    pitch: 'medium', // Neutral pitch for clear narration
    volume: 'medium',
    emphasis: 'moderate'
  },
  ar_enhanced: {
    rate: '-2%', // Slightly slower for enhanced Arabic clarity
    pitch: '+3%', // Slightly higher for better articulation
    volume: '+2%', // Slightly louder for emphasis
    emphasis: 'strong'
  },
  ar_original: {
    rate: '-8%', // Much slower for classical Arabic pronunciation
    pitch: '+1%', // Slightly raised for reverent tone
    volume: '+8%', // Noticeably louder for emphasis
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
  // Only run on server side
  if (typeof window !== 'undefined') {
    return {};
  }

  try {
    // Only load on server side
    if (typeof window !== 'undefined') {
      return {};
    }
    
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

  // Apply pronunciation substitutions from lexicon overrides with better handling
  for (const [term, substitution] of Object.entries(lexicon)) {
    let replacement: string;

    if (typeof substitution === 'string') {
      replacement = substitution;
    } else if (substitution.phoneme) {
      // Use phoneme over IPA for better TTS compatibility
      replacement = `<phoneme alphabet="x-sampa" ph="${substitution.phoneme}">${term}</phoneme>`;
    } else if (substitution.ipa) {
      replacement = `<phoneme alphabet="ipa" ph="${substitution.ipa}">${term}</phoneme>`;
    } else {
      continue; // Skip invalid entries
    }

    // Use word boundary regex for exact matches, preserve case
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    processedText = processedText.replace(regex, (match) => {
      // Preserve original case in the replacement
      if (match === term) return replacement;
      if (match === term.toLowerCase()) return replacement.toLowerCase();
      if (match === term.toUpperCase()) return replacement.toUpperCase();
      // For mixed case, use title case
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    });
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

  // Lane-specific pause configurations
  const pauseConfig = {
    en: {
      sentence: '600ms',
      comma: '250ms',
      paragraph: '1.2s',
      colon: '350ms',
      semicolon: '300ms'
    },
    ar_enhanced: {
      sentence: '800ms',
      comma: '350ms',
      paragraph: '1.5s',
      colon: '400ms',
      semicolon: '350ms'
    },
    ar_original: {
      sentence: '1s',
      comma: '400ms',
      paragraph: '2s',
      colon: '500ms',
      semicolon: '450ms'
    }
  }[lane];

  // Add pauses after sentence endings
  if (lane === 'en') {
    // English: Look for punctuation followed by capital letters or whitespace
    processedText = processedText.replace(/[.!?](?=\s+[A-Z])/g, `$&<break time="${pauseConfig.sentence}"/>`);
    processedText = processedText.replace(/[.!?](?=\s+$)/gm, `$&<break time="${pauseConfig.sentence}"/>`);
  } else {
    // Arabic: Use Arabic-specific punctuation patterns
    processedText = processedText.replace(/[.!؟](?=\s)/g, `$&<break time="${pauseConfig.sentence}"/>`);
    processedText = processedText.replace(/[.!؟](?=\n)/g, `$&<break time="${pauseConfig.sentence}"/>`);
    processedText = processedText.replace(/[.!؟]$/gm, `$&<break time="${pauseConfig.sentence}"/>`);
  }

  // Add pauses after commas (including Arabic comma)
  if (lane === 'en') {
    processedText = processedText.replace(/,(?=\s)/g, `$&<break time="${pauseConfig.comma}"/>`);
  } else {
    // Handle both regular comma and Arabic comma ،
    processedText = processedText.replace(/[,،](?=\s)/g, `$&<break time="${pauseConfig.comma}"/>`);
  }

  // Add longer pauses for paragraph breaks
  processedText = processedText.replace(/\n\s*\n/g, `<break time="${pauseConfig.paragraph}"/>\n\n`);

  // Add emphasis breaks for colons and explanatory punctuation
  processedText = processedText.replace(/:(?=\s)/g, `$&<break time="${pauseConfig.colon}"/>`);

  // Handle semicolons and Arabic semicolon
  processedText = processedText.replace(/;(?=\s)/g, `$&<break time="${pauseConfig.semicolon}"/>`);
  if (lane !== 'en') {
    processedText = processedText.replace(/؛(?=\s)/g, `$&<break time="${pauseConfig.semicolon}"/>`);
  }

  // Add subtle pauses after quotation marks for better flow
  processedText = processedText.replace(/"(?=\s)/g, `$&<break time="200ms"/>`);
  processedText = processedText.replace(/'(?=\s)/g, `$&<break time="200ms"/>`);

  // Add breathing pauses after long sentences (more than 100 characters)
  const sentences = processedText.split(/(?<=[.!?؟])/);
  processedText = sentences.map(sentence => {
    if (sentence.trim().length > 100 && !sentence.includes('<break')) {
      return sentence.replace(/([.!?؟])(\s*)$/, `$1<break time="200ms"/>$2`);
    }
    return sentence;
  }).join('');

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

// Enhanced SSML validation with comprehensive checks
export function validateSSML(ssml: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required elements
  if (!ssml.includes('<speak')) {
    errors.push('Missing <speak> root element');
  }

  if (!ssml.includes('</speak>')) {
    errors.push('Missing closing </speak> tag');
  }

  // Check for proper XML structure
  try {
    // Basic XML structure validation
    const speakMatch = ssml.match(/<speak[^>]*>/);
    if (speakMatch && !speakMatch[0].includes('xmlns=')) {
      warnings.push('Missing xmlns namespace declaration in <speak> element');
    }

    if (speakMatch && !speakMatch[0].includes('xml:lang=')) {
      warnings.push('Missing xml:lang attribute in <speak> element');
    }
  } catch (error) {
    errors.push('Invalid XML structure');
  }

  // Check for unclosed tags (improved validation)
  const selfClosingTags = ['break', 'phoneme'];
  const openTags = ssml.match(/<(?!\/)([^\s>]+)[^>]*>/g) || [];
  const closeTags = ssml.match(/<\/[^>]+>/g) || [];
  const selfClosing = ssml.match(/<[^>]+\/>/g) || [];

  // Filter out self-closing tags
  const actualOpenTags = openTags.filter(tag => {
    const tagName = tag.match(/<([^\s>]+)/)?.[1];
    return !selfClosingTags.includes(tagName || '') && !tag.endsWith('/>');
  });

  if (actualOpenTags.length !== closeTags.length) {
    errors.push(`Mismatched opening and closing tags: ${actualOpenTags.length} open, ${closeTags.length} close`);
  }

  // Check for invalid characters that might break TTS
  if (ssml.includes('&') && !/&(amp|lt|gt|quot|apos);/.test(ssml)) {
    errors.push('Unescaped special characters detected - use XML entities (&amp;, &lt;, &gt;)');
  }

  // Check for extremely long content that might cause issues
  const textContent = extractTextFromSSML(ssml);
  if (textContent.length > 5000) {
    warnings.push(`Text content is very long (${textContent.length} characters) - consider splitting into smaller segments`);
  }

  // Check for excessive nested tags
  const maxNestingDepth = 5;
  let currentDepth = 0;
  let maxDepth = 0;

  for (const char of ssml) {
    if (char === '<') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '>') {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }

  if (maxDepth > maxNestingDepth) {
    warnings.push(`Deep tag nesting detected (depth: ${maxDepth}) - may cause TTS issues`);
  }

  // Check for potentially problematic break times
  const breakMatches = ssml.match(/<break time="([^"]+)"/g) || [];
  for (const breakTag of breakMatches) {
    const time = breakTag.match(/time="([^"]+)"/)?.[1];
    if (time) {
      const numericValue = parseFloat(time);
      if (numericValue > 10) {
        warnings.push(`Very long break time detected: ${time} - may cause awkward pauses`);
      }
    }
  }

  // Check for valid prosody values
  const prosodyMatches = ssml.match(/<prosody[^>]*>/g) || [];
  for (const prosodyTag of prosodyMatches) {
    if (prosodyTag.includes('rate=')) {
      const rate = prosodyTag.match(/rate="([^"]+)"/)?.[1];
      if (rate && !rate.match(/^(\+|-)?(\d+%|x-slow|slow|medium|fast|x-fast)$/)) {
        warnings.push(`Invalid prosody rate value: ${rate}`);
      }
    }
    if (prosodyTag.includes('pitch=')) {
      const pitch = prosodyTag.match(/pitch="([^"]+)"/)?.[1];
      if (pitch && !pitch.match(/^(\+|-)?(\d+%|\d+Hz|x-low|low|medium|high|x-high)$/)) {
        warnings.push(`Invalid prosody pitch value: ${pitch}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
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