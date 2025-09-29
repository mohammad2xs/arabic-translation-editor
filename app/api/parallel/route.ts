import { NextResponse } from 'next/server'
import {
  loadParallelDataset,
  mergeSegments,
  splitSegment,
  updateSegmentStatusAction,
  updateSegmentText
} from '../../../lib/data/parallel'
import type {
  MergeSegmentsPayload,
  SplitSegmentPayload
} from '../../../lib/data/parallel'

export async function GET() {
  const dataset = await loadParallelDataset()
  return NextResponse.json(dataset)
}

type ParallelAction =
  | { action: 'merge'; payload: MergeSegmentsPayload }
  | { action: 'split'; payload: SplitSegmentPayload }
  | {
      action: 'status'
      payload: { rowId: string; segmentId: string; status: 'aligned' | 'needs_review' | 'missing_src' | 'missing_tgt' }
    }
  | { action: 'updateText'; payload: { rowId: string; segmentId: string; tgt: string } }

export async function POST(request: Request) {
  const body = (await request.json()) as ParallelAction

  switch (body.action) {
    case 'merge': {
      const dataset = await mergeSegments(body.payload)
      return NextResponse.json(dataset)
    }
    case 'split': {
      const dataset = await splitSegment(body.payload)
      return NextResponse.json(dataset)
    }
    case 'status': {
      const dataset = await updateSegmentStatusAction(
        body.payload.rowId,
        body.payload.segmentId,
        body.payload.status
      )
      return NextResponse.json(dataset)
    }
    case 'updateText': {
      const dataset = await updateSegmentText(body.payload.rowId, body.payload.segmentId, body.payload.tgt)
      return NextResponse.json(dataset)
    }
    default:
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }
}

