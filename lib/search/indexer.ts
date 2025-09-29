import { promises as fs } from 'fs';
import path from 'path';
import { normalizeArabic, normalizeEnglish, normalizeScriptureReference, extractLeadingSectionId, replaceNumerals } from './normalizer';
import { SearchIndexRecord, SearchScriptureRef, SearchStatus } from './types';
import { computeCompletionRatio } from './utils';

const SEARCH_INDEX_RELATIVE_PATH = ['public', 'data', 'search-index.json'];
const ALT_OUTPUT_PATH = ['outputs', 'search-index.json'];

interface TriviewRow {
  id: string;
  original: string;
  enhanced: string;
  english: string;
  scriptureRefs?: Array<{
    type?: 'quran' | 'hadith' | 'bible' | 'other';
    reference?: string;
    normalized?: string;
  }>;
  resolvedScripture?: Array<{
    reference?: string;
    arabic?: string;
    english?: string;
    metadata?: {
      surahName?: string;
      surahNameEn?: string;
      collection?: string;
      narrator?: string;
    };
  }>;
  metadata?: {
    sectionId?: string;
    lpr?: number;
    confidence?: number;
    processedAt?: string;
    qualityGates?: Record<string, boolean>;
    noteCount?: number;
    completionRatio?: number;
  };
}

interface SectionFile {
  id: string;
  title: string;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function deriveStatus(row: TriviewRow): SearchStatus {
  const englishFilled = !!row.english && row.english.trim().length > 0;
  const gates = row.metadata?.qualityGates;
  const confidence = row.metadata?.confidence ?? 0;
  const allGatesPassed = gates ? Object.values(gates).every(Boolean) : false;

  if (englishFilled && allGatesPassed && confidence >= 0.8) {
    return 'approved';
  }

  if (englishFilled) {
    return 'in-progress';
  }

  return 'pending';
}

function buildScriptureRefs(row: TriviewRow): SearchScriptureRef[] {
  const refs: SearchScriptureRef[] = [];

  if (Array.isArray(row.scriptureRefs)) {
    for (const ref of row.scriptureRefs) {
      if (!ref) continue;
      refs.push({
        raw: ref.reference ?? '',
        normalized: normalizeScriptureReference([ref.normalized, ref.reference].filter(Boolean).join(' ')),
        type: ref.type,
      });
    }
  }

  if (Array.isArray(row.resolvedScripture)) {
    for (const resolved of row.resolvedScripture) {
      const base = normalizeScriptureReference([
        resolved.reference,
        resolved.metadata?.surahName,
        resolved.metadata?.surahNameEn,
        resolved.metadata?.collection,
        resolved.metadata?.narrator,
      ].filter(Boolean).join(' '));

      refs.push({
        raw: resolved.reference ?? '',
        normalized: base,
        arabicName: resolved.metadata?.surahName,
        englishName: resolved.metadata?.surahNameEn,
        type: 'quran',
      });
    }
  }

  // Ensure unique normalized references
  const deduped = new Map<string, SearchScriptureRef>();
  for (const ref of refs) {
    const key = ref.normalized || ref.raw;
    if (!deduped.has(key)) {
      deduped.set(key, ref);
    }
  }

  return Array.from(deduped.values());
}

async function loadSectionTitles(): Promise<Map<string, string>> {
  const sectionsDir = path.join(process.cwd(), 'data', 'sections');
  const sectionsMap = new Map<string, string>();

  if (!(await pathExists(sectionsDir))) {
    return sectionsMap;
  }

  const entries = await fs.readdir(sectionsDir, { withFileTypes: true });
  await Promise.all(entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(async entry => {
      const filePath = path.join(sectionsDir, entry.name);
      const data = await readJsonFile<SectionFile>(filePath);
      if (data?.id && data?.title) {
        sectionsMap.set(data.id, data.title);
      }
    }));

  return sectionsMap;
}

async function loadNotesCounts(): Promise<Record<string, number>> {
  const candidates = [
    path.join(process.cwd(), 'outputs', 'tmp', 'notes'),
    path.join(process.cwd(), 'outputs', 'notes'),
    path.join(process.cwd(), 'notes'),
  ];

  const notesCounts: Record<string, number> = {};

  for (const directory of candidates) {
    if (!(await pathExists(directory))) continue;

    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(async entry => {
        const filePath = path.join(directory, entry.name);
        const data = await readJsonFile<any>(filePath);
        const rowId = entry.name.replace(/\.json$/, '');
        if (Array.isArray(data)) {
          notesCounts[rowId] = data.length;
        } else if (data && typeof data === 'object' && Array.isArray(data.notes)) {
          notesCounts[rowId] = data.notes.length;
        }
      }));
  }

