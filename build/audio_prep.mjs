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

// Load Islamic terminology lexicon from JSON
function loadIslamicLexicon() {
  const lexiconPath = path.join(projectRoot, 'lib', 'audio', 'lexicon.json');

  try {
    const lexiconData = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'));

    // Convert from JSON format to the format expected by this script
    return lexiconData.terms.map(entry => ({
      term: entry.term,
      ipa: entry.ipa,
      notes: entry.notes,
      alternates: Array.isArray(entry.alternates) ? entry.alternates.join(', ') : entry.alternates || ''
    }));
  } catch (error) {
    console.warn('Could not load lexicon from JSON, using fallback:', error.message);

    // Fallback to basic hardcoded lexicon
    return [
      { term: 'Allah', ipa: 'ʔaɫ.ɫaːh', notes: 'God in Arabic', alternates: '' },
      { term: 'Qur\'an', ipa: 'kʊrˈɑːn', notes: 'The holy book of Islam', alternates: 'Quran' },
      { term: 'Prophet', ipa: 'ˈprɒf.ɪt', notes: 'Messenger of God', alternates: '' },
      { term: 'hadith', ipa: 'hæˈdiːθ', notes: 'Prophetic traditions', alternates: '' },
      { term: 'sunnah', ipa: 'ˈsun.na', notes: 'Way or practice of the Prophet', alternates: 'sunna' }
    ];
  }
}

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

    // Supported lanes
    const lanes = ['en', 'ar_enhanced', 'ar_original'];

    // Generate lane-specific narration scripts and manifests
    for (const lane of lanes) {
      console.log(`Generating files for lane: ${lane}`);

      // Create lane-specific directory
      const laneDir = path.join(audioDir, lane);
      if (!fs.existsSync(laneDir)) {
        fs.mkdirSync(laneDir, { recursive: true });
      }

      // Generate narration scripts per lane
      const { cleanScript, scriptWithCues, scriptWithRowIds } = generateNarrationScriptsForLane(triviewData, bookMeta, lane);

      // Generate lane-specific lexicon
      generateLexiconForLane(laneDir, lane);

      // Generate chapter structure with lane data
      const chapters = generateChapterStructureForLane(triviewData, bookMeta, lane);

      // Generate lane-specific ElevenLabs manifest
      const elevenlabsManifest = generateElevenLabsManifestForLane(triviewData, bookMeta, chapters, lane);

      // Generate job runner manifest with row IDs and timestamps
      const jobManifest = generateJobManifest(triviewData, bookMeta, lane);

      // Write lane-specific files
      fs.writeFileSync(
        path.join(laneDir, `narration_script_${lane}.md`),
        cleanScript,
        'utf8'
      );

      fs.writeFileSync(
        path.join(laneDir, `narration_script_with_cues_${lane}.md`),
        scriptWithCues,
        'utf8'
      );

      fs.writeFileSync(
        path.join(laneDir, `narration_script_with_ids_${lane}.md`),
        scriptWithRowIds,
        'utf8'
      );

      fs.writeFileSync(
        path.join(laneDir, `chapters_${lane}.json`),
        JSON.stringify(chapters, null, 2),
        'utf8'
      );

      fs.writeFileSync(
        path.join(laneDir, `elevenlabs_manifest_${lane}.json`),
        JSON.stringify(elevenlabsManifest, null, 2),
        'utf8'
      );

      fs.writeFileSync(
        path.join(laneDir, `job_manifest_${lane}.json`),
        JSON.stringify(jobManifest, null, 2),
        'utf8'
      );

      console.log(`Lane ${lane} files generated:`, Object.keys({
        [`narration_script_${lane}.md`]: true,
        [`narration_script_with_cues_${lane}.md`]: true,
        [`narration_script_with_ids_${lane}.md`]: true,
        [`lexicon_${lane}.csv`]: true,
        [`chapters_${lane}.json`]: true,
        [`elevenlabs_manifest_${lane}.json`]: true,
        [`job_manifest_${lane}.json`]: true
      }));
    }

    // Generate master manifest for all lanes
    const masterManifest = generateMasterManifest(triviewData, bookMeta, lanes);
    fs.writeFileSync(
      path.join(audioDir, 'master_manifest.json'),
      JSON.stringify(masterManifest, null, 2),
      'utf8'
    );

    console.log('Multi-lane audio preparation completed successfully!');
    console.log('Generated files for lanes:', lanes.join(', '));

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

