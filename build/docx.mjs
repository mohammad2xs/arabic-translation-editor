#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Using docx package for proper RTL support
import { Document, Packer, Paragraph, TextRun, Header, Footer, TableOfContents, AlignmentType, HeadingLevel, FootnoteReferenceRun } from 'docx';

async function loadTriviewData() {
  const triviewPath = path.join(projectRoot, 'outputs', 'triview.json');

  try {
    const triviewData = JSON.parse(fs.readFileSync(triviewPath, 'utf8'));
    return triviewData;
  } catch (error) {
    console.log('triview.json not found, generating from sections...');

    // Fallback: read from data/sections/*.json
    const manifestPath = path.join(projectRoot, 'data', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const triviewData = { sections: [] };

    for (const section of manifest.sections) {
      const sectionPath = path.join(projectRoot, 'data', 'sections', `${section.id}.json`);
      if (fs.existsSync(sectionPath)) {
        const sectionData = JSON.parse(fs.readFileSync(sectionPath, 'utf8'));
        triviewData.sections.push(sectionData);
      }
    }

    return triviewData;
  }
}

function createFootnoteText(scriptureRefs) {
  if (!scriptureRefs || scriptureRefs.length === 0) return '';

  return scriptureRefs.map(ref => {
    if (ref.type === 'quran') {
      return `القرآن الكريم، ${ref.normalized}`;
    } else if (ref.type === 'hadith') {
      return `الحديث الشريف، ${ref.reference}`;
    }
    return ref.reference;
  }).join('; ');
}

function parsePageSize(trimSize) {
  // Parse "6x9 inches" format from book_meta.format.trim_size
  const match = trimSize.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*inches?/i);
  if (match) {
    const width = parseFloat(match[1]) * 1440; // Convert inches to twips (1 inch = 1440 twips)
    const height = parseFloat(match[2]) * 1440;
    return { width, height };
  }
  // Default to 6x9 inches if parsing fails
  return { width: 6 * 1440, height: 9 * 1440 };
}

function parseMargins(marginSpec) {
  // Parse "1 inch" format from book_meta.format.page_margin
  const match = marginSpec.match(/(\d+(?:\.\d+)?)\s*inches?/i);
  if (match) {
    const margin = parseFloat(match[1]) * 1440; // Convert inches to twips
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  // Default to 1 inch margins if parsing fails
  const defaultMargin = 1440;
  return { top: defaultMargin, right: defaultMargin, bottom: defaultMargin, left: defaultMargin };
}

function parseFontSize(fontSizeSpec) {
  // Parse "12pt" format from book_meta.format.font_size
  const match = fontSizeSpec.match(/(\d+(?:\.\d+)?)pt/i);
  if (match) {
    return parseFloat(match[1]) * 2; // Convert pt to half-points for docx
  }
  return 24; // Default to 12pt (24 half-points)
}

function createDocumentHeader(bookMeta) {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: bookMeta.title.arabic,
            font: "Amiri",
            size: 24,
            bold: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        bidirectional: true,
      }),
    ],
  });
}

function createDocumentFooter(bookMeta) {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `${bookMeta.author.name} | ${bookMeta.edition.publisher}`,
            font: "Amiri",
            size: 20,
          }),
        ],
        alignment: AlignmentType.CENTER,
        bidirectional: true,
      }),
    ],
  });
}