  return notesCounts;
}

async function loadTriviewRows(): Promise<TriviewRow[]> {
  const triviewPath = path.join(process.cwd(), 'outputs', 'triview.json');
  const triviewData = await readJsonFile<{ rows?: TriviewRow[] }>(triviewPath);
  return triviewData?.rows ?? [];
}

function toIndexRecord(row: TriviewRow, sectionTitle: string | undefined, notesCount: number): SearchIndexRecord {
  const sectionId = row.metadata?.sectionId || extractLeadingSectionId(row.id);
  const status = deriveStatus(row);
  const normalizedEnglish = normalizeEnglish(row.english || '');
  const normalizedArabic = normalizeArabic(`${row.original || ''} ${row.enhanced || ''}`);
  const scriptureRefs = buildScriptureRefs(row);

  const completionRatio = computeCompletionRatio({
    metadata: {
      completionRatio: row.metadata?.completionRatio,
      lpr: row.metadata?.lpr,
      confidence: row.metadata?.confidence,
    },
    status,
    english: row.english,
  });

  return {
    rowId: row.id,
    sectionId,
    sectionTitle: sectionTitle || sectionId || row.id,
    original: row.original || '',
    enhanced: row.enhanced || '',
    english: row.english || '',
    normalizedArabic,
    normalizedEnglish,
    scriptureRefs,
    status,
    notesCount,
    metadata: {
      lpr: row.metadata?.lpr,
      confidence: row.metadata?.confidence,
      updatedAt: row.metadata?.processedAt,
      completionRatio,
    },
  };
}

export async function buildSearchIndex(): Promise<SearchIndexRecord[]> {
  const [rows, sectionTitles, notesCounts] = await Promise.all([
    loadTriviewRows(),
    loadSectionTitles(),
    loadNotesCounts(),
  ]);

  return rows.map(row => {
    const sectionId = row.metadata?.sectionId || extractLeadingSectionId(row.id);
    const sectionTitle = sectionTitles.get(sectionId);
    const notesCount = notesCounts[row.id] ?? row.metadata?.noteCount ?? 0;
    return toIndexRecord(row, sectionTitle, notesCount);
  });
}

async function ensureDirectory(filePath: string) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

export async function writeSearchIndex(records: SearchIndexRecord[], destination?: string): Promise<string> {
  const defaultPath = path.join(process.cwd(), ...SEARCH_INDEX_RELATIVE_PATH);
  const outputPath = destination || defaultPath;
  await ensureDirectory(outputPath);
  await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2), 'utf8');

  // Also persist a copy under outputs for server-only access if no custom destination was provided
  if (!destination) {
    const altPath = path.join(process.cwd(), ...ALT_OUTPUT_PATH);
    try {
      await ensureDirectory(altPath);
      await fs.writeFile(altPath, JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2), 'utf8');
    } catch (error) {
      console.warn('[search-index] Failed to write alternate index copy:', error);
    }
  }

  return outputPath;
}

export async function loadSearchIndexFromDisk(preferredPath?: string): Promise<{ records: SearchIndexRecord[]; generatedAt?: string } | null> {
  const candidates = [
    preferredPath,
    path.join(process.cwd(), ...ALT_OUTPUT_PATH),
    path.join(process.cwd(), ...SEARCH_INDEX_RELATIVE_PATH),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    if (!(await pathExists(filePath))) continue;
    const data = await readJsonFile<{ generatedAt?: string; records?: SearchIndexRecord[] }>(filePath);
    if (data?.records) {
      return {
        records: data.records,
        generatedAt: data.generatedAt,
      };
    }
  }

  return null;
}

export async function refreshSearchIndex(): Promise<SearchIndexRecord[]> {
  const records = await buildSearchIndex();
  await writeSearchIndex(records);
  return records;
}
