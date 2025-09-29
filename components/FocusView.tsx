'use client'

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, Wand2, ArrowLeft, ArrowRight, Mic, MicOff } from 'lucide-react'
import type { ParallelRow, ParallelSegment } from '../types/parallel'
import type { QAResult } from '../lib/qa'
import type { AlignmentStatus } from '../lib/align'
import { useSpeechRecognition } from '../lib/hooks/useSpeechRecognition'

interface FocusViewProps {
  row: ParallelRow | null
  segment: ParallelSegment | null
  qaResult?: QAResult
  onNavigate: (direction: 'previous' | 'next') => void
  onUpdateSegment: (rowId: string, segmentId: string, text: string) => void
  onStatusChange: (rowId: string, segmentId: string, status: AlignmentStatus) => void
  onComment: () => void
}

type DiffToken = { type: 'added' | 'removed' | 'unchanged'; value: string }

function diffWords(previousText: string, currentText: string): DiffToken[] {
  const prevTokens = previousText.split(/\s+/).filter(Boolean)
  const remainingPrev = [...prevTokens]
  const currTokens = currentText.split(/\s+/).filter(Boolean)
  const result: DiffToken[] = []

  currTokens.forEach(token => {
    const index = remainingPrev.indexOf(token)
    if (index >= 0) {
      result.push({ type: 'unchanged', value: token })
      remainingPrev.splice(index, 1)
    } else {
      result.push({ type: 'added', value: token })
    }
  })

  remainingPrev.forEach(token => {
    result.push({ type: 'removed', value: token })
  })

  return result
}

export function FocusView({
  row,
  segment,
  qaResult,
  onNavigate,
  onUpdateSegment,
  onStatusChange,
  onComment
}: FocusViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { isSupported, isListening, transcript, start, stop, reset } = useSpeechRecognition()

  useEffect(() => {
    if (!segment) return
    setDraft(segment.tgt ?? '')
    setIsEditing(false)
    reset()
  }, [segment?.id])

  useEffect(() => {
    if (!isListening || !transcript) return
    setDraft(current => `${current ? `${current} ` : ''}${transcript}`.trim())
  }, [isListening, transcript])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
     if (!segment) return
      const { rowId, id } = segment
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key === 'e') {
        event.preventDefault()
        setIsEditing(prev => !prev)
        setDraft(segment.tgt ?? '')
      } else if (meta && event.key === 'Enter') {
        event.preventDefault()
        onStatusChange(rowId, id, 'aligned')
        onUpdateSegment(rowId, id, draft)
        setIsEditing(false)
      } else if (meta && event.key === 'ArrowLeft') {
        event.preventDefault()
        onNavigate('previous')
      } else if (meta && event.key === 'ArrowRight') {
        event.preventDefault()
        onNavigate('next')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [segment, draft, onNavigate, onStatusChange, onUpdateSegment])

  if (!row || !segment) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <div className="text-lg font-semibold text-slate-500 dark:text-slate-300">Select a segment to review</div>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Use the compare view or keyboard shortcuts (⌘/Ctrl + ←/→) to move between segments.
        </p>
      </div>
    )
  }

  const activeRow = row as ParallelRow
  const activeSegment = segment as ParallelSegment
  const diff = useMemo(() => diffWords(activeSegment.tgt ?? '', draft), [activeSegment.id, activeSegment.tgt, draft])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">{activeRow.rowId}</div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Segment #{activeSegment.segIndex}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('previous')}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
            title="Previous (⌘/Ctrl + ←)"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('next')}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
            title="Next (⌘/Ctrl + →)"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4 font-arabic text-lg leading-relaxed dark:bg-slate-800">
          {activeSegment.src || <span className="text-slate-400">[Missing source]</span>}
        </div>
        <div className="flex flex-col gap-3">
          {isEditing ? (
            <textarea
              className="min-h-[160px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-relaxed shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800"
              value={draft}
              onChange={event => setDraft(event.target.value)}
            />
          ) : (
            <div className="min-h-[160px] rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-base leading-relaxed dark:bg-slate-800">
              {activeSegment.tgt || <span className="text-slate-400">[Add translation]</span>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Edit (⌘/Ctrl + E)
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateSegment(activeSegment.rowId, activeSegment.id, draft)
                onStatusChange(activeSegment.rowId, activeSegment.id, 'aligned')
                setIsEditing(false)
              }}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-3 py-1 font-medium text-white shadow hover:bg-indigo-600"
            >
              <CheckCircle2 className="h-4 w-4" />
              Accept (⌘/Ctrl + Enter)
            </button>
            <button
              type="button"
              onClick={onComment}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              Add Comment
            </button>
            {isSupported && (
              <button
                type="button"
                onClick={() => (isListening ? stop() : start())}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-slate-500 transition',
                  isListening
                    ? 'border-rose-400 bg-rose-500/10 text-rose-500'
                    : 'border-slate-200 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200'
                )}
              >
                {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                Dictate
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-200">QA Checks</h3>
          <ul className="space-y-2 text-sm">
            {qaResult?.checks.map(check => (
              <li key={check.id} className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                <span>{check.label}</span>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
                    check.status === 'pass' && 'bg-emerald-100 text-emerald-600',
                    check.status === 'warn' && 'bg-amber-100 text-amber-700',
                    check.status === 'fail' && 'bg-rose-100 text-rose-600'
                  )}
                >
                  {check.status}
                </span>
              </li>
            )) || <li className="text-slate-400">No QA checks available</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-200">Inline Diff</h3>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed dark:bg-slate-800">
            {diff.length === 0 ? (
              <span className="text-slate-400">No changes yet</span>
            ) : (
              diff.map((token, index) => (
                <span
                  key={`${token.type}-${index}-${token.value}`}
                  className={clsx(
                    token.type === 'added' && 'bg-emerald-100 text-emerald-700',
                    token.type === 'removed' && 'bg-rose-100 text-rose-700 line-through',
                    token.type === 'unchanged' && 'text-slate-600 dark:text-slate-200'
                  )}
                >
                  {token.value}{' '}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FocusView
