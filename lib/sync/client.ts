// @ts-nocheck
'use client'

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

interface SyncState {
  currentRev: number
  lastSync: Date
  isConnected: boolean
  isPolling: boolean
}

interface SyncOptions {
  section: string
  token?: string
  onDelta?: (delta: SyncDelta) => void
  onPresenceUpdate?: (presence: SyncDelta['presence']) => void
  onConnectionChange?: (connected: boolean) => void
  pollInterval?: number
  heartbeatInterval?: number
}

export class SyncClient {
  private state: SyncState = {
    currentRev: 0,
    lastSync: new Date(),
    isConnected: false,
    isPolling: false
  }

  private options: Required<SyncOptions>
  private pollTimer?: NodeJS.Timeout
  private heartbeatTimer?: NodeJS.Timeout
  private abortController?: AbortController

  constructor(options: SyncOptions) {
    this.options = {
      pollInterval: 1500,
      heartbeatInterval: 6000,
      onDelta: () => {},
      onPresenceUpdate: () => {},
      onConnectionChange: () => {},
      ...options
    }
  }

  async start() {
    if (this.state.isPolling) return

    this.state.isPolling = true
    this.abortController = new AbortController()

    // Initial sync
    await this.syncOnce()

    // Start polling
    this.pollTimer = setInterval(() => {
      this.syncOnce()
    }, this.options.pollInterval)

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, this.options.heartbeatInterval)

    console.log(`🔄 Sync client started for section ${this.options.section}`)
  }

  stop() {
    if (!this.state.isPolling) return

    this.state.isPolling = false

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = undefined
    }

    this.setConnectionState(false)
    console.log('⏹️ Sync client stopped')
  }

  private async syncOnce() {
    try {
      const response = await fetch(
        `/api/sync/pull?section=${this.options.section}&since=${this.state.currentRev}`,
        {
          signal: this.abortController?.signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`)
      }

      const delta: SyncDelta = await response.json()

      // Update state
      if (delta.rev > this.state.currentRev) {
        this.state.currentRev = delta.rev
        this.state.lastSync = new Date()

        // Notify about changes
        if (delta.changedRows.length > 0) {
          this.options.onDelta(delta)
        }
      }

      // Update presence
      this.options.onPresenceUpdate(delta.presence)

      this.setConnectionState(true)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return // Ignore aborted requests
      }

      console.warn('Sync error:', error)
      this.setConnectionState(false)
    }
  }

  async pushChange(rowId: string, changes: Record<string, any>, origin: string = 'user') {
    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          section: this.options.section,
          row_id: rowId,
          changes,
          origin
        })
      })

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status}`)
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error('Push error:', error)
      throw error
    }
  }

  private async sendHeartbeat(rowId?: string) {
    try {
      await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          section: this.options.section,
          row_id: rowId,
          userLabel: this.getUserLabel(),
          timestamp: new Date().toISOString(),
          token: this.options.token
        })
      })
    } catch (error) {
      console.warn('Heartbeat error:', error)
    }
  }

  private getUserLabel(): string {
    // Try to get user label from localStorage or generate one
    const stored = localStorage.getItem('sync_user_label')
    if (stored) return stored

    const label = `User-${Math.random().toString(36).substr(2, 6)}`
    localStorage.setItem('sync_user_label', label)
    return label
  }

  private setConnectionState(connected: boolean) {
    if (this.state.isConnected !== connected) {
      this.state.isConnected = connected
      this.options.onConnectionChange(connected)
    }
  }

  // Public getters
  get isConnected() {
    return this.state.isConnected
  }

  get currentRev() {
    return this.state.currentRev
  }

  get lastSync() {
    return this.state.lastSync
  }

  // Update current row for heartbeat
  setCurrentRow(rowId: string) {
    this.sendHeartbeat(rowId)
  }
}

// React hook for using sync client
export function useSyncClient(options: SyncOptions) {
  const clientRef = React.useRef<SyncClient>()
  const [isConnected, setIsConnected] = React.useState(false)
  const [lastSync, setLastSync] = React.useState<Date>()
  const [presence, setPresence] = React.useState<SyncDelta['presence']>([])

  React.useEffect(() => {
    const client = new SyncClient({
      ...options,
      onConnectionChange: (connected) => {
        setIsConnected(connected)
        options.onConnectionChange?.(connected)
      },
      onPresenceUpdate: (presenceData) => {
        setPresence(presenceData)
        options.onPresenceUpdate?.(presenceData)
      },
      onDelta: (delta) => {
        setLastSync(new Date())
        options.onDelta?.(delta)
      }
    })

    clientRef.current = client
    client.start()

    return () => {
      client.stop()
    }
  }, [options.section])

  const pushChange = React.useCallback(
    async (rowId: string, changes: Record<string, any>, origin?: string) => {
      if (!clientRef.current) return
      return clientRef.current.pushChange(rowId, changes, origin)
    },
    []
  )

  const setCurrentRow = React.useCallback(
    (rowId: string) => {
      if (!clientRef.current) return
      clientRef.current.setCurrentRow(rowId)
    },
    []
  )

  return {
    isConnected,
    lastSync,
    presence,
    pushChange,
    setCurrentRow,
    client: clientRef.current
  }
}

// For Next.js - ensure React is available
const React = require('react')