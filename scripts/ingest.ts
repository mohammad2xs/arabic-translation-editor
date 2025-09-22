#!/usr/bin/env node

import mammoth from 'mammoth';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { segmentArabicText } from '../lib/ingest/segment';

const DOCX_PATH = './al-insan.docx';
const DATA_DIR = './data';
const SECTIONS_DIR = './data/sections';
const PUBLIC_DATA_DIR = './public/data';

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SECTIONS_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
}

// Normalize Arabic text for consistent hashing
function normalizeArabicText(text) {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Remove diacritics and tatweel
    .replace(/[ا]/g, 'ا') // Normalize alif variations
    .replace(/[ي]/g, 'ي') // Normalize ya variations
    .replace(/[ه]/g, 'ه') // Normalize heh variations
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function generateStableId(title, content, index, existingMapping = {}, usedIds = new Set()) {
  const normalizedTitle = normalizeArabicText(title);
  const contentHash = calculateHash(content).substring(0, 8); // Use first 8 chars for uniqueness
  const uniqueKey = `${normalizedTitle}:${contentHash}`;

  // Check if we already have an ID for this exact title+content combination
  if (existingMapping[uniqueKey]) {
    return existingMapping[uniqueKey];
  }

  // Generate base ID from index
  let candidateId = `S${String(index).padStart(3, '0')}`;

  // Check for collision with existing section files and used IDs
  let counter = 0;
  while (usedIds.has(candidateId) || existsSync(path.join(SECTIONS_DIR, `${candidateId}.json`))) {
    counter++;
    candidateId = `S${String(index).padStart(3, '0')}_${counter}`;

    // Sanity check to prevent infinite loops
    if (counter > 1000) {
      throw new Error(`Could not generate unique section ID for index ${index}`);
    }
  }

  // Store the mapping and mark ID as used
  existingMapping[uniqueKey] = candidateId;
  usedIds.add(candidateId);

  return candidateId;
}

function loadIdMapping() {
  const mappingPath = path.join(DATA_DIR, 'ingest-index.json');
  if (existsSync(mappingPath)) {
    try {
      return JSON.parse(readFileSync(mappingPath, 'utf8'));
    } catch (error) {
      console.warn('Could not load existing ID mapping, starting fresh');
      return {};
    }
  }
  return {};
}

function saveIdMapping(mapping) {
  const mappingPath = path.join(DATA_DIR, 'ingest-index.json');
  writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
}

function calculateHash(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex').substring(0, 16);
}

function detectSectionBoundaries(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const sections = [];
  let currentSection = { lines: [], title: 'المقدمة' };

  for (const line of lines) {
    // Enhanced heading detection patterns
    const hasArabicMarkers = /\b(الفصل|الباب|المقدمة|الخاتمة|تمهيد|خاتمة|القسم|الجزء|البند|المبحث|المطلب)\b/.test(line);
    const hasNumberedHeading = /^[0-9\u0660-\u0669]+[.\-\s]/.test(line);
    const hasRomanNumerals = /^[IVXLCDM]+[.\-\s]/.test(line);
    const hasArabicNumerals = /^[أ-ي]+[.\-\s]/.test(line);
    const hasChapterKeywords = /\b(فصل|باب|مقدمة|خاتمة|تمهيد|قسم|جزء|بند|مبحث|مطلب)\b/i.test(line);

    // Additional context checks
    const isShortLine = line.length < 120;
    const hasColonOrDash = /[:：\-–—]/.test(line);
    const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
    const hasCenteringPatterns = /^[\s]*[^\s].*[^\s][\s]*$/.test(line) && line.length < 80;

    // More sophisticated heading detection
    const isStrongHeading = hasArabicMarkers || (hasNumberedHeading && isShortLine);
    const isMediumHeading = (hasRomanNumerals || hasArabicNumerals || hasChapterKeywords) && isShortLine;
    const isWeakHeading = isShortLine && (hasColonOrDash || isAllCaps || hasCenteringPatterns) && line.split(/\s+/).length <= 8;

    // Require minimum section length to avoid over-segmentation
    const hasMinimumContent = currentSection.lines.length >= 3;

    const isHeading = (isStrongHeading || (isMediumHeading && hasMinimumContent) || (isWeakHeading && hasMinimumContent));

    if (isHeading && currentSection.lines.length > 0) {
      // Start new section
      sections.push(currentSection);
      currentSection = { lines: [], title: line };
    } else if (isHeading && currentSection.lines.length === 0) {
      // Update current section title
      currentSection.title = line;
    } else {
      currentSection.lines.push(line);
    }
  }

  // Add final section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  // Post-process: merge very small sections with previous ones
  const finalSections = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const wordCount = section.lines.join(' ').split(/\s+/).length;

    // If section is too small (< 50 words) and not the first section, merge with previous
    if (wordCount < 50 && finalSections.length > 0 && i > 0) {
      const prevSection = finalSections[finalSections.length - 1];
      prevSection.lines.push('', section.title, ...section.lines);
    } else {
      finalSections.push(section);
    }
  }

  return finalSections;
}

