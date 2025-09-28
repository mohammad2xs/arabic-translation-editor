'use client';

import { useState, useRef } from 'react';

interface DiffSegment {
  type: 'add' | 'remove' | 'keep';
  content: string;
}

interface Suggestion {
  id: string;
  title: string;
  rationale: string;
  diff: DiffSegment[];
  audioUrl?: string;
  task: string;
  appliedAt?: Date;
  undoToken?: string;
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  canApply: boolean;
  onApply: (range?: string) => void;
  onUndo?: () => void;
}

export default function SuggestionCard({
  suggestion,
  canApply,
  onApply,
  onUndo,
}: SuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showApplyOptions, setShowApplyOptions] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlayAudio = async () => {
    if (isPlayingAudio) return;

    setIsPlayingAudio(true);
    try {
      // Try ElevenLabs audio first if available
      if (suggestion.audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = suggestion.audioUrl;
          await audioRef.current.play();
        }
      } else {
        // Fallback to browser TTS
        const text = suggestion.diff
          .filter(d => d.type === 'add' || d.type === 'keep')
          .map(d => d.content)
          .join(' ');

        if ('speechSynthesis' in window && text.trim()) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.8;
          utterance.volume = 0.8;
          utterance.onend = () => setIsPlayingAudio(false);
          utterance.onerror = () => setIsPlayingAudio(false);
          speechSynthesis.speak(utterance);
        }
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
      setIsPlayingAudio(false);
    }
  };

  const handleAudioEnded = () => {
    setIsPlayingAudio(false);
  };

  const renderDiff = () => {
    return suggestion.diff.map((segment, index) => {
      const className =
        segment.type === 'add' ? 'diff-add' :
        segment.type === 'remove' ? 'diff-remove' :
        'diff-keep';

      return (
        <span key={index} className={className}>
          {segment.content}
        </span>
      );
    });
  };

  const getTaskIcon = (task: string) => {
    switch (task) {
      case 'clarify': return '✨';
      case 'expand': return '📝';
      case 'grammar': return '🔧';
      case 'backtranslate': return '🔄';
      case 'scripture_check': return '📖';
      case 'glossary_explain': return '💡';
      case 'footnote_suggest': return '📚';
      default: return '🤖';
    }
  };

  const getTaskLabel = (task: string) => {
    switch (task) {
      case 'clarify': return 'Clarity Enhancement';
      case 'expand': return 'Text Expansion';
      case 'grammar': return 'Grammar Fix';
      case 'backtranslate': return 'Back-translation Check';
      case 'scripture_check': return 'Scripture Verification';
      case 'glossary_explain': return 'Term Explanation';
      case 'footnote_suggest': return 'Footnote Suggestion';
      default: return 'Custom Query';
    }
  };

  const isApplied = !!suggestion.appliedAt;
  const canUndo = isApplied && suggestion.undoToken && onUndo;

  return (
    <div className={`suggestion-card ${isApplied ? 'applied' : ''}`}>
      {/* Hidden audio element for ElevenLabs playback */}
      {suggestion.audioUrl && (
        <audio
          ref={audioRef}
          onEnded={handleAudioEnded}
          onError={() => setIsPlayingAudio(false)}
          preload="none"
        />
      )}

      {/* Header */}
      <div className="suggestion-card-header">
        <div className="suggestion-card-title">
          <span className="task-icon">{getTaskIcon(suggestion.task)}</span>
          <span className="task-label">{getTaskLabel(suggestion.task)}</span>
          {isApplied && <span className="applied-badge">✅ Applied</span>}
        </div>

        <div className="suggestion-card-controls">
          <button
            onClick={handlePlayAudio}
            disabled={isPlayingAudio}
            className={`audio-button ${isPlayingAudio ? 'playing' : ''}`}
            title="Listen to suggestion"
          >
            {isPlayingAudio ? '⏸️' : '🔈'}
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-button"
            title={isExpanded ? 'Collapse' : 'Expand details'}
          >
            {isExpanded ? '🔼' : '🔽'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="suggestion-card-content">
        <h3 className="suggestion-title">{suggestion.title}</h3>

        {isExpanded && (
          <div className="suggestion-rationale">
            <h4 className="rationale-label">💭 Rationale:</h4>
            <p>{suggestion.rationale}</p>
          </div>
        )}

        {/* Diff Preview */}
        <div className="diff-preview">
          <h4 className="diff-label">📝 Changes:</h4>
          <div className="diff-content">
            {renderDiff()}
          </div>
        </div>

        {/* Applied Status */}
        {isApplied && (
          <div className="applied-status">
            <span className="applied-time">
              Applied {suggestion.appliedAt?.toLocaleTimeString() || 'just now'}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="suggestion-card-actions">
        {!isApplied && canApply && (
          <>
            <button
              onClick={() => {
                if (showApplyOptions) {
                  setShowApplyOptions(false);
                } else {
                  onApply();
                }
              }}
              className="apply-button primary"
            >
              ✅ Apply
            </button>

            <button
              onClick={() => setShowApplyOptions(!showApplyOptions)}
              className="apply-button secondary"
              title="Apply to selection only"
            >
              📌 Apply to Selection
            </button>

            {showApplyOptions && (
              <div className="apply-options">
                <button
                  onClick={() => {
                    onApply('selection');
                    setShowApplyOptions(false);
                  }}
                  className="apply-option-button"
                >
                  📝 Apply to Selected Text Only
                </button>
                <button
                  onClick={() => {
                    onApply('paragraph');
                    setShowApplyOptions(false);
                  }}
                  className="apply-option-button"
                >
                  📄 Apply to Current Paragraph
                </button>
              </div>
            )}
          </>
        )}

        {canUndo && (
          <button
            onClick={onUndo}
            className="undo-button"
            title="Undo this change"
          >
            ↩️ Undo
          </button>
        )}

        {!canApply && !isApplied && (
          <div className="no-apply-message">
            🔒 Reviewer access required to apply changes
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="suggestion-card-footer">
        <span className="suggestion-timestamp">
          Suggested {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}