'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { Scissors, GitMerge, Check, AlertTriangle } from 'lucide-react'
import type { ParallelRow, ParallelSegment } from '../types/parallel'
import type { QAResult } from '../lib/qa'
import type { AlignmentStatus } from '../lib/align'

interface CompareViewProps {
  rows: ParallelRow[]
  qaBySegment: Record<string, QAResult>
  selectedSegmentId?: string
  onSelectSegment?: (segment: ParallelSegment) => void
  onMergeSegments?: (rowId: string, segmentIds: string[]) => void
  onSplitSegment?: (rowId: string, segment: ParallelSegment, parts: { src: string; tgt: string }[]) => void
  onUpdateSegment?: (rowId: string, segmentId: string, text: string) => void
}

function statusBadgeClasses(status: AlignmentStatus) {
  switch (status) {
    case 'aligned':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'needs_review':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'missing_src':
    case 'missing_tgt':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200'
  }
}

function qaIndicator(result?: QAResult) {
  if (!result) return null
  return result.status === 'pass' ? (
    <Check className="h-4 w-4 text-emerald-500" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  )
}

export function CompareView({
  rows,
  qaBySegment,
  selectedSegmentId,
  onSelectSegment,
  onMergeSegments,
  onSplitSegment,
  onUpdateSegment
}: CompareViewProps) {
  const [editingSegment, setEditingSegment] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => a.paraIndex - b.paraIndex), [rows])

  const requestSplit = (row: ParallelRow, segment: ParallelSegment) => {
    if (!onSplitSegment) return
    const value = window.prompt(
      'Enter each translated segment on a new line (Arabic source will split to the same count).',
      segment.tgt
    )
    if (!value) return
    const targets = value.split('\n').map(item => item.trim()).filter(Boolean)
    if (!targets.length) return
    const sources = segment.src
      ? segment.src.split(/(?<=[\.؟?!؛])/).filter(Boolean)
      : new Array(targets.length).fill('')
    const parts = targets.map((tgt, index) => ({ src: sources[index] ?? '', tgt }))
    onSplitSegment(row.rowId, segment, parts)
  }

  const requestMerge = (row: ParallelRow, current: ParallelSegment, next?: ParallelSegment) => {
    if (!onMergeSegments || !next) return
    onMergeSegments(row.rowId, [current.id, next.id])
  }

  const beginEdit = (segment: ParallelSegment) => {
    setEditingSegment(segment.id)
    setDraftText(segment.tgt)
  }

  const commitEdit = (rowId: string, segment: ParallelSegment) => {
    if (!onUpdateSegment) return
    onUpdateSegment(rowId, segment.id, draftText)
    setEditingSegment(null)
    setDraftText('')
  }

  return (
    <div className="space-y-6">
      {sortedRows.map(row => (
        <section key={row.rowId} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <header className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-200">
              {row.rowId}
            </h2>
            <p className="text-xs text-slate-400">
              {row.segments.length} segments · Ratio {row.lengthRatio.toFixed(2)}
            </p>
          </header>

          <div className="grid gap-3">
            {row.segments
              .slice()
              .sort((a, b) => a.segIndex - b.segIndex)
              .map((segment, index, list) => {
                const qaResult = qaBySegment[segment.id]
                const isSelected = selectedSegmentId === segment.id
                const isEditing = editingSegment === segment.id
                const nextSegment = list[index + 1]

                return (
                  <article
                    key={segment.id}
                    id={`seg-${segment.id}`}
                    onClick={() => onSelectSegment?.(segment)}
                    className={clsx(
                      'rounded-xl border px-4 py-3 transition',
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50 shadow-inner dark:border-indigo-500/60 dark:bg-indigo-900/30'
                        : 'border-slate-200 dark:border-slate-700'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', statusBadgeClasses(segment.status))}>
                          {segment.status.replace('_', ' ')}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          #{segment.segIndex}
                        </span>
                        {qaIndicator(qaResult)}
                        <span className="text-slate-400">{qaResult?.score ?? '--'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            onSelectSegment?.(segment)
                          }}
                          className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                        >
                          Focus
                        </button>
                        {nextSegment && (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              requestMerge(row, segment, nextSegment)
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-slate-500 transition hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                          >
                            <GitMerge className="h-3 w-3" />
                            Merge
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            requestSplit(row, segment)
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-slate-500 transition hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                        >
                          <Scissors className="h-3 w-3" />
                          Split
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div
                        dir="rtl"
                        className="rounded-lg bg-slate-50 px-3 py-2 text-right font-arabic text-base leading-relaxed dark:bg-slate-800"
                      >
                        {segment.src || <span className="text-slate-400">[Empty]</span>}
                      </div>
                      <div className="flex flex-col gap-2">
                        {isEditing ? (
                          <>
                            <textarea
                              value={draftText}
                              onChange={event => setDraftText(event.target.value)}
                              onClick={event => event.stopPropagation()}
                              className="min-h-[96px] rounded-lg border border-slate-300 px-3 py-2 text-base leading-relaxed shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800"
                            />
                            <div className="flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation()
                                  commitEdit(row.rowId, segment)
                                }}
                                className="rounded-full bg-indigo-500 px-3 py-1 font-medium text-white shadow hover:bg-indigo-600"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation()
                                  setEditingSegment(null)
                                  setDraftText(segment.tgt)
                                }}
                                className="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              onSelectSegment?.(segment)
                              beginEdit(segment)
                            }}
                            className={clsx(
                              'min-h-[96px] w-full rounded-lg border border-transparent px-3 py-2 text-left text-base leading-relaxed transition hover:border-indigo-200 hover:bg-indigo-50 focus:outline-none dark:hover:bg-slate-800',
                              segment.tgt ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'
                            )}
                          >
                            {segment.tgt || '[Add translation]'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default CompareView
