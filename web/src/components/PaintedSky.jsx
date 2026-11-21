/**
 * PaintedSky — a soft, painted Peshawar sky: layered cloud masses lit by the sun or the moon, film grain, a pale moon,
 * one or two distant kites (patang) by day and at dusk, stars at night. Used by the landing hero and the live call.
 *
 *   <section className="hero">               // any positioned parent (relative, absolute or fixed)
 *     <PaintedSky look={look} />             // fills the parent: position: absolute; inset: 0
 *     <div className="hero-inner">…</div>    // content placed after it with position: relative sits on top
 *   </section>
 *
 * Props
 *   look       'day' | 'dusk' | 'night' (default 'dusk'). Changing it crossfades in about 600ms.
 *   animate    true (default): slow parallax drift, kites sway, stars twinkle. About 30fps, paused while the sky is
 *              off-screen or the tab is hidden. false: one static frame. prefers-reduced-motion always gets one
 *              static frame.
 *   className  extra class on the root (.sky).
 *   children   optional overlay inside the sky box (look dots, a credit line). It renders in a full-size layer
 *              (.sky-over) that lets clicks through except on its direct children. Only the painting is aria-hidden.
 *
 * SKY_LOOKS    [{ id, label: { en, ur }, swatch, text }] for look pickers. `swatch` is a CSS color for the dot.
 *              `text` is the text color that reads on that look: 'light' = ivory (var(--ink-inverse)), 'dark' = ink.
 *              On 'day', ivory only reaches 3:1 — fine for hero titles, but small ivory text needs a scrim.
 *
 * Every color is derived from the tokens (--sky-day, --sky-dusk, --sky-night and the washes), read at paint time.
 * No images are loaded. Until the canvas has painted (or where canvas is unavailable) the root shows a CSS gradient
 * of the look. Clouds are painted once into small offscreen sprites; each frame only composites them.
 */
import { useEffect, useRef } from 'react'
import './PaintedSky.css'

export const SKY_LOOKS = [
  { id: 'day', label: { en: 'Day', ur: 'دن' }, swatch: 'var(--sky-day)', text: 'light' },
  { id: 'dusk', label: { en: 'Dusk', ur: 'شام' }, swatch: 'var(--sky-dusk)', text: 'dark' },
  { id: 'night', label: { en: 'Night', ur: 'رات' }, swatch: 'var(--sky-night)', text: 'light' },
]
const LOOK_IDS = SKY_LOOKS.map(l => l.id)

