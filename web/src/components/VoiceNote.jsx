import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { mmss } from '../lib/format.js'
import { useCommon } from '../lib/i18n.jsx'

// Only one voice note plays at a time across the page.
let playing = null

/** Minimal voice-note player. `reply` styles it as Hisaab's own reply. */
export default function VoiceNote({ src, seconds, reply, autoPlay }) {
  const C = useCommon()
  const audio = useRef(null)
  const [isPlaying, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState(0)
  const [length, setLength] = useState(seconds || null)

  useEffect(() => {
    const a = new Audio()
    // Fetch just the header when we don't already know how long the note is.
    a.preload = seconds ? 'none' : 'metadata'
    a.src = src
    audio.current = a
    setLength(seconds || null)
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setLength(a.duration)
    }
    a.addEventListener('loadedmetadata', onMeta)
    const onTime = () => {
      setCurrent(a.currentTime)
      if (a.duration) setProgress(a.currentTime / a.duration)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      setCurrent(0)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnd)
    if (autoPlay) start()
    return () => {
      a.pause()
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnd)
      if (playing === a) playing = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  function start() {
    const a = audio.current
    if (!a) return
    if (playing && playing !== a) playing.pause()
    playing = a
    a.play().catch(() => {})
  }

  function toggle() {
    const a = audio.current
    if (!a) return
    if (a.paused) start()
    else a.pause()
  }

  function seek(e) {
    const a = audio.current
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const go = () => {
      if (a.duration) a.currentTime = p * a.duration
    }
    if (a.readyState >= 1) go()
    else a.addEventListener('loadedmetadata', go, { once: true })
    if (a.paused) start()
  }

  return (
    <div className={['voice', reply && 'reply'].filter(Boolean).join(' ')}>
      <button type="button" className="voice-btn" onClick={toggle} aria-label={isPlaying ? C.pause : C.play}>
        <Icon name={isPlaying ? 'pause' : 'play'} />
      </button>
      <div className="voice-track" onClick={seek} role="presentation">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="voice-time">{isPlaying || current ? mmss(current) : length ? mmss(length) : ''}</span>
    </div>
  )
}
