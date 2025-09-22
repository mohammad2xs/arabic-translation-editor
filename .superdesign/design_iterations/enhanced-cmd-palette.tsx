'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fuzzySearch, highlightMatches, type Searchable } from '@/lib/ui/fuzzy';
import { shortcuts as shortcutManager, SHORTCUTS, type ShortcutHandler } from '@/lib/ui/shortcuts';

interface PaletteAction extends Searchable {
  icon?: string;
  section: 'actions' | 'rows' | 'issues' | 'assistant' | 'context';
  action: () => void;
  shortcut?: string;
  description?: string;
  contextScore?: number; // MCP Context7 integration
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
  contextData?: any; // Context7 data
}

export default function EnhancedCmdPalette({
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
  issues = [],
  contextData
}: CmdPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build context-aware actions using MCP Context7
  const actions: PaletteAction[] = useMemo(() => {
    const baseActions = [
      // Core Actions with context awareness
      {
        id: 'edit',
        title: 'Edit Current Row',
        subtitle: 'تحرير الصف الحالي',
        description: 'Start editing the currently selected row',
        section: 'actions' as const,
        icon: '✏️',
        keywords: ['edit', 'modify', 'change', 'تحرير'],
        shortcut: 'E',
        contextScore: contextData?.isEditing ? 0.9 : 0.7,
        action: () => onToggleEdit?.()
      },
      {
        id: 'approve',
        title: 'Approve Current Row',
        subtitle: 'اعتماد الصف الحالي',
        description: 'Mark this row as approved and move to next',
        section: 'actions' as const,
        icon: '✅',
        keywords: ['approve', 'accept', 'confirm', 'اعتماد'],
        shortcut: 'Enter',
        contextScore: contextData?.hasChanges ? 0.95 : 0.8,
        action: () => onApprove?.()
      },
      {
        id: 'save',
        title: 'Save Changes',
        subtitle: 'حفظ التغييرات',
        description: 'Save all pending changes to the document',
        section: 'actions' as const,
        icon: '💾',
        keywords: ['save', 'store', 'persist', 'حفظ'],
        shortcut: '⌘S',
        contextScore: contextData?.hasUnsavedChanges ? 0.95 : 0.5,
        action: () => onSave?.()
      },
      {
        id: 'assistant',
        title: 'Open AI Assistant',
        subtitle: 'فتح المساعد الذكي',
        description: 'Get AI-powered suggestions and help',
        section: 'assistant' as const,
        icon: '🤖',
        keywords: ['assistant', 'ai', 'help', 'مساعد', 'ذكي'],
        shortcut: 'A',
        contextScore: contextData?.needsHelp ? 0.9 : 0.6,
        action: () => onToggleAssistant?.()
      },
      {
        id: 'next-row',
        title: 'Next Row',
        subtitle: 'الصف التالي',
        description: `Go to row ${currentRow + 1} of ${totalRows}`,
        section: 'actions' as const,
        icon: '⬇️',
        keywords: ['next', 'down', 'forward', 'التالي'],
        shortcut: 'J',
        contextScore: currentRow < totalRows ? 0.8 : 0.3,
        action: () => onNavigateToRow?.(Math.min(currentRow + 1, totalRows))
      },
      {
        id: 'prev-row',
        title: 'Previous Row',
        subtitle: 'الصف السابق',
        description: `Go to row ${currentRow - 1} of ${totalRows}`,
        section: 'actions' as const,
        icon: '⬆️',
        keywords: ['previous', 'up', 'back', 'السابق'],
        shortcut: 'K',
        contextScore: currentRow > 1 ? 0.8 : 0.3,
        action: () => onNavigateToRow?.(Math.max(currentRow - 1, 1))
      }
    ];

    // Add context-aware suggestions
    const contextActions = [];
    if (contextData?.suggestions) {
      contextActions.push(...contextData.suggestions.map((suggestion: any, index: number) => ({
        id: `context-${index}`,
        title: suggestion.title,
        subtitle: suggestion.subtitle || '',
        description: suggestion.description || '',
        section: 'context' as const,
        icon: suggestion.icon || '💡',
        keywords: suggestion.keywords || [],
        contextScore: suggestion.confidence || 0.7,
        action: () => suggestion.action?.()
      })));
    }

    // Add smart assistant presets based on context
    const smartPresets = [
      {
        id: 'assistant-clarify',
        title: 'Make Text Clearer',
        subtitle: 'اجعل النص أوضح',
        description: 'Improve clarity and readability',
        section: 'assistant' as const,
        icon: '💡',
        keywords: ['clarify', 'clear', 'explain', 'وضح', 'اشرح'],
        contextScore: contextData?.textComplexity > 0.7 ? 0.9 : 0.6,
        action: () => onRunAssistantPreset?.('clarify')
      },
      {
        id: 'assistant-expand',
        title: 'Expand Text',
        subtitle: 'توسيع النص',
        description: 'Add more detail and context',
        section: 'assistant' as const,
        icon: '📝',
        keywords: ['expand', 'elaborate', 'detailed', 'توسع', 'فصل'],
        contextScore: contextData?.textLength < 100 ? 0.8 : 0.5,
        action: () => onRunAssistantPreset?.('expand')
      },
      {
        id: 'assistant-compress',
        title: 'Make Concise',
        subtitle: 'اجعل النص مختصراً',
        description: 'Shorten while keeping meaning',
        section: 'assistant' as const,
        icon: '🎯',
        keywords: ['concise', 'compress', 'shorten', 'اختصر', 'قلل'],
        contextScore: contextData?.textLength > 300 ? 0.8 : 0.5,
        action: () => onRunAssistantPreset?.('compress')
      }
    ];

    return [...baseActions, ...contextActions, ...smartPresets]
      .sort((a, b) => (b.contextScore || 0) - (a.contextScore || 0)); // Sort by context relevance
  }, [currentRow, totalRows, issues, contextData, onNavigateToRow, onToggleAssistant, onToggleEdit, onApprove, onSave, onRunAssistantPreset]);

  // Smart search with context boost
  const results = useMemo(() => {
    if (!query.trim()) {
      return actions.slice(0, 8).map(item => ({
        item,
        score: item.contextScore || 0.5,
        matches: []
      }));
    }

    const searchResults = fuzzySearch<PaletteAction>(
      query,
      actions,
      {
        key: (a) => [a.title, a.subtitle, a.description || '', ...(a.keywords || [])].join(' '),
        threshold: 0.3,
        includeMatches: true
      }
    );

    // Boost results based on context score
    return searchResults.map(result => ({
      ...result,
      score: result.score * 0.7 + (result.item.contextScore || 0.5) * 0.3
    })).sort((a, b) => b.score - a.score);
  }, [query, actions]);

  const groupedActions = results.reduce((groups, { item }) => {
    if (!groups[item.section]) groups[item.section] = [];
    groups[item.section].push(item);
    return groups;
  }, {} as Record<string, PaletteAction[]>);

  const sectionOrder = ['context', 'actions', 'assistant', 'rows', 'issues'];
  const flatActions = sectionOrder.flatMap(section => groupedActions[section] || []);

  // Enhanced keyboard navigation
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
            setIsLoading(true);
            flatActions[selectedIndex].action();
            setTimeout(() => {
              setIsLoading(false);
              onClose();
            }, 200);
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

  // Auto-focus and reset
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Smooth scroll for selected item
  useEffect(() => {
    if (listRef.current && flatActions.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, flatActions.length]);

  if (!isOpen) return null;

  const getSectionTitle = (section: string) => {
    switch (section) {
      case 'context': return 'Smart Suggestions • اقتراحات ذكية';
      case 'actions': return 'Actions • أوامر';
      case 'rows': return 'Navigation • تنقل';
      case 'issues': return 'Issues • مشاكل';
      case 'assistant': return 'AI Assistant • مساعد ذكي';
      default: return section;
    }
  };

  const getSectionIcon = (section: string) => {
    switch (section) {
      case 'context': return '🧠';
      case 'actions': return '⚡';
      case 'assistant': return '🤖';
      case 'rows': return '📍';
      case 'issues': return '⚠️';
      default: return '📝';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Enhanced Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Cursor-Inspired Palette */}
      <div className="cursor-command-palette cursor-ui">
        {/* Search Input */}
        <div className="border-b border-gray-200/50">
          <div className="relative">
            <div className="absolute left-6 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg">
              🔍
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actions or type a command..."
              className="cursor-command-input pl-14 pr-6"
            />
            {isLoading && (
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {flatActions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-4">🤷‍♂️</div>
              <div className="text-lg font-medium mb-2">No results found</div>
              <div className="text-sm text-gray-400">Try a different search term</div>
            </div>
          ) : (
            sectionOrder.map(section => {
              const sectionActions = groupedActions[section];
              if (!sectionActions?.length) return null;

              return (
                <div key={section} className="border-b border-gray-100/50 last:border-b-0">
                  <div className="px-6 py-3 text-sm font-semibold text-gray-600 bg-gray-50/50 flex items-center gap-2">
                    <span>{getSectionIcon(section)}</span>
                    {getSectionTitle(section)}
                    <span className="ml-auto text-xs bg-gray-200 px-2 py-1 rounded-full">
                      {sectionActions.length}
                    </span>
                  </div>
                  {sectionActions.map((action, index) => {
                    const globalIndex = flatActions.indexOf(action);
                    const isSelected = globalIndex === selectedIndex;
                    const contextScore = action.contextScore || 0.5;

                    return (
                      <div
                        key={action.id}
                        className={`cursor-command-item group ${
                          isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          setIsLoading(true);
                          action.action();
                          setTimeout(() => {
                            setIsLoading(false);
                            onClose();
                          }, 200);
                        }}
                      >
                        <div className="cursor-command-icon group-hover:scale-110 transition-transform duration-200">
                          {action.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="font-medium text-gray-900 text-base flex items-center gap-2"
                            dangerouslySetInnerHTML={{
                              __html: highlightMatches(
                                action.title,
                                results.find(r => r.item === action)?.matches?.filter(m => action.title.includes(m.value)) || []
                              )
                            }}
                          />
                          {action.subtitle && (
                            <div className="text-sm text-gray-600 mt-1">
                              {action.subtitle}
                            </div>
                          )}
                          {action.description && (
                            <div className="text-xs text-gray-500 mt-1">
                              {action.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Context Score Indicator */}
                          {contextScore > 0.8 && (
                            <div className="w-2 h-2 bg-green-500 rounded-full" title="High relevance"></div>
                          )}
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

        {/* Enhanced Footer */}
        <div className="px-6 py-3 text-xs flex justify-between items-center border-t border-gray-200/50 bg-gray-50/30">
          <div className="flex items-center gap-4">
            <span>↑↓ navigate</span>
            <span>⏎ select</span>
            <span>esc close</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <span>Powered by Context7</span>
            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}