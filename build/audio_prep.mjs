#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Prosody cues for natural narration
const PROSODY_RULES = {
  // Sentence endings
  sentenceEnd: '[pause]',
  questionEnd: '[pause]',
  exclamationEnd: '[pause]',

  // Paragraph breaks
  paragraphBreak: '[beat][beat]',

  // Islamic terms - add slight pause for reverence
  islamicTerms: {
    'Allah': 'Allah[beat]',
    'Qur\'an': 'Qur\'an[beat]',
    'Prophet': 'Prophet[beat]',
    'hadith': 'hadith[beat]',
    'sunnah': 'sunnah[beat]'
  },

  // Chapter transitions
  chapterTransition: '[beat][beat][beat]'
};

// Islamic terminology lexicon - IPA phonetic transcriptions as specified
const ISLAMIC_LEXICON = [
  { term: 'fitrah', ipa: 'fɪt.rɑː', notes: 'Natural human disposition toward God', alternates: 'fitra' },
  { term: 'nafs', ipa: 'næfs', notes: 'The soul or self', alternates: 'nafs' },
  { term: 'rūḥ', ipa: 'ruːħ', notes: 'The spirit', alternates: 'ruh' },
  { term: 'qalb', ipa: 'qɑlb', notes: 'The heart (spiritual center)', alternates: 'qalb' },
  { term: 'taqwā', ipa: 'tɑk.wɑː', notes: 'God-consciousness, piety', alternates: 'taqwa' },
  { term: 'dunyā', ipa: 'ˈdʊn.jɑː', notes: 'This worldly life', alternates: 'dunya' },
  { term: 'ākhirah', ipa: 'ˈɑː.xɪ.rɑ', notes: 'The hereafter', alternates: 'akhirah' },
  { term: 'Qur\'an', ipa: 'kʊrˈɑːn', notes: 'The holy book of Islam', alternates: 'Quran' },
  { term: 'ḥadīth', ipa: 'hæˈdiːθ', notes: 'Prophetic traditions', alternates: 'hadith' },
  { term: 'Muḥammad', ipa: 'muˈħæm.mæd', notes: 'The Prophet of Islam', alternates: 'Muhammad' },
  { term: 'jihād', ipa: 'dʒi.haːd', notes: 'Struggle, striving in the path of God', alternates: 'jihad' },
  { term: 'sabr', ipa: 'sabr', notes: 'Patience, perseverance', alternates: 'sabr' },
  { term: 'dhikr', ipa: 'ðikr', notes: 'Remembrance of God', alternates: 'zikr' },
  { term: 'salāh', ipa: 'sa.laːħ', notes: 'Prayer', alternates: 'salah' },
  { term: 'zakāh', ipa: 'za.kaːħ', notes: 'Obligatory charity', alternates: 'zakat' },
  { term: 'hajj', ipa: 'ħadʒdʒ', notes: 'Pilgrimage to Mecca', alternates: 'hajj' },
  { term: 'sawm', ipa: 'sawm', notes: 'Fasting', alternates: 'sawm' },
  { term: 'shahādah', ipa: 'ʃa.haː.da', notes: 'Declaration of faith', alternates: 'shahada' },
  { term: 'ummah', ipa: 'ʔum.ma', notes: 'Muslim community', alternates: 'ummah' },
  { term: 'sīrah', ipa: 'siː.ra', notes: 'Biography of the Prophet', alternates: 'sirah' }
];

