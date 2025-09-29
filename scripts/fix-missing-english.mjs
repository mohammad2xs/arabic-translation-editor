#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

console.log('🔧 Fixing missing English translations in section files...');

// Read the triview.json file which contains the English translations
const triviewPath = './outputs/triview.json';
const triviewData = JSON.parse(readFileSync(triviewPath, 'utf8'));

console.log(`📖 Loaded ${triviewData.rows.length} rows from triview.json`);

// Create a map of row ID to English translation
const englishMap = new Map();
for (const row of triviewData.rows) {
  if (row.english && row.english.trim()) {
    englishMap.set(row.id, row.english);
  }
}

console.log(`🗺️ Created English translation map with ${englishMap.size} entries`);

// Process all section files
const sectionsDir = './data/sections';
const sectionFiles = readdirSync(sectionsDir).filter(f => f.endsWith('.json'));

console.log(`📁 Found ${sectionFiles.length} section files to process`);

let totalUpdated = 0;
let totalSections = 0;

for (const filename of sectionFiles) {
  const filePath = join(sectionsDir, filename);

  try {
    const sectionData = JSON.parse(readFileSync(filePath, 'utf8'));
    let updated = false;

    // Update each row's English translation if it's missing
    for (const row of sectionData.rows) {
      if ((!row.english || row.english.trim() === '') && englishMap.has(row.id)) {
        row.english = englishMap.get(row.id);
        updated = true;
        totalUpdated++;
      }
    }

    if (updated) {
      writeFileSync(filePath, JSON.stringify(sectionData, null, 2));
      console.log(`✅ Updated ${filename}`);
      totalSections++;
    }

  } catch (error) {
    console.error(`❌ Error processing ${filename}:`, error.message);
  }
}

console.log(`\n🎉 Completed! Updated ${totalUpdated} rows across ${totalSections} section files`);
console.log('🚀 English translations should now be available in the deployment');