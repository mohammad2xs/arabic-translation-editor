'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserRole, formatRoleDisplay, getRoleIcon, canShare } from '../../lib/dadmode/access';
import { disableDadMode, getViewMode, setViewMode } from '../../lib/dadmode/prefs';
import ShareDialog from './ShareDialog';

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
  onViewModeChange?: (viewMode: 'single' | '3' | '5' | '10' | 'all') => void;
  onExitDadMode?: () => void;
}

export default function DadHeader({
  currentSection,
  availableSections,
  currentRow,
  totalRows,
  onSectionChange,
  onFinishSection,
  onViewModeChange,
  onExitDadMode,
}: DadHeaderProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<'single' | '3' | '5' | '10' | 'all'>(() => getViewMode());
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

  const handleViewModeChange = (newViewMode: 'single' | '3' | '5' | '10' | 'all') => {
    setViewMode(newViewMode);
    setCurrentViewMode(newViewMode);
    if (onViewModeChange) {
      onViewModeChange(newViewMode);
    }
  };

  const currentSectionData = availableSections.find(s => s.id === currentSection);

  return (
    <>
      <header className="bg-white shadow-lg border-b-2 border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Top row - Title and mode toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-3xl font-bold text-gray-900">
                📖 Al-Insān Translation Editor
              </h1>
              <div className="flex items-center space-x-2 text-lg text-gray-600">
                <span>{getRoleIcon(userRole)}</span>
                <span>{formatRoleDisplay(userRole)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {canShare(userRole) && (
                <button
                  onClick={() => setShowShareDialog(true)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-200"
                >
                  📤 Share
                </button>
              )}

              <button
                onClick={handleToggleDadMode}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg text-lg font-medium hover:bg-gray-700 transition-colors focus:ring-4 focus:ring-gray-200"
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
                <label htmlFor="dad-section-select" className="text-lg font-medium text-gray-700">
                  📂 Section:
                </label>
                <select
                  id="dad-section-select"
                  value={currentSection}
                  onChange={(e) => onSectionChange(e.target.value)}
                  className="text-lg px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 min-w-[280px]"
                  style={{ minHeight: '48px' }}
                >
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.id}: {section.title} ({section.rowCount} rows)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <label htmlFor="dad-view-mode-select" className="text-lg font-medium text-gray-700">
                  👁️ View Mode:
                </label>
                <select
                  id="dad-view-mode-select"
                  value={currentViewMode}
                  onChange={(e) => handleViewModeChange(e.target.value as 'single' | '3' | '5' | '10' | 'all')}
                  className="text-lg px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 min-w-[200px]"
                  style={{ minHeight: '48px' }}
                >
                  <option value="single">Single Row</option>
                  <option value="3">3 Rows</option>
                  <option value="5">5 Rows</option>
                  <option value="10">10 Rows</option>
                  <option value="all">All Rows</option>
                </select>
              </div>

              <div className="text-xl font-medium text-gray-700">
                📍 Row {currentRow + 1} of {totalRows}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Progress indicator */}
              <div className="flex items-center space-x-3">
                <div className="bg-gray-200 rounded-full h-3 w-32">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{
                      width: `${totalRows > 0 ? ((currentRow + 1) / totalRows) * 100 : 0}%`
                    }}
                  />
                </div>
                <span className="text-lg text-gray-600">
                  {totalRows > 0 ? Math.round(((currentRow + 1) / totalRows) * 100) : 0}%
                </span>
              </div>

              {onFinishSection && (
                <button
                  onClick={onFinishSection}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700 transition-colors focus:ring-4 focus:ring-green-200"
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
    <header className="bg-white shadow-lg border-b-2 border-gray-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-96 bg-gray-300 rounded animate-pulse"></div>
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-12 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-12 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="h-12 w-80 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-3 w-32 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="h-6 w-12 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-12 w-36 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </header>
  );
}