async function buildAudioPrep() {
  console.log('Building audiobook preparation files...');

  try {
    // Read book metadata
    const bookMeta = JSON.parse(fs.readFileSync(path.join(projectRoot, 'book_meta.json'), 'utf8'));

    // Read manifest to get section order
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'manifest.json'), 'utf8'));

    // Read triview data if it exists, otherwise read individual sections
    let triviewData;
    const triviewPath = path.join(projectRoot, 'outputs', 'triview.json');

    if (fs.existsSync(triviewPath)) {
      triviewData = JSON.parse(fs.readFileSync(triviewPath, 'utf8'));
    } else {
      // Build triview data from individual section files
      triviewData = { sections: [] };

      for (const section of manifest.sections) {
        const sectionPath = path.join(projectRoot, 'data', 'sections', `${section.id}.json`);
        if (fs.existsSync(sectionPath)) {
          const sectionData = JSON.parse(fs.readFileSync(sectionPath, 'utf8'));
          triviewData.sections.push(sectionData);
        }
      }
    }

    // Ensure outputs/audiobook directory exists
    const audioDir = path.join(projectRoot, 'outputs', 'audiobook');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Generate narration scripts
    const { cleanScript, scriptWithCues } = generateNarrationScripts(triviewData, bookMeta);

    // Generate lexicon
    generateLexicon(audioDir);

    // Generate chapter structure
    const chapters = generateChapterStructure(triviewData, bookMeta);

    // Generate ElevenLabs manifest
    const elevenlabsManifest = generateElevenLabsManifest(triviewData, bookMeta, chapters);

    // Write all files
    fs.writeFileSync(
      path.join(audioDir, 'narration_script_en.md'),
      cleanScript,
      'utf8'
    );

    fs.writeFileSync(
      path.join(audioDir, 'narration_script_with_cues.md'),
      scriptWithCues,
      'utf8'
    );

    fs.writeFileSync(
      path.join(audioDir, 'chapters.json'),
      JSON.stringify(chapters, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(audioDir, 'elevenlabs_manifest.json'),
      JSON.stringify(elevenlabsManifest, null, 2),
      'utf8'
    );

    console.log('Audio preparation files generated successfully:');
    console.log('- narration_script_en.md');
    console.log('- narration_script_with_cues.md');
    console.log('- lexicon.csv');
    console.log('- chapters.json');
    console.log('- elevenlabs_manifest.json');

  } catch (error) {
    console.error('Error building audio preparation:', error);
    throw error;
  }
}

function transliterateArabic(arabicText) {
  // Simple transliteration mapping for common Arabic words
  const transliterationMap = {
    'الإنسان': 'Al-Insan',
    'القرآن': 'Quran',
    'الله': 'Allah',
    'النبي': 'The Prophet',
    'الصلاة': 'Prayer',
    'الزكاة': 'Zakat',
    'الحج': 'Hajj',
    'الصيام': 'Fasting'
  };

  // Return transliteration if available, otherwise return original
  return transliterationMap[arabicText] || arabicText;
}

function generateNarrationScripts(triviewData, bookMeta) {
  let cleanScript = `# ${bookMeta.title.english}\n\n`;
  let scriptWithCues = `# ${bookMeta.title.english} - Narration Script with Prosody Cues\n\n`;

  cleanScript += `By ${bookMeta.author.name_en}\n\n`;
  scriptWithCues += `By ${bookMeta.author.name_en}[beat][beat]\n\n`;

  for (const section of triviewData.sections) {
    // Use English title if available, otherwise transliterate Arabic
    let sectionTitle = section.title_en || section.title_english;
    if (!sectionTitle) {
      // Attempt transliteration if no English title available
      sectionTitle = transliterateArabic(section.title);
    }

    cleanScript += `## ${sectionTitle}\n\n`;
    scriptWithCues += `## ${sectionTitle}[beat][beat]\n\n`;

    // Process rows from the section
    for (const row of section.rows) {
      if (row.english && row.english.trim()) {
        let text = row.english.trim();

        // Clean script (no cues)
        cleanScript += text + '\n\n';

        // Script with prosody cues
        text = addProsodyCues(text);
        scriptWithCues += text + PROSODY_RULES.paragraphBreak + '\n\n';
      }
    }

    // Add chapter transition
    scriptWithCues += PROSODY_RULES.chapterTransition + '\n\n';
  }

  return { cleanScript, scriptWithCues };
}

function addProsodyCues(text) {
  let processedText = text;

  // Add beats for Islamic terms first (before sentence boundary processing)
  for (const [term, replacement] of Object.entries(PROSODY_RULES.islamicTerms)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    processedText = processedText.replace(regex, replacement);
  }

  // Add pauses at proper sentence boundaries only
  // Use regex to match sentence endings followed by whitespace and capital letter
  // Avoid abbreviations, decimals, and ellipses
  processedText = processedText.replace(/[.!?](?=\\s+[A-Z])/g, '$&[pause]');

  // Handle question marks and exclamation marks at end of sentences
  processedText = processedText.replace(/[?!](?=\\s|$)/g, '$&[pause]');

  // Preserve ellipses without adding pauses
  processedText = processedText.replace(/\\.{3}\\[pause\\]/g, '...');
  processedText = processedText.replace(/…\\[pause\\]/g, '…');

  return processedText;
}

