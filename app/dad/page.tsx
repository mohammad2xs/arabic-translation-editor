'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DadHeader from '../(components)/DadHeader';
import TriContinuous from '../(components)/TriContinuous';
import {
  useDadPrefs,
  getReviewedRows,
  markRowReviewed,
  DadPrefs,
  DadDensity,
  RowsPerViewOption,
  VisibleColumns,
} from '../../lib/state/dad';
import type { Lane } from '../../lib/audio/types';
import { playSectionNarration } from '../(components)/AudioBar';

interface SectionSummary {
  id: string;
  title: string;
  count?: number;
}

interface SectionRow {
  id: string;
  original: string;
  enhanced: string;
  english: string;
  metadata?: Record<string, any>;
  dadModeMetadata?: {
    noteCount?: number;
    reviewed?: boolean;
  };
}

interface SectionsResponse {
  sections: SectionSummary[];
}

interface SectionApiResponse {
  id: string;
  title: string;
  rows: SectionRow[];
  metadata?: {
    requestedAt?: string;
  };
}

export default function DadPage() {
  const {
    prefs,
    updatePrefs,
    setDensity,
    setRowsPerView,
    setVisibleColumns,
    setLastSectionId,
  } = useDadPrefs();

  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(true);
  const [loadingRows, setLoadingRows] = useState<boolean>(false);
  const [pendingNotes, setPendingNotes] = useState<number>(0);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [audioMessage, setAudioMessage] = useState<string>('Audio controls ready');
  const reviewedRowsRef = useRef<Set<string>>(new Set());

  const refreshSections = useCallback(async () => {
    setLoadingSections(true);
    try {
      const response = await fetch('/api/sections');
      if (!response.ok) {
        throw new Error(`Failed to load sections (${response.status})`);
      }
      const data: SectionsResponse = await response.json();
      setSections(data.sections ?? []);
      setErrorNote(null);
    } catch (error) {
      console.error('Failed to fetch sections', error);
      setSections([]);
      setErrorNote('Sections list unavailable; load data and retry.');
    } finally {
      setLoadingSections(false);
    }
  }, []);

  const loadSectionRows = useCallback(async (sectionId: string) => {
    if (!sectionId) return;
    setLoadingRows(true);
    try {
      const response = await fetch(`/api/sections/${sectionId}?dadMode=true`);
      if (!response.ok) {
        throw new Error(`Failed to load section ${sectionId}`);
      }
      const data: SectionApiResponse = await response.json();
      const retrievedRows = data.rows ?? [];
      setRows(retrievedRows);
      setPendingNotes(
        retrievedRows.reduce((total, row) => {
          if (row.dadModeMetadata?.noteCount != null) return total + row.dadModeMetadata.noteCount;
          if (row.metadata?.notes && Array.isArray(row.metadata.notes)) return total + row.metadata.notes.length;
          if (typeof row.metadata?.noteCount === 'number') return total + (row.metadata.noteCount as number);
          return total;
        }, 0),
      );
      setLastSaved(data.metadata?.requestedAt ?? new Date().toISOString());
      reviewedRowsRef.current = getReviewedRows(sectionId);
      setErrorNote(null);
    } catch (error) {
      console.error('Failed to fetch section rows', error);
      setRows([]);
      setPendingNotes(0);
      setErrorNote(`Rows missing for ${sectionId}; ensure /data/sections/${sectionId}.json exists.`);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    refreshSections();
  }, [refreshSections]);

  useEffect(() => {
    if (!sections.length || loadingSections) return;
    setSelectedSectionId((current) => {
      if (current && sections.some((section) => section.id === current)) {
        return current;
      }
      const preferred = prefs.lastSectionId;
      if (preferred && sections.some((section) => section.id === preferred)) {
        return preferred;
      }
      return sections[0]?.id ?? '';
    });
  }, [sections, prefs.lastSectionId, loadingSections]);

  useEffect(() => {
    if (!selectedSectionId) return;
    setLastSectionId(selectedSectionId);
    loadSectionRows(selectedSectionId);
    setAudioMessage('Audio controls ready');
  }, [selectedSectionId, loadSectionRows, setLastSectionId]);

  const reviewedCount = reviewedRowsRef.current.size;
  const totalRows = rows.length;

  const handleMarkReviewed = useCallback((rowId: string) => {
    if (!rowId) return;
    reviewedRowsRef.current = new Set(reviewedRowsRef.current);
    reviewedRowsRef.current.add(rowId);
    markRowReviewed(selectedSectionId, rowId);
    setLastSaved(new Date().toISOString());
  }, [selectedSectionId]);

  const handleSectionChange = useCallback((nextId: string) => {
    if (!nextId || nextId === selectedSectionId) return;
    setSelectedSectionId(nextId);
  }, [selectedSectionId]);

  const handleAudioAction = useCallback(async (action: 'play-en' | 'play-enhanced' | 'generate') => {
    if (!selectedSectionId) return;
    if (!rows.length) {
      setAudioMessage('No rows to narrate yet.');
      return;
    }

    const lane: Lane = action === 'play-en' ? 'en' : 'ar_enhanced';

    try {
      const result = await playSectionNarration({
        sectionId: selectedSectionId,
        rows,
        lane,
        mode: action === 'generate' ? 'generate' : 'play',
      });
      if (!result) return;
      setAudioMessage(result.message ?? (action === 'generate' ? 'Audio requested…' : 'Playback triggered.'));
      return result.status === 'playing' ? 'playing' : result.status === 'ready' ? 'ready' : undefined;
    } catch (error) {
      console.error('Audio action failed', error);
      setAudioMessage('Audio action failed—check console output.');
    }
  }, [rows, selectedSectionId]);

  const moveToNeighborSection = useCallback((direction: -1 | 1) => {
    if (!sections.length) return;
    const currentIndex = sections.findIndex((section) => section.id === selectedSectionId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    setSelectedSectionId(sections[nextIndex].id);
  }, [sections, selectedSectionId]);

  const headerProps = {
    sectionId: selectedSectionId,
    sections,
    onSectionChange: handleSectionChange,
    prefs,
    setDensity: (density: DadDensity) => setDensity(density),
    setRowsPerView: (value: RowsPerViewOption) => setRowsPerView(value),
    updatePrefs,
    setVisibleColumns: (columns: Partial<VisibleColumns>) => setVisibleColumns(columns),
    reviewedCount,
    totalRows,
    pendingNotes,
    lastSaved,
    onAudioAction: handleAudioAction,
    audioStatusLabel: audioMessage,
    onPrevSection: () => moveToNeighborSection(-1),
    onNextSection: () => moveToNeighborSection(1),
  };

  const loadingState = loadingSections || loadingRows;

  const reviewedRows = useMemo(() => reviewedRowsRef.current, [reviewedCount, selectedSectionId]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <DadHeader {...headerProps} />
      <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-6">
        {loadingState && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Loading Dad Mode data…
          </div>
        )}

        {!loadingState && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
            No rows available for {selectedSectionId || 'this section'}. Try another section.
          </div>
        )}

        {rows.length > 0 && (
          <TriContinuous
            sectionId={selectedSectionId}
            rows={rows}
            prefs={prefs as DadPrefs}
            updatePrefs={updatePrefs}
            setVisibleColumns={setVisibleColumns}
            setRowsPerView={setRowsPerView}
            reviewedRows={reviewedRows}
            onMarkReviewed={handleMarkReviewed}
          />
        )}

        {errorNote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {errorNote}
          </div>
        )}
      </section>
    </main>
  );
}