export default function PaintedSky({ look = 'dusk', animate = true, className, children }) {
  const id = LOOK_IDS.includes(look) ? look : 'dusk'
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const engine = useRef(null)
  const latest = useRef(null)
  latest.current = { look: id, animate }

  useEffect(() => {
    const sky = createSky(rootRef.current, canvasRef.current, latest.current)
    engine.current = sky
    return () => {
      sky.destroy()
      engine.current = null
    }
  }, [])
  useEffect(() => {
    engine.current?.setLook(id)
  }, [id])
  useEffect(() => {
    engine.current?.setAnimate(animate)
  }, [animate])

  return (
    <div ref={rootRef} className={['sky', className].filter(Boolean).join(' ')} data-look={id}>
      <canvas ref={canvasRef} className="sky-canvas" aria-hidden="true" />
      <span className="sky-grain" aria-hidden="true" />
      {children != null && <div className="sky-over">{children}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ engine */

const FPS = 30
const FADE_MS = 600
const TAU = Math.PI * 2

// Tokens the painting reads. The fallbacks mirror tokens.css for when a token cannot be resolved.
const TOKENS = {
  day: ['--sky-day', '#7ea9de'],
  dusk: ['--sky-dusk', '#dcc4b3'],
  night: ['--sky-night', '#1a2237'],
  paper: ['--paper', '#faf9f5'],
  ink: ['--ink', '#141413'],
  wash: ['--sky-wash', '#c9d6e8'],
  heather: ['--heather', '#cbcadb'],
  sand: ['--sand', '#e6d7c8'],
  blush: ['--owed-soft', '#e3b8a8'],
  cream: ['--warn-tint', '#f3e8cf'],
  rust: ['--owed', '#a63d2a'],
  olive: ['--sage-ink', '#788c5d'],
}

// Depth layers, far to near: nearer clouds are bigger, softer (out of focus) and drift further.
const LAYERS = [
  { id: 'far', res: 0.45, blur: 4, amp: 8, bob: 1, period: 120, phase: 0.6 },
  { id: 'mid', res: 0.4, blur: 10, amp: 18, bob: 3, period: 86, phase: 2.1 },
  { id: 'near', res: 0.28, blur: 18, amp: 34, bob: 6, period: 64, phase: 4 },
]

// Cloud masses: [kind, centre x, centre y (fractions of the box), width (× size unit), height/width, blobs].
// They frame the edges, like a vignette, so the middle stays clear for a title.
const SLOTS = {
  land: [
    ['far', 0.05, 0.7, 0.26, 0.36, 12],
    ['far', 0.25, 0.8, 0.2, 0.34, 10],
    ['far', 0.78, 0.76, 0.24, 0.36, 12],
    ['far', 0.97, 0.66, 0.2, 0.38, 10],
    ['far', 0.5, 0.97, 0.3, 0.3, 12],
    ['wisp', 0.33, 0.1, 0.32, 0.12, 9],
    ['wisp', 0.58, 0.05, 0.26, 0.1, 8],
    ['mid', 0.07, 0.5, 0.42, 0.5, 24],
    ['mid', 0.62, 0.06, 0.34, 0.42, 20],
    ['mid', 0.92, 0.68, 0.38, 0.5, 22],
    ['mid', 0.26, 0.9, 0.38, 0.46, 22],
    ['mid', 0.64, 1.02, 0.46, 0.44, 22],
    ['near', -0.02, 0.97, 1, 0.5, 30],
    ['near', 1.02, 0.92, 0.95, 0.5, 30],
    ['near', -0.02, 0.06, 0.8, 0.46, 26],
    ['near', 1.06, 0.4, 0.6, 0.55, 22],
  ],
  port: [
    ['far', 0.04, 0.64, 0.3, 0.36, 12],
    ['far', 0.96, 0.7, 0.3, 0.36, 12],
    ['far', 0.4, 0.86, 0.3, 0.32, 10],
    ['wisp', 0.3, 0.12, 0.42, 0.12, 8],
    ['wisp', 0.75, 0.32, 0.36, 0.1, 7],
    ['mid', -0.02, 0.44, 0.5, 0.5, 20],
    ['mid', 0.66, 0.04, 0.46, 0.42, 18],
    ['mid', 1.02, 0.6, 0.46, 0.5, 18],
    ['mid', 0.18, 0.8, 0.5, 0.46, 20],
    ['near', -0.12, 0.97, 0.95, 0.5, 24],
    ['near', 1.12, 0.88, 0.9, 0.5, 24],
    ['near', -0.16, 0.03, 0.7, 0.46, 20],
    ['near', 1.14, 0.3, 0.55, 0.55, 18],
  ],
}

const SEEDS = { day: 11, dusk: 23, night: 37 }

function parseColor(value) {
  const s = String(value || '').trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, ch => ch + ch) : hex[1]
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const fn = /^rgba?\(([^)]+)\)/i.exec(s)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts
  }
  return null
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
/** Push a color away from grey (`sat`) and scale its brightness (`dark`). */
function tone(c, sat = 0, dark = 1) {
  const grey = (c[0] + c[1] + c[2]) / 3
  return c.map(v => Math.max(0, Math.min(255, (v + (v - grey) * sat) * dark)))
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

function readTokens(el) {
  const cs = getComputedStyle(el)
  const out = {}
  for (const [key, [name, fallback]] of Object.entries(TOKENS)) out[key] = parseColor(cs.getPropertyValue(name)) || parseColor(fallback)
  return out
}

let canFilter = null
function supportsFilter() {
  if (canFilter === null) canFilter = typeof makeCanvas(1, 1).getContext('2d')?.filter === 'string'
  return canFilter
}

let grainUrl = null
/** A 128px tile of light and dark specks, used as a static CSS layer so grain costs nothing per frame. */
function grainTile() {
  if (grainUrl !== null) return grainUrl
  grainUrl = ''
  try {
    const c = makeCanvas(128, 128)
    const g = c.getContext('2d')
    const img = g.createImageData(128, 128)
    const d = img.data
    const rand = rng(7)
    for (let i = 0; i < d.length; i += 4) {
      const v = rand() < 0.5 ? 0 : 255
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = rand() * 36
    }
    g.putImageData(img, 0, 0)
    grainUrl = `url(${c.toDataURL('image/png')})`
  } catch {
    grainUrl = ''
  }
  return grainUrl
}

/* ----------------------------------------------------------------- palettes */

function palette(look, t, land) {
  if (look === 'day') {
    const top = tone(t.day, 0.35, 0.86)
    const mid = tone(t.day, 0.3, 0.88)
    const gold = mix(tone(t.cream, 1.2), t.paper, 0.2)
    return {
      sky: [[0, top], [0.55, mid], [0.82, mix(mid, t.wash, 0.3)], [1, mix(mix(t.day, t.wash, 0.6), t.paper, 0.2)]],
      glows: [{ x: 0.06, y: -0.15, r: 0.95, stops: [[0, mix(t.cream, t.paper, 0.4), 0.32], [1, t.cream, 0]] }],
      haze: [mix(t.wash, t.paper, 0.5), 0.5],
      light: 'above',
      side: -0.14,
      deep: tone(mix(t.day, t.heather, 0.55), -0.2, 0.86),
      shade: tone(mix(t.wash, t.heather, 0.5), 0, 0.92),
      body: mix(t.paper, t.wash, 0.25),
      lit: gold,
      rim: mix(gold, t.paper, 0.5),
      alpha: { far: 0.55, mid: 0.9, near: 0.92 },
      aerial: [mix(mid, t.wash, 0.45), 0.35],
      moon: { phase: 0.82, angle: -2.45, x: land ? 0.76 : 0.74, y: land ? 0.2 : 0.14, r: land ? 0.075 : 0.1, alpha: 0.62, color: t.paper, maria: mix(t.paper, t.day, 0.55) },
      kites: [
        { x: land ? 0.14 : 0.16, y: land ? 0.3 : 0.09, s: 15, c1: mix(t.rust, mid, 0.18), c2: mix(t.paper, mid, 0.2), alpha: 0.92, flyer: -0.2, tilt: -0.14 },
        { x: land ? 0.885 : 0.86, y: land ? 0.58 : 0.72, s: 10, c1: mix(t.olive, mid, 0.2), c2: mix(t.ink, mid, 0.35), alpha: 0.8, flyer: 0.1, tilt: 0.12 },
      ],
      string: rgba(t.ink, 0.2),
    }
  }
  if (look === 'night') {
    return {
      sky: [[0, tone(t.night, 0.3, 0.6)], [0.45, t.night], [0.8, mix(t.night, t.heather, 0.1)], [1, mix(t.night, t.sand, 0.2)]],
      glows: [{ x: 0.5, y: 1.3, r: 0.85, stops: [[0, mix(t.sand, t.blush, 0.3), 0.2], [1, t.sand, 0]] }],
      haze: [mix(t.night, t.sand, 0.22), 0.4],
      light: 'above',
      side: 0.2,
      deep: tone(t.night, 0, 0.75),
      shade: mix(t.night, t.heather, 0.06),
      body: mix(t.night, t.wash, 0.2),
      lit: mix(t.wash, t.night, 0.3),
      rim: mix(t.paper, t.wash, 0.5),
      alpha: { far: 0.5, mid: 0.8, near: 0.82 },
      aerial: [mix(t.night, t.heather, 0.1), 0.4],
      moon: { phase: -0.45, angle: 2.35, x: land ? 0.78 : 0.8, y: land ? 0.19 : 0.085, r: land ? 0.06 : 0.07, alpha: 1, color: t.paper, maria: mix(t.paper, t.heather, 0.6), glow: t.heather },
      stars: true,
      skip: (kind, x, y) => kind === 'near' && x < 0 && y < 0.1,
      kites: [],
    }
  }
  // dusk: the sun has just set to the lower left; clouds are lit from below in pink and gold, lilac on top.
  const lilac = mix(tone(t.heather, 0.6, 0.9), t.blush, 0.15)
  const peach = tone(t.dusk, 0.25)
  return {
    sky: [[0, lilac], [0.3, mix(t.heather, t.blush, 0.45)], [0.62, peach], [1, mix(t.cream, t.blush, 0.18)]],
    glows: [
      { x: 0.26, y: 1.04, r: 0.8, stops: [[0, mix(t.paper, t.cream, 0.5), 0.95], [0.25, tone(mix(t.cream, t.blush, 0.35), 0.5), 0.55], [0.6, t.blush, 0.18], [1, t.blush, 0]] },
    ],
    haze: [mix(t.cream, t.blush, 0.3), 0.42],
    light: 'below',
    side: -0.32,
    deep: tone(mix(t.heather, t.night, 0.25), 0.1, 0.92),
    shade: tone(mix(t.heather, lilac, 0.5), 0.2, 0.93),
    body: mix(t.blush, t.heather, 0.55),
    lit: mix(tone(mix(t.blush, t.rust, 0.12), 0.5, 1.04), t.heather, 0.2),
    rim: mix(tone(t.cream, 1.2), t.paper, 0.15),
    alpha: { far: 0.5, mid: 0.88, near: 0.9 },
    aerial: [peach, 0.4],
    moon: { phase: -0.5, angle: 2.5, x: land ? 0.8 : 0.78, y: land ? 0.14 : 0.1, r: land ? 0.035 : 0.05, alpha: 0.55, color: t.paper, maria: mix(t.paper, t.heather, 0.6) },
    kites: [
      { x: land ? 0.84 : 0.2, y: land ? 0.34 : 0.1, s: 14, c1: mix(t.ink, lilac, 0.25), c2: mix(t.rust, t.ink, 0.45), alpha: 0.8, flyer: land ? 0.12 : -0.22, tilt: 0.12 },
      { x: land ? 0.12 : 0.86, y: land ? 0.52 : 0.74, s: 9, c1: mix(t.ink, lilac, 0.35), c2: mix(t.ink, peach, 0.3), alpha: 0.7, flyer: land ? -0.1 : 0.1, tilt: -0.1 },
    ],
    string: rgba(t.ink, 0.24),
  }
}

/* ----------------------------------------------------------------- painting */

/**
 * One cloud mass as an offscreen sprite, painted the way a painter models it: a dense silhouette of overlapping soft
 * blobs; light laid inside it (lit side to shaded side, per-billow highlights and shadows, a few brush strokes);
 * then blurred. Returns the sprite and its box relative to the cloud's centre, in CSS pixels.
 */
function paintCloud(rand, pal, o) {
  const { w, h, alpha } = o
  const above = pal.light === 'above'
  const tint = c => (o.aerial ? mix(c, o.aerial[0], o.aerial[1]) : c)
  // Direction the light comes from: up (sun or moon overhead) or down (sun below the horizon), tilted sideways.
  const lx = pal.side < 0 ? -0.5 : 0.5
  const ly = above ? -1 : 1

  const blobs = []
  if (o.wisp) {
    for (let i = 0; i < o.blobs; i++) {
      blobs.push({ x: (rand() - 0.5) * w * 0.75, y: (rand() - 0.5) * h * 0.4, r: h * (0.5 + rand() * 0.5), sx: 2.4 + rand() * 1.6, sy: 0.34, rot: (rand() - 0.5) * 0.1, a: alpha * (0.3 + rand() * 0.25), v: 0.5 })
    }
  } else {
    const towers = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({ u: 0.18 + rand() * 0.64, s: 0.1 + rand() * 0.16, a: 0.55 + rand() * 0.45 }))
    const crest = u => Math.min(1, 0.3 + Math.max(...towers.map(tw => tw.a * Math.exp(-((u - tw.u) ** 2) / (2 * tw.s * tw.s)))))
    const base = h * 0.36
    for (let i = 0; i < o.blobs; i++) {
      const u = 0.04 + rand() * 0.92
      const taper = Math.sin(Math.PI * u) ** 0.55
      const v = rand() ** 0.75
      const r = h * (0.2 + rand() * 0.22) * (0.6 + 0.4 * taper) * (1.15 - 0.4 * v)
      blobs.push({ x: (u - 0.5) * w, y: base - v * crest(u) * taper * h * 0.8, r, sx: o.flat ? 1.3 : 1, sy: (v < 0.25 ? 0.62 : 1) * (o.flat ? 0.72 : 1), rot: 0, a: alpha * (0.75 + rand() * 0.25), v })
    }
    // Billows facing the light are painted last, so they sit in front.
    blobs.sort((a, b) => (above ? a.v - b.v : b.v - a.v))
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of blobs) {
    minX = Math.min(minX, b.x - b.r * b.sx)
    maxX = Math.max(maxX, b.x + b.r * b.sx)
    minY = Math.min(minY, b.y - b.r * b.sy)
    maxY = Math.max(maxY, b.y + b.r * b.sy)
  }
  const top = minY
  const bottom = maxY
  const pad = o.blur * 2.5 + 2
  minX -= pad
  minY -= pad
  const bw = maxX + pad - minX
  const bh = maxY + pad - minY
  const c = makeCanvas(bw * o.res, bh * o.res)
  const g = c.getContext('2d')
  g.setTransform(c.width / bw, 0, 0, c.height / bh, -minX * (c.width / bw), -minY * (c.height / bh))

  const soft = (x, y, r, col, a, sx = 1, sy = 1, rot = 0) => {
    g.save()
    g.translate(x, y)
    if (rot) g.rotate(rot)
    g.scale(sx, sy)
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r)
    grd.addColorStop(0, rgba(col, a))
    grd.addColorStop(0.6, rgba(col, a * 0.72))
    grd.addColorStop(1, rgba(col, 0))
    g.fillStyle = grd
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }

  // 1. The silhouette, in the body tone.
  const body = tint(pal.body)
  for (const b of blobs) soft(b.x, b.y, b.r, body, b.a, b.sx, b.sy, b.rot)

  // 2. Light inside the silhouette only: lit side to shaded side across the whole mass…
  g.globalCompositeOperation = 'source-atop'
  const lin = g.createLinearGradient(0, top, 0, bottom)
  const lit = tint(pal.lit)
  const shade = tint(pal.shade)
  const deep = tint(pal.deep)
  if (above) {
    lin.addColorStop(0, rgba(lit, 0.85))
    lin.addColorStop(0.42, rgba(body, 0))
    lin.addColorStop(0.78, rgba(shade, 0.55))
    lin.addColorStop(1, rgba(deep, 0.75))
  } else {
    lin.addColorStop(0, rgba(deep, 0.55))
    lin.addColorStop(0.35, rgba(shade, 0.45))
    lin.addColorStop(0.62, rgba(body, 0))
    lin.addColorStop(0.88, rgba(lit, 0.7))
    lin.addColorStop(1, rgba(tint(pal.rim), 0.5))
  }
  g.fillStyle = lin
  g.fillRect(minX, minY, bw, bh)
  const side = g.createLinearGradient(minX, 0, minX + bw, 0)
  side.addColorStop(lx < 0 ? 0 : 1, rgba(lit, 0.28))
  side.addColorStop(0.5, rgba(lit, 0))
  g.fillStyle = side
  g.fillRect(minX, minY, bw, bh)

  // …each billow lit on the side facing the light and shaded on the other…
  if (!o.wisp) {
    const rim = tint(pal.rim)
    for (const b of blobs) {
      const facing = above ? b.v : 1 - b.v
      soft(b.x - lx * 0.2 * b.r, b.y - ly * 0.5 * b.r, b.r * 0.75, shade, 0.22)
      soft(b.x + lx * 0.25 * b.r, b.y + ly * 0.38 * b.r, b.r * 0.72, facing > 0.55 ? rim : lit, 0.12 + 0.38 * facing, 1.25, 0.85)
    }
  }

  // …and a few loose brush strokes for texture.
  for (let i = 0; i < Math.round(o.blobs / 3); i++) {
    const b = blobs[Math.floor(rand() * blobs.length)]
    const col = rand() < 0.5 ? lit : shade
    soft(b.x + (rand() - 0.5) * b.r, b.y + (rand() - 0.5) * b.r * 0.5, b.r * (0.7 + rand() * 0.5), col, 0.1 + rand() * 0.12, 1.6 + rand() * 1.2, 0.22 + rand() * 0.14, (rand() - 0.5) * 0.35)
  }

  let sprite = c
  if (o.blur > 0 && supportsFilter()) {
    sprite = makeCanvas(c.width, c.height)
    const sg = sprite.getContext('2d')
    sg.filter = `blur(${(o.blur * o.res).toFixed(2)}px)`
    sg.drawImage(c, 0, 0)
    c.width = 0
  }
  return { sprite, ox: minX, oy: minY, w: bw, h: bh }
}

