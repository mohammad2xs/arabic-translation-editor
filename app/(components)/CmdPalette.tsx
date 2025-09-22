'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fuzzySearch, highlightMatches, type Searchable } from '@/lib/ui/fuzzy';
import { shortcuts as shortcutManager, SHORTCUTS, type ShortcutHandler } from '@/lib/ui/shortcuts';

interface PaletteAction extends Searchable {
  icon?: string;
  section: 'actions' | 'rows' | 'issues' | 'assistant';
  action: () => void;
  shortcut?: string;
}

interface CmdPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentRow?: number;
  totalRows?: number;
  onNavigateToRow?: (rowId: number) => void;
  onToggleAssistant?: () => void;
  onToggleEdit?: () => void;
  onApprove?: () => void;
  onSave?: () => void;
  onRunAssistantPreset?: (presetId: string) => void;
  issues?: Array<{
    id: string;
    rowId: number;
    type: 'lpr' | 'coverage' | 'scripture' | 'notes';
    description: string;
  }>;
}

export default function CmdPalette({
  isOpen,
  onClose,
  currentRow = 1,
  totalRows = 100,
  onNavigateToRow,
  onToggleAssistant,
  onToggleEdit,
  onApprove,
  onSave,
  onRunAssistantPreset,
  issues = []
}: CmdPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build actions dynamically
  const actions: PaletteAction[] = useMemo(() => [
    // Core Actions
    {
      id: 'edit',
      title: 'Edit Current Row',
      subtitle: 'تحرير الصف الحالي',
      section: 'actions',
      icon: '✏️',
      keywords: ['edit', 'modify', 'change', 'تحرير'],
      shortcut: 'E',
      action: () => onToggleEdit?.()
    },
    {
      id: 'approve',
      title: 'Approve Current Row',
      subtitle: 'اعتماد الصف الحالي',
      section: 'actions',
      icon: '✅',
      keywords: ['approve', 'accept', 'confirm', 'اعتماد'],
      shortcut: 'Enter',
      action: () => onApprove?.()
    },
    {
      id: 'save',
      title: 'Save Changes',
      subtitle: 'حفظ التغييرات',
      section: 'actions',
      icon: '💾',
      keywords: ['save', 'store', 'persist', 'حفظ'],
      shortcut: '⌘S',
      action: () => onSave?.()
    },
    {
      id: 'assistant',
      title: 'Open Assistant',
      subtitle: 'فتح المساعد',
      section: 'actions',
      icon: '🤖',
      keywords: ['assistant', 'ai', 'help', 'مساعد', 'ذكي'],
      shortcut: 'A',
      action: () => onToggleAssistant?.()
    },
    {
      id: 'next-row',
      title: 'Next Row',
      subtitle: 'الصف التالي',
      section: 'actions',
      icon: '⬇️',
      keywords: ['next', 'down', 'forward', 'التالي'],
      shortcut: 'J',
      action: () => onNavigateToRow?.(Math.min(currentRow + 1, totalRows))
    },
    {
      id: 'prev-row',
      title: 'Previous Row',
      subtitle: 'الصف السابق',
      section: 'actions',
      icon: '⬆️',
      keywords: ['previous', 'up', 'back', 'السابق'],
      shortcut: 'K',
      action: () => onNavigateToRow?.(Math.max(currentRow - 1, 1))
    },
    {
      id: 'jump-5-down',
      title: 'Jump 5 Rows Down',
      subtitle: 'القفز ٥ صفوف لأسفل',
      section: 'actions',
      icon: '⏬',
      keywords: ['jump', 'skip', 'قفز'],
      shortcut: '⌥↓',
      action: () => onNavigateToRow?.(Math.min(currentRow + 5, totalRows))
    },
    {
      id: 'jump-5-up',
      title: 'Jump 5 Rows Up',
      subtitle: 'القفز ٥ صفوف لأعلى',
      section: 'actions',
      icon: '⏫',
      keywords: ['jump', 'skip', 'قفز'],
      shortcut: '⌥↑',
      action: () => onNavigateToRow?.(Math.max(currentRow - 5, 1))
    },

    // Quick Row Navigation
    ...Array.from({ length: Math.min(10, totalRows) }, (_, i) => ({
      id: `row-${i + 1}`,
      title: `Go to Row ${i + 1}`,
      subtitle: `انتقل للصف ${i + 1}`,
      section: 'rows' as const,
      icon: '📍',
      keywords: ['row', 'go', 'navigate', 'صف', 'انتقل'],
      action: () => onNavigateToRow?.(i + 1)
    })),

    // Issues (if any)
    ...issues.map(issue => ({
      id: `issue-${issue.id}`,
      title: `Fix ${issue.type.toUpperCase()}: ${issue.description}`,
      subtitle: `إصلاح مشكلة في الصف ${issue.rowId}`,
      section: 'issues' as const,
      icon: issue.type === 'lpr' ? '📏' : issue.type === 'scripture' ? '📖' : '⚠️',
      keywords: ['issue', 'problem', 'fix', 'مشكلة', 'إصلاح'],
      action: () => onNavigateToRow?.(issue.rowId)
    })),

    // Assistant Presets
    {
      id: 'assistant-clarify',
      title: 'Make Clearer',
      subtitle: 'اجعل النص أوضح',
      section: 'assistant',
      icon: '💡',
      keywords: ['clarify', 'clear', 'explain', 'وضح', 'اشرح'],
      action: () => {
        onRunAssistantPreset?.('clarify');
      }
    },
    {
      id: 'assistant-expand',
      title: 'Expand Text',
      subtitle: 'توسيع النص',
      section: 'assistant',
      icon: '📝',
      keywords: ['expand', 'elaborate', 'detailed', 'توسع', 'فصل'],
      action: () => {
        onRunAssistantPreset?.('expand');
      }
    },
    {
      id: 'assistant-compress',
      title: 'Make Concise',
      subtitle: 'اجعل النص مختصراً',
      section: 'assistant',
      icon: '🎯',
      keywords: ['concise', 'compress', 'shorten', 'اختصر', 'قلل'],
      action: () => {
        onRunAssistantPreset?.('compress');
      }
    }
  ], [currentRow, totalRows, issues, onNavigateToRow, onToggleAssistant, onToggleEdit, onApprove, onSave, onRunAssistantPreset]);

  // Filter actions based on query
  const results = useMemo(() => query.trim()
    ? fuzzySearch<PaletteAction>(query, actions, { key: (a) => [a.title, a.subtitle, ...(a.keywords || [])].join(' '), threshold: 0.4, includeMatches: true })
    : actions.slice(0, 8).map(item => ({ item, score: 1, matches: [] })), [query, actions]);

  // Group actions by section
  const groupedActions = results.reduce((groups, { item }) => {
    if (!groups[item.section]) groups[item.section] = [];
    groups[item.section].push(item);
    return groups;
  }, {} as Record<string, PaletteAction[]>);

  const sectionOrder = ['actions', 'rows', 'issues', 'assistant'];
  const flatActions = sectionOrder.flatMap(section => groupedActions[section] || []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, flatActions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatActions[selectedIndex]) {
            flatActions[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, flatActions, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Register ⌘K shortcut for closing when open
  useEffect(() => {
    if (isOpen) {
      const shortcutHandler: ShortcutHandler = {
        ...SHORTCUTS.COMMAND_PALETTE,
        handler: () => {
          onClose();
        }
      };

      shortcutManager.register(shortcutHandler);
      return () => shortcutManager.unregister(shortcutHandler.key);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getSectionTitle = (section: string) => {
    switch (section) {
      case 'actions': return 'Actions • أوامر';
      case 'rows': return 'Rows • صفوف';
      case 'issues': return 'Issues • مشاكل';
      case 'assistant': return 'Assistant • مساعد';
      default: return section;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-2xl mx-4 overflow-hidden"
        data-command-palette
      >
        {/* Search Input */}
        <div className="p-4 border-bottom-primary">
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 color-text-tertiary">
              🔍
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search... | اكتب أمراً أو ابحث..."
              className="cmd-palette-search"
              className="dad-text-large"
            />
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {flatActions.length === 0 ? (
            <div className="p-8 text-center color-text-secondary">
              <div className="text-2xl mb-2">🤷‍♂️</div>
              <div className="text-lg">No results found • لا توجد نتائج</div>
            </div>
          ) : (
            sectionOrder.map(section => {
              const sectionActions = groupedActions[section];
              if (!sectionActions?.length) return null;

              return (
                <div key={section} className="border-bottom-primary last:border-b-0">
                  <div className="px-4 py-2 text-sm font-medium color-text-secondary bg-tertiary">
                    {getSectionTitle(section)}
                  </div>
                  {sectionActions.map((action, index) => {
                    const globalIndex = flatActions.indexOf(action);
                    const isSelected = globalIndex === selectedIndex;

                    return (
                      <div
                        key={action.id}
                        className="cmd-palette-item"
                        onClick={() => {
                          action.action();
                          onClose();
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 rtl:space-x-reverse">
                            {action.icon && (
                              <span className="text-xl">{action.icon}</span>
                            )}
                            <div>
                              <div
                                className="font-medium text-gray-900"
                                className="dad-text-normal"
                                dangerouslySetInnerHTML={{
                                  __html: highlightMatches(action.title, results.find(r => r.item === action)?.matches?.filter(m => action.title.includes(m.value)) || [])
                                }}
                              />
                              {action.subtitle && (
                                <div
                                  className="text-sm text-gray-600 mt-1"
                                  className="dad-text-small"
                                >
                                  {action.subtitle}
                                </div>
                              )}
                            </div>
                          </div>
                          {action.shortcut && (
                            <kbd className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded font-mono">
                              {action.shortcut}
                            </kbd>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 text-xs flex justify-between items-center border-top-primary color-text-tertiary">
          <div>↑↓ navigate • ⏎ select • esc close</div>
          <div>⌘K to toggle • ⌘ K للتبديل</div>
        </div>
      </div>
    </div>
  );
}