'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { DadPrefs, DadDensity, RowsPerViewOption, VisibleColumns } from '../../lib/state/dad';
import { dadDefaults } from '../../lib/state/dad';

interface SectionSummary {
  id: string;
  title: string;
  count?: number;
}

interface LegacyHeaderProps {
  currentSection: string;
  availableSections: Array<{ id: string; title: string; rowCount: number }>;
  currentRow: number;
  totalRows: number;
  onSectionChange: (sectionId: string) => void;
  onFinishSection?: () => void;
  viewMode?: 'focus' | 'context' | 'all' | 'preview';
  contextSize?: number;
  onViewModeChange?: (viewMode: 'focus' | 'context' | 'all' | 'preview') => void;
  onContextSizeChange?: (contextSize: number) => void;
  onExitDadMode?: () => void;
  onToggleAssistant?: () => void;
  isAssistantOpen?: boolean;
  onOpenPreview?: () => void;
  onOpenCommandPalette?: () => void;
  syncStatus?: React.ReactNode;
}

type AudioAction = 'play-en' | 'play-enhanced' | 'generate';

type DadHeaderProps = Partial<LegacyHeaderProps> & {
  sectionId?: string;
  sections?: SectionSummary[];
  onSectionChange?: (sectionId: string) => void;
  prefs?: DadPrefs;
  setDensity?: (density: DadDensity) => void;
  setRowsPerView?: (value: RowsPerViewOption) => void;
  updatePrefs?: (updates: Partial<DadPrefs>) => void;
  setVisibleColumns?: (columns: Partial<VisibleColumns>) => void;
  reviewedCount?: number;
  totalRows?: number;
  pendingNotes?: number;
  lastSaved?: string | Date | null;
  onAudioAction?: (action: AudioAction) => Promise<'ready' | 'playing' | void> | 'ready' | 'playing' | void;
  audioStatusLabel?: string;
  disableAudio?: boolean;
  onPrevSection?: () => void;
  onNextSection?: () => void;
};

const densityOptions: Array<{ value: DadDensity; label: string }> = [
  { value: 'cozy', label: 'Cozy' },
  { value: 'compact', label: 'Compact' },
  { value: 'super', label: 'Super-compact' },
];

const rowsPerViewOptions: RowsPerViewOption[] = [10, 20, 40, 'all'];

const presets: Array<{ key: string; label: string; columns: VisibleColumns }> = [
  { key: 'en', label: 'EN only', columns: { original: false, enhanced: false, english: true } },
  { key: 'en-enhanced', label: 'EN + AR Enhanced', columns: { original: false, enhanced: true, english: true } },
  { key: 'all', label: 'All three', columns: { original: true, enhanced: true, english: true } },
];

function toDisplayTitle(section?: SectionSummary) {
  if (!section) return 'Select a section';
  return `${section.id} — ${section.title}`;
}

