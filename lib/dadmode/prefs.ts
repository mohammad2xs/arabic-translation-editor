interface DadModePrefs {
  fontSize: 'large' | 'xl' | 'xxl';
  contrast: 'normal' | 'high';
  motion: 'normal' | 'reduced';
  autoSave: boolean;
  voiceEnabled: boolean;
  lastSection?: string;
  viewMode: 'focus' | 'context' | 'all' | 'preview';
  contextSize: number;
}

const DEFAULT_PREFS: DadModePrefs = {
  fontSize: 'xl',
  contrast: 'high',
  motion: 'reduced',
  autoSave: true,
  voiceEnabled: true,
  viewMode: 'focus',
  contextSize: 5,
};

const STORAGE_KEY = 'dadmode-prefs';

export function isDadModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  // Check URL parameter first
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'dad') {
    return true;
  }

  // Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const prefs = JSON.parse(stored);
      return prefs.enabled === true;
    } catch {
      return false;
    }
  }

  return false;
}

export function enableDadMode(): void {
  if (typeof window === 'undefined') return;

  const currentPrefs = getDadModePrefs();
  const newPrefs = { ...currentPrefs, enabled: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));

  // Update URL to include mode parameter
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'dad');
  window.history.pushState({}, '', url.toString());

  // Apply CSS class to document
  document.documentElement.classList.add('dad-mode');
}

export function disableDadMode(): void {
  if (typeof window === 'undefined') return;

  const currentPrefs = getDadModePrefs();
  const newPrefs = { ...currentPrefs, enabled: false };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));

  // Remove mode parameter from URL
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.history.pushState({}, '', url.toString());

  // Remove CSS class from document
  document.documentElement.classList.remove('dad-mode');
}

export function getDadModePrefs(): DadModePrefs & { enabled: boolean } {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFS, enabled: false };
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFS, ...parsed };
    } catch {
      return { ...DEFAULT_PREFS, enabled: false };
    }
  }

  return { ...DEFAULT_PREFS, enabled: isDadModeEnabled() };
}

export function setDadModePrefs(prefs: Partial<DadModePrefs>): void {
  if (typeof window === 'undefined') return;

  const currentPrefs = getDadModePrefs();
  const newPrefs = { ...currentPrefs, ...prefs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));

  // Apply font size immediately
  applyFontSize(newPrefs.fontSize);

  // Apply contrast immediately
  applyContrast(newPrefs.contrast);

  // Apply motion preference immediately
  applyMotion(newPrefs.motion);
}

function applyFontSize(fontSize: string): void {
  const root = document.documentElement;
  root.classList.remove('dad-font-large', 'dad-font-xl', 'dad-font-xxl');
  root.classList.add(`dad-font-${fontSize}`);
}

function applyContrast(contrast: string): void {
  const root = document.documentElement;
  root.classList.remove('dad-contrast-normal', 'dad-contrast-high');
  root.classList.add(`dad-contrast-${contrast}`);
}

function applyMotion(motion: string): void {
  const root = document.documentElement;
  root.classList.remove('dad-motion-normal', 'dad-motion-reduced');
  root.classList.add(`dad-motion-${motion}`);
}

export function initializeDadMode(): void {
  if (typeof window === 'undefined') return;

  const prefs = getDadModePrefs();

  if (isDadModeEnabled()) {
    document.documentElement.classList.add('dad-mode');
    applyFontSize(prefs.fontSize);
    applyContrast(prefs.contrast);
    applyMotion(prefs.motion);
  }
}

export function getFontSizeValue(fontSize: string): string {
  switch (fontSize) {
    case 'large':
      return '20px';
    case 'xl':
      return '22px';
    case 'xxl':
      return '24px';
    default:
      return '22px';
  }
}

export function getLineHeightValue(fontSize: string): string {
  switch (fontSize) {
    case 'large':
      return '1.6';
    case 'xl':
      return '1.65';
    case 'xxl':
      return '1.7';
    default:
      return '1.65';
  }
}

// Migration function to convert legacy viewMode values
function migrateViewMode(storedMode: any): 'focus' | 'context' | 'all' | 'preview' {
  if (typeof storedMode === 'string') {
    switch (storedMode) {
      case 'single':
        return 'focus';
      case '3':
      case '5':
      case '10':
        return 'context';
      case 'all':
        return 'all';
      case 'focus':
      case 'context':
      case 'preview':
        return storedMode;
      default:
        return 'focus';
    }
  }
  return 'focus';
}

export function getViewMode(): 'focus' | 'context' | 'all' | 'preview' {
  const prefs = getDadModePrefs();
  return migrateViewMode(prefs.viewMode);
}

export function setViewMode(viewMode: 'focus' | 'context' | 'all' | 'preview'): void {
  setDadModePrefs({ viewMode });
}

export function getRowsToShow(viewMode: 'focus' | 'context' | 'all' | 'preview', totalRows: number, contextSize: number = 5): number {
  switch (viewMode) {
    case 'focus':
      return 1;
    case 'context':
      return Math.min(contextSize, totalRows);
    case 'all':
      return totalRows;
    case 'preview':
      return Math.min(3, totalRows); // Preview shows 3 rows by default
    default:
      return 1;
  }
}

export function getContextSize(): number {
  const prefs = getDadModePrefs();
  return prefs.contextSize || 5;
}

export function setContextSize(contextSize: number): void {
  setDadModePrefs({ contextSize });
}