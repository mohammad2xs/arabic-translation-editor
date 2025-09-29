'use client';

import { useState, useRef, useEffect } from 'react';
import { useSpeechRecognition } from '@/lib/hooks/useSpeechRecognition';
import { getUserRole, canSave, canComment } from '../../lib/dadmode/access';
import SuggestionCard from './SuggestionCard';

interface AssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentRowId?: string;
  currentSectionId?: string;
  currentRowData?: {
    ar_original: string;
    ar_enhanced: string;
    en_translation: string;
  };
  onApplySuggestion?: (suggestion: Suggestion, range?: string) => void;
}

interface Suggestion {
  id: string;
  type: string; // task type from API
  task?: string; // normalized task id for UI components
  title: string;
  rationale?: string;
  preview: string; // first ~120 chars of proposed change
  en: string; // proposed English text
  ar?: string; // optional Arabic for backtranslate
  footnote?: string; // formatted if scripture_check/footnote_suggest
  diff: Array<{
    type: 'add' | 'remove' | 'keep';
    content: string;
  }>;
  confidence: number;
  cost?: number; // computed from usage
  appliedAt?: Date | string;
  undoToken?: string;
}

const QUICK_ACTIONS = [
  { id: 'clarify', label: '✨ Make clearer', desc: 'Improve clarity with minimal changes' },
  { id: 'expand', label: '📝 Expand', desc: 'Add connective phrasing (+5-20%)' },
  { id: 'grammar', label: '🔧 Fix grammar', desc: 'Fix punctuation and grammar only' },
  { id: 'backtranslate', label: '🔄 Back-translate', desc: 'Check EN→AR fidelity' },
  { id: 'scripture_check', label: '📖 Check scripture', desc: 'Match verses to reference' },
  { id: 'glossary_explain', label: '💡 Explain term', desc: 'Explain selected terms' },
  { id: 'footnote_suggest', label: '📚 Suggest footnote', desc: 'Brief footnote phrasing' },
];

