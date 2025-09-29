'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '../../components/Topbar'
import ReaderView from '../../components/ReaderView'
import CompareView from '../../components/CompareView'
import FocusView from '../../components/FocusView'
import BottomBar from '../../components/BottomBar'
import CommentDrawer, { CommentEntry } from '../../components/CommentDrawer'
import type { ReviewerMode } from '../../components/ModeSwitch'
import type { ParallelDataset, ParallelRow, ParallelSegment } from '../../types/parallel'
import { evaluateSegmentQA, summarizeQA } from '../../lib/qa'
import type { QAResult } from '../../lib/qa'
import { initializeDadMode, enableDadMode, disableDadMode, isDadModeEnabled } from '../../lib/dadmode/prefs'
import { AlignmentStatus } from '../../lib/align'

interface HistoryEntry {
  past: string[]
  future: string[]
}

const PRESENTATION_STORAGE_KEY = 'presentation-mode-enabled'

export default function ReviewPage() {
  const [dataset, setDataset] = useState<ParallelDataset | null>(null)
  const [mode, setMode] = useState<ReviewerMode>('reader')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dadMode, setDadMode] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [commentSegmentId, setCommentSegmentId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, CommentEntry[]>>({})
  const historyRef = useRef<Record<string, HistoryEntry>>({})

  const fetchDataset = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/parallel')
      if (!response.ok) {
        throw new Error(`Failed to load dataset (${response.status})`)
      }
      const payload = (await response.json()) as ParallelDataset
      setDataset(payload)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dataset')
      setLoading(false)
    }
  }, [])

  const mutateDataset = useCallback(async (body: unknown) => {
    try {
      const response = await fetch('/api/parallel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        throw new Error(`Failed to update dataset (${response.status})`)
      }
      const payload = (await response.json()) as ParallelDataset
      setDataset(payload)
      return payload
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed'
      setError(message)
      throw err
    }
  }, [])

  useEffect(() => {
    fetchDataset()
    initializeDadMode()
    setDadMode(isDadModeEnabled())
    if (typeof window !== 'undefined') {
      const savedPresentation = localStorage.getItem(PRESENTATION_STORAGE_KEY) === 'true'
      setPresentationMode(savedPresentation)
      document.documentElement.classList.toggle('presentation-mode', savedPresentation)
    }
  }, [fetchDataset])

  const qaBySegment: Record<string, QAResult> = useMemo(() => {
    if (!dataset) return {}
    const results: Record<string, QAResult> = {}
    dataset.segments.forEach(segment => {
      results[segment.id] = evaluateSegmentQA(segment)
    })
    return results
  }, [dataset?.segments])

  const qaOverview = useMemo(() => summarizeQA(Object.values(qaBySegment)), [qaBySegment])

  const rows = dataset?.rows ?? []
  const selectedSegment = useMemo(() => dataset?.segments.find(segment => segment.id === selectedSegmentId) ?? null, [dataset?.segments, selectedSegmentId])
  const focusedRow: ParallelRow | null = useMemo(() => {
    if (!selectedSegment) return null
    return rows.find(row => row.rowId === selectedSegment.rowId) ?? null
  }, [rows, selectedSegment])

  const handleSelectSegment = useCallback((segment: ParallelSegment) => {
    setSelectedSegmentId(segment.id)
    setSelectedRowId(segment.rowId)
    setMode('focus')
  }, [])

  const handleSelectRow = useCallback((rowId: string) => {
    setSelectedRowId(rowId)
  }, [])

  const pushHistory = useCallback((segment: ParallelSegment) => {
    const entry = historyRef.current[segment.id] ?? { past: [], future: [] }
    entry.past.push(segment.tgt)
    entry.future = []
    historyRef.current[segment.id] = entry
  }, [])

  const handleUpdateSegment = useCallback(
    async (rowId: string, segmentId: string, text: string) => {
      try {
        const segment = dataset?.segments.find(item => item.id === segmentId)
        if (segment) {
          pushHistory(segment)
        }
        const payload = await mutateDataset({ action: 'updateText', payload: { rowId, segmentId, tgt: text } })
        const updatedSegment = payload.segments.find(item => item.id === segmentId)
        if (updatedSegment) {
          setSelectedSegmentId(updatedSegment.id)
          setSelectedRowId(updatedSegment.rowId)
        }
      } catch (err) {
        console.error(err)
      }
    },
    [dataset?.segments, mutateDataset, pushHistory]
  )

  const handleStatusChange = useCallback(
    async (rowId: string, segmentId: string, status: AlignmentStatus) => {
      try {
        await mutateDataset({ action: 'status', payload: { rowId, segmentId, status } })
      } catch (err) {
        console.error(err)
      }
    },
    [mutateDataset]
  )

  const handleMerge = useCallback(
    async (rowId: string, segmentIds: string[]) => {
      try {
        const payload = await mutateDataset({ action: 'merge', payload: { rowId, segmentIds } })
        const startIndex = Math.min(...segmentIds.map(id => Number(id.split('#')[1] ?? 0)))
        const updated = payload.segments.find(segment => segment.rowId === rowId && segment.segIndex === startIndex)
        if (updated) {
          setSelectedSegmentId(updated.id)
          setSelectedRowId(updated.rowId)
        }
      } catch (err) {
        console.error(err)
      }
    },
    [mutateDataset]
  )

  const handleSplit = useCallback(
    async (rowId: string, segment: ParallelSegment, parts: { src: string; tgt: string }[]) => {
      try {
        const payload = await mutateDataset({
          action: 'split',
          payload: { rowId, segIndex: segment.segIndex, parts }
        })
        const updatedRowSegments = payload.segments
          .filter(item => item.rowId === rowId)
          .sort((a, b) => a.segIndex - b.segIndex)
        const nextSelection = updatedRowSegments.find(item => item.segIndex === segment.segIndex) ?? updatedRowSegments[0]
        if (nextSelection) {
          setSelectedSegmentId(nextSelection.id)
          setSelectedRowId(nextSelection.rowId)
        }
      } catch (err) {
        console.error(err)
      }
    },
    [mutateDataset]
  )

  const handleUndo = useCallback(async () => {
    if (!selectedSegmentId || !dataset) return
    const segment = dataset.segments.find(item => item.id === selectedSegmentId)
    if (!segment) return
    const entry = historyRef.current[segment.id]
    if (!entry || entry.past.length === 0) return
    const previous = entry.past.pop() as string
    entry.future.push(segment.tgt)
    await handleUpdateSegment(segment.rowId, segment.id, previous)
  }, [dataset, handleUpdateSegment, selectedSegmentId])

  const handleRedo = useCallback(async () => {
    if (!selectedSegmentId || !dataset) return
    const segment = dataset.segments.find(item => item.id === selectedSegmentId)
    if (!segment) return
    const entry = historyRef.current[segment.id]
    if (!entry || entry.future.length === 0) return
    const next = entry.future.pop() as string
    entry.past.push(segment.tgt)
    await handleUpdateSegment(segment.rowId, segment.id, next)
  }, [dataset, handleUpdateSegment, selectedSegmentId])

  const handleDadToggle = useCallback(
    (enabled: boolean) => {
      setDadMode(enabled)
      if (enabled) {
        enableDadMode()
      } else {
        disableDadMode()
      }
    },
    []
  )

  const handlePresentationToggle = useCallback((enabled: boolean) => {
    setPresentationMode(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRESENTATION_STORAGE_KEY, enabled ? 'true' : 'false')
      document.documentElement.classList.toggle('presentation-mode', enabled)
    }
  }, [])

  const qaResultForSegment = selectedSegment ? qaBySegment[selectedSegment.id] : undefined

  const currentComments = commentSegmentId ? comments[commentSegmentId] ?? [] : []

  const handleAddComment = (body: string) => {
    if (!commentSegmentId) return
    setComments(prev => {
      const existing = prev[commentSegmentId] ?? []
      const updated: CommentEntry[] = [
        ...existing,
        {
          id: `${commentSegmentId}-${existing.length + 1}`,
          author: 'Reviewer',
          body,
          createdAt: new Date().toISOString()
        }
      ]
      return { ...prev, [commentSegmentId]: updated }
    })
  }

  const handleCommentOpen = () => {
    if (!selectedSegmentId) return
    setCommentSegmentId(selectedSegmentId)
    setDrawerOpen(true)
  }

  const handleNavigate = (direction: 'previous' | 'next') => {
    if (!dataset || !selectedSegment) return
    const sorted = dataset.segments.slice().sort((a, b) => a.paraIndex - b.paraIndex || a.segIndex - b.segIndex)
    const index = sorted.findIndex(item => item.id === selectedSegment.id)
    if (index === -1) return
    const nextIndex = direction === 'previous' ? Math.max(0, index - 1) : Math.min(sorted.length - 1, index + 1)
    const target = sorted[nextIndex]
    if (!target) return
    setSelectedSegmentId(target.id)
    setSelectedRowId(target.rowId)
    if (mode !== 'focus') setMode('focus')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
        Loading reviewer workspace…
      </div>
    )
  }

  if (error || !dataset) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-center dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Unable to load reviewer UI</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={fetchDataset}
          className="mt-4 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Topbar
        mode={mode}
        onModeChange={setMode}
        dadMode={dadMode}
        onDadModeToggle={handleDadToggle}
        presentationMode={presentationMode}
        onPresentationToggle={handlePresentationToggle}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        qaOverview={qaOverview}
        onExport={format => {
          window.open(`/api/export?format=${format}`, '_blank')
        }}
        onOpenComments={handleCommentOpen}
        showCommentsIndicator={selectedSegmentId ? (comments[selectedSegmentId]?.length ?? 0) > 0 : false}
      />

      <main className="presentation-content mx-auto max-w-6xl px-6 py-8">
        {mode === 'reader' && (
          <ReaderView
            rows={rows}
            onSelectRow={handleSelectRow}
            searchQuery={searchQuery}
            {...(selectedRowId ? { selectedRowId } : {})}
          />
        )}
        {mode === 'compare' && (
          <CompareView
            rows={rows}
            qaBySegment={qaBySegment}
            {...(selectedSegmentId ? { selectedSegmentId } : {})}
            onSelectSegment={handleSelectSegment}
            onMergeSegments={handleMerge}
            onSplitSegment={handleSplit}
            onUpdateSegment={(rowId, segmentId, text) => handleUpdateSegment(rowId, segmentId, text)}
          />
        )}
        {mode === 'focus' && (
          <FocusView
            row={focusedRow}
            segment={selectedSegment}
            {...(qaResultForSegment ? { qaResult: qaResultForSegment } : {})}
            onNavigate={handleNavigate}
            onUpdateSegment={handleUpdateSegment}
            onStatusChange={handleStatusChange}
            onComment={handleCommentOpen}
          />
        )}
      </main>

      <BottomBar
        visible={Boolean(selectedSegment)}
        onEdit={() => setMode('focus')}
        onAccept={() => {
          if (!selectedSegment) return
          handleStatusChange(selectedSegment.rowId, selectedSegment.id, 'aligned')
        }}
        onFlag={() => {
          if (!selectedSegment) return
          handleStatusChange(selectedSegment.rowId, selectedSegment.id, 'needs_review')
        }}
        onComment={handleCommentOpen}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <CommentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        segment={selectedSegment}
        comments={currentComments}
        onSubmit={handleAddComment}
      />
    </div>
  )
}
