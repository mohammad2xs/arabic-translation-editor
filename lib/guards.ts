import { calculateLPR } from './complexity';

export interface GuardResult {
  pass: boolean;
  score?: number;
  issues?: string[];
  details?: Record<string, any>;
}

export interface CoverageAnalysis {
  arabicClauses: number;
  englishClauses: number;
  mappedClauses: number;
  unmappedClauses: string[];
  coverageRatio: number;
}

export interface LPRResult extends GuardResult {
  lpr: number;
  targetMin: number;
  recommendation?: 'accept' | 'review' | 'expand' | 'reject';
}

export interface DriftAnalysis extends GuardResult {
  semanticSimilarity: number;
  structuralChanges: string[];
  meaningPreserved: boolean;
}

const LPR_TARGET_MIN = 0.95;
const LPR_TARGET_IDEAL = 1.05;
const LPR_TARGET_MAX = 1.20;

const COVERAGE_THRESHOLD = 0.95;
const DRIFT_THRESHOLD = 0.85;

export function lpr(originalText: string, translatedText: string): LPRResult {
  if (!originalText?.trim() || !translatedText?.trim()) {
    return {
      pass: false,
      lpr: 0,
      targetMin: LPR_TARGET_MIN,
      issues: ['empty_text_input'],
      recommendation: 'reject'
    };
  }

  const lprValue = calculateLPR(originalText, translatedText);
  const pass = lprValue >= LPR_TARGET_MIN;

  let recommendation: LPRResult['recommendation'];
  if (lprValue < LPR_TARGET_MIN) {
    recommendation = 'expand';
  } else if (lprValue < LPR_TARGET_IDEAL) {
    recommendation = 'review';
  } else if (lprValue <= LPR_TARGET_MAX) {
    recommendation = 'accept';
  } else {
    recommendation = 'review';
  }

  const issues: string[] = [];
  if (lprValue < LPR_TARGET_MIN) {
    issues.push('insufficient_length_preservation');
  }
  if (lprValue > LPR_TARGET_MAX) {
    issues.push('excessive_expansion');
  }

  return {
    pass,
    lpr: lprValue,
    targetMin: LPR_TARGET_MIN,
    score: Math.min(lprValue / LPR_TARGET_IDEAL, 1.0),
    issues: issues.length > 0 ? issues : undefined,
    recommendation
  };
}

function extractClauses(text: string): string[] {
  if (!text?.trim()) return [];

  const sentences = text.split(/[.!?؟]/).filter(s => s.trim().length > 0);
  const clauses: string[] = [];

  for (const sentence of sentences) {
    const parts = sentence.split(/[,،;]|(?:\s+(?:و|أو|لكن|however|but|and|or)\s+)/)
      .map(part => part.trim())
      .filter(part => part.length > 0);

    clauses.push(...parts);
  }

  return clauses.filter(clause => clause.length > 3);
}

export function coverage(arabicText: string, englishText: string): CoverageAnalysis & GuardResult {
  const arabicClauses = extractClauses(arabicText);
  const englishClauses = extractClauses(englishText);

  const arabicClauseCount = arabicClauses.length;
  const englishClauseCount = englishClauses.length;

  const mappedClauses = Math.min(arabicClauseCount, englishClauseCount);
  const coverageRatio = arabicClauseCount > 0 ? mappedClauses / arabicClauseCount : 0;

  const unmappedClauses: string[] = [];
  if (arabicClauseCount > englishClauseCount) {
    const unmappedCount = arabicClauseCount - englishClauseCount;
    unmappedClauses.push(...arabicClauses.slice(-unmappedCount));
  }

  const pass = coverageRatio >= COVERAGE_THRESHOLD;
  const issues: string[] = [];

  if (coverageRatio < COVERAGE_THRESHOLD) {
    issues.push('incomplete_semantic_coverage');
  }
  if (unmappedClauses.length > 0) {
    issues.push('unmapped_arabic_clauses');
  }
  if (englishClauseCount === 0 && arabicClauseCount > 0) {
    issues.push('missing_english_translation');
  }

  return {
    pass,
    score: coverageRatio,
    issues: issues.length > 0 ? issues : undefined,
    arabicClauses: arabicClauseCount,
    englishClauses: englishClauseCount,
    mappedClauses,
    unmappedClauses,
    coverageRatio,
    details: {
      arabicSample: arabicClauses.slice(0, 3),
      englishSample: englishClauses.slice(0, 3),
      unmappedSample: unmappedClauses.slice(0, 2)
    }
  };
}