export default function AssistantSidebar({
  isOpen,
  onToggle,
  currentRowId,
  currentSectionId,
  currentRowData: _unused,
  onApplySuggestion,
}: AssistantSidebarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechRecognition({ lang: 'en-US', interimResults: false, continuous: false });

  const userRole = getUserRole();
  const canUseAssistant = canComment(userRole); // commenter+ can use assistant
  const canApply = canSave(userRole); // reviewer can apply changes

  // Health check on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/assistant/health');
        if (response.ok) {
          const health = await response.json();
          setIsOffline(!health.key_present);
        } else {
          setIsOffline(true);
        }
      } catch (error) {
        setIsOffline(true);
      }
    };

    if (canUseAssistant) {
      checkHealth();
    }
  }, [canUseAssistant]);

  const handleMicClick = () => {
    if (!speech.supported) {
      alert('Voice input is not supported in this browser');
      return;
    }

    if (speech.listening) {
      speech.stop();
    } else {
      speech.start((event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setQuery(transcript);
        }
      });
    }
  };

  const handleQuickAction = async (actionId: string) => {
    if (!currentRowId || !currentSectionId || !canUseAssistant) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: currentRowId,
          section_id: currentSectionId,
          task: actionId,
          selection: selectedText || undefined,
          temperature: 0.2,
          seed: 42,
        }),
      });

      if (!response.ok) {
        throw new Error(`Assistant request failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.suggestions?.length > 0) {
        setSuggestions(prev => [...data.suggestions, ...prev]);
      }
    } catch (error) {
      console.error('Assistant error:', error);
      alert('Assistant request failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomQuery = async () => {
    if (!query.trim() || !currentRowId || !currentSectionId || !canUseAssistant) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: currentRowId,
          section_id: currentSectionId,
          task: 'custom',
          query: query.trim(),
          selection: selectedText || undefined,
          temperature: 0.2,
          seed: 42,
        }),
      });

      if (!response.ok) {
        throw new Error(`Assistant request failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.suggestions?.length > 0) {
        setSuggestions(prev => [...data.suggestions, ...prev]);
      }
      setQuery(''); // Clear after successful submission
    } catch (error) {
      console.error('Assistant error:', error);
      alert('Assistant request failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async (suggestion: Suggestion, range?: string) => {
    if (!canApply || !currentRowId) return;

    // Determine applyTo based on suggestion task type and range
    let applyTo: 'en' | 'arEnhanced' | 'selection' = 'en';
    if (range) {
      applyTo = 'selection';
    } else if ((suggestion.task ?? suggestion.type) === 'backtranslate') {
      applyTo = 'arEnhanced';
    }

    try {
      const response = await fetch('/api/assistant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: currentRowId,
          suggestion_id: suggestion.id,
          applyTo: applyTo,
          range: range,
          suggestion: {
            content: suggestion.en,
            diff: suggestion.diff,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Apply failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Update suggestion with applied status
      setSuggestions(prev =>
        prev.map(s =>
          s.id === suggestion.id
            ? { ...s, appliedAt: new Date(), undoToken: data.undoToken }
            : s
        )
      );

      // Call parent handler if provided
      if (onApplySuggestion) {
        onApplySuggestion(suggestion, range);
      }
    } catch (error) {
      console.error('Apply error:', error);
      alert('Failed to apply suggestion. Please try again.');
    }
  };

  // Get text selection from parent document
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      setSelectedText(selection?.toString() || '');
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  if (!canUseAssistant) {
    return (
      <div className={`assistant-sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Assistant Locked</h3>
          <p className="text-lg text-gray-600">
            You need Commenter or Reviewer access to use the Assistant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`assistant-sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="assistant-sidebar-header">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          🤖 Claude Assistant
        </h2>
        <button
          onClick={onToggle}
          className="p-2 text-gray-500 hover:text-gray-700 text-2xl"
          aria-label="Close Assistant"
        >
          ×
        </button>
      </div>

      <div className="assistant-sidebar-content">
        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <p className="text-sm">
                  <strong>Assistant Offline:</strong> ANTHROPIC_API_KEY missing.
                  Please add your API key to use Claude features.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ask Box */}
        <div className="assistant-ask-box">
          <label htmlFor="assistant-query" className="block text-lg font-medium text-gray-700 mb-2">
            💬 Ask Claude:
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="assistant-query"
              name="assistant-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCustomQuery();
                }
              }}
              placeholder="Ask for help with this translation..."
              className="assistant-textarea"
              rows={3}
              disabled={isLoading}
            />
            <div className="assistant-input-controls">
              <button
                onClick={handleMicClick}
                className={`assistant-mic-button ${speech.listening ? 'listening' : ''}`}
                disabled={isLoading || !speech.supported}
                aria-label="Voice input"
                title="EN: Speak your edit | AR: تكلّم لإدخال تعديل"
              >
                🎤
              </button>
              <button
                onClick={handleCustomQuery}
                disabled={!query.trim() || isLoading}
                className="assistant-send-button"
              >
                📤
              </button>
            </div>
          </div>
          {selectedText && (
            <div className="assistant-selection-hint">
              📝 Selected: &ldquo;{selectedText.slice(0, 50)}{selectedText.length > 50 ? '...' : ''}&rdquo;
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="assistant-quick-actions">
          <h3 className="text-lg font-bold text-gray-800 mb-3">⚡ Quick Actions:</h3>
          <div className="grid grid-cols-1 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                disabled={isLoading}
                className="assistant-quick-action-button"
                title={action.desc}
              >
                <div className="text-left">
                  <div className="font-medium">{action.label}</div>
                  <div className="text-sm text-gray-600">{action.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="assistant-loading">
            <div className="loading-spinner"></div>
            <span className="text-lg text-gray-600">Claude is thinking...</span>
          </div>
        )}

        {/* Suggestions */}
        <div className="assistant-suggestions">
          {suggestions.map((suggestion) => {
            const { appliedAt: rawAppliedAt, ...rest } = suggestion;
            const appliedAt = rawAppliedAt instanceof Date
              ? rawAppliedAt
              : rawAppliedAt
                ? new Date(rawAppliedAt)
                : undefined;
            const normalized = {
              ...rest,
              task: rest.task ?? rest.type,
              rationale: rest.rationale ?? rest.preview,
              ...(appliedAt ? { appliedAt } : {}),
            };

            return (
              <SuggestionCard
                key={normalized.id}
                suggestion={normalized}
                canApply={canApply}
                onApply={(range) => handleApply(suggestion, range)}
              />
            );
          })}
        </div>

        {suggestions.length === 0 && !isLoading && (
          <div className="assistant-empty-state">
            <div className="text-4xl mb-4">💡</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">Ready to Help!</h3>
            <p className="text-lg text-gray-600 text-center">
              Ask a question or use a Quick Action to get translation suggestions from Claude.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
