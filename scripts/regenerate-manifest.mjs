#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = './data';
const SECTIONS_DIR = './data/sections';
const PUBLIC_DATA_DIR = './public/data';

async function regenerateManifest() {
  try {
    console.log('Regenerating manifest from existing sections...');
    console.log('Sections directory:', SECTIONS_DIR);

    // Read all section files
    const sectionFiles = await fs.readdir(SECTIONS_DIR);
    console.log('Section files found:', sectionFiles);
    const processedSections = [];

    for (const file of sectionFiles) {
      if (file.endsWith('.json')) {
        const sectionPath = path.join(SECTIONS_DIR, file);
        const sectionData = JSON.parse(await fs.readFile(sectionPath, 'utf8'));

        processedSections.push({
          id: sectionData.id,
          title: sectionData.title,
          rowCount: sectionData.metadata.rowCount,
          wordCount: sectionData.metadata.wordCount,
          contentHash: sectionData.metadata.contentHash,
          type: sectionData.id === 'S001' ? 'introduction' : 'chapter'
        });
      }
    }

    // Generate manifest
    const manifest = {
      sections: processedSections,
      metadata: {
        totalSections: processedSections.length,
        totalRows: processedSections.reduce((sum, s) => sum + s.rowCount, 0),
        totalWords: processedSections.reduce((sum, s) => sum + s.wordCount, 0),
        generatedAt: new Date().toISOString(),
        source: './al-insan.docx',
        version: '1.0.0'
      }
    };

    // Write manifest to both locations
    const manifestPath = path.join(DATA_DIR, 'manifest.json');
    const publicManifestPath = path.join(PUBLIC_DATA_DIR, 'manifest.json');

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(publicManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`✓ Manifest regenerated!`);
    console.log(`  Sections: ${processedSections.length}`);
    console.log(`  Total rows: ${manifest.metadata.totalRows}`);
    console.log(`  Total words: ${manifest.metadata.totalWords}`);
    console.log(`  Manifest: ${manifestPath}`);
    console.log(`  Public manifest: ${publicManifestPath}`);

  } catch (error) {
    console.error('Manifest regeneration failed:', error);
    process.exit(1);
  }
}

console.log('Script starting...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

regenerateManifest();