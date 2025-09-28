#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { loadTriviewForExport } from '../lib/export/triview-adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

async function buildEpub() {
  console.log('Building EPUB export...');

  try {
    // Read book metadata
    const bookMeta = JSON.parse(fs.readFileSync(path.join(projectRoot, 'book_meta.json'), 'utf8'));

    const triviewData = loadTriviewForExport(projectRoot);

    if (!triviewData.sections.length) {
      throw new Error('No triview sections available for EPUB export.');
    }

    // Create temporary EPUB structure
    const tempDir = path.join(projectRoot, 'temp_epub');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Create EPUB structure
    await createEpubStructure(tempDir, triviewData, bookMeta);

    // Create EPUB archive
    const outputsDir = path.join(projectRoot, 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    const epubPath = path.join(outputsDir, 'book-final.epub');
    await createEpubArchive(tempDir, epubPath);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true });

    console.log(`EPUB file generated successfully: ${epubPath}`);
    return epubPath;

  } catch (error) {
    console.error('Error building EPUB:', error);
    throw error;
  }
}

async function createEpubStructure(tempDir, triviewData, bookMeta) {
  // Create required directories
  fs.mkdirSync(path.join(tempDir, 'META-INF'));
  fs.mkdirSync(path.join(tempDir, 'OEBPS'));
  fs.mkdirSync(path.join(tempDir, 'OEBPS', 'css'));
  fs.mkdirSync(path.join(tempDir, 'OEBPS', 'fonts'));

  // Create mimetype file
  fs.writeFileSync(path.join(tempDir, 'mimetype'), 'application/epub+zip');

  // Create container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  fs.writeFileSync(path.join(tempDir, 'META-INF', 'container.xml'), containerXml);

  // Copy Amiri fonts
  const fontSourceDir = path.join(projectRoot, 'build', 'assets', 'fonts', 'Amiri');
  const fontTargetDir = path.join(tempDir, 'OEBPS', 'fonts');

  if (fs.existsSync(fontSourceDir)) {
    const fontFiles = ['Amiri-Regular.ttf', 'Amiri-Bold.ttf'];
    for (const fontFile of fontFiles) {
      const sourcePath = path.join(fontSourceDir, fontFile);
      const targetPath = path.join(fontTargetDir, fontFile);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  // Copy RTL CSS
  const rtlCssPath = path.join(projectRoot, 'build', 'rtl.css');
  if (fs.existsSync(rtlCssPath)) {
    fs.copyFileSync(rtlCssPath, path.join(tempDir, 'OEBPS', 'css', 'rtl.css'));
  } else {
    // Create basic RTL CSS if not exists
    createBasicRtlCss(path.join(tempDir, 'OEBPS', 'css', 'rtl.css'));
  }

  // Create content.opf
  const contentOpf = generateContentOpf(triviewData, bookMeta);
  fs.writeFileSync(path.join(tempDir, 'OEBPS', 'content.opf'), contentOpf);

  // Create toc.ncx
  const tocNcx = generateTocNcx(triviewData, bookMeta);
  fs.writeFileSync(path.join(tempDir, 'OEBPS', 'toc.ncx'), tocNcx);

  // Create title page
  const titlePage = generateTitlePage(bookMeta);
  fs.writeFileSync(path.join(tempDir, 'OEBPS', 'title.xhtml'), titlePage);

  // Create table of contents
  const tocPage = generateTocPage(triviewData, bookMeta);
  fs.writeFileSync(path.join(tempDir, 'OEBPS', 'toc.xhtml'), tocPage);

  // Create chapter files
  for (let i = 0; i < triviewData.sections.length; i++) {
    const section = triviewData.sections[i];
    const chapterHtml = generateChapterHtml(section, bookMeta);
    fs.writeFileSync(path.join(tempDir, 'OEBPS', `chapter_${i + 1}.xhtml`), chapterHtml);
  }
}

function createBasicRtlCss(filePath) {
  const basicCss = `/* RTL CSS for Arabic EPUB */
@charset "UTF-8";

/* Font definitions */
@font-face {
  font-family: 'Amiri';
  font-style: normal;
  font-weight: normal;
  src: url('../fonts/Amiri-Regular.ttf') format('truetype'),
       local('Amiri'), local('Amiri-Regular');
}

@font-face {
  font-family: 'Amiri';
  font-style: normal;
  font-weight: bold;
  src: url('../fonts/Amiri-Bold.ttf') format('truetype'),
       local('Amiri Bold'), local('Amiri-Bold');
}

/* Body and base styles */
body {
  font-family: 'Times New Roman', serif;
  line-height: 1.6;
  margin: 1em;
  text-align: left;
  direction: ltr;
}

/* Arabic text styling */
.arabic {
  font-family: 'Amiri', 'Arabic Typesetting', 'Tahoma', sans-serif;
  direction: rtl;
  text-align: right;
  font-size: 1.1em;
  line-height: 1.8;
  margin: 1em 0;
}

/* Enhanced Arabic styling */
.arabic-enhanced {
  font-family: 'Amiri', 'Arabic Typesetting', 'Tahoma', sans-serif;
  direction: rtl;
  text-align: right;
  font-size: 1.05em;
  line-height: 1.7;
  font-style: italic;
  color: #444;
  margin: 0.5em 0;
}

/* English text styling */
.english {
  font-family: 'Times New Roman', serif;
  direction: ltr;
  text-align: left;
  font-size: 1em;
  line-height: 1.6;
  margin: 1em 0;
}

/* Headings */
h1, h2, h3, h4, h5, h6 {
  margin: 1.5em 0 1em 0;
  font-weight: bold;
}

h1.arabic-title, h2.arabic-title {
  font-family: 'Amiri', 'Arabic Typesetting', 'Tahoma', sans-serif;
  direction: rtl;
  text-align: center;
  font-size: 1.5em;
  margin: 2em 0 1em 0;
}

h1.english-title, h2.english-title {
  font-family: 'Times New Roman', serif;
  direction: ltr;
  text-align: center;
  font-size: 1.3em;
  margin: 1em 0 2em 0;
}

/* Scripture references */
.scripture-ref {
  font-size: 0.9em;
  font-style: italic;
  color: #666;
  margin: 0.5em 0;
  text-align: left;
  direction: ltr;
}

/* Page breaks */
.page-break {
  page-break-before: always;
}

/* Responsive design */
@media screen and (max-width: 600px) {
  body {
    margin: 0.5em;
  }

  .arabic {
    font-size: 1em;
  }

  .english {
    font-size: 0.9em;
  }
}`;

  fs.writeFileSync(filePath, basicCss);
}

function mapLanguageCode(language) {
  const languageMap = {
    'arabic': 'ar',
    'english': 'en',
    'ar': 'ar',
    'en': 'en'
  };
  return languageMap[language.toLowerCase()] || language;
}

function generateContentOpf(triviewData, bookMeta) {
  const uuid = `urn:uuid:${generateUUID()}`;
  const manifestItems = triviewData.sections.map((_, i) =>
    `    <item id="chapter_${i + 1}" href="chapter_${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');

  const fontItems = `    <item id="amiri-regular" href="fonts/Amiri-Regular.ttf" media-type="font/ttf"/>
    <item id="amiri-bold" href="fonts/Amiri-Bold.ttf" media-type="font/ttf"/>`;

  const spineItems = triviewData.sections.map((_, i) =>
    `    <itemref idref="chapter_${i + 1}"/>`
  ).join('\n');

  // Generate language metadata
  const primaryLang = mapLanguageCode(bookMeta.languages.primary);
  const secondaryLang = bookMeta.languages.secondary ? mapLanguageCode(bookMeta.languages.secondary) : null;

  let languageMetadata = `    <dc:language>${primaryLang}</dc:language>`;
  if (secondaryLang && secondaryLang !== primaryLang) {
    languageMetadata += `\n    <dc:language>${secondaryLang}</dc:language>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">${uuid}</dc:identifier>
    <dc:title>${bookMeta.title.english}</dc:title>
    <dc:creator opf:role="aut">${bookMeta.author.name_en}</dc:creator>
${languageMetadata}
    <dc:subject>Islam</dc:subject>
    <dc:subject>Spirituality</dc:subject>
    <dc:description>${bookMeta.description.english}</dc:description>
    <dc:publisher>${bookMeta.edition.publisher}</dc:publisher>
    <dc:date>${bookMeta.edition.year}</dc:date>
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="css/rtl.css" media-type="text/css"/>
${fontItems}
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="title"/>
    <itemref idref="toc"/>
${spineItems}
  </spine>
</package>`;
}

function generateTocNcx(triviewData, bookMeta) {
  const navPoints = triviewData.sections.map((section, i) => {
    const title = section.title;
    return `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 3}">
      <navLabel>
        <text>${escapeXml(title)}</text>
      </navLabel>
      <content src="chapter_${i + 1}.xhtml"/>
    </navPoint>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${generateUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(bookMeta.title.english)}</text>
  </docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel>
        <text>Title Page</text>
      </navLabel>
      <content src="title.xhtml"/>
    </navPoint>
    <navPoint id="navpoint-2" playOrder="2">
      <navLabel>
        <text>Table of Contents</text>
      </navLabel>
      <content src="toc.xhtml"/>
    </navPoint>
${navPoints}
  </navMap>
</ncx>`;
}

function generateTitlePage(bookMeta) {
  const primaryLang = mapLanguageCode(bookMeta.languages.primary);
  const direction = primaryLang === 'ar' ? 'rtl' : 'ltr';

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" dir="${direction}" lang="${primaryLang}">
<head>
  <title>Title Page</title>
  <link rel="stylesheet" type="text/css" href="css/rtl.css"/>
</head>
<body>
  <div class="page-break">
    <h1 class="arabic-title">${escapeXml(bookMeta.title.arabic)}</h1>
    <h1 class="english-title">${escapeXml(bookMeta.title.english)}</h1>
    <p style="text-align: center; margin-top: 2em;">
      <strong>By ${escapeXml(bookMeta.author.name_en)}</strong>
    </p>
    <p style="text-align: center; margin-top: 3em;">
      ${escapeXml(bookMeta.edition.publisher)}<br/>
      ${bookMeta.edition.year}
    </p>
  </div>
</body>
</html>`;
}

function generateTocPage(triviewData, bookMeta) {
  const tocEntries = triviewData.sections.map((section, i) => {
    const title = section.title;
    return `    <p><a href="chapter_${i + 1}.xhtml">
      <span class="arabic">${escapeXml(title)}</span><br/>
      ${escapeXml(title)}
    </a></p>`;
  }).join('\n');

  const primaryLang = mapLanguageCode(bookMeta.languages.primary);
  const direction = primaryLang === 'ar' ? 'rtl' : 'ltr';

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" dir="${direction}" lang="${primaryLang}">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="css/rtl.css"/>
</head>
<body>
  <div class="page-break">
    <h1 style="text-align: center;">Table of Contents</h1>
${tocEntries}
  </div>
</body>
</html>`;
}

function generateChapterHtml(section, bookMeta) {
  const sectionTitle = section.title;
  const arabicTitle = section.title;
  const primaryLang = mapLanguageCode(bookMeta.languages.primary);
  const direction = primaryLang === 'ar' ? 'rtl' : 'ltr';

  let contentHtml = '';

  // Process rows from the section
  for (const row of section.rows) {
    contentHtml += '<div class="text-block">\n';

    // Arabic original text
    if (row.original) {
      contentHtml += `  <p class="arabic">${escapeXml(row.original)}</p>\n`;
    }

    // Enhanced Arabic if different
    if (row.enhanced && row.enhanced !== row.original) {
      contentHtml += `  <p class="arabic-enhanced">${escapeXml(row.enhanced)}</p>\n`;
    }

    // English translation
    if (row.english && row.english.trim()) {
      contentHtml += `  <p class="english">${escapeXml(row.english)}</p>\n`;
    }

    // Scripture references
    if (row.scriptureRefs && row.scriptureRefs.length > 0) {
      const refText = row.scriptureRefs.map(ref => {
        if (ref.type === 'quran') {
          return `القرآن الكريم، ${ref.normalized}`;
        } else if (ref.type === 'hadith') {
          return `الحديث الشريف، ${ref.reference}`;
        }
        return ref.reference;
      }).join('; ');

      contentHtml += `  <p class="scripture-ref">${escapeXml(refText)}</p>\n`;
    }

    contentHtml += '</div>\n\n';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" dir="${direction}" lang="${primaryLang}">
<head>
  <title>${escapeXml(sectionTitle)}</title>
  <link rel="stylesheet" type="text/css" href="css/rtl.css"/>
</head>
<body>
  <div class="page-break">
    <h1 class="arabic-title">${escapeXml(arabicTitle)}</h1>
    <h1 class="english-title">${escapeXml(sectionTitle)}</h1>

${contentHtml}  </div>
</body>
</html>`;
}

async function createEpubArchive(tempDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
      store: true  // No compression for mimetype
    });

    output.on('close', () => {
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add mimetype first (uncompressed)
    archive.file(path.join(tempDir, 'mimetype'), { name: 'mimetype', store: true });

    // Add all other files
    archive.directory(path.join(tempDir, 'META-INF'), 'META-INF');
    archive.directory(path.join(tempDir, 'OEBPS'), 'OEBPS');

    archive.finalize();
  });
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildEpub().catch(console.error);
}

export default buildEpub;