// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { validateToken } from '@/lib/share/production-storage'

interface HeartbeatRequest {
  token?: string
  section: string
  row_id?: string
  userLabel?: string
  timestamp?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: HeartbeatRequest = await request.json()
    const { token, section, row_id, userLabel: providedUserLabel } = body

    // Validate required fields
    if (!section) {
      return NextResponse.json(
        { error: 'Missing required field: section' },
        { status: 400 }
      )
    }

    let userLabel = providedUserLabel || 'Anonymous'

    // If token is provided, validate it and check if it's Dad's reviewer share
    if (token) {
      const tokenValidation = await validateToken(token)
      if (tokenValidation.valid && tokenValidation.role === 'reviewer') {
        userLabel = 'Dad'
      }
    }

    const timestamp = new Date().toISOString()

    // Update presence data
    await updatePresence(section, row_id, userLabel, timestamp)

    return NextResponse.json({
      success: true,
      timestamp
    })
  } catch (error) {
    console.error('Presence heartbeat error:', error)
    return NextResponse.json(
      { error: 'Failed to update presence' },
      { status: 500 }
    )
  }
}

async function updatePresence(
  section: string,
  rowId: string | undefined,
  userLabel: string,
  timestamp: string
): Promise<void> {
  const presenceFile = path.join(process.cwd(), 'outputs/tmp/presence.json')

  try {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(presenceFile), { recursive: true })

    // Read existing presence data
    let presenceData: Record<string, any> = {}
    if (fs.existsSync(presenceFile)) {
      try {
        presenceData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'))
      } catch (parseError) {
        console.warn('Error parsing presence file, starting fresh:', parseError)
        presenceData = {}
      }
    }

    // Create presence key (unique per user + section)
    const presenceKey = `${userLabel}:${section}`

    // Update or create presence entry
    presenceData[presenceKey] = {
      userLabel,
      section,
      row_id: rowId || null,
      timestamp,
      lastSeen: new Date().toISOString()
    }

    // Clean up stale entries (older than 12 seconds)
    const now = new Date()
    const staleThreshold = 12000 // 12 seconds for cleanup

    const cleanedPresence = Object.fromEntries(
      Object.entries(presenceData).filter(([key, entry]) => {
        const presence = entry as any
        const lastSeen = new Date(presence.lastSeen || presence.timestamp)
        return (now.getTime() - lastSeen.getTime()) < staleThreshold
      })
    )

    // Write back to file
    fs.writeFileSync(presenceFile, JSON.stringify(cleanedPresence, null, 2))

    // Log activity for debugging
    console.log(`👤 Heartbeat: ${userLabel} on ${section}${rowId ? `:${rowId}` : ''}`)
  } catch (error) {
    console.error('Error updating presence:', error)
    throw error
  }
}

// GET endpoint to retrieve current presence data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section')

    const presenceFile = path.join(process.cwd(), 'outputs/tmp/presence.json')

    if (!fs.existsSync(presenceFile)) {
      return NextResponse.json({ presence: [] })
    }

    const presenceData = JSON.parse(fs.readFileSync(presenceFile, 'utf-8'))
    const now = new Date()
    const activeThreshold = 12000 // 12 seconds

    const activePresence = Object.values(presenceData)
      .filter((entry: any) => {
        // Filter by section if specified
        if (section && entry.section !== section) {
          return false
        }

        // Check if entry is still active
        const lastSeen = new Date(entry.lastSeen || entry.timestamp)
        return (now.getTime() - lastSeen.getTime()) < activeThreshold
      })
      .map((entry: any) => ({
        userLabel: entry.userLabel,
        section: entry.section,
        row_id: entry.row_id,
        timestamp: entry.timestamp,
        active: true
      }))

    return NextResponse.json({ presence: activePresence })
  } catch (error) {
    console.error('Error getting presence:', error)
    return NextResponse.json(
      { error: 'Failed to get presence data' },
      { status: 500 }
    )
  }
}