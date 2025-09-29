import { AlignmentStatus } from '../lib/align'
import { SupportedLanguage } from '../lib/lang'

export interface FileReference {
  path: string
  rowId?: string
  span?: [number, number]
}

export interface ParallelSegment {
  id: string
  rowId: string
  paraIndex: number
  segIndex: number
  src: string
  tgt: string
  srcLang: SupportedLanguage
  tgtLang: SupportedLanguage
  status: AlignmentStatus
  lengthRatio: number
  fileRefs: FileReference[]
}

export interface ParallelRow {
  rowId: string
  paraIndex: number
  segments: ParallelSegment[]
  srcText: string
  tgtText: string
  statuses: AlignmentStatus[]
  lengthRatio: number
}

export interface ParallelManifest {
  coveragePct: number
  sourcesFound: number
  targetsFound: number
  pairCount: number
  reasonsForMiss: Record<string, number>
  updatedAt: string
  usedMap: boolean
  summary?: {
    mapPairs: number
    folderPairs: number
    autoPairs: number
    singleFileEntries: number
  }
}

export interface ParallelDataset {
  manifest: ParallelManifest
  segments: ParallelSegment[]
  rows: ParallelRow[]
}