async function processSection(sectionText, sectionTitle, sectionId) {
  const rows = await segmentArabicText(sectionText);

  // Add row IDs and lane hashes
  const processedRows = rows.map((row, index) => {
    const rowId = `${sectionId}-${String(index + 1).padStart(3, '0')}`;
    return {
      id: rowId,
      original: row.text,
      enhanced: row.text, // Will be modified in enhancement pipeline
      english: '', // Will be filled in translation pipeline
      complexity: row.complexity || 1,
      scriptureRefs: row.scriptureRefs || [],
      metadata: {
        sectionId,
        rowIndex: index,
        wordCount: row.text.split(/\s+/).length,
        charCount: row.text.length,
        laneHash: calculateHash(row.text),
        ...row.metadata
      }
    };
  });

  return {
    id: sectionId,
    title: sectionTitle,
    rows: processedRows,
    metadata: {
      rowCount: processedRows.length,
      wordCount: processedRows.reduce((sum, row) => sum + row.metadata.wordCount, 0),
      charCount: processedRows.reduce((sum, row) => sum + row.metadata.charCount, 0),
      contentHash: calculateHash(JSON.stringify(processedRows)),
      processedAt: new Date().toISOString()
    }
  };
}

async function generateManifest(sections) {
  return {
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      rowCount: section.metadata.rowCount,
      wordCount: section.metadata.wordCount,
      contentHash: section.metadata.contentHash,
      type: section.id === 'S001' ? 'introduction' : 'chapter'
    })),
    metadata: {
      totalSections: sections.length,
      totalRows: sections.reduce((sum, s) => sum + s.metadata.rowCount, 0),
      totalWords: sections.reduce((sum, s) => sum + s.metadata.wordCount, 0),
      generatedAt: new Date().toISOString(),
      source: DOCX_PATH,
      version: '1.0.0'
    }
  };
}

async function main() {
  try {
    console.log('Starting DOCX ingestion...');
    console.log('DOCX file exists:', await fs.access(DOCX_PATH).then(() => true).catch(() => false));

    // Ensure directories exist
    await ensureDirectories();

    // Load existing ID mapping
    const idMapping = loadIdMapping();

    // Extract text from DOCX
    console.log('Extracting text from DOCX...');
    const result = await mammoth.extractRawText({ path: DOCX_PATH });
    const rawText = result.value;

    if (!rawText || rawText.trim().length === 0) {
      throw new Error('No text extracted from DOCX file');
    }

    console.log(`Extracted ${rawText.length} characters`);

    // Detect section boundaries
    console.log('Detecting section boundaries...');
    const sections = detectSectionBoundaries(rawText);
    console.log(`Found ${sections.length} sections`);

    // Process each section
    const processedSections = [];
    const usedIds = new Set();
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionText = section.lines.join('\n');
      const sectionId = generateStableId(section.title, sectionText, i + 1, idMapping, usedIds);

      console.log(`Processing section ${sectionId}: ${section.title}`);

      const processedSection = await processSection(sectionText, section.title, sectionId);
      processedSections.push(processedSection);

      // Write section file
      const sectionPath = path.join(SECTIONS_DIR, `${sectionId}.json`);
      await fs.writeFile(sectionPath, JSON.stringify(processedSection, null, 2), 'utf8');

      console.log(`  ✓ Wrote ${processedSection.rows.length} rows to ${sectionPath}`);
    }

    // Save ID mapping for future runs
    saveIdMapping(idMapping);

    // Generate and write manifest
    console.log('Generating manifest...');
    const manifest = await generateManifest(processedSections);
    const manifestPath = path.join(DATA_DIR, 'manifest.json');
    const publicManifestPath = path.join(PUBLIC_DATA_DIR, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(publicManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`✓ Ingestion complete!`);
    console.log(`  Sections: ${processedSections.length}`);
    console.log(`  Total rows: ${manifest.metadata.totalRows}`);
    console.log(`  Total words: ${manifest.metadata.totalWords}`);
    console.log(`  Manifest: ${manifestPath}`);
    console.log(`  Public manifest: ${publicManifestPath}`);

  } catch (error) {
    console.error('Ingestion failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}