function createTitlePage(bookMeta) {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: bookMeta.title.arabic,
          font: "Amiri",
          size: 48,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      bidirectional: true,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: bookMeta.title.english,
          font: "Times New Roman",
          size: 36,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: bookMeta.author.name,
          font: "Amiri",
          size: 28,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      bidirectional: true,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: bookMeta.author.name_en,
          font: "Times New Roman",
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${bookMeta.edition.publisher} | ${bookMeta.edition.year}`,
          font: "Times New Roman",
          size: 20,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];
}

function createTableOfContents() {
  return new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-3",
  });
}

async function buildDocx() {
  console.log('Building DOCX export...');

  try {
    // Load data
    console.log('Loading triview data...');
    const triviewData = await loadTriviewData();

    console.log('Loading book metadata...');
    const bookMeta = JSON.parse(fs.readFileSync(path.join(projectRoot, 'book_meta.json'), 'utf8'));

    console.log('Creating DOCX document...');

    const documentChildren = [];

    // Add title page
    documentChildren.push(...createTitlePage(bookMeta));

    // Add page break before table of contents
    documentChildren.push(new Paragraph({
      children: [],
      pageBreakBefore: true,
    }));

    // Add table of contents
    documentChildren.push(createTableOfContents());

    // Add page break before content
    documentChildren.push(new Paragraph({
      children: [],
      pageBreakBefore: true,
    }));

    // Process sections
    for (const section of triviewData.sections) {
      console.log(`Processing section: ${section.title || section.id}`);

      // Section title
      documentChildren.push(new Paragraph({
        children: [
          new TextRun({
            text: section.title || section.id,
            font: "Amiri",
            size: 32,
            bold: true,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 300 },
        bidirectional: true,
      }));

      // Process rows
      for (const row of section.rows) {
        const footnoteText = createFootnoteText(row.scriptureRefs);

        // Arabic text
        const arabicChildren = [
          new TextRun({
            text: row.enhanced || row.original,
            font: bookMeta.format.font_arabic,
            size: Math.round(baseFontSize * 1.1),
            rightToLeft: true,
          }),
        ];

        // Add real footnote if scripture references exist
        if (footnoteText) {
          arabicChildren.push(
            new FootnoteReferenceRun({
              footnote: {
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: footnoteText,
                        font: bookMeta.format.font_arabic,
                        size: Math.round(baseFontSize * 0.9),
                        rightToLeft: true,
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                    bidirectional: true,
                  }),
                ],
              },
            })
          );
        }

        documentChildren.push(new Paragraph({
          children: arabicChildren,
          style: "ArabicText",
          spacing: { after: 200 },
        }));

        // English text (if available)
        if (row.english && row.english.trim()) {
          documentChildren.push(new Paragraph({
            children: [
              new TextRun({
                text: row.english,
                font: bookMeta.format.font_english,
                size: baseFontSize,
              }),
            ],
            style: "EnglishText",
            spacing: { after: 200 },
          }));
        }
      }
    }

    // Parse page layout from book_meta
    const pageSize = parsePageSize(bookMeta.format.trim_size);
    const margins = parseMargins(bookMeta.format.page_margin);
    const baseFontSize = parseFontSize(bookMeta.format.font_size);

    const doc = new Document({
      creator: bookMeta.author.name_en,
      title: bookMeta.title.english,
      description: bookMeta.description.english,
      styles: {
        default: {
          document: {
            run: {
              font: bookMeta.format.font_english,
              size: baseFontSize,
            },
          },
        },
        paragraphStyles: [
          {
            id: "ArabicText",
            name: "Arabic Text",
            basedOn: "Normal",
            run: {
              font: bookMeta.format.font_arabic,
              size: Math.round(baseFontSize * 1.1),
              rightToLeft: true,
            },
            paragraph: {
              alignment: AlignmentType.RIGHT,
              bidirectional: true,
            },
          },
          {
            id: "EnglishText",
            name: "English Text",
            basedOn: "Normal",
            run: {
              font: bookMeta.format.font_english,
              size: baseFontSize,
            },
            paragraph: {
              alignment: AlignmentType.LEFT,
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: pageSize.width,
                height: pageSize.height,
              },
              margin: {
                top: margins.top,
                right: margins.right,
                bottom: margins.bottom,
                left: margins.left,
              },
            },
          },
          headers: {
            default: createDocumentHeader(bookMeta),
          },
          footers: {
            default: createDocumentFooter(bookMeta),
          },
          children: documentChildren,
        },
      ],
    });

    console.log('Generating DOCX file...');
    const buffer = await Packer.toBuffer(doc);

    // Ensure outputs directory exists
    const outputsDir = path.join(projectRoot, 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    const outputPath = path.join(outputsDir, 'book-final.docx');
    await fs.writeFileSync(outputPath, buffer);

    console.log(`DOCX file generated successfully: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error('Error building DOCX:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildDocx().catch(console.error);
}

export default buildDocx;