/** The sky gradient and its glows, painted small: it is smooth, so scaling it up costs nothing visible. */
function paintBackground(pal, W, H) {
  const k = 0.35
  const c = makeCanvas(W * k, H * k)
  const g = c.getContext('2d')
  g.scale(c.width / W, c.height / H)
  const lin = g.createLinearGradient(0, 0, 0, H)
  for (const [p, col] of pal.sky) lin.addColorStop(p, rgba(col))
  g.fillStyle = lin
  g.fillRect(0, 0, W, H)
  const R = Math.max(W, H)
  for (const gl of pal.glows) {
    const rg = g.createRadialGradient(gl.x * W, gl.y * H, 0, gl.x * W, gl.y * H, gl.r * R)
    for (const [p, col, a] of gl.stops) rg.addColorStop(p, rgba(col, a))
    g.fillStyle = rg
    g.fillRect(0, 0, W, H)
  }
  const hz = g.createLinearGradient(0, H * 0.55, 0, H)
  hz.addColorStop(0, rgba(pal.haze[0], 0))
  hz.addColorStop(1, rgba(pal.haze[0], pal.haze[1]))
  g.fillStyle = hz
  g.fillRect(0, H * 0.55, W, H * 0.45)
  return c
}

/** Haze laid over the far clouds, so the horizon recedes. */
function paintHaze(pal) {
  const c = makeCanvas(4, 64)
  const g = c.getContext('2d')
  const lin = g.createLinearGradient(0, 0, 0, 64)
  lin.addColorStop(0, rgba(pal.haze[0], 0))
  lin.addColorStop(1, rgba(pal.haze[0], pal.haze[1] * 0.6))
  g.fillStyle = lin
  g.fillRect(0, 0, 4, 64)
  return c
}

