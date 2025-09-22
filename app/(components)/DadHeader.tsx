'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserRole, formatRoleDisplay, getRoleIcon, canShare, canComment } from '../../lib/dadmode/access';
import { disableDadMode, getViewMode, setViewMode, getContextSize, setContextSize } from '../../lib/dadmode/prefs';
import ShareDialog from './ShareDialog';
import EnvironmentWarning from './EnvironmentWarning';
import { useEnvironmentHealth, getServiceStatusSummary } from '../../lib/client/environment-status';

interface DadHeaderProps {
  currentSection: string;
  availableSections: Array<{
    id: string;
    title: string;
    rowCount: number;
  }>;
  currentRow: number;
  totalRows: number;
  onSectionChange: (sectionId: string) => void;
  onFinishSection?: () => void;
  viewMode?: 'focus' | 'context' | 'all' | 'preview';
  contextSize?: number;
  onViewModeChange?: (viewMode: 'focus' | 'context' | 'all' | 'preview') => void;
  onContextSizeChange?: (contextSize: number) => void;
  onExitDadMode?: () => void;
  onToggleAssistant?: () => void;
  isAssistantOpen?: boolean;
  onOpenPreview?: () => void;
  onOpenCommandPalette?: () => void;
  syncStatus?: React.ReactNode;
}

// Service Status Mini-Badges Component
function ServiceStatusBadges() {
  const { status } = useEnvironmentHealth({
    pollInterval: 60000, // Check every minute
    detailed: false,
    autoRefresh: true
  });

  if (!status?.services) {
    return null;
  }

  const getServiceBadge = (serviceName: string, service: any) => {
    const statusColor = service.status === 'healthy' ? 'bg-green-500' :
      service.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500';

    const serviceIcon = serviceName === 'llm_provider' ? '🤖' :
      serviceName === 'storage' ? '💾' :
      serviceName === 'elevenlabs' ? '🔊' :
      serviceName === 'analytics' ? '📊' : '⚙️';

    const title = `${serviceName.replace('_', ' ')}: ${service.status}${service.message ? ` - ${service.message}` : ''}`;

    return (
      <div
        key={serviceName}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${statusColor} text-white`}
        title={title}
      >
        <span>{serviceIcon}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${statusColor === 'bg-green-500' ? 'bg-green-300' : statusColor === 'bg-amber-500' ? 'bg-amber-300' : 'bg-red-300'}`} />
      </div>
    );
  };

  // Show only critical services and TTS service
  const servicesToShow = Object.entries(status.services)
    .filter(([name, service]) =>
      service.critical || name === 'elevenlabs'
    )
    .slice(0, 3); // Limit to 3 badges max

  if (servicesToShow.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center space-x-1">
      {servicesToShow.map(([name, service]) => getServiceBadge(name, service))}
    </div>
  );
}

