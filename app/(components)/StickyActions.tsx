'use client';

import { useState, useEffect, useCallback } from 'react';
import { shortcuts as shortcutManager, SHORTCUTS } from '@/lib/ui/shortcuts';

export interface SaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
  timestamp?: Date;
}

interface StickyActionsProps {
  currentRowId: number;
  totalRows?: number;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  isApproved: boolean;
  onEdit: () => void;
  onSave: () => Promise<void>;
  onApprove: () => Promise<void>;
  onUndo: () => void;
  onRevert: () => void;
  onAddNote: () => void;
  onOpenAssistant: () => void;
  onPlayAudio: (language: 'en' | 'ar') => void;
  onNext: () => void;
  onPrev: () => void;
  saveStatus: SaveStatus;
  className?: string;
}

export default function StickyActions({
  currentRowId,
  totalRows = 100,
  isEditing,
  hasUnsavedChanges,
  isApproved,
  onEdit,
  onSave,
  onApprove,
  onUndo,
  onRevert,
  onAddNote,
  onOpenAssistant,
  onPlayAudio,
  onNext,
  onPrev,
  saveStatus,
  className = '',
}: StickyActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Register keyboard shortcuts for Cursor-style navigation
  useEffect(() => {
    const shortcuts = [
      {
        ...SHORTCUTS.TOGGLE_EDIT,
        handler: () => !isProcessing && onEdit()
      },
      {
        ...SHORTCUTS.SAVE,
        handler: () => !isProcessing && hasUnsavedChanges && onSave()
      },
      {
        ...SHORTCUTS.APPROVE,
        handler: () => !isProcessing && !hasUnsavedChanges && onApprove()
      },
      {
        ...SHORTCUTS.NAVIGATE_UP,
        handler: () => !isProcessing && currentRowId > 1 && onPrev()
      },
      {
        ...SHORTCUTS.NAVIGATE_DOWN,
        handler: () => !isProcessing && currentRowId < totalRows && onNext()
      },
      {
        ...SHORTCUTS.OPEN_ASSISTANT,
        handler: () => !isProcessing && onOpenAssistant()
      }
    ];

    shortcuts.forEach(shortcut => {
      shortcutManager.register(shortcut);
    });

    return () => {
      shortcuts.forEach(shortcut => {
        shortcutManager.unregister(shortcut.key);
      });
    };
  }, [isProcessing, hasUnsavedChanges, currentRowId, totalRows, onEdit, onSave, onApprove, onPrev, onNext, onOpenAssistant]);

  // Auto-save handler
  useEffect(() => {
    if (!hasUnsavedChanges || !isEditing) return;

    const autoSaveTimer = setTimeout(async () => {
      try {
        await onSave();
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 400);

    return () => clearTimeout(autoSaveTimer);
  }, [hasUnsavedChanges, isEditing, onSave]);

  const handleAction = useCallback(
    async (action: () => void | Promise<void>) => {
      if (isProcessing) return;

      setIsProcessing(true);
      try {
        await action();
      } catch (error) {
        console.error('Action failed:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const getSaveStatusText = () => {
    switch (saveStatus.status) {
      case 'saving':
        return 'Saving... • جاري الحفظ...';
      case 'saved':
        const timeAgo = saveStatus.timestamp
          ? Math.round((Date.now() - saveStatus.timestamp.getTime()) / 1000)
          : 0;
        if (timeAgo < 5) return 'Saved just now • محفوظ الآن';
        if (timeAgo < 60) return `Saved ${timeAgo}s ago • محفوظ منذ ${timeAgo} ث`;
        return 'Saved • محفوظ';
      case 'error':
        return saveStatus.message || 'Save failed • فشل الحفظ';
      default:
        return hasUnsavedChanges ? 'Unsaved changes • تغييرات غير محفوظة' : '';
    }
  };

  const getSaveStatusClass = () => {
    switch (saveStatus.status) {
      case 'saving':
        return 'saving';
      case 'saved':
        return 'saved';
      case 'error':
        return 'error';
      default:
        return '';
    }
  };

  return (
    <>
      {/* Desktop Sticky Actions */}
      <div className={`sticky-actions-toolbar ${className}`}>
        <div className="sticky-actions-container">
          {/* Left Actions */}
          <div className="actions-group">
            {/* Edit/Save Toggle */}
            {!isEditing ? (
              <button
                type="button"
                onClick={() => handleAction(onEdit)}
                className="action-btn primary"
                disabled={isProcessing}
                title="Edit current row (E)"
                aria-label="Edit current row"
              >
                <span className="action-icon">✏️</span>
                <span className="action-label">Edit • تحرير</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAction(onSave)}
                className={`action-btn primary ${hasUnsavedChanges ? 'highlight' : ''}`}
                disabled={isProcessing || !hasUnsavedChanges}
                title="Save changes (⌘S)"
                aria-label="Save changes"
              >
                <span className="action-icon">💾</span>
                <span className="action-label">Save • حفظ</span>
              </button>
            )}

            {/* Approve Button */}
            <button
              type="button"
              onClick={() => handleAction(onApprove)}
              className={`action-btn ${isApproved ? 'success' : 'approve'}`}
              disabled={isProcessing || hasUnsavedChanges}
              aria-label={isApproved ? 'Row approved' : 'Approve row'}
              title={hasUnsavedChanges ? 'Save changes before approving' : 'Approve row (Enter)'}
            >
              <span className="action-icon">{isApproved ? '✅' : '☑️'}</span>
              <span className="action-label">{isApproved ? 'Approved • معتمد' : 'Approve • اعتماد'}</span>
            </button>

            {/* Undo/Revert */}
            {isEditing && (
              <>
                <button
                  onClick={() => handleAction(onUndo)}
                  className="action-btn"
                  disabled={isProcessing}
                  title="Undo changes"
                >
                  <span className="action-icon">↶</span>
                  <span className="action-label">Undo • تراجع</span>
                </button>
                <button
                  onClick={() => handleAction(onRevert)}
                  className="action-btn"
                  disabled={isProcessing}
                  title="Revert to original"
                >
                  <span className="action-icon">🔄</span>
                  <span className="action-label">Revert • استرجاع</span>
                </button>
              </>
            )}
          </div>

          {/* Center - Row Navigation */}
          <div className="actions-group navigation">
            <button
              onClick={() => handleAction(onPrev)}
              className="action-btn"
              disabled={isProcessing || currentRowId <= 1}
              title="Previous row (K)"
            >
              <span className="action-icon">⬆️</span>
            </button>

            <div className="row-indicator">
              <span className="current-row">{currentRowId}</span>
              <span className="row-separator">/</span>
              <span className="total-rows">{totalRows}</span>
            </div>

            <button
              onClick={() => handleAction(onNext)}
              className="action-btn"
              disabled={isProcessing || currentRowId >= totalRows}
              title="Next row (J)"
            >
              <span className="action-icon">⬇️</span>
            </button>
          </div>

          {/* Right Actions */}
          <div className="actions-group">
            {/* Audio Playback */}
            <button
              onClick={() => handleAction(() => onPlayAudio('ar'))}
              className="action-btn audio"
              disabled={isProcessing}
              title="Play Arabic audio"
            >
              <span className="action-icon">🔊</span>
              <span className="action-label">Play AR • تشغيل عربي</span>
            </button>

            <button
              onClick={() => handleAction(() => onPlayAudio('en'))}
              className="action-btn audio"
              disabled={isProcessing}
              title="Play English audio"
            >
              <span className="action-icon">🔊</span>
              <span className="action-label">Play EN • تشغيل إنجليزي</span>
            </button>

            {/* Assistant */}
            <button
              onClick={() => handleAction(onOpenAssistant)}
              className="action-btn assistant"
              disabled={isProcessing}
              title="Open assistant (A)"
            >
              <span className="action-icon">🤖</span>
              <span className="action-label">Assistant • مساعد</span>
            </button>

            {/* Add Note */}
            <button
              onClick={() => handleAction(onAddNote)}
              className="action-btn"
              disabled={isProcessing}
              title="Add note"
            >
              <span className="action-icon">📝</span>
              <span className="action-label">Note • ملاحظة</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        {(saveStatus.status !== 'idle' || hasUnsavedChanges) && (
          <div className="status-bar">
            <div className={`save-status ${getSaveStatusClass()}`}>
              {getSaveStatusText()}
            </div>
            <div className="shortcuts-hint">
              ⌘K • E • J/K • Enter • A
            </div>
          </div>
        )}
      </div>

      {/* Mobile Toolbar - Simplified */}
      <div className="sticky-actions-mobile">
        <div className="mobile-actions">
          <button
            onClick={() => handleAction(onPrev)}
            disabled={isProcessing || currentRowId <= 1}
            className="mobile-btn"
          >
            ⬆️
          </button>

          <button
            onClick={() => handleAction(isEditing ? onSave : onEdit)}
            disabled={isProcessing || (isEditing && !hasUnsavedChanges)}
            className={`mobile-btn ${isEditing ? (hasUnsavedChanges ? 'highlight' : '') : 'primary'}`}
          >
            {isEditing ? '💾' : '✏️'}
          </button>

          <button
            onClick={() => handleAction(onApprove)}
            className={`mobile-btn ${isApproved ? 'success' : 'approve'}`}
            disabled={isProcessing || hasUnsavedChanges}
          >
            {isApproved ? '✅' : '☑️'}
          </button>

          <button
            onClick={() => handleAction(onOpenAssistant)}
            className="mobile-btn assistant"
            disabled={isProcessing}
          >
            🤖
          </button>

          <button
            onClick={() => handleAction(onNext)}
            disabled={isProcessing || currentRowId >= totalRows}
            className="mobile-btn"
          >
            ⬇️
          </button>
        </div>

        <div className="mobile-status">
          <span className="mobile-row-indicator">{currentRowId} / {totalRows}</span>
          {(saveStatus.status !== 'idle' || hasUnsavedChanges) && (
            <span className={`mobile-save-status ${getSaveStatusClass()}`}>
              {getSaveStatusText()}
            </span>
          )}
        </div>
      </div>

      {/* Cursor-style CSS */}
      <style jsx>{`
        .sticky-actions-toolbar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          border-top: 1px solid #e5e7eb;
          box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1);
          z-index: 30;
          display: block;
        }

        @media (max-width: 768px) {
          .sticky-actions-toolbar {
            display: none;
          }
        }

        .sticky-actions-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          max-width: 1200px;
          margin: 0 auto;
          gap: 1rem;
        }

        .actions-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .actions-group.navigation {
          gap: 0.75rem;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          min-height: 44px; /* Dad-Mode touch target */
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
          color: #374151;
        }

        .action-btn:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn.primary {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #1d4ed8;
        }

        .action-btn.highlight {
          background: #fef3c7;
          border-color: #f59e0b;
          color: #92400e;
        }

        .action-btn.approve {
          background: #f0fdf4;
          border-color: #22c55e;
          color: #15803d;
        }

        .action-btn.success {
          background: #dcfce7;
          border-color: #16a34a;
          color: #14532d;
        }

        .action-btn.assistant {
          background: #f3e8ff;
          border-color: #8b5cf6;
          color: #6b21a8;
        }

        .action-btn.audio {
          background: #fef7f0;
          border-color: #fb923c;
          color: #ea580c;
        }

        .action-icon {
          font-size: 18px;
          line-height: 1;
        }

        .action-label {
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
        }

        .row-indicator {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.5rem 1rem;
          background: #f3f4f6;
          border-radius: 6px;
          font-weight: 600;
          color: #374151;
          min-width: 80px;
          justify-content: center;
        }

        .current-row {
          color: #1f2937;
          font-size: 16px;
        }

        .row-separator {
          color: #9ca3af;
        }

        .total-rows {
          color: #6b7280;
          font-size: 14px;
        }

        .status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          border-top: 1px solid #f3f4f6;
          background: #fafafa;
          font-size: 12px;
          color: #6b7280;
        }

        .save-status {
          font-weight: 500;
        }

        .save-status.saving {
          color: #f59e0b;
        }

        .save-status.saved {
          color: #059669;
        }

        .save-status.error {
          color: #dc2626;
        }

        .shortcuts-hint {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        }

        /* Mobile Toolbar */
        .sticky-actions-mobile {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          border-top: 1px solid #e5e7eb;
          box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1);
          z-index: 30;
          display: none;
          padding: 0.75rem;
        }

        @media (max-width: 768px) {
          .sticky-actions-mobile {
            display: block;
          }
        }

        .mobile-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .mobile-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px; /* Dad-Mode touch target */
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 18px;
        }

        .mobile-btn:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .mobile-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mobile-btn.primary {
          background: #eff6ff;
          border-color: #3b82f6;
        }

        .mobile-btn.highlight {
          background: #fef3c7;
          border-color: #f59e0b;
        }

        .mobile-btn.approve {
          background: #f0fdf4;
          border-color: #22c55e;
        }

        .mobile-btn.success {
          background: #dcfce7;
          border-color: #16a34a;
        }

        .mobile-btn.assistant {
          background: #f3e8ff;
          border-color: #8b5cf6;
        }

        .mobile-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #6b7280;
        }

        .mobile-row-indicator {
          font-weight: 600;
          color: #374151;
        }

        .mobile-save-status {
          font-weight: 500;
        }

        .mobile-save-status.saving {
          color: #f59e0b;
        }

        .mobile-save-status.saved {
          color: #059669;
        }

        .mobile-save-status.error {
          color: #dc2626;
        }

        /* Dad-Mode optimizations */
        @media (prefers-reduced-motion: reduce) {
          .action-btn,
          .mobile-btn {
            transition: none;
          }
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
          .action-btn,
          .mobile-btn {
            border-width: 2px;
          }
        }
      `}</style>
    </>
  );
}