import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Land on the #section a link from another page points at (/app/settings#set-sample, /app/help#help-lists).
 * The app shell scrolls to the top on every route change and nothing scrolls to the hash, so the page does it once it
 * has mounted: in an animation frame (after the shell's scroll), aiming again while data loading above the target
 * still moves it, and stopping as soon as the person scrolls themselves. In-page contents links stay native.
 */
export function useHashScroll() {
  const { hash } = useLocation()
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1))
    if (!id) return undefined
    let frame = 0
    let frames = 0
    let still = 0
    let lastTop = null
    let done = false
    const stop = () => {
      done = true
    }
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown']
    for (const e of events) window.addEventListener(e, stop, { passive: true, once: true })
    const seek = () => {
      if (done) return
      const el = document.getElementById(id)
      if (el) {
        const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
        if (top !== lastTop) {
          lastTop = top
          still = 0
          try {
            el.scrollIntoView({ block: 'start', behavior: 'instant' })
          } catch {
            el.scrollIntoView(true)
          }
        } else still++
      }
      // Up to ~6 s for late sections; done once the target has not moved for ~half a second.
      if (still < 30 && frames++ < 360) frame = requestAnimationFrame(seek)
    }
    frame = requestAnimationFrame(seek)
    return () => {
      done = true
      cancelAnimationFrame(frame)
      for (const e of events) window.removeEventListener(e, stop)
    }
    // Only on arrival: the page mounts once per visit, and later in-page hash links scroll natively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
