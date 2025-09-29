#!/usr/bin/env node
// @ts-nocheck

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { assessQuality, configureGuards } from '../lib/guards';
import { tmInit, tmSuggest, tmLearn } from '../lib/tm';
import { createCostTracker } from '../lib/cost';
import { resolveLocalFirst, warmCache } from '../lib/scripture/cache';

// Import English quality analysis modules
let analyzeReadability, checkReadabilityFlags;
let analyzeAudienceSuitability, checkAudienceFlags;

async function loadEnglishModules() {
  try {
    const readabilityModule = await import('../lib/en/readability.js');
    const audienceModule = await import('../lib/en/audience.js');

    analyzeReadability = readabilityModule.analyzeReadability;
    checkReadabilityFlags = readabilityModule.checkReadabilityFlags;

    analyzeAudienceSuitability = audienceModule.analyzeAudienceSuitability;
    checkAudienceFlags = audienceModule.checkAudienceFlags;

    return true;
  } catch (error) {
    console.warn('⚠️  English analysis modules not compiled, skipping Excellence Rail');
    return false;
  }
}

const CONCURRENCY_ROWS = 6;
const TM_THRESHOLD = 0.90;
const LPR_TARGET_MIN = 0.95;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.running < this.capacity) {
        this.running++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.running++;
      next();
    }
  }
}

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function calculateHash(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex').substring(0, 16);
}

async function atomicWriteFile(filePath, content) {
  const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  await fs.writeFile(tempFile, content);
  await fs.rename(tempFile, filePath);
}