/** The moon as a sprite at full resolution: a soft gibbous moon by day and dusk, a crescent with earthshine at night. */
function paintMoon(m, r, scale) {
  const size = Math.ceil(r * (m.glow ? 7 : 2.6))
  const px = size * scale
  const c = makeCanvas(px, px)
  const g = c.getContext('2d')
  g.scale(c.width / size, c.height / size)
  const cx = size / 2
  if (m.glow) {
    const glow = g.createRadialGradient(cx, cx, r * 0.9, cx, cx, size / 2)
    glow.addColorStop(0, rgba(m.glow, 0.2))
    glow.addColorStop(0.35, rgba(m.glow, 0.06))
    glow.addColorStop(1, rgba(m.glow, 0))
    g.fillStyle = glow
    g.fillRect(0, 0, size, size)
  }
  const d = makeCanvas(px, px)
  const dg = d.getContext('2d')
  dg.scale(d.width / size, d.height / size)
  const face = dg.createRadialGradient(cx - r * 0.3, cx - r * 0.3, r * 0.1, cx, cx, r)
  face.addColorStop(0, rgba(m.color))
  face.addColorStop(1, rgba(mix(m.color, m.maria, 0.25)))
  dg.fillStyle = face
  dg.beginPath()
  dg.arc(cx, cx, r, 0, TAU)
  dg.fill()
  dg.globalCompositeOperation = 'source-atop'
  // Maria, roughly where they sit on the real moon (and never in a pattern that reads as a face).
  for (const [ox, oy, rs] of [[-0.34, -0.2, 0.3], [-0.06, -0.42, 0.22], [0.16, -0.18, 0.2], [0.34, -0.3, 0.12], [0.5, -0.05, 0.12], [-0.46, 0.16, 0.3], [-0.2, 0.08, 0.16], [0.08, 0.5, 0.1]]) {
    const spot = dg.createRadialGradient(cx + ox * r, cx + oy * r, 0, cx + ox * r, cx + oy * r, rs * r)
    spot.addColorStop(0, rgba(m.maria, 0.34))
    spot.addColorStop(1, rgba(m.maria, 0))
    dg.fillStyle = spot
    dg.fillRect(0, 0, size, size)
  }
  if (m.glow) {
    // Earthshine: the dark part of the moon, barely there.
    g.globalAlpha = 0.06
    g.drawImage(d, 0, 0, size, size)
    g.globalAlpha = 1
  }
  // Keep only the lit part: the half disc facing the light plus a half ellipse (phase > 0 gibbous, < 0 crescent).
  dg.globalCompositeOperation = 'destination-in'
  if (supportsFilter()) dg.filter = `blur(${(r * (m.glow ? 0.025 : 0.07) * (d.width / size)).toFixed(2)}px)`
  dg.translate(cx, cx)
  dg.rotate(m.angle)
  dg.fillStyle = 'black'
  dg.beginPath()
  dg.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
  dg.ellipse(0, 0, Math.abs(m.phase) * r, r, 0, Math.PI / 2, -Math.PI / 2, m.phase < 0)
  dg.closePath()
  dg.fill()
  g.globalAlpha = m.alpha
  g.drawImage(d, 0, 0, size, size)
  d.width = 0
  return { sprite: c, size }
}

