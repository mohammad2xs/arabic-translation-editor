'use client'

import clsx from 'clsx'

export type ReviewerMode = 'reader' | 'compare' | 'focus'

interface ModeSwitchProps {
  mode: ReviewerMode
  onModeChange: (mode: ReviewerMode) => void
}

const MODES: Array<{ id: ReviewerMode; label: string; description: string }> = [
  { id: 'reader', label: 'Reader', description: 'Target-only, presentation ready' },
  { id: 'compare', label: 'Compare', description: 'Source ↔ Target alignment' },
  { id: 'focus', label: 'Focus', description: 'One segment with QA actions' }
]

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {MODES.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onModeChange(option.id)}
          className={clsx(
            'relative flex flex-col rounded-lg px-4 py-2 text-left transition',
            mode === option.id
              ? 'bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          <span className="text-sm font-semibold leading-tight">{option.label}</span>
          <span className="text-[11px] leading-tight text-slate-400 dark:text-slate-300">
            {option.description}
          </span>
        </button>
      ))}
    </div>
  )
}

export default ModeSwitch

