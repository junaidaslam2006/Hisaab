import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { useRealtime } from './realtime.jsx'

/**
 * GET a JSON resource and keep it fresh.
 * `refreshOn`: realtime event types that trigger a quiet refetch (no loading flash).
 */
export function useResource(path, { refreshOn = [] } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const seq = useRef(0)
  // Coalesce bursts of events (one voice note can fire several) into one refetch.
  const pending = useRef(null)

  const load = useCallback(
    async (quiet = false) => {
      if (!path) return
      const mine = ++seq.current
      if (!quiet) setState(s => ({ ...s, loading: true, error: null }))
      try {
        const data = await api(path)
        if (mine === seq.current) setState({ data, error: null, loading: false })
      } catch (error) {
        if (mine === seq.current) setState(s => ({ data: quiet ? s.data : null, error, loading: false }))
      }
    },
    [path],
  )

  useEffect(() => {
    clearTimeout(pending.current) // a refresh queued for the previous path must not land on this one
    load()
  }, [load])

  useRealtime(refreshOn, () => {
    clearTimeout(pending.current)
    pending.current = setTimeout(() => load(true), 150)
  })
  useEffect(() => () => clearTimeout(pending.current), [])

  return { ...state, reload: load, setData: data => setState(s => ({ ...s, data })) }
}