let starSprite = null
function star() {
  if (!starSprite) {
    starSprite = makeCanvas(16, 16)
    const g = starSprite.getContext('2d')
    const grd = g.createRadialGradient(8, 8, 0, 8, 8, 8)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 16, 16)
  }
  return starSprite
}

function buildScene(look, W, H, scale, tokens, lite) {
  const land = W >= H * 1.05
  const pal = palette(look, tokens, land)
  const rand = rng(SEEDS[look])
  const min = Math.min(W, H)
  const unit = Math.max(W, H) * 0.55 + min * 0.2
  const thin = lite ? 0.65 : 1

  const layers = LAYERS.map(L => ({ ...L, clouds: [] }))
  for (const [kind, fx, fy, fw, ratio, blobs] of SLOTS[land ? 'land' : 'port']) {
    const jx = (rand() - 0.5) * 0.04
    const jy = (rand() - 0.5) * 0.04
    const grow = 0.9 + rand() * 0.2
    if (pal.skip?.(kind, fx, fy)) continue
    const layer = layers.find(L => L.id === (kind === 'wisp' ? 'far' : kind))
    const w = fw * unit * grow
    const cloud = paintCloud(rand, pal, {
      w,
      h: w * ratio,
      wisp: kind === 'wisp',
      flat: layer.id === 'far',
      blobs: Math.max(6, Math.round(blobs * thin)),
      blur: layer.blur,
      res: layer.res * (lite ? 0.8 : 1),
      alpha: pal.alpha[layer.id] * (kind === 'wisp' ? 0.8 : 1),
      aerial: layer.id === 'far' ? pal.aerial : null,
    })
    layer.clouds.push({ sprite: cloud.sprite, x: (fx + jx) * W + cloud.ox, y: (fy + jy) * H + cloud.oy, w: cloud.w, h: cloud.h })
  }

  let moon = null
  if (pal.moon) {
    const r = Math.max(14, pal.moon.r * min)
    const m = paintMoon(pal.moon, r, scale)
    moon = { sprite: m.sprite, x: pal.moon.x * W - m.size / 2, y: pal.moon.y * H - m.size / 2, size: m.size, cx: pal.moon.x * W, cy: pal.moon.y * H, r }
  }

  const stars = []
  if (pal.stars) {
    const n = Math.round(Math.min(lite ? 70 : 150, Math.max(30, (W * H) / (lite ? 12000 : 7000))))
    for (let i = 0; i < n; i++) {
      const x = rand() * W
      const y = rand() ** 1.3 * H * 0.78
      const r = 0.45 + rand() ** 3 * 1.4
      const s = { x, y, r, a: 0.35 + rand() * 0.6, tw: rand() < 0.45 ? 0.3 + rand() * 0.5 : 0, sp: 0.5 + rand() * 1.4, ph: rand() * TAU }
      if (moon && Math.hypot(x - moon.cx, y - moon.cy) < moon.r * 3) continue
      stars.push(s)
    }
  }

  const ks = Math.max(0.8, Math.min(1.25, min / 700))
  const kites = pal.kites.map(k => {
    const x = k.x * W
    const y = k.y * H
    const ax = (k.x + k.flyer) * W
    return { ...k, x, y, s: k.s * ks, ax, cx: x + (ax - x) * 0.2, cy: y + (H - y) * 0.72, sp: 0.55 + rand() * 0.3, ph: rand() * TAU, string: pal.string }
  })

  return { bg: paintBackground(pal, W, H), haze: paintHaze(pal), layers, moon, stars, kites }
}