function generateLexicon(audioDir) {
  // Check for custom lexicon overrides
  const customLexiconPath = path.join(audioDir, 'lexicon.custom.csv');
  let csvContent = 'term,ipa,notes,alternates\n';

  for (const entry of ISLAMIC_LEXICON) {
    csvContent += `"${entry.term}","${entry.ipa}","${entry.notes}","${entry.alternates}"\n`;
  }

  // Merge with custom lexicon if it exists
  if (fs.existsSync(customLexiconPath)) {
    const customContent = fs.readFileSync(customLexiconPath, 'utf8');
    // Skip header row and append custom entries
    const customLines = customContent.split('\n').slice(1).filter(line => line.trim());
    csvContent += customLines.join('\n');
  }

  fs.writeFileSync(
    path.join(audioDir, 'lexicon.csv'),
    csvContent,
    'utf8'
  );
}

function generateChapterStructure(triviewData, bookMeta) {
  const chapters = [];
  let currentRowId = 1;
  const secondsPerRow = 8; // Configurable duration estimate

  for (let i = 0; i < triviewData.sections.length; i++) {
    const section = triviewData.sections[i];

    // Count rows with English content
    const rowCount = section.rows.filter(row =>
      row.english && row.english.trim()
    ).length;

    const estimatedDuration = rowCount * secondsPerRow;

    // Handle empty chapters
    const startRowId = rowCount === 0 ? null : currentRowId;
    const endRowId = rowCount === 0 ? null : currentRowId + rowCount - 1;

    chapters.push({
      id: section.id,
      title: section.title,
      title_arabic: section.title, // Use same title for both since we only have one
      start_row_id: startRowId,
      end_row_id: endRowId,
      row_count: rowCount,
      estimated_duration_seconds: estimatedDuration,
      estimated_duration_formatted: formatDuration(estimatedDuration)
    });

    // Only increment currentRowId if there are rows
    if (rowCount > 0) {
      currentRowId += rowCount;
    }
  }

  return {
    book_title: bookMeta.title.english,
    total_chapters: chapters.length,
    total_estimated_duration: chapters.reduce((sum, ch) => sum + ch.estimated_duration_seconds, 0),
    chapters
  };
}

function generateElevenLabsManifest(triviewData, bookMeta, chaptersData) {
  const segments = [];
  let segmentId = 1;

  for (const section of triviewData.sections) {
    for (const row of section.rows) {
      if (row.english && row.english.trim()) {
        segments.push({
          id: `segment_${segmentId}`,
          text: row.english.trim(),
          chapter_id: section.id,
          row_id: row.id,
          output_filename: `chapter_${section.id}_segment_${row.id}.mp3`
        });
        segmentId++;
      }
    }
  }

  const totalCharacters = segments.reduce((sum, seg) => sum + seg.text.length, 0);
  const estimatedCost = (totalCharacters / 1000) * 0.30; // ElevenLabs pricing estimate

  return {
    project: {
      name: bookMeta.title.english,
      title_arabic: bookMeta.title.arabic,
      description: bookMeta.description.english,
      language: "en",
      voice_id: process.env.ELEVENLABS_VOICE_ID || "default_voice_id",
      created_date: new Date().toISOString()
    },
    voice_settings: {
      stability: 0.40,
      similarity_boost: 0.85,
      style: 0.10,
      use_speaker_boost: true
    },
    producer_settings: {
      clarity: 0.65
    },
    output_settings: {
      format: "mp3",
      quality: "high",
      sample_rate: 44100
    },
    chapters: chaptersData.chapters,
    segments: segments,
    total_segments: segments.length,
    metadata: {
      total_characters: totalCharacters,
      estimated_cost_usd: estimatedCost,
      processing_notes: "Generated automatically from section data with deterministic IDs"
    }
  };
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAudioPrep().catch(console.error);
}

export default buildAudioPrep;