// Lane-specific narration script generation
function generateNarrationScriptsForLane(triviewData, bookMeta, lane) {
  const langTitle = lane === 'en' ? bookMeta.title.english : bookMeta.title.arabic;
  const langAuthor = lane === 'en' ? bookMeta.author.name_en : bookMeta.author.name_ar;

  let cleanScript = `# ${langTitle}\n\n`;
  let scriptWithCues = `# ${langTitle} - Narration Script with Prosody Cues (${lane.toUpperCase()})\n\n`;
  let scriptWithRowIds = `# ${langTitle} - Narration Script with Row IDs (${lane.toUpperCase()})\n\n`;

  cleanScript += `By ${langAuthor}\n\n`;
  scriptWithCues += `By ${langAuthor}[beat][beat]\n\n`;
  scriptWithRowIds += `By ${langAuthor}\n\n`;

  let currentRowId = 1;

  for (const section of triviewData.sections) {
    // Get appropriate title for lane
    let sectionTitle;
    if (lane === 'en') {
      sectionTitle = section.title_en || section.title_english || transliterateArabic(section.title);
    } else {
      sectionTitle = section.title || section.title_arabic;
    }

    cleanScript += `## ${sectionTitle}\n\n`;
    scriptWithCues += `## ${sectionTitle}[beat][beat]\n\n`;
    scriptWithRowIds += `## ${sectionTitle}\n\n`;

    // Process rows from the section based on lane
    for (const row of section.rows) {
      let text;
      let hasContent = false;

      switch (lane) {
        case 'en':
          text = row.english;
          hasContent = text && text.trim();
          break;
        case 'ar_enhanced':
          text = row.enhanced || row.arabic_enhanced;
          hasContent = text && text.trim();
          break;
        case 'ar_original':
          text = row.original || row.arabic_original;
          hasContent = text && text.trim();
          break;
      }

      if (hasContent) {
        text = text.trim();

        // Clean script (no cues)
        cleanScript += text + '\n\n';

        // Script with prosody cues
        const textWithCues = addProsodyCues(text);
        scriptWithCues += textWithCues + PROSODY_RULES.paragraphBreak + '\n\n';

        // Script with row IDs for job processing
        const timestamp = new Date().toISOString();
        scriptWithRowIds += `<!-- ROW_ID: ${row.id || currentRowId} | SECTION: ${section.id} | TIMESTAMP: ${timestamp} -->\n`;
        scriptWithRowIds += text + '\n\n';

        currentRowId++;
      }
    }

    // Add chapter transition
    scriptWithCues += PROSODY_RULES.chapterTransition + '\n\n';
    scriptWithRowIds += `<!-- SECTION_END: ${section.id} -->\n\n`;
  }

  return { cleanScript, scriptWithCues, scriptWithRowIds };
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
  // Load lexicon from JSON
  const islamicLexicon = loadIslamicLexicon();

  // Check for custom lexicon overrides
  const customLexiconPath = path.join(audioDir, 'lexicon.custom.csv');
  let csvContent = 'term,ipa,notes,alternates\n';

  for (const entry of islamicLexicon) {
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

// Lane-specific lexicon generation
function generateLexiconForLane(laneDir, lane) {
  // Load lexicon from JSON
  const islamicLexicon = loadIslamicLexicon();

  let csvContent = 'term,ipa,notes,alternates\n';

  // Filter lexicon based on lane
  let relevantLexicon = islamicLexicon;
  if (lane === 'en') {
    // For English, include transliterated terms
    relevantLexicon = islamicLexicon.filter(entry =>
      entry.alternates && entry.alternates.length > 0
    );
  }

  for (const entry of relevantLexicon) {
    csvContent += `"${entry.term}","${entry.ipa}","${entry.notes}","${entry.alternates}"\n`;
  }

  // Check for lane-specific custom lexicon
  const customLexiconPath = path.join(laneDir, `lexicon.custom_${lane}.csv`);
  if (fs.existsSync(customLexiconPath)) {
    const customContent = fs.readFileSync(customLexiconPath, 'utf8');
    const customLines = customContent.split('\n').slice(1).filter(line => line.trim());
    csvContent += customLines.join('\n');
  }

  fs.writeFileSync(
    path.join(laneDir, `lexicon_${lane}.csv`),
    csvContent,
    'utf8'
  );
}

// Lane-specific chapter structure generation
function generateChapterStructureForLane(triviewData, bookMeta, lane) {
  const chapters = [];
  let currentRowId = 1;
  const secondsPerRow = lane === 'en' ? 6 : 8; // Faster for English

  for (let i = 0; i < triviewData.sections.length; i++) {
    const section = triviewData.sections[i];

    // Count rows with content for the specific lane
    let rowCount = 0;
    for (const row of section.rows) {
      let hasContent = false;
      switch (lane) {
        case 'en':
          hasContent = row.english && row.english.trim();
          break;
        case 'ar_enhanced':
          hasContent = (row.enhanced || row.arabic_enhanced) && (row.enhanced || row.arabic_enhanced).trim();
          break;
        case 'ar_original':
          hasContent = (row.original || row.arabic_original) && (row.original || row.arabic_original).trim();
          break;
      }
      if (hasContent) rowCount++;
    }

    const estimatedDuration = rowCount * secondsPerRow;

    // Handle empty chapters
    const startRowId = rowCount === 0 ? null : currentRowId;
    const endRowId = rowCount === 0 ? null : currentRowId + rowCount - 1;

    // Get appropriate title for lane
    let sectionTitle;
    if (lane === 'en') {
      sectionTitle = section.title_en || section.title_english || transliterateArabic(section.title);
    } else {
      sectionTitle = section.title || section.title_arabic;
    }

    chapters.push({
      id: section.id,
      title: sectionTitle,
      title_lane: sectionTitle,
      lane,
      start_row_id: startRowId,
      end_row_id: endRowId,
      row_count: rowCount,
      estimated_duration_seconds: estimatedDuration,
      estimated_duration_formatted: formatDuration(estimatedDuration)
    });

    if (rowCount > 0) {
      currentRowId += rowCount;
    }
  }

  const langTitle = lane === 'en' ? bookMeta.title.english : bookMeta.title.arabic;

  return {
    book_title: langTitle,
    lane,
    total_chapters: chapters.length,
    total_estimated_duration: chapters.reduce((sum, ch) => sum + ch.estimated_duration_seconds, 0),
    chapters
  };
}

// Lane-specific ElevenLabs manifest generation
function generateElevenLabsManifestForLane(triviewData, bookMeta, chaptersData, lane) {
  const segments = [];
  let segmentId = 1;

  for (const section of triviewData.sections) {
    for (const row of section.rows) {
      let text;
      let hasContent = false;

      switch (lane) {
        case 'en':
          text = row.english;
          hasContent = text && text.trim();
          break;
        case 'ar_enhanced':
          text = row.enhanced || row.arabic_enhanced;
          hasContent = text && text.trim();
          break;
        case 'ar_original':
          text = row.original || row.arabic_original;
          hasContent = text && text.trim();
          break;
      }

      if (hasContent) {
        segments.push({
          id: `segment_${segmentId}`,
          text: text.trim(),
          chapter_id: section.id,
          row_id: row.id || `row_${segmentId}`,
          lane,
          output_filename: `${lane}_chapter_${section.id}_segment_${row.id || segmentId}.mp3`
        });
        segmentId++;
      }
    }
  }

  const totalCharacters = segments.reduce((sum, seg) => sum + seg.text.length, 0);
  const estimatedCost = (totalCharacters / 1000) * 0.30; // ElevenLabs pricing estimate

  const langTitle = lane === 'en' ? bookMeta.title.english : bookMeta.title.arabic;
  const langDescription = lane === 'en' ? bookMeta.description.english : bookMeta.description.arabic;

  return {
    project: {
      name: `${langTitle} (${lane.toUpperCase()})`,
      title_lane: langTitle,
      description: langDescription,
      language: lane === 'en' ? 'en' : 'ar',
      lane,
      voice_id: getVoiceIdForLane(lane),
      created_date: new Date().toISOString()
    },
    voice_settings: getVoiceSettingsForLane(lane),
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
      processing_notes: `Generated automatically for lane ${lane} with deterministic IDs`
    }
  };
}

// Job manifest generation for batch processing
function generateJobManifest(triviewData, bookMeta, lane) {
  const segments = [];
  let segmentIndex = 0;

  for (const section of triviewData.sections) {
    for (const row of section.rows) {
      let text;
      let hasContent = false;

      switch (lane) {
        case 'en':
          text = row.english;
          hasContent = text && text.trim();
          break;
        case 'ar_enhanced':
          text = row.enhanced || row.arabic_enhanced;
          hasContent = text && text.trim();
          break;
        case 'ar_original':
          text = row.original || row.arabic_original;
          hasContent = text && text.trim();
          break;
      }

      if (hasContent) {
        segments.push({
          index: segmentIndex,
          rowId: row.id || `row_${segmentIndex}`,
          sectionId: section.id,
          text: text.trim(),
          lane,
          timestamp: new Date().toISOString(),
          estimatedDuration: Math.ceil(text.trim().length / 10), // Rough estimate
          metadata: {
            charCount: text.trim().length,
            wordCount: text.trim().split(/\s+/).length
          }
        });
        segmentIndex++;
      }
    }
  }

  const langTitle = lane === 'en' ? bookMeta.title.english : bookMeta.title.arabic;

  return {
    jobInfo: {
      title: `${langTitle} (${lane.toUpperCase()})`,
      lane,
      scope: 'book',
      createdAt: new Date().toISOString(),
      totalSegments: segments.length
    },
    segments,
    summary: {
      totalCharacters: segments.reduce((sum, seg) => sum + seg.metadata.charCount, 0),
      totalWords: segments.reduce((sum, seg) => sum + seg.metadata.wordCount, 0),
      estimatedTotalDuration: segments.reduce((sum, seg) => sum + seg.estimatedDuration, 0)
    }
  };
}

// Master manifest generation
function generateMasterManifest(triviewData, bookMeta, lanes) {
  return {
    project: {
      title: bookMeta.title.english,
      title_arabic: bookMeta.title.arabic,
      author: bookMeta.author.name_en,
      author_arabic: bookMeta.author.name_ar,
      description: bookMeta.description.english,
      description_arabic: bookMeta.description.arabic,
      createdAt: new Date().toISOString()
    },
    lanes: lanes.map(lane => ({
      lane,
      displayName: lane === 'en' ? 'English' : lane === 'ar_enhanced' ? 'Arabic Enhanced' : 'Arabic Original',
      manifestFile: `${lane}/elevenlabs_manifest_${lane}.json`,
      jobManifestFile: `${lane}/job_manifest_${lane}.json`,
      chaptersFile: `${lane}/chapters_${lane}.json`
    })),
    sections: triviewData.sections.map(section => ({
      id: section.id,
      title: section.title,
      title_english: section.title_en || section.title_english,
      rowCount: section.rows ? section.rows.length : 0
    })),
    statistics: {
      totalSections: triviewData.sections.length,
      totalLanes: lanes.length,
      generatedAt: new Date().toISOString()
    }
  };
}

// Helper functions for voice configuration
function getVoiceIdForLane(lane) {
  switch (lane) {
    case 'en':
      return process.env.ELEVENLABS_VOICE_ID_EN || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    case 'ar_enhanced':
      return process.env.ELEVENLABS_VOICE_ID_AR_ENHANCED || 'pNInz6obpgDQGcFmaJgB'; // Adam
    case 'ar_original':
      return process.env.ELEVENLABS_VOICE_ID_AR_ORIGINAL || 'pNInz6obpgDQGcFmaJgB'; // Adam
    default:
      return process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  }
}

function getVoiceSettingsForLane(lane) {
  switch (lane) {
    case 'en':
      return {
        stability: 0.45,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true
      };
    case 'ar_enhanced':
      return {
        stability: 0.55,
        similarity_boost: 0.90,
        style: 0.10,
        use_speaker_boost: true
      };
    case 'ar_original':
      return {
        stability: 0.65,
        similarity_boost: 0.95,
        style: 0.05,
        use_speaker_boost: true
      };
    default:
      return {
        stability: 0.4,
        similarity_boost: 0.85,
        style: 0.1,
        use_speaker_boost: true
      };
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAudioPrep().catch(console.error);
}

export default buildAudioPrep;