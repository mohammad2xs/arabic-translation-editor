#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');

function showUsage() {
  console.log(`
ReviewPack Export Script

Usage: node scripts/reviewpack.mjs <section-id>

Examples:
  node scripts/reviewpack.mjs S001
  node scripts/reviewpack.mjs S042

This script generates review pack documents for a section, including:
  - Markdown format (.md) for easy viewing
  - HTML format (.html) with print-ready CSS

The script reads from:
  - data/sections/<id>.json (section data)
  - outputs/tmp/notes/*.json (notes for rows)
  - outputs/tmp/history/*.json (revision history)

Output files are saved to:
  - outputs/reviewpacks/<id>.md
  - outputs/reviewpacks/<id>.html
`);
}

function validateSectionId(sectionId) {
  if (!sectionId || !/^S\d{3}$/.test(sectionId)) {
    console.error('❌ Invalid section ID format. Expected format: S001, S002, etc.');
    return false;
  }
  return true;
}

async function loadSectionData(sectionId) {
  const sectionPath = path.join(PROJECT_ROOT, 'data', 'sections', `${sectionId}.json`);

  try {
    const data = await fs.promises.readFile(sectionPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Section ${sectionId} not found at ${sectionPath}`);
    }
    throw new Error(`Failed to load section ${sectionId}: ${error.message}`);
  }
}

async function loadNotesForRow(rowId) {
  const notesPath = path.join(PROJECT_ROOT, 'outputs', 'tmp', 'notes', `${rowId}.json`);

  try {
    const data = await fs.promises.readFile(notesPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // No notes file exists
    return [];
  }
}

async function loadHistoryForRow(rowId) {
  const historyPath = path.join(PROJECT_ROOT, 'outputs', 'tmp', 'history', `${rowId}.json`);

  try {
    const data = await fs.promises.readFile(historyPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // No history file exists
    return { rowId, versions: [] };
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

function generateMarkdown(sectionData, notesData, historyData) {
  const { id, title, rows } = sectionData;

  let markdown = `# Review Pack: ${title} (${id})

Generated on: ${new Date().toLocaleString()}

## Section Overview

- **Section ID**: ${id}
- **Title**: ${title}
- **Total Rows**: ${rows.length}
- **Word Count**: ${sectionData.metadata?.wordCount || 'N/A'}
- **Content Hash**: ${sectionData.metadata?.contentHash || 'N/A'}

## Rows

`;

  rows.forEach((row, index) => {
    const notes = notesData[row.id] || [];
    const history = historyData[row.id] || { versions: [] };

    markdown += `### Row ${index + 1}: ${row.id}

**Original Arabic:**
> ${row.original}

**Enhanced Arabic:**
> ${row.enhanced || '_Not provided_'}

**English Translation:**
> ${row.english || '_Not provided_'}

**Metadata:**
- Word Count: ${row.metadata?.wordCount || 'N/A'}
- Character Count: ${row.metadata?.charCount || 'N/A'}
- Complexity: ${row.complexity || 'N/A'}
- LPR: ${row.metadata?.lpr?.toFixed(3) || 'N/A'}
- Confidence: ${row.metadata?.confidence ? (row.metadata.confidence * 100).toFixed(1) + '%' : 'N/A'}
- Processed At: ${formatTimestamp(row.metadata?.processedAt)}

`;

    // Scripture References
    if (row.scriptureRefs && row.scriptureRefs.length > 0) {
      markdown += `**Scripture References:**
`;
      row.scriptureRefs.forEach(ref => {
        markdown += `- ${ref.type === 'quran' ? '📖' : '📝'} ${ref.normalized} (${ref.reference})
`;
      });
      markdown += '\n';
    }

    // Quality Gates
    if (row.metadata?.qualityGates) {
      markdown += `**Quality Gates:**
`;
      Object.entries(row.metadata.qualityGates).forEach(([gate, passed]) => {
        markdown += `- ${gate}: ${passed ? '✅' : '❌'}
`;
      });
      markdown += '\n';
    }

    // Notes
    if (notes.length > 0) {
      markdown += `**Notes (${notes.length}):**
`;
      notes.forEach((note, noteIndex) => {
        markdown += `${noteIndex + 1}. **${note.kind}** (${formatTimestamp(note.ts)}) by ${note.by}
   ${note.body || note.audioPath || 'No content'}
`;
      });
      markdown += '\n';
    }

    // History
    if (history.versions.length > 0) {
      markdown += `**Revision History (${history.versions.length} versions):**
`;
      history.versions.slice(-5).forEach((version, versionIndex) => {
        markdown += `${versionIndex + 1}. Rev ${version.revision} - ${version.action || 'save'} (${formatTimestamp(version.timestamp)}) by ${version.userRole}
`;
        if (version.reason) {
          markdown += `   Reason: ${version.reason}
`;
        }
      });
      if (history.versions.length > 5) {
        markdown += `   ... and ${history.versions.length - 5} earlier versions
`;
      }
      markdown += '\n';
    }

    markdown += '---\n\n';
  });

  markdown += `## Summary

**Statistics:**
- Total rows: ${rows.length}
- Rows with notes: ${Object.values(notesData).filter(notes => notes.length > 0).length}
- Rows with history: ${Object.values(historyData).filter(history => history.versions.length > 0).length}
- Total notes: ${Object.values(notesData).reduce((sum, notes) => sum + notes.length, 0)}
- Total revisions: ${Object.values(historyData).reduce((sum, history) => sum + history.versions.length, 0)}

Generated by ReviewPack Export Script
`;

  return markdown;
}

function generateHTML(markdown, sectionId) {
  // Simple markdown to HTML conversion for basic formatting
  let html = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/(<li>.*?<\/li>(?:<br><li>.*?<\/li>)*)/gs, '<ul>$1</ul>');

  // Remove <br> tags inside <ul>
  html = html.replace(/<ul>(.*?)<\/ul>/gs, (match, content) => {
    return '<ul>' + content.replace(/<br>/g, '') + '</ul>';
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Pack: ${sectionId}</title>
    <style>
        body {
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }

        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }

        h2 {
            color: #34495e;
            margin-top: 30px;
            border-bottom: 1px solid #bdc3c7;
            padding-bottom: 5px;
        }

        h3 {
            color: #7f8c8d;
            margin-top: 25px;
        }

        blockquote {
            background-color: #f8f9fa;
            border-left: 4px solid #3498db;
            margin: 10px 0;
            padding: 10px 15px;
            font-style: italic;
            direction: rtl;
            text-align: right;
        }

        blockquote:has-text("English") {
            direction: ltr;
            text-align: left;
        }

        ul {
            margin: 10px 0;
            padding-left: 20px;
        }

        li {
            margin: 5px 0;
        }

        hr {
            border: none;
            border-top: 2px solid #ecf0f1;
            margin: 30px 0;
        }

        strong {
            color: #2c3e50;
        }

        @media print {
            body {
                max-width: none;
                margin: 0;
                padding: 15px;
                font-size: 12px;
            }

            h1 {
                font-size: 18px;
            }

            h2 {
                font-size: 16px;
                page-break-before: auto;
            }

            h3 {
                font-size: 14px;
            }

            blockquote {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showUsage();
    process.exit(0);
  }

  const sectionId = args[0];

  if (!validateSectionId(sectionId)) {
    process.exit(1);
  }

  console.log(`📋 Generating review pack for section ${sectionId}...`);

  try {
    // Load section data
    console.log('📖 Loading section data...');
    const sectionData = await loadSectionData(sectionId);

    // Load notes and history for all rows
    console.log('📝 Loading notes and history...');
    const notesData = {};
    const historyData = {};

    for (const row of sectionData.rows) {
      notesData[row.id] = await loadNotesForRow(row.id);
      historyData[row.id] = await loadHistoryForRow(row.id);
    }

    // Generate markdown
    console.log('📄 Generating markdown...');
    const markdown = generateMarkdown(sectionData, notesData, historyData);

    // Generate HTML
    console.log('🌐 Generating HTML...');
    const html = generateHTML(markdown, sectionId);

    // Ensure output directory exists
    const outputDir = path.join(PROJECT_ROOT, 'outputs', 'reviewpacks');
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Write files
    const markdownPath = path.join(outputDir, `${sectionId}.md`);
    const htmlPath = path.join(outputDir, `${sectionId}.html`);

    console.log('💾 Writing files...');
    await fs.promises.writeFile(markdownPath, markdown, 'utf-8');
    await fs.promises.writeFile(htmlPath, html, 'utf-8');

    console.log(`✅ Review pack generated successfully!`);
    console.log(`📄 Markdown: ${markdownPath}`);
    console.log(`🌐 HTML: ${htmlPath}`);
    console.log(`📊 Statistics:`);
    console.log(`   - ${sectionData.rows.length} rows processed`);
    console.log(`   - ${Object.values(notesData).reduce((sum, notes) => sum + notes.length, 0)} total notes`);
    console.log(`   - ${Object.values(historyData).reduce((sum, history) => sum + history.versions.length, 0)} total revisions`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`❌ Unexpected error: ${error.message}`);
  process.exit(1);
});