function calculateSemanticSimilarity(original: string, enhanced: string): number {
  const originalWords = new Set(original.toLowerCase().split(/\s+/));
  const enhancedWords = new Set(enhanced.toLowerCase().split(/\s+/));

  const intersection = new Set(Array.from(originalWords).filter(x => enhancedWords.has(x)));
  const union = new Set([...Array.from(originalWords), ...Array.from(enhancedWords)]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

function detectStructuralChanges(original: string, enhanced: string): string[] {
  const changes: string[] = [];

  const originalLength = original.length;
  const enhancedLength = enhanced.length;
  const lengthRatio = originalLength > 0 ? enhancedLength / originalLength : 0;

  if (lengthRatio < 0.95 || lengthRatio > 1.05) {
    changes.push('significant_length_change');
  }

  const originalSentences = original.split(/[.!?؟]/).length;
  const enhancedSentences = enhanced.split(/[.!?؟]/).length;

  if (Math.abs(originalSentences - enhancedSentences) > 1) {
    changes.push('sentence_structure_change');
  }

  const originalQuestions = (original.match(/[?؟]/g) || []).length;
  const enhancedQuestions = (enhanced.match(/[?؟]/g) || []).length;

  if (originalQuestions !== enhancedQuestions) {
    changes.push('question_pattern_change');
  }

  const originalNegations = (original.match(/\b(لا|ليس|ما|غير)\b/g) || []).length;
  const enhancedNegations = (enhanced.match(/\b(لا|ليس|ما|غير)\b/g) || []).length;

  if (Math.abs(originalNegations - enhancedNegations) > 0) {
    changes.push('negation_pattern_change');
  }

  return changes;
}

export function drift(original: string, enhanced: string): DriftAnalysis {
  if (!original?.trim() || !enhanced?.trim()) {
    return {
      pass: false,
      semanticSimilarity: 0,
      structuralChanges: ['empty_input'],
      meaningPreserved: false,
      issues: ['insufficient_input_data']
    };
  }

  const semanticSimilarity = calculateSemanticSimilarity(original, enhanced);
  const structuralChanges = detectStructuralChanges(original, enhanced);

  const meaningPreserved = semanticSimilarity >= DRIFT_THRESHOLD && structuralChanges.length <= 1;
  const pass = meaningPreserved;

  const issues: string[] = [];
  if (semanticSimilarity < DRIFT_THRESHOLD) {
    issues.push('semantic_drift_detected');
  }
  if (structuralChanges.length > 1) {
    issues.push('excessive_structural_changes');
  }

  return {
    pass,
    score: semanticSimilarity,
    semanticSimilarity,
    structuralChanges,
    meaningPreserved,
    issues: issues.length > 0 ? issues : undefined,
    details: {
      threshold: DRIFT_THRESHOLD,
      changeCount: structuralChanges.length,
      similarityScore: semanticSimilarity
    }
  };
}

export interface QualityAssessment {
  overall: GuardResult;
  lpr: LPRResult;
  coverage: CoverageAnalysis & GuardResult;
  drift?: DriftAnalysis;
  recommendation: 'accept' | 'review' | 'expand' | 'reject';
  confidence: number;
}

export function assessQuality(
  arabicOriginal: string,
  arabicEnhanced: string | null,
  englishTranslation: string
): QualityAssessment {
  const lprResult = lpr(arabicOriginal, englishTranslation);
  const coverageResult = coverage(arabicOriginal, englishTranslation);

  let driftResult: DriftAnalysis | undefined;
  if (arabicEnhanced && arabicEnhanced !== arabicOriginal) {
    driftResult = drift(arabicOriginal, arabicEnhanced);
  }

  const allPassed = lprResult.pass && coverageResult.pass && (!driftResult || driftResult.pass);

  const issues: string[] = [];
  if (lprResult.issues) issues.push(...lprResult.issues);
  if (coverageResult.issues) issues.push(...coverageResult.issues);
  if (driftResult?.issues) issues.push(...driftResult.issues);

  let recommendation: QualityAssessment['recommendation'];
  if (!allPassed) {
    if (lprResult.lpr < LPR_TARGET_MIN) {
      recommendation = 'expand';
    } else if (coverageResult.coverageRatio < 0.90 || (driftResult && !driftResult.pass)) {
      recommendation = 'reject';
    } else {
      recommendation = 'review';
    }
  } else {
    recommendation = 'accept';
  }

  const scores = [lprResult.score || 0, coverageResult.score || 0];
  if (driftResult?.score !== undefined) scores.push(driftResult.score);

  const confidence = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return {
    overall: {
      pass: allPassed,
      score: confidence,
      issues: issues.length > 0 ? issues : undefined
    },
    lpr: lprResult,
    coverage: coverageResult,
    drift: driftResult,
    recommendation,
    confidence
  };
}

export interface GuardConfig {
  lprMin?: number;
  coverageThreshold?: number;
  driftThreshold?: number;
  strictMode?: boolean;
}

export function configureGuards(config: GuardConfig): void {
  if (config.lprMin !== undefined && config.lprMin > 0 && config.lprMin <= 2.0) {
    Object.defineProperty(globalThis, 'LPR_TARGET_MIN', { value: config.lprMin, writable: true });
  }

  if (config.coverageThreshold !== undefined && config.coverageThreshold > 0 && config.coverageThreshold <= 1.0) {
    Object.defineProperty(globalThis, 'COVERAGE_THRESHOLD', { value: config.coverageThreshold, writable: true });
  }

  if (config.driftThreshold !== undefined && config.driftThreshold > 0 && config.driftThreshold <= 1.0) {
    Object.defineProperty(globalThis, 'DRIFT_THRESHOLD', { value: config.driftThreshold, writable: true });
  }
}