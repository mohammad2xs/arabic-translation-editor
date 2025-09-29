'use client'

import clsx from 'clsx'
import type { QAOverview } from '../lib/qa'

interface QABadgeProps {
  overview: QAOverview | null
  onClick?: () => void
}

function getBadgeClasses(status: QAOverview['status']) {
  switch (status) {
    case 'pass':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'warn':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'fail':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

export function QABadge({ overview, onClick }: QABadgeProps) {
  const status = overview?.status ?? 'warn'
  const score = overview?.averageScore ?? 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2',
        getBadgeClasses(status)
      )}
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-current" />
      <span>QA {status.toUpperCase()}</span>
      <span className="font-semibold">{score}</span>
    </button>
  )
}

export default QABadge

