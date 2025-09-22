"use strict";
/**
 * English Readability Analysis Module
 *
 * Provides Flesch-Kincaid grade calculation and sentence length statistics
 * for integration with the translation pipeline quality gates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFleschKincaidGrade = calculateFleschKincaidGrade;
exports.analyzeReadability = analyzeReadability;
exports.checkReadabilityFlags = checkReadabilityFlags;
exports.getReadabilitySummary = getReadabilitySummary;
/**
 * Calculate Flesch-Kincaid grade level
 */
function calculateFleschKincaidGrade(text) {
    const sentences = segmentSentences(text);
    const words = countWords(text);
    const syllables = countSyllables(text);
    if (sentences === 0 || words === 0)
        return 0;
    const avgSentenceLength = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    const grade = (0.39 * avgSentenceLength) + (11.8 * avgSyllablesPerWord) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
}
/**
 * Calculate comprehensive readability metrics
 */
function analyzeReadability(text) {
    const sentences = segmentSentences(text);
    const sentenceLengths = getSentenceLengths(text);
    const totalWords = countWords(text);
    const longSentences = sentenceLengths.filter(len => len > 30);
    const avgLen = sentences > 0 ? totalWords / sentences : 0;
    const longPct = sentences > 0 ? (longSentences.length / sentences) * 100 : 0;
    const medianLength = getMedian(sentenceLengths);
    const grade = calculateFleschKincaidGrade(text);
    return {
        grade,
        avgLen: Math.round(avgLen * 10) / 10,
        longPct: Math.round(longPct * 10) / 10,
        totalSentences: sentences,
        totalWords,
        medianLength: Math.round(medianLength * 10) / 10
    };
}
/**
 * Check if readability meets target criteria
 */
function checkReadabilityFlags(metrics) {
    return {
        gradeOutOfRange: metrics.grade < 8 || metrics.grade > 11,
        tooManyLongSentences: metrics.longPct > 25,
        medianTooHigh: metrics.medianLength > 20
    };
}
/**
 * Segment text into sentences using multiple delimiters
 */
function segmentSentences(text) {
    if (!text.trim())
        return 0;
    // Handle common sentence endings, including those with quotations
    const sentences = text
        .split(/[.!?]+[\s\n\r]+|[.!?]+["'][\s\n\r]+|[.!?]+$/)
        .filter(s => s.trim().length > 0);
    return sentences.length;
}
/**
 * Get array of sentence lengths in words
 */
function getSentenceLengths(text) {
    if (!text.trim())
        return [];
    const sentences = text
        .split(/[.!?]+[\s\n\r]+|[.!?]+["'][\s\n\r]+|[.!?]+$/)
        .filter(s => s.trim().length > 0);
    return sentences.map(sentence => countWordsInSentence(sentence.trim()));
}
/**
 * Count words in a sentence
 */
function countWordsInSentence(sentence) {
    if (!sentence.trim())
        return 0;
    // Split on whitespace and filter out empty strings
    return sentence.trim().split(/\s+/).filter(word => word.length > 0).length;
}
/**
 * Count total words in text
 */
function countWords(text) {
    if (!text.trim())
        return 0;
    // Remove extra whitespace and split on word boundaries
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
}
/**
 * Estimate syllable count for Flesch-Kincaid calculation
 */
function countSyllables(text) {
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    return words.reduce((total, word) => {
        return total + countSyllablesInWord(word);
    }, 0);
}
/**
 * Estimate syllables in a single word using common heuristics
 */
function countSyllablesInWord(word) {
    if (word.length <= 3)
        return 1;
    // Remove common non-syllabic endings
    word = word.replace(/(?:es|ed|ing|tion|sion|ly)$/, '');
    // Count vowel groups
    const vowelGroups = word.match(/[aeiouy]+/g) || [];
    let syllables = vowelGroups.length;
    // Adjust for silent e
    if (word.endsWith('e') && syllables > 1) {
        syllables--;
    }
    // Ensure minimum of 1 syllable
    return Math.max(1, syllables);
}
/**
 * Calculate median of an array of numbers
 */
function getMedian(numbers) {
    if (numbers.length === 0)
        return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    else {
        return sorted[middle];
    }
}
/**
 * Generate human-readable readability summary
 */
function getReadabilitySummary(metrics, flags) {
    const issues = [];
    if (flags.gradeOutOfRange) {
        issues.push(`Grade ${metrics.grade} outside target range [8,11]`);
    }
    if (flags.tooManyLongSentences) {
        issues.push(`${metrics.longPct}% long sentences (target ≤25%)`);
    }
    if (flags.medianTooHigh) {
        issues.push(`Median ${metrics.medianLength} words (target ≤20)`);
    }
    if (issues.length === 0) {
        return `✓ Readability: Grade ${metrics.grade}, ${metrics.longPct}% long sentences, median ${metrics.medianLength} words`;
    }
    return `⚠ Readability issues: ${issues.join(', ')}`;
}
