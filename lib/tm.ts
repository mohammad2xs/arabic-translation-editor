// @ts-nocheck
import fs from 'fs/promises';
import path from 'path';

interface TMEntry {
  id: string;
  arabic: string;
  english: string;
  score: number;
  usageCount: number;
  lastUsed: string;
  metadata?: {
    complexity?: number;
    domain?: string;
    quality?: number;
  };
}

interface TMDatabase {
  version: string;
  lastUpdated: string;
  entries: TMEntry[];
  statistics: {
    totalEntries: number;
    averageScore: number;
    totalUsages: number;
  };
}

const TM_THRESHOLD = 0.90;
const TM_FILE_PATH = 'outputs/tm.json';
const MAX_ENTRIES = 10000;

let tmCache: TMDatabase | null = null;

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ًٌٍَُِْ]/g, '')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function tmInit(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TM_FILE_PATH), { recursive: true });

    try {
      const data = await fs.readFile(TM_FILE_PATH, 'utf8');
      tmCache = JSON.parse(data);

      if (tmCache && tmCache.version !== '1.0') {
        console.warn('TM version mismatch, reinitializing...');
        tmCache = null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Error reading TM file:', error);
      }
    }

    if (!tmCache) {
      tmCache = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        entries: [],
        statistics: {
          totalEntries: 0,
          averageScore: 0,
          totalUsages: 0
        }
      };
      await saveTM();
    }

  } catch (error) {
    console.error('Failed to initialize TM:', error);
    throw error;
  }
}

async function saveTM(): Promise<void> {
  if (!tmCache) return;

  tmCache.lastUpdated = new Date().toISOString();
  tmCache.statistics = {
    totalEntries: tmCache.entries.length,
    averageScore: tmCache.entries.length > 0
      ? tmCache.entries.reduce((sum, entry) => sum + entry.score, 0) / tmCache.entries.length
      : 0,
    totalUsages: tmCache.entries.reduce((sum, entry) => sum + entry.usageCount, 0)
  };

  try {
    await fs.writeFile(TM_FILE_PATH, JSON.stringify(tmCache, null, 2));
  } catch (error) {
    console.error('Failed to save TM:', error);
    throw error;
  }
}

export interface TMSuggestion {
  id: string;
  arabic: string;
  english: string;
  similarity: number;
  score: number;
  usageCount: number;
  metadata?: TMEntry['metadata'];
}

export async function tmSuggest(arabicText: string): Promise<TMSuggestion[]> {
  if (!tmCache) {
    await tmInit();
  }

  if (!tmCache || !arabicText?.trim()) {
    return [];
  }

  const normalizedInput = normalizeArabicText(arabicText);
  const suggestions: TMSuggestion[] = [];

  for (const entry of tmCache.entries) {
    const normalizedEntry = normalizeArabicText(entry.arabic);
    const similarity = calculateSimilarity(normalizedInput, normalizedEntry);

    if (similarity >= TM_THRESHOLD) {
      suggestions.push({
        id: entry.id,
        arabic: entry.arabic,
        english: entry.english,
        similarity,
        score: entry.score,
        usageCount: entry.usageCount,
        metadata: entry.metadata
      });

      entry.usageCount++;
      entry.lastUsed = new Date().toISOString();
    }
  }

  suggestions.sort((a, b) => {
    if (Math.abs(a.similarity - b.similarity) < 0.01) {
      return b.usageCount - a.usageCount;
    }
    return b.similarity - a.similarity;
  });

  if (suggestions.length > 0) {
    await saveTM();
  }

  return suggestions.slice(0, 5);
}

export async function tmLearn(arabicText: string, englishText: string, metadata?: TMEntry['metadata']): Promise<void> {
  if (!tmCache) {
    await tmInit();
  }

  if (!tmCache || !arabicText?.trim() || !englishText?.trim()) {
    return;
  }

  const normalizedArabic = normalizeArabicText(arabicText);

  const existingIndex = tmCache.entries.findIndex(entry =>
    normalizeArabicText(entry.arabic) === normalizedArabic
  );

  const words = arabicText.split(/\s+/).length;
  const score = Math.min(0.5 + (words * 0.05), 1.0);

  if (existingIndex >= 0) {
    const existing = tmCache.entries[existingIndex];
    existing.english = englishText;
    existing.score = Math.max(existing.score, score);
    existing.usageCount = Math.max(existing.usageCount, 1);
    existing.lastUsed = new Date().toISOString();
    if (metadata) {
      existing.metadata = { ...existing.metadata, ...metadata };
    }
  } else {
    if (tmCache.entries.length >= MAX_ENTRIES) {
      tmCache.entries.sort((a, b) => a.usageCount - b.usageCount);
      tmCache.entries.splice(0, Math.floor(MAX_ENTRIES * 0.1));
    }

    const newEntry: TMEntry = {
      id: `tm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      arabic: arabicText.trim(),
      english: englishText.trim(),
      score,
      usageCount: 1,
      lastUsed: new Date().toISOString(),
      metadata
    };

    tmCache.entries.push(newEntry);
  }

  await saveTM();
}

export async function tmStats(): Promise<TMDatabase['statistics'] & { threshold: number }> {
  if (!tmCache) {
    await tmInit();
  }

  return {
    ...tmCache!.statistics,
    threshold: TM_THRESHOLD
  };
}

export async function tmCleanup(minUsage: number = 1, maxAge: number = 30): Promise<number> {
  if (!tmCache) {
    await tmInit();
  }

  if (!tmCache) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);

  const initialCount = tmCache.entries.length;
  tmCache.entries = tmCache.entries.filter(entry => {
    if (entry.usageCount < minUsage) return false;
    if (new Date(entry.lastUsed) < cutoffDate) return false;
    return true;
  });

  const removedCount = initialCount - tmCache.entries.length;

  if (removedCount > 0) {
    await saveTM();
  }

  return removedCount;
}

export async function tmExport(): Promise<TMDatabase> {
  if (!tmCache) {
    await tmInit();
  }

  return JSON.parse(JSON.stringify(tmCache));
}

export async function tmImport(data: TMDatabase): Promise<void> {
  if (data.version !== '1.0') {
    throw new Error('Incompatible TM version');
  }

  tmCache = data;
  await saveTM();
}