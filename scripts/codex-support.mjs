#!/usr/bin/env node
/*
 * Codex Support Bundle generator.
 * Produces CODEX_SUPPORT.md with sanitized environment info and lightweight stats.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function maskSecrets(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/([A-Z0-9_]*KEY|TOKEN|SECRET|PASSWORD|PRIVATE|API)[^,\n]*/gi, '$1=***');
}

function listFiles(root, globs) {
  const out = [];
  for (const rel of globs) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const subRel = join(rel, entry.name);
        const subAbs = join(root, subRel);
        if (entry.isFile()) out.push(subRel);
      }
    } else if (st.isFile()) {
      out.push(rel);
    }
  }
  return out.sort();
}

function readHeadTail(absPath, head = 120, tail = 120) {
  if (!existsSync(absPath)) return { present: false };
  const txt = readFileSync(absPath, 'utf8');
  const lines = txt.split(/\r?\n/);
  return {
    present: true,
    lineCount: lines.length,
    size: Buffer.byteLength(txt, 'utf8'),
    head: lines.slice(0, head).join('\n'),
    tail: lines.slice(-tail).join('\n'),
  };
}

function analyzeTriview(absPath) {
  if (!existsSync(absPath)) return { present: false };
  const data = JSON.parse(readFileSync(absPath, 'utf8'));
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const bySection = new Map();
  const lprValues = [];

  for (const row of rows) {
    const sid = row?.metadata?.sectionId || 'S000';
    bySection.set(sid, (bySection.get(sid) || 0) + 1);
    const lpr = row?.metadata?.lpr;
    if (typeof lpr === 'number') lprValues.push(lpr);
  }

  const avg = lprValues.length ? lprValues.reduce((a, b) => a + b, 0) / lprValues.length : 0;
  const min = lprValues.length ? Math.min(...lprValues) : 0;

  return {
    present: true,
    totalRows: rows.length,
    sections: Array.from(bySection.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    lprAvg: Number(avg.toFixed(3)),
    lprMin: Number(min.toFixed(3)),
    sample: rows.slice(0, 3).map(row => ({
      id: row?.id,
      original: (row?.original || '').slice(0, 140),
      enhanced: (row?.enhanced || '').slice(0, 140),
      english: (row?.english || '').slice(0, 140),
    })),
  };
}

const root = process.cwd();
const pkgPath = join(root, 'package.json');
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null;
const envExample = existsSync(join(root, '.env.example'));
const envLocalRaw = existsSync(join(root, '.env.local')) ? readFileSync(join(root, '.env.local'), 'utf8') : null;

const filesOfInterest = listFiles(root, [
  'package.json',
  'next.config.js',
  'next.config.mjs',
  'tsconfig.json',
  'jsconfig.json',
  'scripts',
  'build',
  'lib',
  'app',
  'outputs',
  'reports',
  'config',
]).filter(rel => /(^package\.json$)|(^scripts\/.*\.(?:mjs|ts|js)$)|(^build\/.*\.(?:mjs|ts|js)$)|(^lib\/.*\.(?:ts|js|mdc|mjs)$)|(^app\/.*\.(?:tsx|ts|js)$)|(^reports\/.*\.(?:md|json)$)|(^config\/.*\.(?:json|md)$)/.test(rel));

const triviewPath = join(root, 'outputs', 'triview.json');
const translationNdjsonPath = join(root, 'outputs', 'state', 'translation.ndjson');
const triviewInfo = analyzeTriview(triviewPath);
const triviewHeadTail = readHeadTail(triviewPath, 120, 120);
const translationHeadTail = readHeadTail(translationNdjsonPath, 40, 40);

const report = [];
report.push('# CODEX SUPPORT BUNDLE');
report.push(`Generated: ${new Date().toISOString()}`);
report.push('');
report.push('## 1) Project');
report.push(`- name: ${pkg?.name || '<unknown>'}`);
report.push(`- version: ${pkg?.version || '<unknown>'}`);
if (pkg?.scripts) {
  report.push('\n### Scripts');
  report.push('```json');
  report.push(JSON.stringify(pkg.scripts, null, 2));
  report.push('```');
}

report.push('\n## 2) Environment (sanitized)');
if (envExample) report.push('- .env.example present ✅');
if (envLocalRaw) {
  report.push('- .env.local present (sanitized) ✅');
  report.push('```');
  report.push(maskSecrets(envLocalRaw));
  report.push('```');
}

report.push(`\n## 3) Files of interest (${filesOfInterest.length})`);
report.push('```');
for (const rel of filesOfInterest) report.push(rel);
report.push('```');

report.push('\n## 4) Triview analysis');
report.push(`- present: ${triviewInfo.present}`);
if (triviewInfo.present) {
  report.push(`- rows: ${triviewInfo.totalRows}`);
  report.push(`- sections: ${triviewInfo.sections.map(([id, count]) => `${id}:${count}`).join(', ') || '<none>'}`);
  report.push(`- LPR avg: ${triviewInfo.lprAvg} | LPR min: ${triviewInfo.lprMin}`);
  report.push('- sample rows:');
  report.push('```json');
  report.push(JSON.stringify(triviewInfo.sample, null, 2));
  report.push('```');
}

report.push('\n### triview.json head/tail');
report.push(triviewHeadTail.present ? `- lines: ${triviewHeadTail.lineCount}, size: ${triviewHeadTail.size}B` : '- missing');
if (triviewHeadTail.present) {
  report.push('\n```json');
  report.push(triviewHeadTail.head);
  report.push('```');
  report.push('...');
  report.push('```json');
  report.push(triviewHeadTail.tail);
  report.push('```');
}

report.push('\n### translation.ndjson tail');
if (translationHeadTail.present) {
  report.push('```ndjson');
  report.push(translationHeadTail.tail);
  report.push('```');
} else {
  report.push('- missing');
}

report.push('\n## 5) Reports (if any)');
for (const rel of ['reports/quality-gates.md', 'reports/quality-gates.json', 'reports/deployment-report.md', 'reports/deployment-report.json']) {
  report.push(`- ${rel}: ${existsSync(join(root, rel)) ? 'present ✅' : 'missing'}`);
}

report.push('\n## 6) Export artifacts');
for (const rel of ['outputs/book-final.docx', 'outputs/book-final.epub', 'outputs/audiobook']) {
  report.push(`- ${rel}: ${existsSync(join(root, rel)) ? 'present ✅' : 'missing'}`);
}

writeFileSync(join(root, 'CODEX_SUPPORT.md'), report.join('\n'));
console.log('Wrote CODEX_SUPPORT.md');
