'use client'

import { FormEvent, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { ParallelSegment } from '../types/parallel'

export interface CommentEntry {
  id: string
  author: string
  body: string
  createdAt: string
}

interface CommentDrawerProps {
  open: boolean
  onClose: () => void
  segment?: ParallelSegment | null
  comments: CommentEntry[]
  onSubmit: (comment: string) => void
}

function renderMarkdown(markdown: string): string {
  return markdown
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />')
}

export function CommentDrawer({ open, onClose, segment, comments, onSubmit }: CommentDrawerProps) {
  const [draft, setDraft] = useState('')

  const preview = useMemo(() => renderMarkdown(draft), [draft])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    onSubmit(draft.trim())
    setDraft('')
  }

  return (
    <div
      className={clsx(
        'fixed inset-y-0 right-0 z-50 w-full max-w-md transform border-l border-slate-200 bg-white shadow-xl transition dark:border-slate-700 dark:bg-slate-900',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Comments</div>
          {segment ? (
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{segment.rowId} · #{segment.segIndex}</h3>
          ) : (
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">No segment selected</h3>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
        >
          Close
        </button>
      </header>

      <div className="flex h-[calc(100%-4rem)] flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {comments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
              No comments yet. Capture reviewer notes, glossaries, or blockers.
            </div>
          ) : (
            <ul className="space-y-4">
              {comments.map(comment => (
                <li key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>{comment.author}</span>
                    <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-600 dark:prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Markdown supported. Use **bold**, *italic*, `code`."
            className="mb-3 min-h-[120px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm leading-relaxed shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800"
          />
          {draft && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Preview</div>
              <div dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{draft.length} characters</span>
            <button
              type="submit"
              className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-600"
            >
              Add Comment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CommentDrawer

