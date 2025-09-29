// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { JsonStore } from '@/lib/storage/index'

interface PushRequest {
  section: string
  row_id: string
  changes: Record<string, any>
  origin?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: PushRequest = await request.json()
    const { section, row_id, changes, origin = 'user' } = body

    // Validate required fields
    if (!section || !row_id || !changes) {
      return NextResponse.json(
        { error: 'Missing required fields: section, row_id, changes' },
        { status: 400 }
      )
    }

    // Get current revision and increment it
    const newRev = await incrementRevision()

    // Create stream entry
    const streamEntry = {
      rev: newRev,
      section,
      row_id,
      changes,
      origin,
      timestamp: new Date().toISOString()
    }

    // Append to stream
    await appendToStream(streamEntry)

    // Also update the main triview.json file if needed
    await updateTriviewData(section, row_id, changes)

    return NextResponse.json({
      success: true,
      rev: newRev,
      timestamp: streamEntry.timestamp
    })
  } catch (error) {
    console.error('Sync push error:', error)
    return NextResponse.json(
      { error: 'Failed to push sync data' },
      { status: 500 }
    )
  }
}

async function incrementRevision(): Promise<number> {
  try {
    // Try to use KV storage first
    const currentState = await JsonStore.get<{ revision: number }>('sync:state') || { revision: 0 }

    // Increment revision
    const newRevision = (currentState.revision || 0) + 1
    currentState.revision = newRevision

    // Save back to KV
    await JsonStore.set('sync:state', currentState)

    // Fallback: also update filesystem for backward compatibility
    const stateFile = path.join(process.cwd(), 'outputs/tmp/sync/state.json')
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true })
      fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2))
    } catch (fsError) {
      console.warn('Failed to write state to filesystem (KV succeeded):', fsError)
    }

    return newRevision
  } catch (error) {
    console.error('Error incrementing revision:', error)

    // Fallback to filesystem if KV fails
    const stateFile = path.join(process.cwd(), 'outputs/tmp/sync/state.json')
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })

    let currentState = { revision: 0 }
    if (fs.existsSync(stateFile)) {
      currentState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    }

    const newRevision = (currentState.revision || 0) + 1
    currentState.revision = newRevision
    fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2))

    return newRevision
  }
}

async function appendToStream(entry: any): Promise<void> {
  try {
    // Use KV for stream storage
    const currentStream = await JsonStore.get<any[]>('sync:stream') || []

    // Append new entry
    currentStream.push(entry)

    // Trim to last 1000 entries
    const trimmedStream = currentStream.slice(-1000)

    // Save back to KV
    await JsonStore.set('sync:stream', trimmedStream)

    // Fallback: also write to filesystem for backward compatibility
    const streamFile = path.join(process.cwd(), 'outputs/tmp/sync/stream.ndjson')
    try {
      fs.mkdirSync(path.dirname(streamFile), { recursive: true })
      const line = JSON.stringify(entry) + '\n'
      fs.appendFileSync(streamFile, line)
      // Keep filesystem file trimmed too
      const data = fs.readFileSync(streamFile, 'utf-8')
      const lines = data.trim().split('\n').filter(line => line.trim())
      if (lines.length > 1000) {
        const keepLines = lines.slice(-1000)
        fs.writeFileSync(streamFile, keepLines.join('\n') + '\n')
      }
    } catch (fsError) {
      console.warn('Failed to write stream to filesystem (KV succeeded):', fsError)
    }
  } catch (error) {
    console.error('Error appending to stream (KV failed, trying filesystem):', error)

    // Fallback to filesystem if KV fails
    const streamFile = path.join(process.cwd(), 'outputs/tmp/sync/stream.ndjson')
    fs.mkdirSync(path.dirname(streamFile), { recursive: true })
    const line = JSON.stringify(entry) + '\n'
    fs.appendFileSync(streamFile, line)

    // Keep stream file manageable
    try {
      const data = fs.readFileSync(streamFile, 'utf-8')
      const lines = data.trim().split('\n').filter(line => line.trim())
      if (lines.length > 1000) {
        const keepLines = lines.slice(-1000)
        fs.writeFileSync(streamFile, keepLines.join('\n') + '\n')
      }
    } catch (truncateError) {
      console.warn('Error truncating stream file:', truncateError)
    }
  }
}

// Note: truncateOldEntries is now handled inline in appendToStream
// This function is kept for backward compatibility but is no longer used
async function truncateOldEntries(streamFile: string): Promise<void> {
  try {
    if (!fs.existsSync(streamFile)) return

    const data = fs.readFileSync(streamFile, 'utf-8')
    const lines = data.trim().split('\n').filter(line => line.trim())

    // Keep only the last 1000 entries
    if (lines.length > 1000) {
      const keepLines = lines.slice(-1000)
      fs.writeFileSync(streamFile, keepLines.join('\n') + '\n')
    }
  } catch (error) {
    console.warn('Error truncating stream file:', error)
  }
}

// Legacy wrapper function for compatibility
export async function pushChange(section: string, rowId: string, changes: Record<string, any>): Promise<void> {
  return updateTriviewData(section, rowId, changes);
}

async function updateTriviewData(section: string, rowId: string, changes: Record<string, any>): Promise<void> {
  try {
    const triviewFile = path.join(process.cwd(), 'outputs/triview.json')

    if (!fs.existsSync(triviewFile)) {
      console.warn('triview.json not found, skipping update')
      return
    }

    const data = JSON.parse(fs.readFileSync(triviewFile, 'utf-8'))

    // Handle flat schema with rows array
    if (Array.isArray(data.rows)) {
      const i = data.rows.findIndex((r: any) => r.id === rowId)
      if (i !== -1) {
        Object.assign(data.rows[i], changes)
        data.rows[i].metadata = { ...(data.rows[i].metadata || {}), updated_at: new Date().toISOString() }
        fs.writeFileSync(triviewFile, JSON.stringify(data, null, 2))
      }
    }
    // Fallback: support legacy nested sections structure if it exists
    else if (data.sections && data.sections[section] && data.sections[section].rows) {
      const rows = data.sections[section].rows
      const rowIndex = rows.findIndex((row: any) => row.id === rowId)

      if (rowIndex !== -1) {
        Object.assign(rows[rowIndex], changes)
        rows[rowIndex].updated_at = new Date().toISOString()
        fs.writeFileSync(triviewFile, JSON.stringify(data, null, 2))
      }
    }
  } catch (error) {
    console.warn('Error updating triview data:', error)
    // Don't throw here, as sync stream is more important
  }
}