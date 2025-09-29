'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { calculateLPR } from '../../lib/complexity';
import { isDadModeEnabled, initializeDadMode, getViewMode, getRowsToShow } from '../../lib/dadmode/prefs';
import { getUserRole, canEdit } from '../../lib/dadmode/access';
import DadHeader from '../(components)/DadHeader';
import RowCard from '../(components)/RowCard';
import MultiRowView from '../(components)/MultiRowView';
import AssistantSidebar from '../(components)/AssistantSidebar';
import CmdPalette from '../(components)/CmdPalette';
import IssueQueue from '../(components)/IssueQueue';
import StickyActions from '../(components)/StickyActions';
import FinalPreview from '../(components)/FinalPreview';
import RowNavigator from '../(components)/RowNavigator';
import OnboardingCoach from '../(components)/OnboardingCoach';
import ContextSwitcher, { useContextSwitcher, ViewMode } from '../(components)/ContextSwitcher';
import SectionPreview, { useSectionPreview } from '../(components)/SectionPreview';
import AudioBar from '../(components)/AudioBar';
import AudiobookPanel from '../(components)/AudiobookPanel';
import SearchPanel from '@/components/SearchPanel';
import { useSyncClient } from '../../lib/sync/client';
import { shortcuts as shortcutManager, SHORTCUTS } from '../../lib/ui/shortcuts';

interface SectionRow {
  id: string;
  original: string;
  enhanced: string;
  english: string;
  complexity: number;
  scriptureRefs: Array<{
    type: 'quran' | 'hadith';
    reference: string;
    normalized: string;
  }>;
  metadata: {
    laneHash: string;
    sectionId: string;
    rowIndex: number;
    wordCount: number;
    charCount: number;
    lpr?: number;
    qualityGates?: {
      lpr: boolean;
      coverage: boolean;
      drift: boolean;
      semantic: boolean;
      scripture: boolean;
    };
    clauses?: number;
    processedAt?: string;
    needsExpand?: boolean;
    confidence?: number;
    tm?: {
      used: boolean;
      suggestionId?: string;
      similarity?: number;
    };
  };
}

interface SectionData {
  id: string;
  title: string;
  rows: SectionRow[];
  metadata: {
    contentHash: string;
    rowCount: number;
    wordCount: number;
    processedAt: string;
  };
}

interface ManifestSection {
  id: string;
  title: string;
  rowCount: number;
  wordCount: number;
  contentHash: string;
  type: string;
}

interface DevRow {
  id: string;
  arabic_original: string;
  arabic_enhanced: string;
  english: string;
  section: string;
  complexity_score?: number;
  scripture_refs?: string[];
  metadata?: {
    section_ref?: string;
    complexity_score?: number;
    scripture_refs?: string[];
    notes?: string;
  };
}

type FocusColumn = 'english' | 'enhanced' | 'arabic'; // Reordered: English first

type ScriptureReference = {
  reference: string;
  type: 'quran' | 'hadith';
  surah?: number;
  ayah?: number;
  arabic: string;
  english: string;
  metadata: {
    surahName?: string;
    surahNameEn?: string;
    revelationType?: 'meccan' | 'medinan';
    collection?: string;
    narrator?: string;
    grading?: string;
  };
};

function TriViewPageContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [focusedColumn, setFocusedColumn] = useState<FocusColumn>('english'); // English first
  const [showColumns, setShowColumns] = useState({
    english: true,    // Reordered: English first
    enhanced: true,   // Enhanced Arabic second
    arabic: true      // Original Arabic third
  });
  const [loading, setLoading] = useState(true);
  const [scriptureTooltip, setScriptureTooltip] = useState<{
    ref: string;
    x: number;
    y: number;
    data: ScriptureReference;
  } | null>(null);
  const [findPanelOpen, setFindPanelOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [currentSectionId, setCurrentSectionId] = useState<string>('S001');
  const [availableSections, setAvailableSections] = useState<ManifestSection[]>([]);
  const [sectionData, setSectionData] = useState<SectionData | null>(null);
  const [expandStatus, setExpandStatus] = useState<Record<string, boolean>>({});
  const [dadModeEnabled, setDadModeEnabled] = useState(false);
  const [advancedMetricsVisible, setAdvancedMetricsVisible] = useState(false);
  const [localHistory, setLocalHistory] = useState<Record<string, string[]>>({});
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isIssueQueueOpen, setIsIssueQueueOpen] = useState(false);
  const [isFinalPreviewOpen, setIsFinalPreviewOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isAudiobookPanelOpen, setIsAudiobookPanelOpen] = useState(false);
  const [issues, setIssues] = useState<Array<{
    id: string;
    rowId: number;
    type: 'lpr' | 'coverage' | 'scripture' | 'notes';
    description: string;
  }>>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    status: 'idle' | 'saving' | 'saved' | 'error';
    message?: string;
    timestamp?: Date;
  }>({ status: 'idle' });
  const [conflictQueue, setConflictQueue] = useState<Array<{ id: string; changes: Record<string, any>; timestamp: string }>>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchDefaults, setSearchDefaults] = useState<{ sectionIds?: string[]; status?: 'all' | 'pending' | 'in-progress' | 'approved'; minNotes?: number; includeScriptureOnly?: boolean }>({ sectionIds: ['S001'] });
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  const findInputRef = useRef<HTMLInputElement>(null);
  const englishScrollRef = useRef<HTMLDivElement>(null);     // Reordered
  const enhancedScrollRef = useRef<HTMLDivElement>(null);
  const arabicScrollRef = useRef<HTMLDivElement>(null);      // Moved to third
  const isScrollingRef = useRef(false);
  const enhancedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const englishTextareaRef = useRef<HTMLTextAreaElement>(null); // Added for English
  const autoSaveTimersRef = useRef<Record<string, number>>({});
  const pendingRowRef = useRef<string | null>(null);

  const currentRow = rows[currentRowIndex];

  // Context switcher integration
  const {
    currentMode,
    contextSize,
    onModeChange,
    onContextSizeChange,
    mounted: contextMounted
  } = useContextSwitcher();

  // Section preview integration
  const {
    isPreviewOpen,
    previewData,
    currentRowId: previewCurrentRowId,
    sectionTitle,
    openPreview,
    closePreview
  } = useSectionPreview();

  // Real-time sync integration
  const {
    isConnected,
    lastSync,
    presence,
    pushChange,
    setCurrentRow: setSyncCurrentRow
  } = useSyncClient({
    section: currentSectionId,
    token: token || undefined,
    onDelta: (delta) => {
      console.log('Received sync delta:', delta);
      // Apply remote changes to local state and detect conflicts
      if (delta.changedRows.length > 0) {
        const updatedRows = [...rows];
        const newConflicts: Array<{ id: string; changes: Record<string, any>; timestamp: string }> = [];

        for (const change of delta.changedRows) {
          const rowIndex = updatedRows.findIndex(r => r.id === change.row_id);
          if (rowIndex !== -1) {
            // Check for conflicts: if this is the current row and we have unsaved changes
            if (change.row_id === currentRow?.id && hasUnsavedChanges) {
              // Convert new format back to old format for conflict handling
              const legacyChanges: Record<string, any> = {};
              if (change.en !== undefined) legacyChanges.english = change.en;
              if (change.arEnhanced !== undefined) legacyChanges.enhanced = change.arEnhanced;

              // Stash the change in conflict queue instead of applying
              newConflicts.push({
                id: change.row_id,
                changes: legacyChanges,
                timestamp: change.timestamp
              });
              console.log('Conflict detected for row:', change.row_id);
            } else {
              // No conflict, apply the change
              if (change.en !== undefined) {
                updatedRows[rowIndex].english = change.en;
              }
              if (change.arEnhanced !== undefined) {
                updatedRows[rowIndex].enhanced = change.arEnhanced;
              }
            }
          }
        }

        if (newConflicts.length > 0) {
          setConflictQueue(prev => [...prev, ...newConflicts]);
          // Show toast notification about conflicts
          console.log(`⚠️ ${newConflicts.length} conflicts detected`);
        }

        setRows(updatedRows);
      }
    },
    onPresenceUpdate: (presenceData) => {
      console.log('Presence update:', presenceData);
      // Presence is handled by the hook automatically
    }
  });

  useEffect(() => {
    pendingRowRef.current = pendingRowId;
  }, [pendingRowId]);

  // Initialize Dad-Mode on mount
  useEffect(() => {
    initializeDadMode();
    setDadModeEnabled(isDadModeEnabled());

    // Auto-open assistant in Dad-Mode for easier access
    if (isDadModeEnabled()) {
      setIsAssistantOpen(true);
    }

    // Check if first-time user for onboarding
    const hasSeenOnboarding = localStorage.getItem('translation-editor-onboarding-seen');
    if (!hasSeenOnboarding) {
      setIsOnboardingOpen(true);
    }
  }, []);

  // Update sync current row when current row changes
  useEffect(() => {
    if (currentRow && setSyncCurrentRow) {
      setSyncCurrentRow(currentRow.id);
    }
  }, [currentRow, setSyncCurrentRow]);

  // Watch for URL parameter changes to sync Dad Mode state and UI toggles
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const isDadMode = modeParam === 'dad';
    setDadModeEnabled(isDadMode);

    // Auto-open assistant when entering Dad-Mode
    if (isDadMode) {
      setIsAssistantOpen(true);
    }

    // Extract token for reviewer shares
    const tokenParam = searchParams.get('token');
    setToken(tokenParam);

    // Handle UI toggles from URL parameters (only on first mount)
    const previewParam = searchParams.get('preview');
    const issuesParam = searchParams.get('issues');
    const paletteParam = searchParams.get('palette');

    if (previewParam === '1') {
      setIsFinalPreviewOpen(true);
    }
    if (issuesParam === '1') {
      setIsIssueQueueOpen(true);
    }
    if (paletteParam === '1') {
      setIsCmdPaletteOpen(true);
    }
  }, [searchParams]);

  // Handle context mode changes
  const handleContextModeChange = (mode: ViewMode) => {
    onModeChange(mode);

    if (mode === 'preview') {
      // Open section preview with current data
      const previewRows = rows.map(row => ({
        id: row.id,
        arabic_original: row.original,
        arabic_enhanced: row.enhanced,
        english: row.english,
        metadata: row.metadata
      }));

      openPreview(previewRows, currentRow?.id, sectionData?.title || currentSectionId);
    }
  };

  // Assistant toggle handler
  const handleToggleAssistant = useCallback(() => {
    setIsAssistantOpen(prev => !prev);
  }, []);

  // Command palette handlers
  const handleToggleCmdPalette = useCallback(() => {
    setIsCmdPaletteOpen(prev => !prev);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setSearchDefaults(prev => ({
      ...prev,
      sectionIds: currentSectionId ? [currentSectionId] : [],
    }));
    setIsSearchOpen(true);
  }, [currentSectionId]);

  const handleSearchSelect = useCallback((selection: { rowId: string; sectionId: string; sectionTitle: string; score: number }) => {
    if (!selection) return;
    setIsSearchOpen(false);

    const { sectionId, rowId } = selection;

    setSearchDefaults(prev => ({
      ...prev,
      sectionIds: sectionId ? [sectionId] : [],
    }));

    if (sectionId !== currentSectionId) {
      setPendingRowId(rowId);
      pendingRowRef.current = rowId;
      setCurrentSectionId(sectionId);
      return;
    }

    const targetIndex = rows.findIndex(row => row.id === rowId);
    if (targetIndex !== -1) {
      setCurrentRowIndex(targetIndex);
      setFocusedRowIndex(targetIndex);
      setPendingRowId(null);
      pendingRowRef.current = null;
    } else {
      setPendingRowId(rowId);
      pendingRowRef.current = rowId;
    }
  }, [currentSectionId, rows]);

  const handleRunAssistantPreset = useCallback((presetId: string) => {
    setIsAssistantOpen(true);
    console.log('Running assistant preset:', presetId);
  }, []);

  const handleNavigateToRow = useCallback((rowId: number) => {
    const targetIndex = rowId - 1; // Convert 1-based to 0-based
    if (targetIndex >= 0 && targetIndex < rows.length) {
      setCurrentRowIndex(targetIndex);
      setFocusedRowIndex(targetIndex);
    }
  }, [rows.length]);

  const handleFocusColumn = useCallback((column: 'original' | 'enhanced' | 'english') => {
    if (column === 'original') setFocusedColumn('arabic');
    else if (column === 'enhanced') setFocusedColumn('enhanced');
    else if (column === 'english') setFocusedColumn('english');
  }, []);

  const handleToggleEdit = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  const handleApprove = useCallback(async () => {
    if (!currentRow) return;

    try {
      const response = await fetch(`/api/rows/${currentRow.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (response.ok) {
        setIsApproved(true);
        setHasUnsavedChanges(false);

        // Move to next row after approval
        const nextIndex = Math.min(currentRowIndex + 1, rows.length - 1);
        setCurrentRowIndex(nextIndex);
        setFocusedRowIndex(nextIndex);

        // Show toast
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        toast.textContent = '✅ Row approved';
        document.body.appendChild(toast);
        setTimeout(() => document.body.removeChild(toast), 2000);
      }
    } catch (error) {
      console.error('Approval error:', error);
    }
  }, [currentRow, currentRowIndex, rows.length]);

  const handleToggleIssueQueue = useCallback(() => {
    setIsIssueQueueOpen(prev => !prev);
  }, []);

  const handleToggleFinalPreview = useCallback(() => {
    setIsFinalPreviewOpen(prev => !prev);
  }, []);

  const handleToggleAudiobookPanel = useCallback(() => {
    setIsAudiobookPanelOpen(prev => !prev);
  }, []);

  // Assistant apply suggestion handler
  const handleApplySuggestion = useCallback((suggestion: any, range?: string) => {
    if (!currentRow) return;

    console.log('Applying suggestion:', suggestion, 'to row:', currentRow.id, 'range:', range);

    const updatedRows = rows.map(row => {
      if (row.id === currentRow.id) {
        return {
          ...row,
          english: suggestion.diff
            ?.filter((d: any) => d.type !== 'remove')
            ?.map((d: any) => d.content)
            ?.join('') || suggestion.content || row.english
        };
      }
      return row;
    });

    setRows(updatedRows);

    // Add to local history for undo functionality
    setLocalHistory(prev => ({
      ...prev,
      [currentRow.id]: [
        ...(prev[currentRow.id] || []).slice(-4),
        currentRow.english
      ]
    }));

    // Trigger auto-save with origin tracking and sync push
    setLastAutoSave(new Date().toISOString());
    setTimeout(async () => {
      try {
        const updatedRow = updatedRows.find(r => r.id === currentRow.id);
        if (!updatedRow) return;

        const response = await fetch(`/api/rows/${currentRow.id}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arEnhanced: updatedRow.enhanced,
            en: updatedRow.english,
            action: 'save',
            origin: 'assistant',
          }),
        });

        // Push to sync if save successful
        if (response.ok && pushChange) {
          await pushChange(currentRow.id, {
            english: updatedRow.english
          }, 'assistant');
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    }, 400);
  }, [currentRow, rows, pushChange]);

  // Load issues from API
  useEffect(() => {
    const loadIssues = async () => {
      try {
        const response = await fetch(`/api/issues?section=${currentSectionId}`);
        if (response.ok) {
          const data = await response.json();
          setIssues(data.issues || []);
        }
      } catch (error) {
        console.error('Failed to load issues:', error);
      }
    };

    if (currentSectionId) {
      loadIssues();
    }
  }, [currentSectionId, rows]);

  // Save function definition (moved here to fix reference error)
  const handleSave = async () => {
    if (!currentRow) return;

    setSaveStatus({ status: 'saving' });

    try {
      const response = await fetch(`/api/rows/${currentRow.id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arEnhanced: currentRow.enhanced,
          en: currentRow.english,
          action: 'save',
        }),
      });

      if (response.ok) {
        setHasUnsavedChanges(false);
        setSaveStatus({ status: 'saved', timestamp: new Date() });

        // Push to sync
        if (pushChange) {
          await pushChange(currentRow.id, {
            enhanced: currentRow.enhanced,
            english: currentRow.english
          }, 'user');
        }

        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        toast.textContent = '✅ Saved just now';
        document.body.appendChild(toast);

        setTimeout(() => {
          document.body.removeChild(toast);
        }, 3000);
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus({ status: 'error', message: 'Save failed' });
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      toast.textContent = '❌ Save failed';
      document.body.appendChild(toast);

      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    }
  };

  // Register global shortcuts
  useEffect(() => {
    const shortcutHandlers = [
      {
        ...SHORTCUTS.GLOBAL_SEARCH,
        handler: handleOpenSearch,
      },
      {
        ...SHORTCUTS.COMMAND_PALETTE,
        handler: () => setIsCmdPaletteOpen(prev => !prev),
      },
      {
        ...SHORTCUTS.OPEN_ASSISTANT,
        handler: handleToggleAssistant,
      },
      {
        ...SHORTCUTS.TOGGLE_EDIT,
        handler: handleToggleEdit,
      },
      {
        ...SHORTCUTS.APPROVE,
        handler: handleApprove,
      },
      {
        ...SHORTCUTS.SAVE,
        handler: handleSave,
      },
    ];

    shortcutHandlers.forEach(handler => shortcutManager.register(handler));

    return () => {
      shortcutHandlers.forEach(handler => shortcutManager.unregister(handler.key));
    };
  }, [handleOpenSearch, handleToggleAssistant, handleToggleEdit, handleApprove, handleSave]);

  // Calculate quality metrics for current row
  const getQualityMetrics = (row: SectionRow) => {
    const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
    const hasAllGates = row.metadata?.qualityGates ?
      Object.values(row.metadata.qualityGates).every(gate => gate) : false;
    const confidence = row.metadata?.confidence || 0;

    return {
      lpr,
      hasAllGates,
      confidence,
      needsExpand: lpr < 0.95 || row.metadata?.needsExpand || false,
      hasScripture: (row.scriptureRefs?.length || 0) > 0,
      isProcessed: !!row.metadata?.processedAt
    };
  };

  const handleExpandRow = async (rowId: string) => {
    try {
      const response = await fetch(`/api/rows/${rowId}/expand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'insufficient_length_preservation',
          targetLPR: 1.05
        })
      });

      if (response.ok) {
        setExpandStatus(prev => ({ ...prev, [rowId]: true }));
      }
    } catch (error) {
      console.error('Failed to mark row for expansion:', error);
    }
  };

  // Load manifest on component mount
  useEffect(() => {
    const loadManifest = async () => {
      try {
        const response = await fetch('/data/manifest.json');
        if (response.ok) {
          const manifest = await response.json();
          setAvailableSections(manifest.sections || []);
        }
      } catch (error) {
        console.error('Error loading manifest:', error);
      }
    };

    loadManifest();
  }, []);

  // Set initial section from URL params
  useEffect(() => {
    const sectionParam = searchParams.get('section');
    if (sectionParam && /^S\d{3}$/.test(sectionParam)) {
      setCurrentSectionId(sectionParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setSearchDefaults(prev => ({
      ...prev,
      sectionIds: currentSectionId ? [currentSectionId] : [],
    }));
  }, [currentSectionId]);

  // Load section data when section changes
  useEffect(() => {
    const loadSectionData = async () => {
      setLoading(true);
      try {
        const url = dadModeEnabled
          ? `/api/sections/${currentSectionId}?dadMode=true`
          : `/api/sections/${currentSectionId}`;

        const response = await fetch(url);
        if (response.ok) {
          const data: SectionData = await response.json();
          setSectionData(data);
          const rowsInSection = data.rows || [];
          setRows(rowsInSection);
          const targetRowId = pendingRowRef.current;
          if (targetRowId) {
            const targetIndex = rowsInSection.findIndex(row => row.id === targetRowId);
            if (targetIndex !== -1) {
              setCurrentRowIndex(targetIndex);
              setFocusedRowIndex(targetIndex);
            } else {
              setCurrentRowIndex(0);
              setFocusedRowIndex(0);
            }
            setPendingRowId(null);
            pendingRowRef.current = null;
          } else {
            setCurrentRowIndex(0);
            setFocusedRowIndex(0);
          }
        } else if (response.status === 404) {
          console.warn(`Section ${currentSectionId} not found, trying dev data`);
          const devResponse = await fetch('/data/dev_rows.json');
          if (devResponse.ok) {
            const devData = await devResponse.json();
            const processedRows = devData.map((row: any) => ({
              id: row.id,
              original: row.arabic_original,
              enhanced: row.arabic_enhanced,
              english: row.english,
              complexity: row.complexity_score || 1,
              scriptureRefs: row.scripture_refs || [],
              metadata: {
                laneHash: 'dev-hash',
                sectionId: 'dev',
                rowIndex: 0,
                wordCount: row.arabic_original?.split(' ').length || 0,
                charCount: row.arabic_original?.length || 0
              }
            }));
            setRows(processedRows);
          } else {
            setRows([]);
          }
        }
      } catch (error) {
        console.error('Error loading section data:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    if (currentSectionId) {
      loadSectionData();
    }
  }, [currentSectionId, dadModeEnabled]);

  // Dad-Mode specific handlers
  const handleRowChange = async (field: 'enhanced' | 'english', value: string) => {
    const currentRow = rows[currentRowIndex];
    if (!currentRow) return;

    const historyKey = `${currentRow.id}_${field}`;
    const currentValue = currentRow[field];

    setLocalHistory(prev => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] || []), currentValue].slice(-10)
    }));

    const updatedRows = [...rows];
    updatedRows[currentRowIndex][field] = value;
    setRows(updatedRows);
    setHasUnsavedChanges(true);

    // Push change to sync
    if (pushChange) {
      try {
        await pushChange(currentRow.id, { [field]: value }, 'user');
      } catch (error) {
        console.warn('Failed to sync change:', error);
      }
    }
  };

  // Multi-row view handlers
  const handleMultiRowChange = async (rowIndex: number, field: 'enhanced' | 'english', value: string) => {
    const targetRow = rows[rowIndex];
    if (!targetRow) return;

    const historyKey = `${targetRow.id}_${field}`;
    const currentValue = targetRow[field];

    setLocalHistory(prev => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] || []), currentValue].slice(-10)
    }));

    const updatedRows = [...rows];
    updatedRows[rowIndex][field] = value;
    setRows(updatedRows);

    // Push change to sync
    if (pushChange) {
      try {
        await pushChange(targetRow.id, { [field]: value }, 'user');
      } catch (error) {
        console.warn('Failed to sync change:', error);
      }
    }

    // Debounced auto-save
    const autoSaveKey = targetRow.id;

    if (autoSaveTimersRef.current[autoSaveKey]) {
      clearTimeout(autoSaveTimersRef.current[autoSaveKey]);
    }

    autoSaveTimersRef.current[autoSaveKey] = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/rows/${targetRow.id}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            arEnhanced: updatedRows[rowIndex].enhanced,
            en: updatedRows[rowIndex].english,
            action: 'save',
          }),
        });

        if (response.ok) {
          const toast = document.createElement('div');
          toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm';
          toast.textContent = `✅ Row ${targetRow.id} auto-saved`;
          document.body.appendChild(toast);

          setTimeout(() => {
            if (document.body.contains(toast)) {
              document.body.removeChild(toast);
            }
          }, 2000);
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      } finally {
        delete autoSaveTimersRef.current[autoSaveKey];
      }
    }, 400);
  };

  const handleViewModeChange = (newViewMode: 'focus' | 'context' | 'all' | 'preview') => {
    onModeChange(newViewMode);
    if (newViewMode === 'focus') {
      setCurrentRowIndex(focusedRowIndex);
    }
  };

  const handleFocusRow = (rowIndex: number) => {
    setFocusedRowIndex(rowIndex);
    setCurrentRowIndex(rowIndex);
  };

  const handleUndo = () => {
    if (!currentRow) return;

    const enhancedHistory = localHistory[`${currentRow.id}_enhanced`] || [];
    const englishHistory = localHistory[`${currentRow.id}_english`] || [];

    if (enhancedHistory.length > 0) {
      const previousValue = enhancedHistory[enhancedHistory.length - 1];
      const updatedRows = [...rows];
      updatedRows[currentRowIndex].enhanced = previousValue;
      setRows(updatedRows);
      setHasUnsavedChanges(true);

      setLocalHistory(prev => ({
        ...prev,
        [`${currentRow.id}_enhanced`]: enhancedHistory.slice(0, -1)
      }));
    } else if (englishHistory.length > 0) {
      const previousValue = englishHistory[englishHistory.length - 1];
      const updatedRows = [...rows];
      updatedRows[currentRowIndex].english = previousValue;
      setRows(updatedRows);
      setHasUnsavedChanges(true);

      setLocalHistory(prev => ({
        ...prev,
        [`${currentRow.id}_english`]: englishHistory.slice(0, -1)
      }));
    }
  };

  const handleRevert = async () => {
    if (!currentRow) return;

    try {
      const response = await fetch(`/api/rows/${currentRow.id}/save`);
      if (response.ok) {
        const data = await response.json();
        if (data.versions && data.versions.length > 0) {
          const lastVersion = data.versions[data.versions.length - 1];
          const updatedRows = [...rows];

          if (lastVersion.arEnhanced) {
            updatedRows[currentRowIndex].enhanced = lastVersion.arEnhanced;
          }
          if (lastVersion.en) {
            updatedRows[currentRowIndex].english = lastVersion.en;
          }

          setRows(updatedRows);

          const toast = document.createElement('div');
          toast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
          toast.textContent = '↶ Reverted to last saved version';
          document.body.appendChild(toast);

          setTimeout(() => {
            document.body.removeChild(toast);
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Revert error:', error);
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      toast.textContent = '❌ Revert failed';
      document.body.appendChild(toast);

      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    }
  };

  const handleApproveScripture = async () => {
    if (!currentRow) return;

    try {
      const response = await fetch(`/api/rows/${currentRow.id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve_scripture',
        }),
      });

      if (response.ok) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        toast.textContent = '✅ Scripture approved';
        document.body.appendChild(toast);

        setTimeout(() => {
          document.body.removeChild(toast);
        }, 3000);
      } else {
        throw new Error('Approve failed');
      }
    } catch (error) {
      console.error('Approve scripture error:', error);
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      toast.textContent = '❌ Approve failed';
      document.body.appendChild(toast);

      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    }
  };

  const handleFlagScripture = async () => {
    if (!currentRow) return;

    const reason = prompt('Please provide a reason for flagging this scripture:');
    if (!reason || reason.trim() === '') {
      return;
    }

    try {
      const response = await fetch(`/api/rows/${currentRow.id}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'flag_scripture',
          reason: reason.trim(),
        }),
      });

      if (response.ok) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        toast.textContent = '🚩 Scripture flagged for review';
        document.body.appendChild(toast);

        setTimeout(() => {
          document.body.removeChild(toast);
        }, 3000);
      } else {
        throw new Error('Flag failed');
      }
    } catch (error) {
      console.error('Flag scripture error:', error);
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      toast.textContent = '❌ Flag failed';
      document.body.appendChild(toast);

      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    }
  };

  const handleAddNote = () => {
    console.log('Add note functionality not yet implemented');
  };

  const handlePlayAudio = (language: 'en' | 'ar') => {
    console.log('Audio playback functionality not yet implemented for language:', language);
  };

  const handleNext = () => {
    const nextIndex = Math.min(currentRowIndex + 1, rows.length - 1);
    setCurrentRowIndex(nextIndex);
    setFocusedRowIndex(nextIndex);
  };

  const handlePrev = () => {
    const prevIndex = Math.max(currentRowIndex - 1, 0);
    setCurrentRowIndex(prevIndex);
    setFocusedRowIndex(prevIndex);
  };

  const handleFinishSection = async () => {
    try {
      const response = await fetch(`/api/snapshot/${currentSectionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'Section completed in Dad-Mode',
          lock: false,
        }),
      });

      if (response.ok) {
        alert('✅ Section completed! Snapshot saved.');
      } else {
        alert('❌ Failed to save section snapshot.');
      }
    } catch (error) {
      console.error('Failed to finish section:', error);
      alert('❌ Failed to save section snapshot.');
    }
  };

  const handleSectionChange = (sectionId: string) => {
    setCurrentSectionId(sectionId);
    const url = new URL(window.location.href);
    url.searchParams.set('section', sectionId);
    window.history.pushState({}, '', url.toString());
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
      if (dadModeEnabled && currentRow && getUserRole() && canEdit(getUserRole())) {
        event.preventDefault();
        handleSave();
        return;
      }
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.code) {
      case 'KeyJ':
        event.preventDefault();
        if (currentMode !== 'focus') {
          const newIndex = Math.min(focusedRowIndex + 1, rows.length - 1);
          setCurrentRowIndex(newIndex);
          setFocusedRowIndex(newIndex);
        } else {
          setCurrentRowIndex(prev => Math.min(prev + 1, rows.length - 1));
        }
        break;
      case 'KeyK':
        event.preventDefault();
        if (currentMode !== 'focus') {
          const newIndex = Math.max(focusedRowIndex - 1, 0);
          setCurrentRowIndex(newIndex);
          setFocusedRowIndex(newIndex);
        } else {
          setCurrentRowIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      case 'KeyE': // Changed: E for English (first column)
        event.preventDefault();
        setFocusedColumn('english');
        break;
      case 'KeyA': // Changed: A for Arabic enhanced (second column)
        event.preventDefault();
        setFocusedColumn('enhanced');
        break;
      case 'KeyO': // Changed: O for Original Arabic (third column)
        event.preventDefault();
        setFocusedColumn('arabic');
        break;
      case 'Digit1':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, english: !prev.english }));
        break;
      case 'Digit2':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, enhanced: !prev.enhanced }));
        break;
      case 'Digit3':
        event.preventDefault();
        setShowColumns(prev => ({ ...prev, arabic: !prev.arabic }));
        break;
      case 'KeyF':
        event.preventDefault();
        setFindPanelOpen(prev => !prev);
        break;
      case 'KeyD':
        event.preventDefault();
        const newDadModeState = !dadModeEnabled;
        setDadModeEnabled(newDadModeState);

        localStorage.setItem('dadModeEnabled', newDadModeState.toString());

        const url = new URL(window.location.href);
        if (newDadModeState) {
          url.searchParams.set('mode', 'dad');
        } else {
          url.searchParams.delete('mode');
        }
        window.history.pushState({}, '', url.toString());
        break;
    }
  }, [rows.length, dadModeEnabled, currentRow, handleSave]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (findPanelOpen && findInputRef.current) {
      findInputRef.current.focus();
    }
  }, [findPanelOpen]);

  const handleSyncScroll = useCallback((sourceRef: React.RefObject<HTMLDivElement>) => {
    if (isScrollingRef.current) return;

    isScrollingRef.current = true;
    const scrollTop = sourceRef.current?.scrollTop || 0;

    // Sync to other visible columns (reordered)
    if (showColumns.english && englishScrollRef.current && sourceRef !== englishScrollRef) {
      englishScrollRef.current.scrollTop = scrollTop;
    }
    if (showColumns.enhanced && enhancedScrollRef.current && sourceRef !== enhancedScrollRef) {
      enhancedScrollRef.current.scrollTop = scrollTop;
    }
    if (showColumns.arabic && arabicScrollRef.current && sourceRef !== arabicScrollRef) {
      arabicScrollRef.current.scrollTop = scrollTop;
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  }, [showColumns]);

  useEffect(() => {
    // Focus textarea when column focus changes (reordered)
    if (focusedColumn === 'enhanced' && enhancedTextareaRef.current) {
      enhancedTextareaRef.current.focus();
    } else if (focusedColumn === 'english' && englishTextareaRef.current) {
      englishTextareaRef.current.focus();
    }
  }, [focusedColumn]);

  const handleScriptureClick = async (ref: string, event: React.MouseEvent) => {
    try {
      const response = await fetch(`/api/scripture/resolve?ref=${encodeURIComponent(ref)}`);
      if (response.ok) {
        const data = await response.json();
        setScriptureTooltip({
          ref,
          x: event.clientX,
          y: event.clientY,
          data
        });
      }
    } catch (error) {
      console.error('Error fetching scripture:', error);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const escape = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escape(query)})`, 'gi'));

    return parts.map((part, idx) => (
      idx % 2 === 1 ? (
        <mark key={idx} className="bg-yellow-200 text-yellow-900">{part}</mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    ));
  };

  const renderTextWithScriptureLinks = (text: string) => {
    const scripturePattern = /\b\d{1,3}:\d{1,3}\b/g;
    const parts = text.split(scripturePattern);
    const matches = text.match(scripturePattern) || [];

    return parts.reduce((acc: (string | JSX.Element)[], part, index) => {
      const highlightedPart = findQuery ? highlightText(part, findQuery) : part;
      acc.push(
        <span key={`text-${index}`}>{highlightedPart}</span>
      );
      if (matches[index]) {
        acc.push(
          <button
            type="button"
            key={`scripture-${index}`}
            className="text-blue-600 underline hover:text-blue-800"
            onClick={(e) => handleScriptureClick(matches[index], e)}
            aria-label={`View scripture reference ${matches[index]}`}
          >
            {matches[index]}
          </button>
        );
      }
      return acc;
    }, []);
  };

  // Render context-aware row content based on current mode
  const renderRowsForCurrentMode = () => {
    if (!contextMounted) return null;

    switch (currentMode) {
      case 'focus':
        return (
          <div className="context-view-focus">
            <RowCard
              row={currentRow}
              onRowChange={handleRowChange}
              onSave={handleSave}
              onUndo={handleUndo}
              large={true}
            />
          </div>
        );

      case 'context':
        const startIndex = Math.max(0, currentRowIndex - Math.floor(contextSize / 2));
        return (
          <div className="context-view-context">
            <MultiRowView
              rows={rows}
              startIndex={startIndex}
              rowsToShow={contextSize}
              onRowChange={handleMultiRowChange}
              onSave={(rowIndex) => handleMultiRowChange(rowIndex, 'enhanced', rows[rowIndex].enhanced)}
              onUndo={() => {/* TODO: implement undo for context rows */}}
              focusedRowIndex={currentRowIndex}
              onFocusRow={(rowIndex) => setCurrentRowIndex(rowIndex)}
            />
          </div>
        );

      case 'all':
        return (
          <div className="context-view-all">
            <MultiRowView
              rows={rows}
              startIndex={0}
              rowsToShow={rows.length}
              onRowChange={handleMultiRowChange}
              onSave={(rowIndex) => handleMultiRowChange(rowIndex, 'enhanced', rows[rowIndex].enhanced)}
              onUndo={() => {/* TODO: implement undo for all rows */}}
              focusedRowIndex={currentRowIndex}
              onFocusRow={(rowIndex) => setCurrentRowIndex(rowIndex)}
            />
          </div>
        );

      case 'preview':
        return <div className="text-center py-16 text-gray-600">Preview mode active - see section preview modal</div>;

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading translation editor...</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-red-600">No data available</div>
      </div>
    );
  }

  const visibleColumns = Object.entries(showColumns).filter(([, visible]) => visible).length;

  // Dad-Mode rendering
  if (dadModeEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 dad-mode">
        <DadHeader
          currentSection={currentSectionId}
          availableSections={availableSections}
          currentRow={focusedRowIndex}
          totalRows={rows.length}
          onSectionChange={handleSectionChange}
          onFinishSection={handleFinishSection}
          viewMode={currentMode}
          contextSize={contextSize}
          onViewModeChange={handleViewModeChange}
          onContextSizeChange={onContextSizeChange}
          onExitDadMode={() => setDadModeEnabled(false)}
          onToggleAssistant={handleToggleAssistant}
          isAssistantOpen={isAssistantOpen}
          onOpenPreview={() => {
            const previewRows = rows.map(row => ({
              id: row.id,
              arabic_original: row.original,
              arabic_enhanced: row.enhanced,
              english: row.english,
              metadata: row.metadata
            }));
            openPreview(previewRows, currentRow?.id, sectionData?.title || currentSectionId);
          }}
          onOpenCommandPalette={() => setIsCmdPaletteOpen(true)}
          onOpenAudiobook={handleToggleAudiobookPanel}
          syncStatus={
            <div className={`sync-status ${isConnected ? 'connected' : 'disconnected'}`}>
              <div className={`sync-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
              {isConnected ? 'Connected' : 'Offline'}
              {lastSync && <span className="text-xs ml-1">• {lastSync.toLocaleTimeString()}</span>}
            </div>
          }
        />

        {/* Context Switcher */}
        <ContextSwitcher
          currentMode={currentMode}
          onModeChange={handleContextModeChange}
          contextSize={contextSize}
          onContextSizeChange={onContextSizeChange}
          className="border-b border-gray-200"
        />

        {/* Audio Bar */}
        {currentRow && (
          <AudioBar
            text={currentRow.english || ''}
            originalText={currentRow.original}
            enhancedText={currentRow.enhanced}
            rowId={currentRow.id}
            sectionId={currentSectionId}
            chapterId={currentSectionId} // Using section as chapter for now
          />
        )}

        {/* Conflict notification banner */}
        {conflictQueue.length > 0 && (
          <div className="bg-orange-50 border-b-2 border-orange-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <div className="text-lg font-medium text-orange-900">
                    Sync Conflict Detected
                  </div>
                  <div className="text-sm text-orange-700">
                    Someone else has modified the row you're editing. {conflictQueue.length} conflict(s) pending.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowConflictModal(true)}
                  className="px-4 py-2 bg-orange-600 text-white text-lg font-medium rounded-lg hover:bg-orange-700 transition-colors focus:ring-4 focus:ring-orange-200"
                  aria-label="Review conflicts"
                >
                  🔍 Review Conflicts
                </button>
                <button
                  type="button"
                  onClick={() => setConflictQueue([])}
                  className="px-4 py-2 bg-gray-600 text-white text-lg font-medium rounded-lg hover:bg-gray-700 transition-colors focus:ring-4 focus:ring-gray-200"
                  aria-label="Dismiss conflicts"
                >
                  ✖ Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-6 py-8">
          {loading ? (
            <div className="text-center py-16">
              <div className="text-2xl text-gray-600">Loading translation editor...</div>
            </div>
          ) : !currentRow ? (
            <div className="text-center py-16">
              <div className="text-2xl text-red-600">No data available</div>
            </div>
          ) : (
            <>
              {/* Context-aware row rendering */}
              <div className="context-view-container">
                {renderRowsForCurrentMode()}
              </div>

              {/* Revert button */}
              <div className="mt-6">
                <button
                  onClick={handleRevert}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg text-lg font-medium hover:bg-purple-700 transition-colors focus:ring-4 focus:ring-purple-200"
                >
                  ↶ Revert to Last Saved
                </button>
              </div>

              {/* Scripture banner */}
              {currentRow.scriptureRefs && currentRow.scriptureRefs.length > 0 && (
                <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                  <div className="text-2xl font-bold text-blue-900 mb-4">
                    📖 Scripture References Found
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {currentRow.scriptureRefs.map((ref, index) => (
                      <div
                        key={index}
                        className="bg-blue-100 border border-blue-300 rounded-lg p-4 flex items-center space-x-3"
                      >
                        <span className="text-2xl">{ref.type === 'quran' ? '📖' : '📝'}</span>
                        <div>
                          <div className="text-lg font-medium text-blue-800">
                            {ref.normalized}
                          </div>
                          <div className="text-sm text-blue-600">
                            {ref.type === 'quran' ? "Qur'an" : 'Hadith'} reference
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex space-x-4">
                    <button
                      onClick={handleApproveScripture}
                      className="px-8 py-4 bg-green-600 text-white rounded-lg text-xl font-bold hover:bg-green-700 transition-colors"
                    >
                      ✅ Approve Scripture
                    </button>
                    <button
                      onClick={handleFlagScripture}
                      className="px-8 py-4 bg-yellow-600 text-white rounded-lg text-xl font-bold hover:bg-yellow-700 transition-colors"
                    >
                      🚩 Flag for Review
                    </button>
                  </div>
                </div>
              )}

              {/* Large navigation buttons */}
              <div className="mt-12 flex items-center justify-between">
                <button
                  onClick={() => {
                    const newIndex = Math.max(focusedRowIndex - 1, 0);
                    setFocusedRowIndex(newIndex);
                    setCurrentRowIndex(newIndex);
                  }}
                  disabled={focusedRowIndex === 0}
                  className="nav-button px-12 py-6 bg-blue-600 text-white rounded-xl text-2xl font-bold disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-200"
                >
                  ← Previous Row
                </button>

                <div className="text-center">
                  <div className="text-xl text-gray-600 mb-2">
                    {currentMode === 'focus' ? 'Progress through section' : `${currentMode} mode: ${currentMode === 'context' ? contextSize : 'all'} rows`}
                  </div>
                  <div className="bg-gray-200 rounded-full h-4 w-96">
                    <div
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{
                        width: `${rows.length > 0 ? ((focusedRowIndex + 1) / rows.length) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {Math.round(((focusedRowIndex + 1) / rows.length) * 100)}% complete
                    {currentMode !== 'focus' && ` • Focused row: ${focusedRowIndex + 1}`}
                  </div>
                </div>

                <button
                  onClick={() => {
                    const newIndex = Math.min(focusedRowIndex + 1, rows.length - 1);
                    setFocusedRowIndex(newIndex);
                    setCurrentRowIndex(newIndex);
                  }}
                  disabled={focusedRowIndex === rows.length - 1}
                  className="nav-button px-12 py-6 bg-blue-600 text-white rounded-xl text-2xl font-bold disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-200"
                >
                  Next Row →
                </button>
              </div>

              {/* Optional advanced metrics toggle */}
              <div className="mt-8 text-center">
                <button
                  onClick={() => setAdvancedMetricsVisible(!advancedMetricsVisible)}
                  className="text-gray-500 hover:text-gray-700 text-sm flex items-center mx-auto space-x-2"
                >
                  <span>Advanced metrics</span>
                  <span className={`transform transition-transform ${advancedMetricsVisible ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {advancedMetricsVisible && (() => {
                  const metricsRow = currentMode === 'focus' ? currentRow : rows[focusedRowIndex];
                  return metricsRow?.metadata && (
                    <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {metricsRow.metadata.confidence && (
                          <div>
                            <span className="font-medium">Confidence:</span> {(metricsRow.metadata.confidence * 100).toFixed(1)}%
                          </div>
                        )}
                        {metricsRow.metadata.clauses && (
                          <div>
                            <span className="font-medium">Clauses:</span> {metricsRow.metadata.clauses}
                          </div>
                        )}
                        {metricsRow.metadata.processedAt && (
                          <div>
                            <span className="font-medium">Processed:</span> {new Date(metricsRow.metadata.processedAt).toLocaleTimeString()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">TM Usage:</span> {
                            metricsRow.metadata?.tm ? (
                              metricsRow.metadata.tm.used ? (
                                `${(metricsRow.metadata.tm.similarity || 0).toFixed(2)} (${metricsRow.metadata.tm.suggestionId || 'N/A'})`
                              ) : 'Not used'
                            ) : 'N/A'
                          }
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Section Preview Modal */}
        <SectionPreview
          isOpen={isPreviewOpen}
          onClose={closePreview}
          sectionData={previewData}
          currentRowId={previewCurrentRowId}
          sectionTitle={sectionTitle}
        />

        {/* Assistant Sidebar */}
        <AssistantSidebar
          isOpen={isAssistantOpen}
          onToggle={handleToggleAssistant}
          currentRowId={currentRow?.id}
          currentSectionId={currentSectionId}
          currentRowData={currentRow ? {
            ar_original: currentRow.original,
            ar_enhanced: currentRow.enhanced,
            en_translation: currentRow.english,
          } : undefined}
          onApplySuggestion={handleApplySuggestion}
        />

        {/* Cursor-style UI Components */}
        <CmdPalette
          isOpen={isCmdPaletteOpen}
          onClose={() => setIsCmdPaletteOpen(false)}
          currentRow={currentRowIndex + 1}
          totalRows={rows.length}
          onNavigateToRow={handleNavigateToRow}
          onToggleAssistant={handleToggleAssistant}
          onToggleEdit={handleToggleEdit}
          onApprove={handleApprove}
          onSave={handleSave}
          onRunAssistantPreset={handleRunAssistantPreset}
          issues={issues}
        />

        <IssueQueue
          isOpen={isIssueQueueOpen}
          onToggle={handleToggleIssueQueue}
          currentRow={currentRowIndex + 1}
          onNavigateToRow={handleNavigateToRow}
          onFocusColumn={handleFocusColumn}
          onOpenAssistant={(preset) => {
            setIsAssistantOpen(true);
          }}
          sectionId={currentSectionId}
        />

        <RowNavigator
          rows={rows.map((row, index) => ({
            id: index + 1,
            status: getQualityMetrics(row).hasAllGates ? 'approved' :
                   getQualityMetrics(row).needsExpand ? 'issues' : 'pending',
            hasIssues: issues.some(issue => issue.rowId === index + 1),
            preview: row.enhanced ? row.enhanced.substring(0, 50) + '...' : undefined,
          }))}
          currentRowId={currentRowIndex + 1}
          onNavigateToRow={handleNavigateToRow}
          onJumpRows={(direction, count) => {
            const newIndex = direction === 'up'
              ? Math.max(currentRowIndex - count, 0)
              : Math.min(currentRowIndex + count, rows.length - 1);
            setCurrentRowIndex(newIndex);
            setFocusedRowIndex(newIndex);
          }}
          isVisible={true}
        />

        <StickyActions
          currentRowId={currentRowIndex + 1}
          totalRows={rows.length}
          isEditing={isEditMode}
          hasUnsavedChanges={hasUnsavedChanges}
          isApproved={isApproved}
          onEdit={handleToggleEdit}
          onSave={handleSave}
          onApprove={handleApprove}
          onUndo={handleUndo}
          onRevert={handleRevert}
          onAddNote={handleAddNote}
          onOpenAssistant={() => setIsAssistantOpen(true)}
          onPlayAudio={handlePlayAudio}
          onNext={handleNext}
          onPrev={handlePrev}
          saveStatus={saveStatus}
        />

        <FinalPreview
          isOpen={isFinalPreviewOpen}
          onClose={() => setIsFinalPreviewOpen(false)}
          currentSection={currentSectionId}
          focusedRowId={currentRowIndex + 1}
        />

        <OnboardingCoach
          isOpen={isOnboardingOpen}
          onClose={() => {
            setIsOnboardingOpen(false);
          }}
          onComplete={() => {
            setIsOnboardingOpen(false);
          }}
          isDadMode={dadModeEnabled}
        />

        {/* Conflict resolution modal */}
        {showConflictModal && conflictQueue.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">⚠️ Resolve Sync Conflicts</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Choose how to handle conflicts between your local changes and remote updates.
                </p>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh]">
                {conflictQueue.map((conflict, index) => {
                  const localRow = rows.find(r => r.id === conflict.id);
                  return (
                    <div key={index} className="mb-6 border border-gray-200 rounded-lg">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <h3 className="font-medium">Row {conflict.id}</h3>
                        <p className="text-sm text-gray-600">Conflict at {new Date(conflict.timestamp).toLocaleString()}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                        {/* Local version */}
                        <div>
                          <h4 className="font-medium text-blue-700 mb-2">Your Local Version</h4>
                          <div className="space-y-2">
                            <div>
                              <label className="text-sm font-medium text-gray-700">English:</label>
                              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm">
                                {localRow?.english || 'N/A'}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Enhanced Arabic:</label>
                              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm" dir="rtl">
                                {localRow?.enhanced || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Remote version */}
                        <div>
                          <h4 className="font-medium text-orange-700 mb-2">Remote Version</h4>
                          <div className="space-y-2">
                            <div>
                              <label className="text-sm font-medium text-gray-700">English:</label>
                              <div className="bg-orange-50 border border-orange-200 rounded p-2 text-sm">
                                {conflict.changes.english || conflict.changes.en || localRow?.english || 'N/A'}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Enhanced Arabic:</label>
                              <div className="bg-orange-50 border border-orange-200 rounded p-2 text-sm" dir="rtl">
                                {conflict.changes.enhanced || conflict.changes.arEnhanced || localRow?.enhanced || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end space-x-2">
                        <button
                          onClick={() => {
                            // Apply remote changes
                            const updatedRows = [...rows];
                            const rowIndex = updatedRows.findIndex(r => r.id === conflict.id);
                            if (rowIndex !== -1) {
                              Object.assign(updatedRows[rowIndex], conflict.changes);
                              setRows(updatedRows);
                            }
                            setConflictQueue(prev => prev.filter((_, i) => i !== index));
                            setHasUnsavedChanges(false);
                          }}
                          className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
                        >
                          Use Remote
                        </button>
                        <button
                          onClick={() => {
                            // Keep local changes, discard conflict
                            setConflictQueue(prev => prev.filter((_, i) => i !== index));
                          }}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        >
                          Keep Local
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowConflictModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Audiobook Panel */}
        <AudiobookPanel
          isOpen={isAudiobookPanelOpen}
          onClose={() => setIsAudiobookPanelOpen(false)}
          currentSectionId={currentSectionId}
          currentChapterId={currentSectionId} // Using section as chapter for now
        />
      </div>
    );
  }

  // Regular mode rendering with reordered columns
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header className="modern-nav border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="modern-nav-brand">
              Al-Insān Translation Editor
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('mode', 'dad');
                  window.location.href = url.toString();
                }}
                className="modern-btn primary"
              >
                👓 Enable Dad Mode
              </button>
              <button
                onClick={handleToggleAudiobookPanel}
                className="modern-btn secondary"
                title="Open Audiobook Builder"
              >
                🎧 Audiobook
              </button>
              <div className="flex items-center space-x-2">
                <label htmlFor="sectionSelect" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Section:
                </label>
                <select
                  id="sectionSelect"
                  value={currentSectionId}
                  onChange={(e) => {
                    const newSectionId = e.target.value;
                    setCurrentSectionId(newSectionId);
                    const url = new URL(window.location.href);
                    url.searchParams.set('section', newSectionId);
                    window.history.pushState({}, '', url.toString());
                  }}
                  className="modern-input"
                  style={{ width: 'auto', minWidth: '200px' }}
                >
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.id}: {section.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Row {currentRowIndex + 1} of {rows.length}
              </div>
              {sectionData && (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {sectionData.metadata.rowCount} rows, {sectionData.metadata.wordCount} words
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Quality Indicators */}
        {currentRow && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Quality Assessment</h3>
              <span className="text-sm text-gray-500">Row {currentRow.id}</span>
            </div>

            {(() => {
              const metrics = getQualityMetrics(currentRow);
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.lpr >= 1.05 ? 'bg-green-500' :
                      metrics.lpr >= 0.95 ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">LPR</div>
                      <div className="text-xs text-gray-500">
                        {metrics.lpr.toFixed(3)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.hasAllGates ? 'bg-green-500' : 'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Gates</div>
                      <div className="text-xs text-gray-500">
                        {currentRow.metadata?.qualityGates ?
                          `${Object.values(currentRow.metadata.qualityGates).filter(Boolean).length}/5` :
                          'N/A'
                        }
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.hasScripture ?
                        (currentRow.metadata?.qualityGates?.scripture ? 'bg-green-500' : 'bg-yellow-500') :
                        'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Scripture</div>
                      <div className="text-xs text-gray-500">
                        {metrics.hasScripture ?
                          `${currentRow.scriptureRefs?.length || 0} refs` : 'None'
                        }
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      metrics.isProcessed ? 'bg-green-500' : 'bg-gray-400'
                    )} />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Status</div>
                      <div className="text-xs text-gray-500">
                        {metrics.isProcessed ? 'Processed' : 'Pending'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const metrics = getQualityMetrics(currentRow);
              return metrics.needsExpand && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-md">
                      ⚠️ Translation needs expansion (LPR: {metrics.lpr.toFixed(3)})
                    </div>
                    <button
                      onClick={() => handleExpandRow(currentRow.id)}
                      disabled={expandStatus[currentRow.id]}
                      className={clsx(
                        'px-3 py-1 text-sm rounded-md font-medium',
                        expandStatus[currentRow.id] ?
                          'bg-green-100 text-green-800 cursor-default' :
                          'bg-blue-600 text-white hover:bg-blue-700'
                      )}
                    >
                      {expandStatus[currentRow.id] ? '✓ Marked for Expansion' : 'Mark for Expansion'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {currentRow.metadata && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                  {currentRow.metadata.confidence && (
                    <div>
                      <span className="font-medium">Confidence:</span> {(currentRow.metadata.confidence * 100).toFixed(1)}%
                    </div>
                  )}
                  {currentRow.metadata.clauses && (
                    <div>
                      <span className="font-medium">Clauses:</span> {currentRow.metadata.clauses}
                    </div>
                  )}
                  {currentRow.metadata.processedAt && (
                    <div>
                      <span className="font-medium">Processed:</span> {new Date(currentRow.metadata.processedAt).toLocaleTimeString()}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">TM Usage:</span> {
                      currentRow.metadata?.tm ? (
                        currentRow.metadata.tm.used ? (
                          `${(currentRow.metadata.tm.similarity || 0).toFixed(2)} (${currentRow.metadata.tm.suggestionId || 'N/A'})`
                        ) : 'Not used'
                      ) : 'N/A'
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Hotkeys: J/K (navigate), E/A/O (focus columns), 1/2/3 (toggle columns), F (find), D (toggle Dad-Mode), Cmd/Ctrl+S (save in Dad-Mode)
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Focus:</span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'english' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              English
            </span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'enhanced' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              Arabic-Enhanced
            </span>
            <span className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              focusedColumn === 'arabic' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              Arabic-Original
            </span>
          </div>
        </div>

        {findPanelOpen && (
          <div className="mb-4 bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
            <div className="flex items-center space-x-4">
              <label htmlFor="findInput" className="text-sm font-medium text-gray-700">
                Find:
              </label>
              <input
                ref={findInputRef}
                id="findInput"
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFindPanelOpen(false);
                    setFindQuery('');
                  }
                }}
                className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search in focused column..."
              />
              <button
                onClick={() => {
                  setFindPanelOpen(false);
                  setFindQuery('');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        )}

        {/* Reordered tri-view columns: English | Enhanced Arabic | Original Arabic */}
        <div className={clsx(
          'grid gap-6 tri-view-container',
          visibleColumns === 1 ? 'grid-cols-1' :
          visibleColumns === 2 ? 'grid-cols-2' : 'grid-cols-3'
        )}>
          {/* English Column - First */}
          {showColumns.english && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6 column-english',
              focusedColumn === 'english' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="tri-view-header">
                <h2 className="text-lg font-semibold text-gray-900">
                  English Translation
                </h2>
                <span className="column-meta text-xs text-gray-500">Editable</span>
              </div>
              <div
                ref={englishScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                onScroll={() => handleSyncScroll(englishScrollRef)}
              >
                <div className="relative">
                  <textarea
                    id={`single-view-english-${currentRow.id}`}
                    name={`single-view-english-${currentRow.id}`}
                    ref={englishTextareaRef}
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none text-lg leading-relaxed row-input"
                    value={currentRow.english}
                    onChange={(e) => {
                      const updatedRows = [...rows];
                      updatedRows[currentRowIndex].english = e.target.value;
                      setRows(updatedRows);
                    }}
                  />
                  {findQuery && focusedColumn === 'english' && (
                    <div className="absolute inset-0 pointer-events-none p-3 text-lg leading-relaxed overflow-hidden">
                      <div className="text-transparent">
                        {highlightText(currentRow.english, findQuery)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Arabic Column - Second */}
          {showColumns.enhanced && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6 column-arabic-enhanced',
              focusedColumn === 'enhanced' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="tri-view-header">
                <h2 className="text-lg font-semibold text-gray-900">
                  Arabic-Enhanced
                </h2>
                <span className="column-meta text-xs text-gray-500">Editable</span>
              </div>
              <div
                ref={enhancedScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                dir="rtl"
                onScroll={() => handleSyncScroll(enhancedScrollRef)}
              >
                <div className="relative">
                  <textarea
                    id={`single-view-enhanced-${currentRow.id}`}
                    name={`single-view-enhanced-${currentRow.id}`}
                    ref={enhancedTextareaRef}
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none font-arabic text-xl leading-relaxed arabic-input row-input"
                    value={currentRow.enhanced}
                    onChange={(e) => {
                      const updatedRows = [...rows];
                      updatedRows[currentRowIndex].enhanced = e.target.value;
                      setRows(updatedRows);
                    }}
                    dir="rtl"
                  />
                  {findQuery && focusedColumn === 'enhanced' && (
                    <div className="absolute inset-0 pointer-events-none p-3 font-arabic text-xl leading-relaxed overflow-hidden">
                      <div className="text-transparent" dir="rtl">
                        {highlightText(currentRow.enhanced, findQuery)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Original Arabic Column - Third */}
          {showColumns.arabic && (
            <div className={clsx(
              'bg-white rounded-lg shadow-sm border-2 p-6 column-arabic-original',
              focusedColumn === 'arabic' ? 'border-blue-500' : 'border-gray-200'
            )}>
              <div className="tri-view-header">
                <h2 className="text-lg font-semibold text-gray-900">
                  Arabic-Original
                </h2>
                <span className="column-meta text-xs text-gray-500">Read-only</span>
              </div>
              <div
                ref={arabicScrollRef}
                className="prose prose-lg max-w-none overflow-y-auto max-h-64"
                dir="rtl"
                onScroll={() => handleSyncScroll(arabicScrollRef)}
              >
                <p className="text-xl leading-relaxed font-arabic">
                  {renderTextWithScriptureLinks(currentRow.original)}
                </p>
              </div>
            </div>
          )}
        </div>

        {currentRow.scriptureRefs && currentRow.scriptureRefs.length > 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-900 mb-2">Scripture References:</div>
            <div className="flex flex-wrap gap-2">
              {currentRow.scriptureRefs.map((ref, index) => (
                <button
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
                  onClick={(e) => handleScriptureClick(ref.reference, e)}
                >
                  <span className="mr-1">{ref.type === 'quran' ? '📖' : '📝'}</span>
                  {ref.normalized}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentRowIndex(prev => Math.max(prev - 1, 0))}
            disabled={currentRowIndex === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-300"
          >
            Previous
          </button>

          <div className="flex items-center space-x-2">
            {rows.map((row, index) => {
              const metrics = getQualityMetrics(row);
              return (
                <button
                  key={index}
                  onClick={() => setCurrentRowIndex(index)}
                  className={clsx(
                    'w-3 h-3 rounded-full relative',
                    index === currentRowIndex ? 'bg-blue-600' : 'bg-gray-300'
                  )}
                  title={`Row ${row.id} - LPR: ${metrics.lpr.toFixed(3)} - ${metrics.isProcessed ? 'Processed' : 'Pending'}`}
                >
                  {metrics.needsExpand && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                  {metrics.hasAllGates && (
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentRowIndex(prev => Math.min(prev + 1, rows.length - 1))}
            disabled={currentRowIndex === rows.length - 1}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-300"
          >
            Next
          </button>
        </div>

        {currentRow.complexity !== undefined && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Complexity Level: {currentRow.complexity}/5
            {currentRow.metadata && (
              <span className="ml-4">
                {currentRow.metadata.wordCount} words, {currentRow.metadata.charCount} chars
              </span>
            )}
          </div>
        )}
      </div>

      {scriptureTooltip && (
        <div
          className="fixed z-50 bg-black text-white p-4 rounded-lg shadow-lg max-w-md"
          style={{
            left: scriptureTooltip.x,
            top: scriptureTooltip.y + 10
          }}
        >
          <div className="text-sm font-medium mb-2">
            {scriptureTooltip.data.type === 'quran' ? 'Qur\'an' : 'Hadith'} {scriptureTooltip.ref}
          </div>
          <div className="text-xs mb-2" dir="rtl">
            {scriptureTooltip.data.arabic}
          </div>
          <div className="text-xs">
            {scriptureTooltip.data.english}
          </div>
          <button
            onClick={() => setScriptureTooltip(null)}
            className="mt-2 text-xs text-gray-300 hover:text-white"
          >
            Close
          </button>
        </div>
      )}

      {/* Audiobook Panel */}
      <AudiobookPanel
        isOpen={isAudiobookPanelOpen}
        onClose={() => setIsAudiobookPanelOpen(false)}
        currentSectionId={currentSectionId}
        currentChapterId={currentSectionId} // Using section as chapter for now
      />
    </div>
  );
}

export default function TriViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-900 mb-4">Loading Translation Editor...</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    }>
      <TriViewPageContent />
    </Suspense>
  );
}