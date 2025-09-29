'use client'

import clsx from 'clsx'
import { useMemo } from 'react'
import type { ParallelRow } from '../types/parallel'

interface ReaderViewProps {
  rows: ParallelRow[]
  selectedRowId?: string
  onSelectRow?: (rowId: string) => void
  searchQuery?: string
}

interface TocEntry {
  sectionId: string
  rows: ParallelRow[]
}

function buildToc(rows: ParallelRow[]): TocEntry[] {
  const sections = new Map<string, ParallelRow[]>()
  rows.forEach(row => {
    const sectionId = row.rowId.split('-')[0] ?? row.rowId
    const group = sections.get(sectionId) ?? []
    group.push(row)
    sections.set(sectionId, group)
  })
  return Array.from(sections.entries()).map(([sectionId, group]) => ({ sectionId, rows: group }))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function ReaderView({ rows, selectedRowId, onSelectRow, searchQuery }: ReaderViewProps) {
  const toc = useMemo(() => buildToc(rows), [rows])
  const normalizedQuery = searchQuery?.toLowerCase().trim()

  return (
    <div className="flex gap-8">
      <aside className="sticky top-28 h-[calc(100vh-7rem)] w-64 overflow-y-auto border-r border-slate-200 pr-4 text-sm dark:border-slate-700">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Sections</div>
        <nav className="space-y-2">
          {toc.map(entry => (
            <div key={entry.sectionId}>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-300">{entry.sectionId}</div>
              <ul className="mt-1 space-y-1">
                {entry.rows.map(row => (
                  <li key={row.rowId}>
                    <a
                      href={`#${row.rowId}`}
                      className={clsx(
                        'block rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800',
                        row.rowId === selectedRowId && 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white'
                      )}
                    >
                      {row.rowId}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <div className="mx-auto max-w-3xl space-y-8">
          {rows.map(row => {
            const isActive = row.rowId === selectedRowId
            const targetText = row.tgtText || '[Translation pending]'
            const escaped = escapeHtml(targetText)
            const highlighted = normalizedQuery
              ? escaped.replace(
                  new RegExp(`(${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                  '<mark class="bg-amber-200 text-amber-900">$1</mark>'
                )
              : escaped

            return (
              <section
                key={row.rowId}
                id={row.rowId}
                className={clsx(
                  'rounded-2xl border border-transparent px-6 py-6 transition',
                  isActive && 'border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-600/40 dark:bg-indigo-900/30'
                )}
              >
                <header className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-200">
                      {row.rowId}
                    </h2>
                    <p className="text-xs text-slate-400">{row.segments.length} segments · ratio {row.lengthRatio.toFixed(2)}</p>
                  </div>
                  {onSelectRow && (
                    <button
                      type="button"
                      onClick={() => onSelectRow(row.rowId)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                    >
                      Focus
                    </button>
                  )}
                </header>
                <article
                  className="prose prose-slate max-w-none text-lg leading-relaxed dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: highlighted.replace(/\n/g, '<br />') }}
                />
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ReaderView
