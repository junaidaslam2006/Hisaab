import { EventEmitter } from 'node:events'

// Per-shop event bus. Every change (new entry, message progress, WhatsApp status)
// is published here and pushed to that shop's open dashboards over WebSocket.
const hub = new EventEmitter()
hub.setMaxListeners(0)

export function publish(tenantId, type, data = {}) {
  if (tenantId) hub.emit(`t:${tenantId}`, { type, data })
}

export function subscribe(tenantId, listener) {
  const key = `t:${tenantId}`
  hub.on(key, listener)
  return () => hub.off(key, listener)
}

// Link attempts (QR screen) are not tied to a shop yet.
export const linkEvents = new EventEmitter()
linkEvents.setMaxListeners(0)
