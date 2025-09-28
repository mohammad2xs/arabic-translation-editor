/**
 * English Audience Suitability Analysis Module
 *
 * Detects content that may be inappropriate for general educated audiences,
 * including excessive jargon, passive voice overload, and archaic language.
 */

export interface AudienceSuitability {
  flags: string[];       // Array of detected issues
  score: number;         // Overall suitability score (0-100, higher is better)
  details: {
    jargonCount: number;
    jargonDensity: number;
    passiveOverload: boolean;
    archaicTerms: string[];
    clicheMetaphors: string[];
    academicJargon: string[];
  };
}

export interface AudienceFlags {
  hasJargonOverload: boolean;     // Too much specialized terminology
  hasPassiveOverload: boolean;    // Excessive passive voice constructions
  hasArchaicLanguage: boolean;    // Outdated vocabulary
  hasClicheOverload: boolean;     // Overuse of tired metaphors
}

/**
 * Analyze text for audience suitability issues
 */
export function analyzeAudienceSuitability(text: string): AudienceSuitability {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const sentences = segmentSentences(text);

  const jargonTerms = detectJargon(text);
  const passiveOverload = detectPassiveOverload(text, sentences.length);
  const archaicTerms = detectArchaicTerms(text);
  const clicheMetaphors = detectClicheMetaphors(text);
  const academicJargon = detectAcademicJargon(text);

  const flags: string[] = [];
  let score = 100;

  // Assess jargon density
  const jargonDensity = words.length ? (jargonTerms.length / words.length) * 100 : 0;
  if (jargonDensity > 5) {
    flags.push(`High jargon density: ${jargonDensity.toFixed(1)}%`);
    score -= Math.min(30, jargonDensity * 2);
  }

  // Check passive voice overload
  if (passiveOverload) {
    flags.push('Excessive passive voice constructions');
    score -= 20;
  }

  // Check archaic language
  if (archaicTerms.length > 0) {
    flags.push(`Archaic terms detected: ${archaicTerms.slice(0, 3).join(', ')}${archaicTerms.length > 3 ? '...' : ''}`);
    score -= Math.min(25, archaicTerms.length * 5);
  }

  // Check cliché overload
  if (clicheMetaphors.length > 2) {
    flags.push(`Overuse of clichéd metaphors: ${clicheMetaphors.length} detected`);
    score -= Math.min(15, clicheMetaphors.length * 3);
  }

  // Check academic jargon
  if (academicJargon.length > 3) {
    flags.push(`Academic jargon overload: ${academicJargon.slice(0, 2).join(', ')}...`);
    score -= Math.min(20, academicJargon.length * 2);
  }

  return {
    flags,
    score: Math.max(0, Math.round(score)),
    details: {
      jargonCount: jargonTerms.length,
      jargonDensity,
      passiveOverload,
      archaicTerms,
      clicheMetaphors,
      academicJargon
    }
  };
}

/**
 * Check if audience suitability meets acceptance criteria
 */
export function checkAudienceFlags(suitability: AudienceSuitability): AudienceFlags {
  return {
    hasJargonOverload: suitability.details.jargonDensity > 5, // More than 5% jargon
    hasPassiveOverload: suitability.details.passiveOverload,
    hasArchaicLanguage: suitability.details.archaicTerms.length > 0,
    hasClicheOverload: suitability.details.clicheMetaphors.length > 2
  };
}

/**
 * Detect specialized jargon terms
 */
function detectJargon(text: string): string[] {
  const jargonPatterns = [
    // Academic/philosophical jargon
    /\b(?:hermeneutic|epistemolog|ontolog|phenomenolog|dialectic|heuristic|paradigmatic|teleolog|deontolog|axiomatic)\w*\b/gi,
    // Technical Islamic terminology (excluding basic terms that should be preserved)
    /\b(?:eschatological|soteriological|christological|pneumatological|trinitarian|ecclesiastical)\w*\b/gi,
    // Overly complex alternatives to simple words
    /\b(?:utilize|facilitate|implement|demonstrate|incorporate|initiate|terminate|conceptualize)\b/gi,
    // Academic hedging language overuse
    /\b(?:purportedly|ostensibly|presumably|conceivably|hypothetically|theoretically)\b/gi
  ];

  const matches: string[] = [];
  jargonPatterns.forEach(pattern => {
    const found = text.match(pattern) || [];
    matches.push(...found.map(match => match.toLowerCase()));
  });

  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Detect excessive passive voice constructions
 */
function detectPassiveOverload(text: string, sentenceCount: number): boolean {
  if (sentenceCount === 0) return false;

  // Pattern for passive voice: form of "be" + past participle
  const passivePatterns = [
    /\b(?:is|are|was|were|being|been|be)\s+\w+ed\b/gi,
    /\b(?:is|are|was|were|being|been|be)\s+(?:given|taken|made|done|seen|found|used|said|told|shown)\b/gi
  ];

  let passiveCount = 0;
  passivePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    passiveCount += matches.length;
  });

  const passivePercentage = (passiveCount / sentenceCount) * 100;
  return passivePercentage > 30; // More than 30% passive constructions
}

