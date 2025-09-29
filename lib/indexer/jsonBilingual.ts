/**
 * Bilingual JSON row processor for Arabic-English parallel content
 * Extracts and segments parallel text pairs from JSON objects
 */

import { segmentParagraph } from '../segment';
import { AlignmentStatus } from '../align';

interface ParallelEntry {
  id: string;
  src: string;
  tgt: string;
  status: AlignmentStatus;
  fileRefs: string[];
  paraIndex: number;
  segIndex: number;
  metadata?: any;
}

interface JsonRow {
  [key: string]: any;
}

interface PairPushFunction {
  (entry: ParallelEntry): void;
}

/**
 * Extract and emit parallel pairs from a bilingual JSON row
 * Returns the number of pairs successfully emitted
 */
export function emitPairsFromJsonRow(
  row: JsonRow,
  fileRef: string,
  pushPair: PairPushFunction
): number {
  // Arabic content keys (in priority order)
  const arabicKeys = ["ar", "arabic", "src_ar", "text_ar", "source_ar"];

  // English content keys (in priority order)
  const englishKeys = ["en", "english", "src_en", "tgt_en", "text_en", "target_en"];

  // Find Arabic content
  let arabicText = "";
  for (const key of arabicKeys) {
    if (row[key] && typeof row[key] === 'string' && row[key].trim()) {
      arabicText = row[key].trim();
      break;
    }
  }

  // Find English content
  let englishText = "";
  for (const key of englishKeys) {
    if (row[key] && typeof row[key] === 'string' && row[key].trim()) {
      englishText = row[key].trim();
      break;
    }
  }

  // If we don't have both languages, can't create pairs
  if (!arabicText || !englishText) {
    return 0;
  }

  // Segment both texts
  const arabicSegments = segmentParagraph(arabicText, "ar").segments;
  const englishSegments = segmentParagraph(englishText, "en").segments;

  // Create pairs from parallel segments
  const pairCount = Math.min(arabicSegments.length, englishSegments.length);
  let emittedCount = 0;

  for (let i = 0; i < pairCount; i++) {
    const arabicSeg = arabicSegments[i].trim();
    const englishSeg = englishSegments[i].trim();

    // Skip empty segments
    if (!arabicSeg || !englishSeg) {
      continue;
    }

    // Create parallel entry
    const entry: ParallelEntry = {
      id: `${fileRef}:${i}`,
      src: arabicSeg,
      tgt: englishSeg,
      status: "reviewed", // Mark as reviewed since both languages present
      fileRefs: [fileRef],
      paraIndex: 0, // JSON rows don't have paragraph structure
      segIndex: i,
      metadata: {
        fromBilingualJson: true,
        originalRow: row
      }
    };

    pushPair(entry);
    emittedCount++;
  }

  return emittedCount;
}

/**
 * Check if a JSON object appears to contain bilingual content
 */
export function isBilingualJsonRow(row: JsonRow): boolean {
  const arabicKeys = ["ar", "arabic", "src_ar", "text_ar", "source_ar"];
  const englishKeys = ["en", "english", "src_en", "tgt_en", "text_en", "target_en"];

  const hasArabic = arabicKeys.some(key =>
    row[key] && typeof row[key] === 'string' && row[key].trim()
  );

  const hasEnglish = englishKeys.some(key =>
    row[key] && typeof row[key] === 'string' && row[key].trim()
  );

  return hasArabic && hasEnglish;
}