function drawKite(ctx, k, t, H) {
  const sway = Math.sin(t * k.sp + k.ph)
  const x = k.x + sway * 3
  const y = k.y + Math.sin(t * k.sp * 0.7 + k.ph) * 2.5
  const ang = k.tilt + sway * 0.07
  const s = k.s
  ctx.globalAlpha = k.alpha
  ctx.beginPath()
  ctx.moveTo(x - Math.sin(ang) * s * 0.1, y + Math.cos(ang) * s * 0.1)
  ctx.quadraticCurveTo(k.cx, k.cy, k.ax, H + 8)
  ctx.lineWidth = 0.7
  ctx.strokeStyle = k.string
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  // A patang: a diamond, darker above the bow, with a small triangular tail.
  ctx.fillStyle = rgba(k.c2)
  ctx.beginPath()
  ctx.moveTo(0, -s / 2)
  ctx.lineTo(s * 0.48, -s * 0.04)
  ctx.lineTo(0, s / 2)
  ctx.lineTo(-s * 0.48, -s * 0.04)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = rgba(k.c1)
  ctx.beginPath()
  ctx.moveTo(0, -s / 2)
  ctx.lineTo(s * 0.48, -s * 0.04)
  ctx.quadraticCurveTo(0, -s * 0.2, -s * 0.48, -s * 0.04)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, s * 0.5)
  ctx.lineTo(-s * 0.15, s * 0.7)
  ctx.lineTo(s * 0.15, s * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = rgba(k.c1, 0.9)
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(0, -s / 2)
  ctx.lineTo(0, s / 2)
  ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = 1
}