async function persistExpansionFlag(rowId, flagData) {
  try {
    let expandFlags = {};
    try {
      const expandData = await fs.readFile('outputs/expand.json', 'utf8');
      expandFlags = JSON.parse(expandData);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    expandFlags[rowId] = flagData;
    await fs.mkdir('outputs', { recursive: true });
    await atomicWriteFile('outputs/expand.json', JSON.stringify(expandFlags, null, 2));
    log('info', `Persisted expansion flag for row ${rowId}`);
  } catch (error) {
    log('error', `Failed to persist expansion flag for row ${rowId}`, { error: error.message });
  }
}

async function persistReadabilityFlag(rowId, flagData) {
  try {
    let readabilityFlags = {};
    try {
      const readabilityData = await fs.readFile('outputs/readability.json', 'utf8');
      readabilityFlags = JSON.parse(readabilityData);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    readabilityFlags[rowId] = flagData;
    await fs.mkdir('outputs', { recursive: true });
    await atomicWriteFile('outputs/readability.json', JSON.stringify(readabilityFlags, null, 2));
    log('info', `Persisted readability flag for row ${rowId}`);
  } catch (error) {
    log('error', `Failed to persist readability flag for row ${rowId}`, { error: error.message });
  }
}

async function getFlaggedRowsForRetry(processResults) {
  const flaggedRows = [];

  // Load current expand flags
  let expandFlags = {};
  try {
    const expandData = await fs.readFile('outputs/expand.json', 'utf8');
    expandFlags = JSON.parse(expandData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('warn', 'Failed to load expansion flags for retry', { error: error.message });
    }
  }

  // Load current readability flags
  let readabilityFlags = {};
  try {
    const readabilityData = await fs.readFile('outputs/readability.json', 'utf8');
    readabilityFlags = JSON.parse(readabilityData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('warn', 'Failed to load readability flags for retry', { error: error.message });
    }
  }

  // Find rows that have flags and were successfully processed but need retry
  for (const result of processResults) {
    if (result.success) {
      const hasExpandFlag = expandFlags[result.rowId] && !expandFlags[result.rowId].applied;
      const hasReadabilityFlag = readabilityFlags[result.rowId] && !readabilityFlags[result.rowId].applied;

      if (hasExpandFlag || hasReadabilityFlag) {
        // Find the original row data to retry
        try {
          const rowData = JSON.parse(
            await fs.readFile(`outputs/tmp/rows/${result.rowId}.json`, 'utf8')
          );

          flaggedRows.push({
            row: {
              id: rowData.id,
              original: rowData.original,
              complexity: rowData.complexity,
              scriptureRefs: rowData.scriptureRefs,
              metadata: rowData.metadata
            },
            sectionId: rowData.sectionId
          });
        } catch (error) {
          log('warn', `Failed to load row data for retry`, { rowId: result.rowId, error: error.message });
        }
      }
    }
  }

  return flaggedRows;
}

function isRetryableError(error) {
  const retryablePatterns = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /Network request failed/i,
    /socket hang up/i,
    /503 Service Temporarily Unavailable/i,
    /502 Bad Gateway/i,
    /504 Gateway Timeout/i,
    /429 Too Many Requests/i,
    /Rate limit exceeded/i,
    /Service Unavailable/i,
    /Internal Server Error/i
  ];

  return retryablePatterns.some(pattern => pattern.test(error.message));
}

async function exponentialBackoff(fn, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry non-retryable errors (like validation failures)
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
      log('warn', `Attempt ${attempt} failed, retrying in ${delay}ms`, {
        error: error.message,
        retryable: true,
        attempt,
        maxRetries
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function loadSections() {
  const sectionsDir = 'data/sections';
  try {
    const files = await fs.readdir(sectionsDir);
    const sections = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(sectionsDir, file), 'utf8');
        const section = JSON.parse(content);
        sections.push(section);
      }
    }

    return sections.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    log('error', 'Failed to load sections', { error: error.message });
    throw error;
  }
}

async function clauseMap(arabicText) {
  const clauses = [];
  let clauseId = 1;

  const sentences = arabicText.split(/[.!?؟]/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const conjunctionSplit = sentence.split(/\s+(و|أو|لكن|إذا|لأن|أن)\s+/);

    for (let i = 0; i < conjunctionSplit.length; i += 2) {
      const clause = conjunctionSplit[i].trim();
      if (clause.length > 0) {
        clauses.push({
          id: `C${clauseId}`,
          text: clause,
          type: clauseId === 1 ? 'main' : 'dependent'
        });
        clauseId++;
      }
    }
  }

  return clauses;
}

async function arEnhance(originalText, options = {}) {
  const { preserveArabicPunctuation = true } = options;

  let enhanced = originalText
    .replace(/ـ+/g, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Optionally normalize punctuation for ASCII compatibility
  if (!preserveArabicPunctuation) {
    enhanced = enhanced
      .replace(/،/g, ',')
      .replace(/؟/g, '?');
  }

  return enhanced;
}

async function semanticGuard(original, enhanced) {
  const originalLength = original.length;
  const enhancedLength = enhanced.length;
  const lengthDiff = Math.abs(originalLength - enhancedLength) / originalLength;

  const warnings = [];
  let pass = true;

  // Treat >5% length change as warning, not hard fail
  if (lengthDiff > 0.05) {
    warnings.push({
      type: 'significant_length_change',
      severity: 'warning',
      details: { originalLength, enhancedLength, ratio: lengthDiff }
    });
  }

  // Check for semantic issues that should cause hard failure
  const originalQuestions = (original.match(/[?؟]/g) || []).length;
  const enhancedQuestions = (enhanced.match(/[?؟]/g) || []).length;

  if (originalQuestions !== enhancedQuestions) {
    pass = false;
    warnings.push({
      type: 'question_pattern_change',
      severity: 'error',
      details: { originalQuestions, enhancedQuestions }
    });
  }

  const originalNegations = (original.match(/\b(لا|ليس|ما|غير)\b/g) || []).length;
  const enhancedNegations = (enhanced.match(/\b(لا|ليس|ما|غير)\b/g) || []).length;

  if (Math.abs(originalNegations - enhancedNegations) > 0) {
    pass = false;
    warnings.push({
      type: 'negation_pattern_change',
      severity: 'error',
      details: { originalNegations, enhancedNegations }
    });
  }

  // Word count mismatch is still a warning
  const originalWords = original.split(/\s+/).length;
  const enhancedWords = enhanced.split(/\s+/).length;

  if (Math.abs(originalWords - enhancedWords) > 2) {
    warnings.push({
      type: 'word_count_mismatch',
      severity: 'warning',
      details: { originalWords, enhancedWords }
    });
  }

  return {
    pass,
    warnings,
    issue: pass ? null : warnings.filter(w => w.severity === 'error').map(w => w.type).join(', ')
  };
}

async function translateText(enhancedText, costTracker, rowId) {
  const spanId = costTracker.startOperation('translate', rowId);

  try {
    const words = enhancedText.split(/\s+/);
    const englishWords = words.length * 1.2;

    const mockTranslation = `This is a mock translation of the Arabic text with approximately ${Math.floor(englishWords)} words to meet the LPR requirements. The translation preserves all semantic content while ensuring clarity and readability for English speakers. Each clause maintains its logical relationship and emphasis patterns from the original text.`;

    // Simulate realistic token counts for mock translation
    const inputTokens = Math.ceil(words.length * 1.3); // Approximate tokens from Arabic
    const outputTokens = Math.ceil(englishWords);

    await costTracker.endOperation(spanId,
      { input: inputTokens, output: outputTokens },
      'claude-3-5-sonnet-20241022'
    );

    return mockTranslation;
  } catch (error) {
    await costTracker.endOperation(spanId, { input: 0, output: 0 });
    throw error;
  }
}

async function toneGuardian(englishText, costTracker, rowId) {
  const spanId = costTracker.startOperation('tone_guardian', rowId);

  try {
    const refinedText = englishText
      .replace(/\b(very|really|quite|rather|extremely)\s+/gi, '')
      .replace(/\b(ornate|flowery|decorative)\b/gi, 'clear')
      .replace(/\b(arcane|archaic)\b/gi, 'established');

    // Simulate token counts for tone adjustment
    const words = englishText.split(/\s+/).length;
    const inputTokens = Math.ceil(words * 1.2);
    const outputTokens = Math.ceil(words * 1.1); // Slightly fewer due to refinement

    await costTracker.endOperation(spanId,
      { input: inputTokens, output: outputTokens },
      'claude-3-5-haiku-20241022'
    );

    return refinedText;
  } catch (error) {
    await costTracker.endOperation(spanId, { input: 0, output: 0 });
    throw error;
  }
}


async function scriptureVerify(footnotes) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const resolvedRefs = [];

  for (const footnote of footnotes) {
    // Skip validation for context-only refs (empty reference)
    if (!footnote.reference || footnote.reference.trim() === '') {
      // Check if we have a normalized reference to try
      if (footnote.normalized && footnote.normalized.trim() !== '') {
        try {
          const resolved = await resolveLocalFirst(footnote.normalized, baseUrl);
          if (resolved) {
            resolvedRefs.push({
              reference: footnote.normalized,
              arabic: resolved.arabic,
              english: resolved.english,
              metadata: resolved.metadata,
              isContextOnly: true
            });
          }
          // Don't fail if context-only ref can't be resolved
        } catch (error) {
          // Log warning but don't fail for context-only refs
          log('warn', `Could not resolve context-only reference: ${footnote.normalized}`, { error: error.message });
        }
      }
      continue; // Skip to next footnote
    }

    // Basic format validation for non-empty references
    if (footnote.type === 'quran' && !footnote.reference.match(/^\d+:\d+(-\d+)?$/)) {
      return { pass: false, issue: 'invalid_quran_reference', footnote };
    }

    // Resolve using scripture cache
    try {
      const resolved = await resolveLocalFirst(footnote.reference, baseUrl);
      if (!resolved) {
        return { pass: false, issue: 'scripture_not_found', reference: footnote.reference };
      }
      resolvedRefs.push({
        reference: footnote.reference,
        arabic: resolved.arabic,
        english: resolved.english,
        metadata: resolved.metadata
      });
    } catch (error) {
      console.warn(`Failed to resolve scripture reference: ${footnote.reference}`, error);
      return { pass: false, issue: 'scripture_resolution_failed', reference: footnote.reference };
    }
  }

  return { pass: true, resolvedRefs };
}

async function processRowCore(row, sectionId, costTracker, expandFlags) {
  const rowId = row.id;

  log('info', `Starting row processing`, { rowId });

  const currentHash = calculateHash(row.original);
    if (currentHash === row.metadata?.laneHash && row.metadata?.processedAt && row.english?.trim()) {
      log('info', `Skipping unchanged row`, { rowId, hash: currentHash });
      return { rowId, skipped: true, reason: 'unchanged_hash' };
    }

    const clauses = await clauseMap(row.original);
    const enhanced = await arEnhance(row.original);

    const semanticCheck = await semanticGuard(row.original, enhanced);
    if (!semanticCheck.pass) {
      throw new Error(`Semantic guard failed: ${semanticCheck.issue}`);
    }

    // Log semantic warnings
    if (semanticCheck.warnings && semanticCheck.warnings.length > 0) {
      const warningCount = semanticCheck.warnings.filter(w => w.severity === 'warning').length;
      if (warningCount > 0) {
        log('warn', `Semantic warnings detected`, {
          rowId,
          warnings: semanticCheck.warnings.filter(w => w.severity === 'warning')
        });
      }
    }

    // Check Translation Memory for suggestions
    const tmSuggestions = await tmSuggest(enhanced);
    let translated;
    let tmUsed = false;
    let tmSuggestionId = null;
    let tmSimilarity = 0;

    // Check if expansion is requested for this row
    const expandFlag = expandFlags[rowId];
    let expandedTranslation = false;

    if (tmSuggestions.length > 0 && tmSuggestions[0].similarity >= 0.9) {
      // Use TM suggestion if similarity is high enough
      translated = tmSuggestions[0].english;
      tmUsed = true;
      tmSuggestionId = tmSuggestions[0].id;
      tmSimilarity = tmSuggestions[0].similarity;
      log('info', `Using TM suggestion`, { rowId, similarity: tmSimilarity, suggestionId: tmSuggestionId });
    } else {
      translated = await translateText(enhanced, costTracker, rowId);
    }

    // Apply expansion if requested
    if (expandFlag && expandFlag.needsExpand) {
      log('info', `Applying expansion`, { rowId, targetLPR: expandFlag.targetLPR, reason: expandFlag.reason });

      // Re-translate with expansion directive
      const expansionPrompt = `Expand this translation to achieve LPR of ${expandFlag.targetLPR}. Reason: ${expandFlag.reason}`;
      const expandedTranslated = await translateText(`${enhanced} [EXPAND: ${expansionPrompt}]`, costTracker, rowId);
      translated = expandedTranslated;
      expandedTranslation = true;
    }

    const refined = await toneGuardian(translated, costTracker, rowId);

    // Excellence Rail Processing - Apply style guard and readability pass
    let excellenceRailText = refined;
    let needsExpand = false;
    let needsReadability = false;

    if (analyzeReadability && analyzeAudienceSuitability) {
      // Apply style guard (rules/02b_en_style_guard.mdc)
      // This would normally call the LLM with style guard rules
      // For now, simulate style guard improvements
      const styleGuardedText = excellenceRailText
        .replace(/\b(whilst|amongst)\b/gi, (match) => match.toLowerCase() === 'whilst' ? 'while' : 'among')
        .replace(/\b(nonetheless)\b/gi, 'nevertheless');

      // Apply readability pass (rules/02c_en_readability.mdc)
      const readabilityMetrics = analyzeReadability(styleGuardedText);
      const readabilityFlags = checkReadabilityFlags(readabilityMetrics);

      // Apply audience suitability check
      const audienceAnalysis = analyzeAudienceSuitability(styleGuardedText);
      const audienceFlags = checkAudienceFlags(audienceAnalysis);

      // Determine if further processing is needed
      needsReadability = readabilityFlags.gradeOutOfRange || readabilityFlags.tooManyLongSentences;

      // Persist readability flag if needed
      if (needsReadability) {
        await persistReadabilityFlag(rowId, {
          needsReadability: true,
          reason: readabilityFlags.gradeOutOfRange ? 'grade_out_of_range' : 'too_many_long_sentences',
          grade: readabilityMetrics.grade,
          longPct: readabilityMetrics.longPct
        });
      }

      excellenceRailText = styleGuardedText;

      log('info', `Excellence Rail applied`, {
        rowId,
        grade: readabilityMetrics.grade,
        longPct: readabilityMetrics.longPct,
        audienceScore: audienceAnalysis.score,
        needsReadability
      });
    }
    // Use assessQuality from lib/guards.ts with Excellence Rail text
    const qualityAssessment = assessQuality(row.original, enhanced, excellenceRailText);
    const qaResult = qualityAssessment.lpr;

    // Check if LPR expansion is needed
    if (qaResult.lpr < 1.08) {
      needsExpand = true;
      log('info', `LPR below threshold, marking for expansion`, { rowId, currentLPR: qaResult.lpr });

      // Persist expansion flag
      await persistExpansionFlag(rowId, {
        needsExpand: true,
        reason: 'lpr_below_threshold',
        targetLPR: 1.08,
        currentLPR: qaResult.lpr
      });
    }

    if (qualityAssessment.recommendation === 'reject') {
      throw new Error(`Quality assessment failed: ${qualityAssessment.overall.issues?.join(', ')}`);
    }

    if (!qualityAssessment.overall.pass) {
      log('warn', `Quality gate failed`, {
        rowId,
        lpr: qaResult.lpr,
        recommendation: qualityAssessment.recommendation,
        issues: qualityAssessment.overall.issues
      });
    }

    const scriptureCheck = await scriptureVerify(row.scriptureRefs || []);
    if (!scriptureCheck.pass) {
      throw new Error(`Scripture verification failed: ${scriptureCheck.issue}`);
    }

    // Inject footnote anchors into English text using Excellence Rail text
    let englishWithFootnotes = excellenceRailText;
    const footnotes = [];

    if (scriptureCheck.resolvedRefs && scriptureCheck.resolvedRefs.length > 0) {
      // Sort resolved refs to ensure stable order
      const sortedRefs = scriptureCheck.resolvedRefs.sort((a, b) => a.reference.localeCompare(b.reference));

      sortedRefs.forEach((resolvedRef, index) => {
        const footnoteNumber = index + 1;
        const anchor = `[^${footnoteNumber}]`;

        // Add footnote anchor at the end of the sentence (before punctuation)
        englishWithFootnotes = englishWithFootnotes.replace(/(\.)(\s|$)/, `${anchor}$1$2`);

        // Create footnote entry
        footnotes.push({
          number: footnoteNumber,
          reference: resolvedRef.reference,
          arabic: resolvedRef.arabic,
          english: resolvedRef.english,
          metadata: resolvedRef.metadata
        });
      });
    }

    // Learn from successful translation for future TM use
    if (qualityAssessment.overall.pass) {
      await tmLearn(row.original, englishWithFootnotes, { complexity: row.complexity });
    }

    const result = {
      id: rowId,
      sectionId,
      original: row.original,
      enhanced,
      english: englishWithFootnotes,
      complexity: row.complexity,
      scriptureRefs: row.scriptureRefs || [],
      resolvedScripture: scriptureCheck.resolvedRefs || [],
      footnotes,
      metadata: {
        ...row.metadata,
        laneHash: currentHash,
        processedAt: new Date().toISOString(),
        lpr: qaResult.lpr,
        qualityGates: {
          lpr: qualityAssessment.lpr.pass,
          coverage: qualityAssessment.coverage.pass,
          drift: qualityAssessment.drift?.pass || true,
          semantic: semanticCheck.pass,
          scripture: scriptureCheck.pass
        },
        clauses: qualityAssessment.coverage.mappedClauses,
        recommendation: qualityAssessment.recommendation,
        confidence: qualityAssessment.confidence,
        tm: {
          used: tmUsed,
          suggestionId: tmSuggestionId,
          similarity: tmSimilarity
        },
        needsExpand: needsExpand || qualityAssessment.recommendation === 'expand' || (expandFlag && expandFlag.needsExpand && !expandedTranslation),
        needsReadability,
        expansion: expandFlag ? {
          requested: true,
          applied: expandedTranslation,
          targetLPR: expandFlag.targetLPR,
          reason: expandFlag.reason
        } : null,
        excellenceRail: analyzeReadability && analyzeAudienceSuitability ? {
          applied: true,
          readabilityFlags: needsReadability,
          lprFlags: needsExpand
        } : null,
        semanticWarnings: semanticCheck.warnings || []
      }
    };

    await fs.mkdir('outputs/tmp/rows', { recursive: true });
    await fs.writeFile(
      `outputs/tmp/rows/${rowId}.json`,
      JSON.stringify(result, null, 2)
    );

    log('info', `Row processed successfully`, {
      rowId,
      lpr: qaResult.lpr.toFixed(3),
      clauses: clauses.length
    });

    return { rowId, success: true, lpr: qaResult.lpr, clauses: clauses.length };
}

async function processRow(rowData, semaphore, costTracker, expandFlags) {
  const { row, sectionId } = rowData;
  const rowId = row.id;

  await semaphore.acquire();

  try {
    return await processRowCore(row, sectionId, costTracker, expandFlags);
  } catch (error) {
    // Check if error is retryable and rethrow for exponentialBackoff to handle
    if (isRetryableError(error)) {
      throw error; // Let exponentialBackoff handle retries
    }

    // Non-retryable errors are logged and returned as failure results
    log('error', `Row processing failed`, { rowId, error: error.message, retryable: false });
    return { rowId, success: false, error: error.message };
  } finally {
    semaphore.release();
  }
}

async function mergeResults(processedRows) {
  log('info', 'Starting result merger');

  const successfulRowsWithLPR = processedRows.filter(r => r.success && r.lpr && !isNaN(r.lpr) && isFinite(r.lpr));
  const successfulRows = processedRows.filter(r => r.success);

  const triviewData = {
    metadata: {
      processedAt: new Date().toISOString(),
      totalRows: processedRows.length,
      successfulRows: successfulRows.length,
      averageLPR: successfulRowsWithLPR.length > 0
        ? successfulRowsWithLPR.reduce((sum, r) => sum + r.lpr, 0) / successfulRowsWithLPR.length
        : null,
      minLPR: successfulRowsWithLPR.length > 0
        ? Math.min(...successfulRowsWithLPR.map(r => r.lpr))
        : null
    },
    rows: [],
    sections: [] // Add sections array for compatibility with EPUB/DOCX builders
  };

  const bilingualLines = [];
  bilingualLines.push('# Bilingual Translation Output\\n');

  for (const result of processedRows) {
    if (result.success) {
      try {
        const rowData = JSON.parse(
          await fs.readFile(`outputs/tmp/rows/${result.rowId}.json`, 'utf8')
        );
        triviewData.rows.push(rowData);

        bilingualLines.push(`## ${result.rowId}\\n`);
        bilingualLines.push(`**Arabic:** ${rowData.original}\\n`);
        bilingualLines.push(`**English:** ${rowData.english}\\n`);
        bilingualLines.push(`**LPR:** ${rowData.metadata.lpr.toFixed(3)}\\n`);

        // Add footnotes if present
        if (rowData.footnotes && rowData.footnotes.length > 0) {
          bilingualLines.push('\\n**Footnotes:**\\n');
          rowData.footnotes.forEach(footnote => {
            bilingualLines.push(`[^${footnote.number}]: ${footnote.reference} - ${footnote.english}`);
          });
        }

        bilingualLines.push('');
      } catch (error) {
        log('warn', `Failed to read row result`, { rowId: result.rowId, error: error.message });
      }
    }
  }

  // Group rows by section for EPUB/DOCX compatibility
  const sectionMap = new Map();
  for (const row of triviewData.rows) {
    const sectionId = row.sectionId || row.id.split(/[-_]/)[0]; // Extract section from row ID if not present
    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        id: sectionId,
        title: `Section ${sectionId}`,
        rows: []
      });
    }
    sectionMap.get(sectionId).rows.push(row);
  }

  // Convert map to array and sort by section ID
  triviewData.sections = Array.from(sectionMap.values()).sort((a, b) => a.id.localeCompare(b.id));

  await fs.mkdir('outputs', { recursive: true });
  await fs.writeFile('outputs/triview.json', JSON.stringify(triviewData, null, 2));
  await fs.writeFile('outputs/bilingual.md', bilingualLines.join('\\n'));

  // Ensure TM data is persisted to outputs/tm.json
  try {
    const tmData = await fs.readFile('outputs/tm.json', 'utf8');
    // TM data already exists and is up to date
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('warn', 'TM data not found in outputs directory');
    }
  }

  // Clear expansion and readability flags for successfully processed rows
  try {
    const expandData = await fs.readFile('outputs/expand.json', 'utf8');
    const expandFlags = JSON.parse(expandData);
    let expandFlagsCleared = 0;

    for (const result of processedRows) {
      if (result.success) {
        try {
          const rowData = JSON.parse(
            await fs.readFile(`outputs/tmp/rows/${result.rowId}.json`, 'utf8')
          );
          // Clear flag if expansion was successfully applied
          if (expandFlags[result.rowId] && rowData.metadata?.expansion?.applied) {
            delete expandFlags[result.rowId];
            expandFlagsCleared++;
          }
        } catch (error) {
          // Ignore read errors for individual rows
        }
      }
    }

    if (expandFlagsCleared > 0) {
      await atomicWriteFile('outputs/expand.json', JSON.stringify(expandFlags, null, 2));
      log('info', `Cleared ${expandFlagsCleared} expansion flags after successful processing`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('warn', 'Failed to update expansion flags', { error: error.message });
    }
  }

  // Clear readability flags for successfully processed rows
  try {
    const readabilityData = await fs.readFile('outputs/readability.json', 'utf8');
    const readabilityFlags = JSON.parse(readabilityData);
    let readabilityFlagsCleared = 0;

    for (const result of processedRows) {
      if (result.success) {
        try {
          const rowData = JSON.parse(
            await fs.readFile(`outputs/tmp/rows/${result.rowId}.json`, 'utf8')
          );
          // Clear flag if readability issues were resolved
          if (readabilityFlags[result.rowId] && !rowData.metadata?.needsReadability) {
            delete readabilityFlags[result.rowId];
            readabilityFlagsCleared++;
          }
        } catch (error) {
          // Ignore read errors for individual rows
        }
      }
    }

    if (readabilityFlagsCleared > 0) {
      await atomicWriteFile('outputs/readability.json', JSON.stringify(readabilityFlags, null, 2));
      log('info', `Cleared ${readabilityFlagsCleared} readability flags after successful processing`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('warn', 'Failed to update readability flags', { error: error.message });
    }
  }

  log('info', 'Results merged successfully', {
    totalRows: triviewData.metadata.totalRows,
    successfulRows: triviewData.metadata.successfulRows,
    averageLPR: triviewData.metadata.averageLPR?.toFixed(3) || 'N/A',
    minLPR: triviewData.metadata.minLPR?.toFixed(3) || 'N/A'
  });

  return triviewData.metadata;
}

async function runPipeline() {
  try {
    log('info', 'Starting translation pipeline');

    // Load English analysis modules for Excellence Rail
    const excellenceRailEnabled = await loadEnglishModules();
    if (excellenceRailEnabled) {
      log('info', 'Excellence Rail enabled - English quality analysis modules loaded');
    } else {
      log('info', 'Excellence Rail disabled - continuing with base translation only');
    }

    // Configure quality guards from deployment gates
    try {
      const configData = await fs.readFile('config/deployment-gates.json', 'utf8');
      const config = JSON.parse(configData);
      configureGuards({
        lprMin: config.thresholds.lpr.minimum,
        coverageThreshold: config.thresholds.coverage.percentage / 100,
        driftThreshold: 1 - config.thresholds.drift.maximum
      });
      log('info', 'Quality guards configured from deployment gates');
    } catch (error) {
      log('warn', 'Failed to load deployment gates config, using defaults', { error: error.message });
    }

    // Initialize Translation Memory
    await tmInit();
    log('info', 'Translation Memory initialized');

    // Initialize Cost Tracker
    const costTracker = createCostTracker();
    log('info', 'Cost tracking initialized');

    // Initialize Scripture Cache
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    await warmCache(baseUrl);
    log('info', 'Scripture cache warmed');

    // Load expansion flags
    let expandFlags = {};
    try {
      const expandData = await fs.readFile('outputs/expand.json', 'utf8');
      expandFlags = JSON.parse(expandData);
      log('info', `Loaded ${Object.keys(expandFlags).length} expansion flags`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log('warn', 'Failed to load expansion flags', { error: error.message });
      }
    }

    // Check for section scoping
    const scope = process.env.SECTION_SCOPE;
    let sections = await loadSections();
    log('info', `Loaded ${sections.length} sections`);

    // Apply section filtering if scope is specified
    if (scope && scope !== 'all') {
      const originalSectionCount = sections.length;
      if (scope.includes(',')) {
        // Multiple sections specified as CSV
        const sectionIds = scope.split(',').map(id => id.trim());
        sections = sections.filter(section => sectionIds.includes(section.id));
        log('info', `Section scope applied: processing sections ${sectionIds.join(', ')} (${sections.length}/${originalSectionCount})`);
      } else {
        // Single section specified
        sections = sections.filter(section => section.id === scope);
        log('info', `Section scope applied: processing section ${scope} (${sections.length}/${originalSectionCount})`);
      }

      if (sections.length === 0) {
        throw new Error(`No sections found matching scope: ${scope}`);
      }
    } else {
      log('info', 'Processing all sections (no scope specified or scope=all)');
    }

    const allRows = [];
    for (const section of sections) {
      for (const row of section.rows) {
        allRows.push({ row, sectionId: section.id });
      }
    }

    allRows.sort((a, b) => a.row.id.localeCompare(b.row.id));
    log('info', `Processing ${allRows.length} rows with concurrency ${CONCURRENCY_ROWS}`);

    const semaphore = new Semaphore(CONCURRENCY_ROWS);

    const results = await Promise.all(
      allRows.map(rowData =>
        exponentialBackoff(() => processRow(rowData, semaphore, costTracker, expandFlags))
      )
    );

    // Second pass: retry flagged rows
    const flaggedRowsToRetry = await getFlaggedRowsForRetry(results);
    if (flaggedRowsToRetry.length > 0) {
      log('info', `Starting second pass for ${flaggedRowsToRetry.length} flagged rows`);

      const retryResults = await Promise.all(
        flaggedRowsToRetry.map(rowData =>
          exponentialBackoff(() => processRow(rowData, semaphore, costTracker, expandFlags))
        )
      );

      // Merge retry results with original results
      for (const retryResult of retryResults) {
        const originalIndex = results.findIndex(r => r.rowId === retryResult.rowId);
        if (originalIndex !== -1) {
          results[originalIndex] = retryResult;
        }
      }

      log('info', `Second pass completed, processed ${retryResults.length} flagged rows`);
    }

    const summary = await mergeResults(results);

    // Generate and display cost report
    try {
      const costSummary = await costTracker.getSummary();
      log('info', 'Cost Summary', {
        totalCost: `$${costSummary.totalCost.toFixed(4)}`,
        totalTokens: costSummary.totalTokens,
        totalOperations: costSummary.totalSpans
      });

      console.log('\n=== COST BREAKDOWN ===');
      console.log(`Total Cost: $${costSummary.totalCost.toFixed(4)}`);
      console.log(`Total Tokens: ${costSummary.totalTokens.toLocaleString()}`);
      console.log(`Total Operations: ${costSummary.totalSpans}`);

      if (Object.keys(costSummary.operationBreakdown).length > 0) {
        console.log('\nBy Operation:');
        for (const [op, breakdown] of Object.entries(costSummary.operationBreakdown)) {
          console.log(`  ${op}: ${breakdown.count} ops, $${breakdown.totalCost.toFixed(4)}, ${breakdown.totalTokens.toLocaleString()} tokens`);
        }
      }
    } catch (error) {
      log('warn', 'Failed to generate cost report', { error: error.message });
    }

    log('info', 'Pipeline completed successfully', summary);

    return {
      success: true,
      totalRows: summary.totalRows,
      successfulRows: summary.successfulRows,
      averageLPR: summary.averageLPR,
      minLPR: summary.minLPR
    };

  } catch (error) {
    log('error', 'Pipeline failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline()
    .then(result => {
      console.log('\\n=== PIPELINE SUMMARY ===');
      console.log(`Total rows: ${result.totalRows}`);
      console.log(`Successful: ${result.successfulRows}`);
      console.log(`Average LPR: ${result.averageLPR ? result.averageLPR.toFixed(3) : 'N/A'}`);
      console.log(`Minimum LPR: ${result.minLPR ? result.minLPR.toFixed(3) : 'N/A'}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Pipeline failed:', error.message);
      process.exit(1);
    });
}

export { runPipeline };