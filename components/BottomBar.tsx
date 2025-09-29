'use client'

import clsx from 'clsx'
import { Check, Flag, MessageSquarePlus, RotateCcw, RotateCw, Pencil } from 'lucide-react'

interface BottomBarProps {
  visible: boolean
  onEdit: () => void
  onAccept: () => void
  onFlag: () => void
  onComment: () => void
  onUndo: () => void
  onRedo: () => void
}

export function BottomBar({ visible, onEdit, onAccept, onFlag, onComment, onUndo, onRedo }: BottomBarProps) {
  return (
    <div
      className={clsx(
        'pointer-events-none fixed inset-x-0 bottom-6 flex justify-center transition-opacity',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          <Check className="h-4 w-4" /> Accept
        </button>
        <button
          type="button"
          onClick={onFlag}
          className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-200"
        >
          <Flag className="h-4 w-4" /> Flag
        </button>
        <button
          type="button"
          onClick={onComment}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
        >
          <MessageSquarePlus className="h-4 w-4" /> Comment
        </button>
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
        >
          <RotateCcw className="h-4 w-4" /> Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
        >
          <RotateCw className="h-4 w-4" /> Redo
        </button>
      </div>
    </div>
  )
}

export default BottomBar

