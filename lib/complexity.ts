export interface ComplexityFactors {
  wordCount: number;
  hasScriptureRef: boolean;
  hasClassicalVocab: boolean;
  sentenceLength: 'short' | 'medium' | 'long';
  grammaticalComplexity: 'low' | 'medium' | 'high';
}

export interface ComplexityResult {
  score: number;
  factors: ComplexityFactors;
  needsFullPipeline: boolean;
}

export function calculateLPR(originalText: string, translatedText: string): number {
  const originalWords = originalText.trim().split(/\s+/).length;
  const translatedWords = translatedText.trim().split(/\s+/).length;

  if (originalWords === 0) return 0;
  return translatedWords / originalWords;
}

export function scoreArabicRow(arabicText: string): ComplexityResult {
  if (!arabicText || typeof arabicText !== 'string') {
    throw new Error('Invalid Arabic text input');
  }

  const text = arabicText.trim();
  const wordCount = text.split(/\s+/).length;

  const hasScriptureRef = /\d+:\d+/.test(text);

  const classicalMarkers = [
    'قال', 'فقال', 'وقال', 'إن', 'أن', 'الذي', 'التي', 'الذين', 'اللاتي',
    'عليه السلام', 'صلى الله عليه وسلم', 'رضي الله عنه', 'رحمه الله'
  ];
  const hasClassicalVocab = classicalMarkers.some(marker => text.includes(marker));

  const sentenceLength: 'short' | 'medium' | 'long' =
    wordCount <= 10 ? 'short' :
    wordCount <= 25 ? 'medium' : 'long';

  const complexGrammarPatterns = [
    /إذ\s+/, /إذا\s+/, /لو\s+/, /أما\s+/, /كأن\s+/,
    /ليس\s+/, /ما\s+زال/, /لا\s+يزال/
  ];
  const hasComplexGrammar = complexGrammarPatterns.some(pattern => pattern.test(text));

  const grammaticalComplexity: 'low' | 'medium' | 'high' =
    hasComplexGrammar ? 'high' :
    hasClassicalVocab ? 'medium' : 'low';

  let baseScore = Math.min(wordCount * 0.05, 0.6);

  if (hasScriptureRef) baseScore += 0.15;
  if (hasClassicalVocab) baseScore += 0.1;
  if (sentenceLength === 'long') baseScore += 0.1;
  if (grammaticalComplexity === 'high') baseScore += 0.15;
  else if (grammaticalComplexity === 'medium') baseScore += 0.08;

  const score = Math.min(baseScore, 1.0);

  const factors: ComplexityFactors = {
    wordCount,
    hasScriptureRef,
    hasClassicalVocab,
    sentenceLength,
    grammaticalComplexity
  };

  const needsFullPipeline = score > 0.4 || hasScriptureRef || wordCount > 20;

  return {
    score,
    factors,
    needsFullPipeline
  };
}

export function needsFullPipeline(complexityResult: ComplexityResult): boolean {
  return complexityResult.needsFullPipeline;
}