function normalizeDateInput(dateLike: string | Date | null | undefined): string | null {
  if (!dateLike) return null;
  if (dateLike instanceof Date) {
    return dateLike.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DadHeader(props: DadHeaderProps) {
  const {
    sectionId: explicitSectionId,
    sections: sectionList,
    onSectionChange: handleSectionChange,
    prefs: incomingPrefs,
    setDensity,
    setRowsPerView,
    updatePrefs,
    setVisibleColumns,
    reviewedCount = props.reviewedCount ?? props.currentRow ?? 0,
    totalRows = props.totalRows ?? props.availableSections?.find((s) => s.id === props.currentSection)?.rowCount ?? 0,
    pendingNotes = props.pendingNotes ?? 0,
    lastSaved = props.lastSaved ?? null,
    onAudioAction,
    audioStatusLabel,
    disableAudio,
    onPrevSection,
    onNextSection,
    syncStatus,
  } = props;

  const sections = useMemo<SectionSummary[]>(() => {
    const source = sectionList ?? props.availableSections ?? [];
    return source.map((section) =>
      'rowCount' in section
        ? { id: section.id, title: section.title, count: section.rowCount }
        : section
    );
  }, [sectionList, props.availableSections]);
  const activeSectionId = explicitSectionId ?? props.currentSection ?? sections[0]?.id ?? '';
  const activeSection = useMemo(() => sections.find((section) => section.id === activeSectionId), [sections, activeSectionId]);

  const prefs = incomingPrefs ?? dadDefaults.prefs;
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [audioLane, setAudioLane] = useState<'en' | 'ar_enhanced' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sectionInputValue, setSectionInputValue] = useState(() => toDisplayTitle(activeSection));
  const lastSavedDisplay = normalizeDateInput(lastSaved);

  useEffect(() => {
    setSectionInputValue(toDisplayTitle(activeSection));
  }, [activeSection]);

  const handlePreset = (columns: VisibleColumns) => {
    updatePrefs?.({ visibleColumns: columns });
  };

  const handleAudioClick = async (action: AudioAction) => {
    if (!onAudioAction) return;
    setAudioState('loading');
    setNote('Working on audio…');
    setAudioLane(action === 'play-en' ? 'en' : action === 'play-enhanced' ? 'ar_enhanced' : null);
    try {
      const result = await onAudioAction(action);
      if (result === 'playing') {
        setAudioState('playing');
        setNote('Playing narration');
      } else if (result === 'ready') {
        setAudioState('idle');
        setNote('Audio ready');
      } else {
        setAudioState('idle');
        setNote(action === 'generate' ? 'Generation requested' : 'Action complete');
      }
    } catch (error) {
      console.error('Audio action failed', error);
      setAudioState('idle');
      setAudioLane(null);
      setNote('Audio action failed—check console');
    }
  };

  const onChangeSection = (targetId: string) => {
    const nextId = targetId || activeSectionId;
    handleSectionChange?.(nextId);
  };

  const handleInputSelect = (value: string) => {
    const matched = sections.find((section) => toDisplayTitle(section) === value || section.id === value);
    if (matched) {
      onChangeSection(matched.id);
      setSectionInputValue(toDisplayTitle(matched));
    }
  };

  const densityButtons = densityOptions.map((option) => (
    <button
      key={option.value}
      type="button"
      onClick={() => setDensity?.(option.value)}
      className={clsx(
        'dad-header-button rounded-full px-3 py-2 text-sm font-medium transition-colors',
        prefs.density === option.value
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
      )}
      title={`Set ${option.label} density`}
      disabled={!setDensity}
    >
      {option.label}
    </button>
  ));

  const presetButtons = presets.map((preset) => {
    const isActive = Object.keys(preset.columns).every((key) => (prefs.visibleColumns as any)[key] === (preset.columns as any)[key]);
    return (
      <button
        key={preset.key}
        type="button"
        onClick={() => handlePreset(preset.columns)}
        className={clsx(
          'dad-header-button rounded-full px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50',
        )}
        title={`Preset: ${preset.label}`}
        disabled={!updatePrefs}
      >
        {preset.label}
      </button>
    );
  });

  const toggleColumnVisibility = (key: keyof VisibleColumns) => {
    if (!setVisibleColumns) return;
    setVisibleColumns({ [key]: !prefs.visibleColumns[key] });
  };

  const columnButtons = setVisibleColumns
    ? (
      <div className="flex flex-wrap items-center gap-2" aria-label="Column visibility">
        {[
          { key: 'original' as const, label: 'Original AR' },
          { key: 'enhanced' as const, label: 'Enhanced AR' },
          { key: 'english' as const, label: 'English' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleColumnVisibility(key)}
            className={clsx(
              'dad-header-button rounded-full px-3 py-2 text-sm font-medium transition-colors',
              prefs.visibleColumns[key]
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50',
            )}
            title={`Toggle ${label}`}
          >
            {prefs.visibleColumns[key] ? `Hide ${label}` : `Show ${label}`}
          </button>
        ))}
      </div>
    )
    : null;

  const reviewedLabel = `${reviewedCount} / ${totalRows}`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="dad-header-button rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              onClick={() => onPrevSection?.()}
              disabled={!onPrevSection}
              title="Previous section"
            >
              ← Prev
            </button>
            <div className="flex flex-col">
              <label htmlFor="dad-section-input" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Section
              </label>
              <input
                id="dad-section-input"
                list="dad-section-options"
                className="dad-header-button w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={sectionInputValue}
                onChange={(event) => setSectionInputValue(event.target.value)}
                onBlur={(event) => handleInputSelect(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleInputSelect((event.target as HTMLInputElement).value);
                  }
                }}
                title="Type to jump to another section"
              />
              <datalist id="dad-section-options">
                {sections.map((section) => (
                  <option key={section.id} value={toDisplayTitle(section)} />
                ))}
              </datalist>
            </div>
            <button
              type="button"
              className="dad-header-button rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              onClick={() => onNextSection?.()}
              disabled={!onNextSection}
              title="Next section"
            >
              Next →
            </button>
          </div>

          <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-500">
            <span>{audioStatusLabel ?? note ?? 'Audio controls ready'}</span>
            {lastSavedDisplay ? (
              <span>Last saved {lastSavedDisplay}</span>
            ) : (
              <span>No edits saved yet</span>
            )}
            {syncStatus && <span className="text-slate-600">{syncStatus}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {columnButtons}

          <div className="flex flex-wrap items-center gap-2" aria-label="Column presets">
            {presetButtons}
          </div>

          <div className="flex flex-wrap items-center gap-2" aria-label="Density controls">
            {densityButtons}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dad-rows-select">
              Rows per view
            </label>
            <select
              id="dad-rows-select"
              className="dad-header-button rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={String(prefs.rowsPerView)}
            onChange={(event) => {
              const value = event.target.value === 'all' ? 'all' : Number(event.target.value) as RowsPerViewOption;
                setRowsPerView?.(value);
              }}
              disabled={!setRowsPerView}
            >
              {rowsPerViewOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All in section' : option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-700">
            <div className="flex items-center gap-1">
              <span className="font-semibold">Progress:</span>
              <span>{`Reviewed ${reviewedLabel} rows`}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">Pending notes:</span>
              <span>{pendingNotes}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <div className="flex items-center gap-4">
            <div>
              <span className="font-semibold text-slate-900">{toDisplayTitle(activeSection)}</span>
              {activeSection?.count != null && (
                <span className="ml-2 text-xs text-slate-500">{activeSection.count} rows</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Shortcuts: 1/2/3 toggle columns · Cmd/Ctrl+Shift+F focus lane · [ and ] adjust rows
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="dad-header-button rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={!onAudioAction || disableAudio || audioState === 'loading'}
                onClick={() => handleAudioClick('play-en')}
                title="Play English narration for this section"
              >
                {audioState === 'loading' && audioLane === 'en' ? 'Working…' : 'Play English'}
              </button>
            </div>
            <button
              type="button"
              className="dad-header-button rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-200 disabled:opacity-60"
              disabled={!onAudioAction || disableAudio || audioState === 'loading'}
              onClick={() => handleAudioClick('play-enhanced')}
              title="Play Arabic Enhanced narration for this section"
            >
              {audioState === 'loading' && audioLane === 'ar_enhanced' ? 'Working…' : 'Play Arabic+'}
            </button>
            <button
              type="button"
              className="dad-header-button rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
              disabled={!onAudioAction || disableAudio || audioState === 'loading'}
              onClick={() => handleAudioClick('generate')}
              title="Generate or refresh section audio"
            >
              {audioState === 'loading' && audioLane === null ? 'Generating…' : 'Generate audio'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
