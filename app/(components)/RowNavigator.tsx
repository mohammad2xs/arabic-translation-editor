'use client';

import { useState, useEffect, useMemo } from 'react';
import { useShortcuts, SHORTCUTS } from '@/lib/ui/shortcuts';

export interface RowStatus {
  id: number;
  status: 'pending' | 'in-progress' | 'approved' | 'issues';
  hasIssues: boolean;
  preview?: string; // First few words for tooltip
}

interface RowNavigatorProps {
  rows: RowStatus[];
  currentRowId: number;
  onNavigateToRow: (rowId: number) => void;
  onJumpRows?: (direction: 'up' | 'down', count: number) => void;
  isVisible: boolean;
  className?: string;
}

export default function RowNavigator({
  rows,
  currentRowId,
  onNavigateToRow,
  onJumpRows,
  isVisible = true,
  className = '',
}: RowNavigatorProps) {
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);

  // Generate status color for each row
  const getStatusColor = (row: RowStatus) => {
    if (row.hasIssues) return 'issues';
    return row.status;
  };

  // Get tooltip text with bilingual support
  const getTooltipText = (row: RowStatus) => {
    const statusText = {
      pending: 'Not started • لم يبدأ',
      'in-progress': 'In progress • قيد التقدم',
      approved: 'Approved • معتمد',
      issues: 'Has issues • يحتوي على مشاكل',
    };

    const status = statusText[row.hasIssues ? 'issues' : row.status];
    const preview = row.preview ? `\n${row.preview}` : '';
    return `Row ${row.id} • الصف ${row.id}\n${status}${preview}`;
  };

  // Register keyboard shortcuts using centralized system
  useShortcuts([
    {
      ...SHORTCUTS.JUMP_UP_5,
      enabled: () => isVisible,
      handler: () => onJumpRows?.('up', 5)
    },
    {
      ...SHORTCUTS.JUMP_DOWN_5,
      enabled: () => isVisible,
      handler: () => onJumpRows?.('down', 5)
    }
  ], [isVisible, onJumpRows]);

  // Auto-scroll to current row
  useEffect(() => {
    const currentDot = document.querySelector(`[data-row-id="${currentRowId}"]`);
    if (currentDot) {
      currentDot.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentRowId]);

  // Group rows into sections for better organization
  const rowSections = useMemo(() => {
    const sections: { start: number; end: number; rows: RowStatus[] }[] = [];
    const sectionSize = 20;

    for (let i = 0; i < rows.length; i += sectionSize) {
      const sectionRows = rows.slice(i, i + sectionSize);
      sections.push({
        start: sectionRows[0]?.id || i + 1,
        end: sectionRows[sectionRows.length - 1]?.id || i + sectionSize,
        rows: sectionRows,
      });
    }

    return sections;
  }, [rows]);

  if (!isVisible) return null;

  return (
    <div className={`row-navigator ${className}`}>
      {rowSections.map((section) => (
        <div key={`section-${section.start}`} className="mb-6">
          <div className="text-xs text-gray-500 text-center mb-2 sticky top-0 bg-white py-1">
            {section.start}-{section.end}
          </div>

          {section.rows.map((row) => {
            const statusColor = getStatusColor(row);
            const isCurrent = row.id === currentRowId;
            const isHovered = row.id === hoveredRowId;

            return (
              <div
                key={row.id}
                data-row-id={row.id}
                className={`row-nav-dot ${statusColor} ${isCurrent ? 'current' : ''}`}
                onClick={() => onNavigateToRow(row.id)}
                onMouseEnter={() => setHoveredRowId(row.id)}
                onMouseLeave={() => setHoveredRowId(null)}
                style={{
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {(isHovered || isCurrent) && (
                  <div className="row-nav-tooltip">
                    {getTooltipText(row)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Progress indicator */}
      <div className="sticky bottom-4 bg-white border border-gray-200 rounded-lg p-2 text-xs text-center">
        <div className="text-gray-600 mb-1" style={{ fontSize: '12px' }}>Progress • التقدم</div>
        <div className="flex gap-1 justify-center mb-1">
          {Object.entries(
            rows.reduce((acc, row) => {
              const status = getStatusColor(row);
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).map(([status, count]) => (
            <div
              key={status}
              className="flex items-center gap-1"
              title={`${count} ${status} rows • ${count} صف ${status}`}
            >
              <div className={`w-2 h-2 rounded-full row-nav-dot ${status}`}></div>
              <span className="text-xs" style={{ fontSize: '11px' }}>{count}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500" style={{ fontSize: '11px' }}>
          Row {currentRowId} of {rows.length} • الصف {currentRowId} من {rows.length}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-2 text-xs text-gray-500">
        <div style={{ fontSize: '10px' }}>⌥↑↓ Jump 5 rows • القفز ٥ صفوف</div>
        <div style={{ fontSize: '10px' }}>Click to navigate • اضغط للتنقل</div>
      </div>
    </div>
  );
}