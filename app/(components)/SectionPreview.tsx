'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'

interface SectionData {
  id: string
  arabic_original: string
  arabic_enhanced: string
  english: string
  metadata?: {
    section?: string
    verse?: string
    page?: number
  }
}

interface SectionPreviewProps {
  isOpen: boolean
  onClose: () => void
  sectionData: SectionData[]
  currentRowId?: string
  sectionTitle: string
  className?: string
}

export default function SectionPreview({
  isOpen,
  onClose,
  sectionData,
  currentRowId,
  sectionTitle,
  className = ''
}: SectionPreviewProps) {
  const [activeTab, setActiveTab] = useState<'english' | 'arabic_enhanced' | 'arabic_original'>('english')
  const [fullHeight, setFullHeight] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentRowRef = useRef<HTMLDivElement>(null)

  // Scroll to current row when preview opens
  useEffect(() => {
    if (isOpen && currentRowId && currentRowRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        currentRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }, 100)
    }
  }, [isOpen, currentRowId])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const tabs = [
    { id: 'english', label: 'English Translation', dir: 'ltr' },
    { id: 'arabic_enhanced', label: 'Enhanced Arabic', dir: 'rtl' },
    { id: 'arabic_original', label: 'Original Arabic', dir: 'rtl' }
  ] as const

  const currentTab = tabs.find(tab => tab.id === activeTab)

  const renderText = (row: SectionData) => {
    const text = row[activeTab]
    const isCurrentRow = row.id === currentRowId

    return (
      <div
        key={row.id}
        ref={isCurrentRow ? currentRowRef : undefined}
        className={`
          relative p-6 rounded-lg transition-all duration-200
          ${isCurrentRow
            ? 'bg-blue-50 border-2 border-blue-200 shadow-md'
            : 'hover:bg-gray-50'
          }
        `}
      >
        {/* Row metadata */}
        {row.metadata && (
          <div className="text-xs text-gray-500 mb-2 font-mono">
            {row.metadata.section && `Section: ${row.metadata.section}`}
            {row.metadata.verse && ` • Verse: ${row.metadata.verse}`}
            {row.metadata.page && ` • Page: ${row.metadata.page}`}
          </div>
        )}

        {/* Text content */}
        <div
          className={`
            text-lg leading-relaxed
            ${currentTab?.dir === 'rtl'
              ? 'text-right font-arabic text-xl'
              : 'text-left'
            }
            ${isCurrentRow ? 'font-medium' : ''}
          `}
          dir={currentTab?.dir}
          style={{
            fontFamily: currentTab?.dir === 'rtl'
              ? 'Amiri, "Scheherazade New", "Arabic Typesetting", serif'
              : 'Georgia, "Times New Roman", serif'
          }}
        >
          {text || (
            <span className="text-gray-400 italic">
              {activeTab === 'english' ? 'No English translation yet' : 'No Arabic text'}
            </span>
          )}
        </div>

        {/* Current row indicator */}
        {isCurrentRow && (
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
            <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`section-preview ${className}`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`
        fixed z-50 bg-white rounded-t-2xl shadow-2xl
        transition-all duration-300 ease-out
        ${fullHeight
          ? 'inset-0 rounded-none'
          : 'inset-x-4 bottom-4 top-16 md:inset-x-8 md:top-24'
        }
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {sectionTitle}
            </h2>
            <p className="text-sm text-gray-600">
              {sectionData.length} rows • Typeset Preview
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullHeight(!fullHeight)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title={fullHeight ? 'Exit full height' : 'Open in full height'}
            >
              <ExternalLink className="w-5 h-5" />
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-shrink-0 px-6 py-3 text-sm font-medium transition-all duration-200
                  min-h-[44px] flex items-center gap-2
                  ${activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }
                `}
              >
                <span>{tab.label}</span>
                {tab.dir === 'rtl' && (
                  <span className="text-xs text-gray-400">RTL</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-white"
          style={{
            maxHeight: fullHeight ? 'calc(100vh - 140px)' : 'calc(100vh - 200px)'
          }}
        >
          <div className="max-w-4xl mx-auto space-y-4">
            {sectionData.map(renderText)}
          </div>

          {/* Bottom spacing */}
          <div className="h-16" />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {sectionData.length} rows
            {currentRowId && (
              <span className="ml-2 text-blue-600">
                • Current: {currentRowId}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook for managing section preview state
export function useSectionPreview() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<SectionData[]>([])
  const [currentRowId, setCurrentRowId] = useState<string>()
  const [sectionTitle, setSectionTitle] = useState('')

  const openPreview = (data: SectionData[], rowId?: string, title: string = 'Section Preview') => {
    setPreviewData(data)
    setCurrentRowId(rowId)
    setSectionTitle(title)
    setIsPreviewOpen(true)
  }

  const closePreview = () => {
    setIsPreviewOpen(false)
  }

  return {
    isPreviewOpen,
    previewData,
    currentRowId,
    sectionTitle,
    openPreview,
    closePreview
  }
}
