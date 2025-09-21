interface DadModePrefs {
  fontSize: 'large' | 'xl' | 'xxl';
  contrast: 'normal' | 'high';
  motion: 'normal' | 'reduced';
  autoSave: boolean;
  voiceEnabled: boolean;
  lastSection?: string;
  viewMode: 'single' | '3' | '5' | '10' | 'all';
}

const DEFAULT_PREFS: DadModePrefs = {
  fontSize: 'xl',
  contrast: 'high',
  motion: 'reduced',
  autoSave: true,
  voiceEnabled: true,
  viewMode: 'single',
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

export function getViewMode(): 'single' | '3' | '5' | '10' | 'all' {
  const prefs = getDadModePrefs();
  return prefs.viewMode || 'single';
}

export function setViewMode(viewMode: 'single' | '3' | '5' | '10' | 'all'): void {
  setDadModePrefs({ viewMode });
}

export function getRowsToShow(viewMode: 'single' | '3' | '5' | '10' | 'all', totalRows: number): number {
  switch (viewMode) {
    case 'single':
      return 1;
    case '3':
      return Math.min(3, totalRows);
    case '5':
      return Math.min(5, totalRows);
    case '10':
      return Math.min(10, totalRows);
    case 'all':
      return totalRows;
    default:
      return 1;
  }
}