function paintScene(ctx, s, t, W, H) {
  ctx.globalAlpha = 1
  ctx.drawImage(s.bg, 0, 0, W, H)
  if (s.stars.length) {
    const sp = star()
    for (const st of s.stars) {
      ctx.globalAlpha = st.a * (1 - st.tw * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph)))
      const d = st.r * 2.6
      ctx.drawImage(sp, st.x - d / 2, st.y - d / 2, d, d)
    }
    ctx.globalAlpha = 1
  }
  if (s.moon) ctx.drawImage(s.moon.sprite, s.moon.x + Math.sin((t / 150) * TAU) * 2, s.moon.y, s.moon.size, s.moon.size)
  for (const layer of s.layers) {
    const dx = layer.amp * Math.sin((t / layer.period) * TAU + layer.phase)
    const dy = layer.bob * Math.sin((t / (layer.period * 0.7)) * TAU + layer.phase * 2)
    for (const c of layer.clouds) ctx.drawImage(c.sprite, c.x + dx, c.y + dy, c.w, c.h)
    if (layer.id === 'far') ctx.drawImage(s.haze, 0, H * 0.6, W, H * 0.4)
  }
  for (const k of s.kites) drawKite(ctx, k, t, H)
}

const whenIdle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 32))
const cancelIdle = id => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id))

