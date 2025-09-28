'use client';

import { useState, useEffect } from 'react';

interface Issue {
  id: string;
  rowId: number;
  type: 'lpr' | 'coverage' | 'scripture' | 'notes';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

interface IssueQueueProps {
  isOpen: boolean;
  onToggle: () => void;
  currentRow?: number;
  onNavigateToRow?: (rowId: number) => void;
  onFocusColumn?: (column: 'original' | 'enhanced' | 'english') => void;
  onOpenAssistant?: (preset?: string) => void;
  sectionId?: string; // Current section being edited
}

export default function IssueQueue({
  isOpen,
  onToggle,
  currentRow = 1,
  onNavigateToRow,
  onFocusColumn,
  onOpenAssistant,
  sectionId = 'default'
}: IssueQueueProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'lpr' | 'coverage' | 'scripture' | 'notes'>('all');

  // Fetch issues from API
  useEffect(() => {
    if (!isOpen) return;

    const fetchIssues = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/issues?section=${sectionId}`);
        if (response.ok) {
          const data = await response.json();
          setIssues(data.issues || []);
        }
      } catch (error) {
        console.error('Failed to fetch issues:', error);
        // Fallback with mock data for demo
        setIssues([
          {
            id: '1',
            rowId: 15,
            type: 'lpr',
            title: 'Low Length Preservation',
            description: 'Arabic text is 40% shorter than original',
            severity: 'high'
          },
          {
            id: '2',
            rowId: 23,
            type: 'coverage',
            title: 'Missing Semantic Coverage',
            description: 'Key concept "covenant" not fully expressed',
            severity: 'medium'
          },
          {
            id: '3',
            rowId: 31,
            type: 'scripture',
            title: 'Unresolved Scripture Reference',
            description: 'Reference to Psalm 23:1 needs verification',
            severity: 'medium'
          },
          {
            id: '4',
            rowId: 42,
            type: 'notes',
            title: 'Translation Note',
            description: 'Reviewer flagged cultural adaptation needed',
            severity: 'low'
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [isOpen, sectionId]);

  // Filter issues
  const filteredIssues = filter === 'all'
    ? issues
    : issues.filter(issue => issue.type === filter);

  // Group issues by type
  const groupedIssues = filteredIssues.reduce((groups, issue) => {
    if (!groups[issue.type]) groups[issue.type] = [];
    groups[issue.type].push(issue);
    return groups;
  }, {} as Record<string, Issue[]>);

  const getIssueIcon = (type: Issue['type']) => {
    switch (type) {
      case 'lpr': return '📏';
      case 'coverage': return '🎯';
      case 'scripture': return '📖';
      case 'notes': return '📝';
      default: return '⚠️';
    }
  };

  const getIssueTitle = (type: Issue['type']) => {
    switch (type) {
      case 'lpr': return 'Length Preservation • حفظ الطول';
      case 'coverage': return 'Semantic Coverage • التغطية الدلالية';
      case 'scripture': return 'Scripture References • المراجع الكتابية';
      case 'notes': return 'Translation Notes • ملاحظات الترجمة';
      default: return type;
    }
  };

  const getSeverityColor = (severity: Issue['severity']) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const handleJumpAndFix = (issue: Issue) => {
    // Navigate to the problematic row
    onNavigateToRow?.(issue.rowId);

    // Focus appropriate column based on issue type
    if (issue.type === 'lpr' || issue.type === 'coverage') {
      onFocusColumn?.('enhanced');
    } else if (issue.type === 'scripture') {
      onFocusColumn?.('original');
    } else if (issue.type === 'notes') {
      onFocusColumn?.('english');
    }

    // Open assistant with relevant preset
    if (issue.type === 'lpr') {
      onOpenAssistant?.('expand');
    } else if (issue.type === 'coverage') {
      onOpenAssistant?.('clarify');
    } else if (issue.type === 'scripture') {
      onOpenAssistant?.('scripture-check');
    }
  };

  const issueTypeOrder: Issue['type'][] = ['lpr', 'coverage', 'scripture', 'notes'];

  return (
    <div className={`issue-queue ${isOpen ? 'open' : 'closed'}`}>
      {/* Header */}
      <div className="issue-queue-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-gray-900" style={{ fontSize: '18px' }}>
              Issues • مشاكل
            </h3>
            {issues.length > 0 && (
              <span className="bg-red-100 text-red-800 text-sm font-medium px-2 py-1 rounded-full">
                {issues.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Toggle issues queue"
          >
            {isOpen ? '✕' : '📋'}
          </button>
        </div>

        {/* Filter Tabs */}
        {isOpen && (
          <div className="mt-3 flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                filter === 'all'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-label="Show all issues"
            >
              All • الكل
            </button>
            {issueTypeOrder.map(type => {
              const count = issues.filter(issue => issue.type === type).length;
              if (count === 0) return null;

              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => setFilter(type)}
                  aria-label={`Filter by ${type} issues`}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    filter === type
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {getIssueIcon(type)} {count}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      {isOpen && (
        <div className="issue-queue-content">
          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin text-2xl mb-2">⏳</div>
              <div>Loading issues... • جاري التحميل...</div>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-medium mb-1">No issues found!</div>
              <div className="text-sm">لا توجد مشاكل!</div>
            </div>
          ) : (
            <div className="space-y-4">
              {issueTypeOrder.map(type => {
                const typeIssues = groupedIssues[type];
                if (!typeIssues?.length) return null;

                return (
                  <div key={type} className="space-y-2">
                    <div className="text-sm font-medium text-gray-600 px-3">
                      {getIssueTitle(type)}
                    </div>
                    {typeIssues.map(issue => (
                      <div
                        key={issue.id}
                        className={`p-3 border rounded-lg ${
                          issue.rowId === currentRow
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        } transition-colors`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getIssueIcon(issue.type)}</span>
                            <div>
                              <div className="font-medium text-gray-900 text-sm">
                                Row {issue.rowId} • الصف {issue.rowId}
                              </div>
                              <div className="text-xs text-gray-600">
                                {issue.title}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        </div>

                        <div className="text-sm text-gray-700 mb-3">
                          {issue.description}
                        </div>

                        <button
                          onClick={() => handleJumpAndFix(issue)}
                          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                          style={{ fontSize: '14px' }} // Dad-Mode friendly
                        >
                          Jump & Fix • انتقل وأصلح
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}