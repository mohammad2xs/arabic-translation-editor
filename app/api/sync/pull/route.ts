import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

interface SyncDelta {
  rev: number
  changedRows: Array<{
    row_id: string
    en?: string
    arEnhanced?: string
    timestamp: string
    origin: string
  }>
  presence: Array<{
    userLabel: string
    section: string
    row_id: string
    timestamp: string
    active: boolean
  }>
}

export async function GET(request: NextRequest) {
  try {
    const section = request.nextUrl.searchParams.get('section') || 'S001'
    const since = parseInt(request.nextUrl.searchParams.get('since') || '0')

    // Read current state
    const stateFile = path.join(process.cwd(), 'outputs/tmp/sync/state.json')
    const currentRev = await getCurrentRevision(stateFile)

    // Get changed rows since the requested revision
    const changedRows = await getChangedRowsSince(section, since)

    // Get current presence data
    const presence = await getPresenceData(section)

    const delta: SyncDelta = {
      rev: currentRev,
      changedRows,
      presence
    }

    return NextResponse.json(delta)
  } catch (error) {
    console.error('Sync pull error:', error)
    return NextResponse.json(
      { error: 'Failed to pull sync data' },
      { status: 500 }
    )
  }
}

async function getCurrentRevision(stateFile: string): Promise<number> {
  try {
    if (!fs.existsSync(stateFile)) {
      // Initialize state file if it doesn't exist
      const initialState = { revision: 0 }
      fs.mkdirSync(path.dirname(stateFile), { recursive: true })
      fs.writeFileSync(stateFile, JSON.stringify(initialState, null, 2))
      return 0
    }

    const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    return stateData.revision || 0
  } catch (error) {
    console.warn('Error reading state file:', error)
    return 0
  }
}

async function getChangedRowsSince(section: string, since: number): Promise<SyncDelta['changedRows']> {
  try {
    const streamFile = path.join(process.cwd(), 'outputs/tmp/sync/stream.ndjson')

    if (!fs.existsSync(streamFile)) {
      return []
    }

    const streamData = fs.readFileSync(streamFile, 'utf-8')
    const lines = streamData.trim().split('\n').filter(line => line.trim())

    const changes: SyncDelta['changedRows'] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)

        // Filter by section and revision
        if (entry.section === section && entry.rev > since) {
          const changeEntry: SyncDelta['changedRows'][0] = {
            row_id: entry.row_id,
            timestamp: entry.timestamp,
            origin: entry.origin || 'unknown'
          }

          // Extract specific fields from changes object
          if (entry.changes) {
            if (entry.changes.english !== undefined) {
              changeEntry.en = entry.changes.english
            }
            if (entry.changes.enhanced !== undefined) {
              changeEntry.arEnhanced = entry.changes.enhanced
            }
          }

          changes.push(changeEntry)
        }
      } catch (parseError) {
        console.warn('Error parsing stream line:', parseError)
      }
    }

    // Sort by timestamp
    changes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return changes
  } catch (error) {
    console.warn('Error reading stream file:', error)
    return []
  }
}

async function getPresenceData(section: string): Promise<SyncDelta['presence']> {
  try {
    const presenceFile = path.join(process.cwd(), 'outputs/tmp/presence.json')

    if (!fs.existsSync(presenceFile)) {
      return []
    }

    const presenceData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'))
    const now = new Date()
    const staleThreshold = 12000 // 12 seconds

    const activePresence: SyncDelta['presence'] = []

    for (const [key, entry] of Object.entries(presenceData)) {
      const presence = entry as any
      const lastSeen = new Date(presence.timestamp)
      const isActive = (now.getTime() - lastSeen.getTime()) < staleThreshold

      // Filter by section
      if (presence.section === section) {
        activePresence.push({
          userLabel: presence.userLabel,
          section: presence.section,
          row_id: presence.row_id,
          timestamp: presence.timestamp,
          active: isActive
        })
      }
    }

    // Clean up stale entries
    const cleanedPresence = Object.fromEntries(
      Object.entries(presenceData).filter(([key, entry]) => {
        const presence = entry as any
        const lastSeen = new Date(presence.timestamp)
        return (now.getTime() - lastSeen.getTime()) < staleThreshold
      })
    )

    // Write back cleaned presence
    if (Object.keys(cleanedPresence).length !== Object.keys(presenceData).length) {
      fs.writeFileSync(presenceFile, JSON.stringify(cleanedPresence, null, 2))
    }

    return activePresence
  } catch (error) {
    console.warn('Error reading presence file:', error)
    return []
  }
}