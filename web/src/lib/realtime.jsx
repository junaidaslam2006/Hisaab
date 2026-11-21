import { createContext, useContext, useEffect, useRef } from 'react'
import { api } from './api.js'

// One WebSocket per signed-in tab. Server pushes { type, data } for:
// 'ledger' (entries/customers changed), 'message' (activity item progress), 'tenant' (profile/WhatsApp status).

const RealtimeContext = createContext(null)

export function RealtimeProvider({ enabled, children }) {
  const listeners = useRef(new Set())

  useEffect(() => {
    if (!enabled) return
    let ws = null
    let closed = false
    let retry = 0
    let timer = null

    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      ws.onopen = () => {
        // After a reconnect, tell pages to refetch: we may have missed events.
        if (retry > 0) for (const fn of listeners.current) fn({ type: 'resync' })
        retry = 0
      }
      ws.onmessage = e => {
        let event
        try {
          event = JSON.parse(e.data)
        } catch {
          return
        }
        for (const fn of listeners.current) fn(event)
      }
      ws.onclose = e => {
        if (closed) return
        // Signed out elsewhere, or the shop re-linked WhatsApp: the app shell sends the user to /login.
        if (e.code === 4401) {
          window.dispatchEvent(new Event('hisaab:signedout'))
          return
        }
        retry++
        // A refused upgrade (session gone) looks like a dropped network here. Ask the API: a 401 there signs out.
        if (retry >= 2) api('/api/me').catch(() => {})
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(retry, 4)))
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [enabled])

  return <RealtimeContext.Provider value={listeners}>{children}</RealtimeContext.Provider>
}

/** Call `handler(event)` for realtime events whose type is in `types` (plus 'resync'). */
export function useRealtime(types, handler) {
  const listeners = useContext(RealtimeContext)
  const saved = useRef(handler)
  saved.current = handler
  const key = types.join(',')
  useEffect(() => {
    if (!listeners) return
    const wanted = new Set([...key.split(','), 'resync'])
    const fn = event => {
      if (wanted.has(event.type)) saved.current(event)
    }
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [listeners, key])
}