function createSky(root, canvas, init) {
  const ctx = canvas?.getContext('2d', { alpha: false })
  if (!root || !ctx) return { setLook() {}, setAnimate() {}, destroy() {} }

  const lite = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3
  const maxPx = lite ? 1.2e6 : 2.4e6
  const interval = 1000 / (lite ? 24 : FPS) - 2
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const st = {
    look: init.look,
    animate: init.animate,
    reduced: Boolean(motion?.matches),
    visible: !document.hidden,
    inView: true,
    W: 0,
    H: 0,
    scale: 1,
    scenes: new Map(),
    tokens: null,
    prev: null,
    fadeFrom: 0,
    raf: 0,
    last: 0,
    tick: 0,
    clock: 24, // seconds into the drift; a non-zero start gives the static frame a composed spread
    painted: false,
    timer: 0,
    idle: 0,
    dead: false,
  }

  const grain = grainTile()
  if (grain) root.style.setProperty('--sky-grain', grain)

  const live = () => st.animate && !st.reduced
  const shouldRun = () => !st.dead && st.W > 0 && st.visible && st.inView && (live() || Boolean(st.prev))

  function scene(look) {
    let s = st.scenes.get(look)
    if (!s) {
      st.tokens ||= readTokens(root)
      s = buildScene(look, st.W, st.H, st.scale, st.tokens, lite)
      st.scenes.set(look, s)
    }
    return s
  }

  function draw(now) {
    const s = scene(st.look)
    ctx.setTransform(st.scale, 0, 0, st.scale, 0, 0)
    paintScene(ctx, s, st.clock, st.W, st.H)
    if (st.prev) {
      const p = Math.min(1, (now - st.fadeFrom) / FADE_MS)
      if (p >= 1) {
        st.prev.width = 0
        st.prev = null
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1 - p * p * (3 - 2 * p)
        ctx.drawImage(st.prev, 0, 0)
        ctx.globalAlpha = 1
      }
    }
    if (!st.painted) {
      st.painted = true
      root.classList.add('is-painted')
    }
  }

  function frame(now) {
    st.raf = 0
    if (!shouldRun()) {
      st.tick = 0
      return
    }
    st.raf = requestAnimationFrame(frame)
    if (now - st.last < interval) return
    if (live() && st.tick) st.clock += Math.min(0.1, (now - st.tick) / 1000)
    st.tick = now
    st.last = now
    draw(now)
  }

  function sync() {
    if (!st.raf && shouldRun()) st.raf = requestAnimationFrame(frame)
  }

  function drawNow() {
    if (st.W > 0 && !st.dead) draw(performance.now())
  }

  function rebuild() {
    st.timer = 0
    const W = root.clientWidth
    const H = root.clientHeight
    if (!W || !H || st.dead) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    st.scale = Math.min(dpr, Math.sqrt(maxPx / (W * H)))
    st.W = W
    st.H = H
    canvas.width = Math.max(1, Math.round(W * st.scale))
    canvas.height = Math.max(1, Math.round(H * st.scale))
    st.scenes.clear()
    if (st.prev) st.prev.width = 0
    st.prev = null
    drawNow()
    sync()
  }

  // Small height changes (a phone's address bar) only stretch the canvas (object-fit: cover); real resizes repaint.
  function onResize() {
    const W = root.clientWidth
    const H = root.clientHeight
    if (!W || !H) return
    if (!st.W) {
      // The first painting waits for an idle moment: the page shows first (with the CSS sky), then the canvas fades in.
      st.idle ||= whenIdle(() => {
        st.idle = 0
        rebuild()
      })
      return
    }
    if (Math.abs(W - st.W) > 1 || Math.abs(H - st.H) / st.H > 0.2) {
      clearTimeout(st.timer)
      st.timer = setTimeout(rebuild, 160)
    }
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
  if (ro) ro.observe(root)
  else window.addEventListener('resize', onResize)

  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          entries => {
            st.inView = entries[entries.length - 1].isIntersecting
            st.tick = 0
            sync()
          },
          { rootMargin: '64px' },
        )
      : null
  io?.observe(root)

  const onVisibility = () => {
    st.visible = !document.hidden
    st.tick = 0
    sync()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const onMotion = () => {
    st.reduced = Boolean(motion.matches)
    drawNow()
    sync()
  }
  motion?.addEventListener?.('change', onMotion)

  if (!ro) rebuild()

  return {
    setLook(next) {
      if (next === st.look) return
      const fade = st.painted && !st.reduced && st.W > 0 && st.visible && st.inView
      if (fade) {
        // Paint the new look's clouds before the fade starts, so the fade itself runs at full frame rate.
        scene(next)
        const snap = st.prev || document.createElement('canvas')
        snap.width = canvas.width
        snap.height = canvas.height
        snap.getContext('2d').drawImage(canvas, 0, 0)
        st.prev = snap
        st.fadeFrom = performance.now()
      } else if (st.prev) {
        st.prev.width = 0
        st.prev = null
      }
      st.look = next
      if (fade) sync()
      else drawNow()
    },
    setAnimate(on) {
      st.animate = Boolean(on)
      sync()
    },
    destroy() {
      st.dead = true
      cancelAnimationFrame(st.raf)
      clearTimeout(st.timer)
      if (st.idle) cancelIdle(st.idle)
      ro?.disconnect()
      if (!ro) window.removeEventListener('resize', onResize)
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motion?.removeEventListener?.('change', onMotion)
      st.scenes.clear()
      if (st.prev) st.prev.width = 0
      st.prev = null
    },
  }
}
