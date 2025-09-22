/**
 * Centralized keyboard shortcuts system with collision-safe handling
 * Supports ⌘K (command palette), J/K (navigation), 1/2/3 (column focus), etc.
 */

export interface ShortcutHandler {
  id: string;
  key: string;
  modifiers?: ('cmd' | 'ctrl' | 'alt' | 'shift')[];
  description: string;
  enabled?: () => boolean;
  handler: (event: KeyboardEvent) => void;
}

export class ShortcutsManager {
  private handlers = new Map<string, ShortcutHandler>();
  private isRegistered = false;

  register(handler: ShortcutHandler) {
    this.handlers.set(handler.id, handler);

    if (!this.isRegistered) {
      this.setupGlobalListener();
      this.isRegistered = true;
    }
  }

  unregister(id: string) {
    this.handlers.delete(id);
  }

  private setupGlobalListener() {
    document.addEventListener('keydown', (event) => {
      // Skip if user is typing in an input
      if (this.isTypingContext(event.target as Element)) {
        return;
      }

      for (const handler of this.handlers.values()) {
        if (this.matchesShortcut(event, handler)) {
          // Check if handler is enabled
          if (handler.enabled && !handler.enabled()) {
            continue;
          }

          event.preventDefault();
          event.stopPropagation();
          handler.handler(event);
          break;
        }
      }
    });
  }

  private isTypingContext(target: Element): boolean {
    if (!target) return false;

    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isContentEditable = target.getAttribute('contenteditable') === 'true';
    const isCommandPalette = target.closest('[data-command-palette]');

    return isInput || isContentEditable || !!isCommandPalette;
  }

  private matchesShortcut(event: KeyboardEvent, handler: ShortcutHandler): boolean {
    const key = event.key.toLowerCase();
    const handlerKey = handler.key.toLowerCase();

    if (key !== handlerKey) return false;

    const modifiers = handler.modifiers || [];
    const isMac = navigator.platform.includes('Mac');

    // Check modifiers
    for (const modifier of modifiers) {
      switch (modifier) {
        case 'cmd':
          if (isMac && !event.metaKey) return false;
          if (!isMac && !event.ctrlKey) return false;
          break;
        case 'ctrl':
          if (!event.ctrlKey) return false;
          break;
        case 'alt':
          if (!event.altKey) return false;
          break;
        case 'shift':
          if (!event.shiftKey) return false;
          break;
      }
    }

    // Ensure no extra modifiers
    const expectedMeta = modifiers.includes('cmd') && isMac;
    const expectedCtrl = modifiers.includes('ctrl') || (modifiers.includes('cmd') && !isMac);
    const expectedAlt = modifiers.includes('alt');
    const expectedShift = modifiers.includes('shift');

    return (
      event.metaKey === expectedMeta &&
      event.ctrlKey === expectedCtrl &&
      event.altKey === expectedAlt &&
      event.shiftKey === expectedShift
    );
  }

  getShortcutLabel(handler: ShortcutHandler): string {
    const modifiers = handler.modifiers || [];
    const isMac = navigator.platform.includes('Mac');

    let label = '';

    if (modifiers.includes('cmd')) {
      label += isMac ? '⌘' : 'Ctrl+';
    }
    if (modifiers.includes('ctrl')) {
      label += 'Ctrl+';
    }
    if (modifiers.includes('alt')) {
      label += isMac ? '⌥' : 'Alt+';
    }
    if (modifiers.includes('shift')) {
      label += 'Shift+';
    }

    label += handler.key.toUpperCase();

    return label;
  }
}

// Global shortcuts manager instance
export const shortcuts = new ShortcutsManager();

// Common shortcuts for the app
export const SHORTCUTS = {
  COMMAND_PALETTE: {
    id: 'command-palette',
    key: 'k',
    modifiers: ['cmd' as const],
    description: 'Open command palette'
  },
  NAVIGATE_UP: {
    id: 'navigate-up',
    key: 'k',
    modifiers: [] as const,
    description: 'Previous row'
  },
  NAVIGATE_DOWN: {
    id: 'navigate-down',
    key: 'j',
    modifiers: [] as const,
    description: 'Next row'
  },
  JUMP_UP_5: {
    id: 'jump-up-5',
    key: 'ArrowUp',
    modifiers: ['alt' as const],
    description: 'Jump up 5 rows'
  },
  JUMP_DOWN_5: {
    id: 'jump-down-5',
    key: 'ArrowDown',
    modifiers: ['alt' as const],
    description: 'Jump down 5 rows'
  },
  FOCUS_ORIGINAL: {
    id: 'focus-original',
    key: '1',
    modifiers: [] as const,
    description: 'Focus Original column'
  },
  FOCUS_ENHANCED: {
    id: 'focus-enhanced',
    key: '2',
    modifiers: [] as const,
    description: 'Focus Enhanced column'
  },
  FOCUS_ENGLISH: {
    id: 'focus-english',
    key: '3',
    modifiers: [] as const,
    description: 'Focus English column'
  },
  TOGGLE_EDIT: {
    id: 'toggle-edit',
    key: 'e',
    modifiers: [] as const,
    description: 'Toggle edit mode'
  },
  TOGGLE_TRANSLATE: {
    id: 'toggle-translate',
    key: 't',
    modifiers: [] as const,
    description: 'Toggle translate mode'
  },
  TOGGLE_DAD_MODE: {
    id: 'toggle-dad-mode',
    key: 'd',
    modifiers: [] as const,
    description: 'Toggle Dad Mode'
  },
  OPEN_ASSISTANT: {
    id: 'open-assistant',
    key: 'a',
    modifiers: [] as const,
    description: 'Open Assistant'
  },
  SAVE: {
    id: 'save',
    key: 's',
    modifiers: ['cmd' as const],
    description: 'Save current row'
  },
  APPROVE: {
    id: 'approve',
    key: 'Enter',
    modifiers: [] as const,
    description: 'Approve current row'
  }
} as const;

/**
 * Hook for React components to register shortcuts
 */
export function useShortcuts(handlers: ShortcutHandler[], deps: any[] = []) {
  const { useEffect } = require('react');

  useEffect(() => {
    for (const handler of handlers) {
      shortcuts.register(handler);
    }

    return () => {
      for (const handler of handlers) {
        shortcuts.unregister(handler.id);
      }
    };
  }, deps);
}

/**
 * Register a single shortcut
 */
export function registerShortcut(handler: ShortcutHandler) {
  shortcuts.register(handler);

  return () => shortcuts.unregister(handler.id);
}