export interface ShortcutHandler {
  handler: () => void;
  key: string;
  modifiers: ('shift' | 'cmd' | 'alt' | 'ctrl')[];
  description: string;
}

export class ShortcutsManager {
  private shortcuts = new Map<string, ShortcutHandler>();
  private isEnabled = true;

  register(shortcut: ShortcutHandler) {
    this.shortcuts.set(shortcut.key, shortcut);
  }

  unregister(key: string) {
    this.shortcuts.delete(key);
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.isEnabled) return;

    const key = event.key.toLowerCase();
    const modifiers: string[] = [];
    
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey || event.ctrlKey) modifiers.push('cmd');
    if (event.altKey) modifiers.push('alt');
    if (event.ctrlKey && !event.metaKey) modifiers.push('ctrl');

    const shortcut = this.shortcuts.get(key);
    if (shortcut && this.matchesModifiers(modifiers, shortcut.modifiers)) {
      event.preventDefault();
      shortcut.handler();
    }
  }

  private matchesModifiers(eventModifiers: string[], shortcutModifiers: string[]): boolean {
    if (eventModifiers.length !== shortcutModifiers.length) return false;
    return shortcutModifiers.every(mod => eventModifiers.includes(mod));
  }

  getAllShortcuts(): ShortcutHandler[] {
    return Array.from(this.shortcuts.values());
  }
}

export const shortcuts = new ShortcutsManager();
export const SHORTCUTS = {
  COMMAND_PALETTE: { key: 'k', modifiers: ['cmd'] as const, description: 'Open command palette' },
  NAVIGATE_DOWN: { key: 'j', modifiers: [] as const, description: 'Next row' },
  NAVIGATE_UP: { key: 'k', modifiers: [] as const, description: 'Prev row' },
  JUMP_DOWN_5: { key: 'ArrowDown', modifiers: ['alt'] as const, description: 'Jump 5 down' },
  JUMP_UP_5: { key: 'ArrowUp', modifiers: ['alt'] as const, description: 'Jump 5 up' },
  SAVE: { key: 's', modifiers: ['cmd'] as const, description: 'Save' },
  APPROVE: { key: 'Enter', modifiers: [] as const, description: 'Approve' },
  OPEN_ASSISTANT: { key: 'a', modifiers: [] as const, description: 'Assistant' },
  TOGGLE_EDIT: { key: 'e', modifiers: [] as const, description: 'Toggle edit' },
  FOCUS_1: { key: '1', modifiers: [] as const, description: 'Focus column 1' },
  FOCUS_2: { key: '2', modifiers: [] as const, description: 'Focus column 2' },
  FOCUS_3: { key: '3', modifiers: [] as const, description: 'Focus column 3' },
};

if (typeof window !== 'undefined') {
  document.addEventListener('keydown', e => shortcuts.handleKeyDown(e));
}