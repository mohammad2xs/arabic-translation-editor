'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Download, MessageSquare, Settings2 } from 'lucide-react'
import ModeSwitch, { ReviewerMode } from './ModeSwitch'
import QABadge from './QABadge'
import type { QAOverview } from '../lib/qa'

interface TopbarProps {
  mode: ReviewerMode
  onModeChange: (mode: ReviewerMode) => void
  dadMode: boolean
  onDadModeToggle: (enabled: boolean) => void
  presentationMode: boolean
  onPresentationToggle: (enabled: boolean) => void
  searchQuery: string
  onSearchChange: (value: string) => void
  qaOverview: QAOverview | null
  onExport: (format: 'txt' | 'md' | 'docx' | 'json') => void
  onOpenComments: () => void
  showCommentsIndicator?: boolean
}

const EXPORT_OPTIONS: Array<{ id: 'txt' | 'md' | 'docx' | 'json'; label: string; description: string }> = [
  { id: 'txt', label: 'Target (.txt)', description: 'Plain text export of target translation' },
  { id: 'md', label: 'Target (.md)', description: 'Markdown export with headings' },
  { id: 'docx', label: 'Target (.docx)', description: 'Word document ready for review' },
  { id: 'json', label: 'Aligned (.json)', description: 'Source ↔ Target alignment for tooling' }
]

export function Topbar({
  mode,
  onModeChange,
  dadMode,
  onDadModeToggle,
  presentationMode,
  onPresentationToggle,
  searchQuery,
  onSearchChange,
  qaOverview,
  onExport,
  onOpenComments,
  showCommentsIndicator
}: TopbarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleClick(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  return (
    <header className="app-chrome sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center gap-4">
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
        <QABadge overview={qaOverview} />
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search segments, refs, notes"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDadModeToggle(!dadMode)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              dadMode
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600'
                : 'border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
            aria-pressed={dadMode}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            DAD Mode
          </button>

          <button
            type="button"
            onClick={() => onPresentationToggle(!presentationMode)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              presentationMode
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                : 'border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
            aria-pressed={presentationMode}
          >
            Screenshare
          </button>

          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen(state => !state)}
              className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="divide-y divide-slate-100">
                  {EXPORT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        onExport(option.id)
                        setExportOpen(false)
                      }}
                    >
                      <div className="font-medium text-slate-800">{option.label}</div>
                      <div className="text-[11px] text-slate-400">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenComments}
            className="relative inline-flex items-center rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Comments
            {showCommentsIndicator && (
              <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export default Topbar