export default function DadHeader({
  currentSection,
  availableSections,
  currentRow,
  totalRows,
  onSectionChange,
  onFinishSection,
  viewMode,
  contextSize,
  onViewModeChange,
  onContextSizeChange,
  onExitDadMode,
  onToggleAssistant,
  isAssistantOpen,
  onOpenPreview,
  onOpenCommandPalette,
  syncStatus,
}: DadHeaderProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const currentViewMode = viewMode || getViewMode();
  const currentContextSize = contextSize || getContextSize();
  const router = useRouter();
  const userRole = getUserRole();

  const handleToggleDadMode = () => {
    disableDadMode();
    // Call the callback to update parent state
    if (onExitDadMode) {
      onExitDadMode();
    }
    // Remove mode parameter and refresh
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    router.push(url.toString());
  };

  const handleViewModeChange = (newViewMode: 'focus' | 'context' | 'all' | 'preview') => {
    setViewMode(newViewMode);
    if (onViewModeChange) {
      onViewModeChange(newViewMode);
    }
  };

  const handleContextSizeChange = (newContextSize: number) => {
    setContextSize(newContextSize);
    if (onContextSizeChange) {
      onContextSizeChange(newContextSize);
    }
  };

  const currentSectionData = availableSections.find(s => s.id === currentSection);

  return (
    <>
      <header className="terminal-panel terminal-theme terminal-header sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Top row - Title and mode toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <h1 className="terminal-header-title">
                📖 Al-Insān Translation Editor
              </h1>
              <div className="flex items-center space-x-2 text-lg" style={{ color: 'var(--muted)' }}>
                <span>{getRoleIcon(userRole)}</span>
                <span>{formatRoleDisplay(userRole)}</span>
              </div>

              {/* Environment Status Indicator */}
              <EnvironmentWarning
                compact={true}
                criticalOnly={true}
                className="terminal-button terminal-button-ghost"
              />

              {/* Service Status Badges */}
              <ServiceStatusBadges />
            </div>

            <div className="flex items-center space-x-4">
              {syncStatus && (
                <div className="flex items-center space-x-2">
                  {syncStatus}
                </div>
              )}

              {onOpenPreview && (
                <button
                  onClick={onOpenPreview}
                  className="terminal-button terminal-button-success"
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                  aria-label="Open final preview"
                >
                  👁️ Preview
                </button>
              )}

              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className="terminal-button"
                  style={{
                    minHeight: 'var(--dad-touch-target)',
                    background: 'var(--violet)',
                    color: 'var(--bg0)',
                    borderColor: 'var(--violet)',
                    position: 'relative'
                  }}
                  aria-label="Open command palette"
                  title="Press ⌘K to open command palette"
                >
                  ⌘K
                  <span className="terminal-cmd-palette-shortcut" style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    fontSize: '10px',
                    background: 'var(--blue)',
                    color: 'var(--bg0)',
                    padding: '2px 4px',
                    borderRadius: '4px'
                  }}>
                    hint
                  </span>
                </button>
              )}

              {canComment(userRole) && onToggleAssistant && (
                <button
                  onClick={onToggleAssistant}
                  className="terminal-button"
                  style={{
                    minHeight: 'var(--dad-touch-target)',
                    background: isAssistantOpen ? 'var(--violet)' : 'var(--panel)',
                    color: isAssistantOpen ? 'var(--bg0)' : 'var(--ink)',
                    borderColor: 'var(--violet)'
                  }}
                  aria-label={isAssistantOpen ? 'Close Assistant' : 'Open Assistant'}
                >
                  🤖 Assistant {isAssistantOpen ? '✓' : ''}
                </button>
              )}

              {canShare(userRole) && (
                <>
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="terminal-button terminal-button-primary"
                    style={{ minHeight: 'var(--dad-touch-target)' }}
                  >
                    📤 Share
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const { createToken, generateShareUrl } = await import('../../lib/share/production-storage');
                        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
                        const token = await createToken('reviewer', expiresAt, currentSection);
                        const shareUrl = generateShareUrl(window.location.origin, token, currentSection, 'dad');
                        await navigator.clipboard.writeText(shareUrl);

                        // Show success toast
                        const toast = document.createElement('div');
                        toast.className = 'fixed top-4 right-4 terminal-panel text-white px-6 py-3 rounded-lg shadow-lg z-50';
                        toast.style.background = 'var(--green)';
                        toast.textContent = '📋 Public review link copied!';
                        document.body.appendChild(toast);
                        setTimeout(() => document.body.removeChild(toast), 3000);
                      } catch (error) {
                        console.error('Failed to create share link:', error);
                        // Show error toast
                        const toast = document.createElement('div');
                        toast.className = 'fixed top-4 right-4 terminal-panel text-white px-6 py-3 rounded-lg shadow-lg z-50';
                        toast.style.background = 'var(--red)';
                        toast.textContent = '❌ Failed to create share link';
                        document.body.appendChild(toast);
                        setTimeout(() => document.body.removeChild(toast), 3000);
                      }
                    }}
                    className="terminal-button terminal-button-success"
                    style={{ minHeight: 'var(--dad-touch-target)' }}
                    aria-label="Copy reviewer link"
                  >
                    📋 Copy Reviewer Link
                  </button>
                </>
              )}

              <button
                onClick={() => window.open('/review', '_blank')}
                className="terminal-button"
                style={{
                  minHeight: 'var(--dad-touch-target)',
                  background: 'var(--amber)',
                  color: 'var(--bg0)',
                  borderColor: 'var(--amber)'
                }}
                aria-label="Open code review interface"
              >
                🔍 Review
              </button>

              <button
                onClick={handleToggleDadMode}
                className="terminal-button terminal-button-ghost"
                style={{ minHeight: 'var(--dad-touch-target)' }}
                aria-label="Exit Dad Mode"
              >
                👓 Exit Dad Mode
              </button>
            </div>
          </div>

          {/* Second row - Section selector and progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <label htmlFor="dad-section-select" className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
                  📂 Section:
                </label>
                <select
                  id="dad-section-select"
                  value={currentSection}
                  onChange={(e) => onSectionChange(e.target.value)}
                  className="terminal-input text-lg min-w-[280px]"
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                >
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.id}: {section.title} ({section.rowCount} rows)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <label htmlFor="dad-view-mode-select" className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
                  👁️ View Mode:
                </label>
                <select
                  id="dad-view-mode-select"
                  value={currentViewMode}
                  onChange={(e) => handleViewModeChange(e.target.value as 'focus' | 'context' | 'all' | 'preview')}
                  className="terminal-input text-lg min-w-[200px]"
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                >
                  <option value="focus">Focus Row</option>
                  <option value="context">±N Rows</option>
                  <option value="all">All Rows</option>
                  <option value="preview">Preview</option>
                </select>

                {currentViewMode === 'context' && (
                  <div className="flex items-center space-x-2">
                    <label htmlFor="dad-context-size-select" className="text-lg font-medium" style={{ color: 'var(--ink)' }}>
                      Size:
                    </label>
                    <select
                      id="dad-context-size-select"
                      value={currentContextSize}
                      onChange={(e) => handleContextSizeChange(parseInt(e.target.value))}
                      className="terminal-input text-lg min-w-[80px]"
                      style={{ minHeight: 'var(--dad-touch-target)' }}
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
                📍 Row {currentRow + 1} of {totalRows}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Progress indicator */}
              <div className="flex items-center space-x-3">
                <div className="terminal-progress">
                  <div
                    className="terminal-progress-bar"
                    style={{
                      width: `${totalRows > 0 ? ((currentRow + 1) / totalRows) * 100 : 0}%`
                    }}
                  />
                </div>
                <span className="text-lg" style={{ color: 'var(--muted)' }}>
                  {totalRows > 0 ? Math.round(((currentRow + 1) / totalRows) * 100) : 0}%
                </span>
              </div>

              {onFinishSection && (
                <button
                  onClick={onFinishSection}
                  className="terminal-button terminal-button-success"
                  style={{ minHeight: 'var(--dad-touch-target)' }}
                  aria-label="Mark section as complete"
                >
                  ✅ Finish Section
                </button>
              )}
            </div>
          </div>

          {/* Third row - Section info */}
          {currentSectionData && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between text-lg text-gray-600">
                <div className="flex items-center space-x-6">
                  <span>📊 {currentSectionData.rowCount} total rows</span>
                  <span>
                    📈 {Math.round((currentRow / totalRows) * 100)}% progress
                  </span>
                </div>
                <div className="text-base text-gray-500">
                  💡 Use the big Previous/Next buttons below to navigate
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Full Environment Warning Banner */}
      <EnvironmentWarning
        compact={false}
        criticalOnly={false}
        className="show"
      />

      {showShareDialog && (
        <ShareDialog
          currentSection={currentSection}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}

export function DadHeaderSkeleton() {
  return (
    <header className="terminal-panel terminal-theme terminal-header sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-96 rounded animate-pulse" style={{ background: 'var(--muted)' }}></div>
            <div className="h-6 w-32 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-12 w-24 rounded-lg animate-pulse" style={{ background: 'var(--bg1)' }}></div>
            <div className="h-12 w-32 rounded-lg animate-pulse" style={{ background: 'var(--bg1)' }}></div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="h-12 w-80 rounded-lg animate-pulse" style={{ background: 'var(--bg1)' }}></div>
            <div className="h-6 w-32 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-3 w-32 rounded-full animate-pulse" style={{ background: 'var(--bg1)' }}></div>
            <div className="h-6 w-12 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
            <div className="h-12 w-36 rounded-lg animate-pulse" style={{ background: 'var(--bg1)' }}></div>
          </div>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(147, 164, 177, 0.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="h-6 w-24 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
              <div className="h-6 w-24 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
            </div>
            <div className="h-4 w-64 rounded animate-pulse" style={{ background: 'var(--bg1)' }}></div>
          </div>
        </div>
      </div>
    </header>
  );
}