/**
 * Detect archaic or outdated vocabulary
 */
function detectArchaicTerms(text: string): string[] {
  const archaicTerms = [
    'whilst', 'amongst', 'betwixt', 'hitherto', 'heretofore', 'wherein', 'whereby',
    'therein', 'thereof', 'whereof', 'whereupon', 'notwithstanding', 'inasmuch',
    'insofar', 'howbeit', 'albeit', 'methinks', 'perchance', 'mayhap',
    'verily', 'forsooth', 'prithee', 'thence', 'whence', 'hence'
  ];

  const found: string[] = [];
  const textLower = text.toLowerCase();

  archaicTerms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(textLower)) {
      found.push(term);
    }
  });

  return found;
}

/**
 * Detect overused clichéd metaphors and expressions
 */
function detectClicheMetaphors(text: string): string[] {
  const clichePatterns = [
    /tip of the iceberg/gi,
    /think outside the box/gi,
    /paradigm shift/gi,
    /low-hanging fruit/gi,
    /move the needle/gi,
    /game changer/gi,
    /at the end of the day/gi,
    /it goes without saying/gi,
    /needless to say/gi,
    /last but not least/gi,
    /in this day and age/gi,
    /crystal clear/gi,
    /few and far between/gi
  ];

  const matches: string[] = [];
  clichePatterns.forEach(pattern => {
    const found = text.match(pattern) || [];
    matches.push(...found);
  });

  return matches;
}

/**
 * Detect academic jargon inappropriate for general audiences
 */
function detectAcademicJargon(text: string): string[] {
  const academicJargon = [
    'aforementioned', 'heretofore', 'notwithstanding', 'vis-à-vis', 'qua',
    'ipso facto', 'per se', 'prima facie', 'sine qua non', 'sui generis',
    'mutatis mutandis', 'ceteris paribus', 'inter alia', 'exempli gratia',
    'videlicet', 'scilicet', 'ergo', 'henceforth', 'forthwith', 'heretofore'
  ];

  const found: string[] = [];
  const textLower = text.toLowerCase();

  academicJargon.forEach(term => {
    const regex = new RegExp(`\\b${term.replace(/[^a-z]/gi, '\\$&')}\\b`, 'gi');
    if (regex.test(textLower)) {
      found.push(term);
    }
  });

  return found;
}

/**
 * Simple sentence segmentation for analysis
 */
function segmentSentences(text: string): string[] {
  if (!text.trim()) return [];

  return text
    .split(/[.!?]+[\s\n\r]+|[.!?]+["'][\s\n\r]+|[.!?]+$/)
    .filter(s => s.trim().length > 0);
}

/**
 * Generate human-readable audience suitability summary
 */
export function getAudienceSuitabilitySummary(suitability: AudienceSuitability): string {
  if (suitability.score >= 80) {
    return `✓ Audience suitability: ${suitability.score}/100 (Good for general readers)`;
  } else if (suitability.score >= 60) {
    return `⚠ Audience suitability: ${suitability.score}/100 (May need simplification)`;
  } else {
    return `✗ Audience suitability: ${suitability.score}/100 (Requires significant editing)`;
  }
}

/**
 * Get recommendations for improving audience suitability
 */
export function getAudienceRecommendations(suitability: AudienceSuitability): string[] {
  const recommendations: string[] = [];

  if (suitability.details.jargonCount > 5) {
    recommendations.push('Reduce specialized terminology; define essential terms on first use');
  }

  if (suitability.details.passiveOverload) {
    recommendations.push('Convert excessive passive voice to active constructions');
  }

  if (suitability.details.archaicTerms.length > 0) {
    recommendations.push(`Replace archaic terms: ${suitability.details.archaicTerms.slice(0, 3).join(', ')}`);
  }

  if (suitability.details.clicheMetaphors.length > 2) {
    recommendations.push('Replace clichéd expressions with fresh, direct language');
  }

  if (suitability.details.academicJargon.length > 3) {
    recommendations.push('Simplify academic jargon for general readership');
  }

  return recommendations;
}