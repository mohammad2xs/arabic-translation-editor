'use client'

import { useState, useEffect } from 'react'
import { getViewMode, setViewMode, getContextSize, setContextSize } from '@/lib/dadmode/prefs'

export type ViewMode = 'focus' | 'context' | 'all' | 'preview'

interface ContextSwitcherProps {
  currentMode: ViewMode
  onModeChange: (mode: ViewMode) => void
  contextSize: number
  onContextSizeChange: (size: number) => void
  className?: string
}

const contextSizes = [3, 5, 10, 20]

export default function ContextSwitcher({
  currentMode,
  onModeChange,
  contextSize,
  onContextSizeChange,
  className = ''
}: ContextSwitcherProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleModeChange = (mode: ViewMode) => {
    onModeChange(mode)
    if (mounted) {
      setViewMode(mode)
    }
  }

  const handleContextSizeChange = (size: number) => {
    onContextSizeChange(size)
    if (mounted) {
      setContextSize(size)
    }
  }

  const modes = [
    { id: 'focus', label: 'Focus Row', icon: '🎯' },
    { id: 'context', label: `±${contextSize} Rows`, icon: '📋' },
    { id: 'all', label: 'All Rows', icon: '📚' },
    { id: 'preview', label: 'Preview', icon: '👁️' }
  ] as const

  return (
    <div className={`context-switcher ${className}`}>
      {/* Mode Switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              min-h-[44px] min-w-[90px] justify-center
              ${currentMode === mode.id
                ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }
            `}
          >
            <span className="text-base">{mode.icon}</span>
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Context Size Selector (only show when in context mode) */}
      {currentMode === 'context' && (
        <div className="flex items-center gap-3 ml-4">
          <span className="text-sm text-gray-600 font-medium">Rows:</span>
          <div className="flex bg-gray-50 rounded-lg p-1 gap-1">
            {contextSizes.map((size) => (
              <button
                key={size}
                onClick={() => handleContextSizeChange(size)}
                className={`
                  px-3 py-1 rounded-md text-sm font-medium transition-all duration-150
                  min-h-[36px] min-w-[36px]
                  ${contextSize === size
                    ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }
                `}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Hook for using context switcher state
export function useContextSwitcher() {
  const [currentMode, setCurrentMode] = useState<ViewMode>('focus')
  const [contextSize, setCurrentContextSize] = useState(5)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedMode = getViewMode()
    const savedSize = getContextSize()

    setCurrentMode(savedMode)
    setCurrentContextSize(savedSize)
  }, [])

  const handleModeChange = (mode: ViewMode) => {
    setCurrentMode(mode)
    if (mounted) {
      setViewMode(mode)
    }
  }

  const handleContextSizeChange = (size: number) => {
    setCurrentContextSize(size)
    if (mounted) {
      setContextSize(size)
    }
  }

  return {
    currentMode,
    contextSize,
    onModeChange: handleModeChange,
    onContextSizeChange: handleContextSizeChange,
    mounted
  }
}