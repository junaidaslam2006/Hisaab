import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { GoogleGenAI } from '@google/genai'
import { config } from './config.js'
import * as brain from './brain.js'

// ---------- ffmpeg helpers ----------

function run(bin, args, input, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true })
    const out = []
    const err = []
    // A wedged ffmpeg must not hold a reply forever.
    const timer = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`${path.basename(bin)} timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('error', e => {
      clearTimeout(timer)
      reject(e)
    })
    p.stdin.on('error', () => {}) // ffmpeg exiting early must not crash the server (EPIPE); 'close' reports it
    p.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${Buffer.concat(err).toString().slice(-400)}`))
    })
    if (input) p.stdin.end(input)
    else p.stdin.end()
  })
}

/** Any audio buffer -> WhatsApp-compatible voice note (Ogg/Opus, mono, 48 kHz). */
export async function toVoiceNote(input, outFile, inputArgs = []) {
  await run(config.ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputArgs, '-i', 'pipe:0',
    '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', '-application', 'voip',
    '-map_metadata', '-1', '-avoid_negative_ts', 'make_zero',
    outFile,
  ], input, 60000)
  return outFile
}

export async function durationOf(file) {
  try {
    const out = await run(config.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], null, 10000)
    const s = parseFloat(out.toString())
    if (Number.isFinite(s)) return s
  } catch {}
  return Math.max(1, fs.statSync(file).size / 4000)
}

// ---------- numbers as Urdu words ----------
// Gemini TTS sometimes says a different number than the digits it was given (heard "1200" read as 1250), so it
// gets every amount already spelled out. The words come from this fixed table, never from a model.

const UNITS = (
  'صفر ایک دو تین چار پانچ چھ سات آٹھ نو دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس ' +
  'بیس اکیس بائیس تئیس چوبیس پچیس چھبیس ستائیس اٹھائیس انتیس تیس اکتیس بتیس تینتیس چونتیس پینتیس چھتیس سینتیس اڑتیس انتالیس ' +
  'چالیس اکتالیس بیالیس تینتالیس چوالیس پینتالیس چھیالیس سینتالیس اڑتالیس انچاس پچاس اکاون باون ترپن چون پچپن چھپن ستاون اٹھاون انسٹھ ' +
  'ساٹھ اکسٹھ باسٹھ تریسٹھ چونسٹھ پینسٹھ چھیاسٹھ سڑسٹھ اڑسٹھ انہتر ستر اکہتر بہتر تہتر چوہتر پچھتر چھہتر ستتر اٹھہتر اناسی ' +
  'اسی اکیاسی بیاسی تراسی چوراسی پچاسی چھیاسی ستاسی اٹھاسی نواسی نوے اکانوے بانوے ترانوے چورانوے پچانوے چھیانوے ستانوے اٹھانوے ننانوے'
).split(' ')

/** 4350 -> "چار ہزار تین سو پچاس" (Pakistani lakh/crore grouping). */
export function urduNumber(n) {
  n = Math.floor(Math.abs(Number(n)))
  if (!Number.isFinite(n)) return ''
  if (n < 100) return UNITS[n]
  const parts = []
  for (const [size, word] of [[10_000_000, 'کروڑ'], [100_000, 'لاکھ'], [1000, 'ہزار'], [100, 'سو']]) {
    if (n >= size) {
      parts.push(`${urduNumber(Math.floor(n / size))} ${word}`)
      n %= size
    }
  }
  if (n) parts.push(UNITS[n])
  return parts.join(' ')
}

/** Spell out every number in a sentence. Phone-like digit runs (leading 0, or 10+ digits) are read digit by digit. */
export function spellNumbers(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\d[\d,]*/g, raw => {
      const digits = raw.replace(/,/g, '')
      if ((digits.length > 1 && digits.startsWith('0')) || digits.length >= 10) return [...digits].map(d => UNITS[d]).join(' ')
      return urduNumber(digits)
    })
}

// ---------- TTS providers ----------
// Each takes (text, signal) and returns { audio, inputArgs } (raw audio + the ffmpeg args to read it),
// or null when it is not configured. They stop their work when `signal` aborts.

const PROVIDER_LABELS = { uplift: 'Uplift AI', edge: 'Microsoft Edge voice', gemini: 'Gemini TTS' }

async function uplift(text, signal) {
  if (!config.upliftKey) return null
  const res = await fetch('https://api.upliftai.org/v1/synthesis/text-to-speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.upliftKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceId: config.upliftVoice, text, outputFormat: 'MP3_22050_64' }),
    signal,
  })
  if (!res.ok) throw new Error(`Uplift ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return { audio: Buffer.from(await res.arrayBuffer()), inputArgs: [] }
}

// Microsoft's free endpoint now and then drops or stalls a request (2 of 8 dropped mid-stream on 31 Oct; a good one
// takes 1–3 s), and a fresh connection usually works. So each attempt gets a short cap of its own and a failed one
// is retried at once, within the provider's overall timeout.
const EDGE_ATTEMPT_MS = 4000
async function edge(text, signal) {
  let lastError = null
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    const attemptCtrl = new AbortController()
    const forward = () => attemptCtrl.abort()
    signal.addEventListener('abort', forward, { once: true })
    const timer = setTimeout(() => attemptCtrl.abort(), EDGE_ATTEMPT_MS + 10 * text.length)
    try {
      return await edgeOnce(text, attemptCtrl.signal)
    } catch (err) {
      lastError = attemptCtrl.signal.aborted && !signal.aborted ? new Error(`Edge attempt ${attempt + 1} stalled`) : err
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', forward)
    }
  }
  throw lastError || new Error('aborted')
}

async function edgeOnce(text, signal) {
  const tts = new MsEdgeTTS()
  const stop = () => {
    try {
      tts.close()
    } catch {}
  }
  signal.addEventListener('abort', stop, { once: true })
  try {
    await tts.setMetadata(config.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    if (signal.aborted) throw new Error('aborted')
    const { audioStream } = tts.toStream(text, { rate: '+4%' })
    const chunks = []
    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      audioStream.on('data', c => chunks.push(c))
      audioStream.on('end', resolve)
      audioStream.on('close', resolve)
      audioStream.on('error', reject)
    })
    const audio = Buffer.concat(chunks)
    if (audio.length < 1000) throw new Error('Edge TTS returned no audio')
    return { audio, inputArgs: [] }
  } finally {
    signal.removeEventListener('abort', stop)
    stop()
  }
}

let ownClient = null
const geminiClient = () => {
  if (typeof brain.gemini === 'function') return brain.gemini()
  ownClient ??= new GoogleGenAI({ apiKey: config.geminiKey })
  return ownClient
}
const isBusy = err => /\b(503|429|500)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|high demand|overloaded/i.test(String(err?.message || err))

// When the main TTS model is busy, its lighter sibling usually still answers. A model whose daily quota is used up
// (free tier: 10 TTS requests per model per day) is skipped for 30 minutes instead of being asked on every reply.
const quotaUntil = new Map()
const geminiTtsModels = () =>
  [...new Set([config.geminiTtsModel, process.env.GEMINI_TTS_FALLBACK_MODEL || 'gemini-3.8-flash-lite-tts'].filter(Boolean))]
    .filter(m => !(quotaUntil.get(m) > Date.now()))

async function geminiTts(text, signal) {
  if (!config.geminiKey) return null
  let lastError = null
  for (const model of geminiTtsModels()) {
    if (signal.aborted) break
    try {
      // Only the words to say. With a style instruction in front ("Read this aloud in natural Pakistani Urdu…")
      // the model sometimes speaks the instruction too: 9.4 s of audio instead of 2.8 s for the same sentence.
      const res = await geminiClient().models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: spellNumbers(text) }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.geminiTtsVoice } } },
          abortSignal: signal,
        },
      })
      const part = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)
      if (!part) throw new Error(`${model} returned no audio`)
      const audio = Buffer.from(part.inlineData.data, 'base64')
      const mime = part.inlineData.mimeType || ''
      // Some TTS models send a WAV file (ffmpeg reads its header), others raw 16-bit PCM with the rate in the mime type.
      if (audio.subarray(0, 4).toString('latin1') === 'RIFF' || /wav/i.test(mime)) return { audio, inputArgs: [], model }
      const rate = /rate=(\d+)/.exec(mime)?.[1] || '24000'
      return { audio, inputArgs: ['-f', 's16le', '-ar', rate, '-ac', '1'], model }
    } catch (err) {
      lastError = err
      if (/PerDay|per day/i.test(String(err?.message))) quotaUntil.set(model, Date.now() + 30 * 60e3)
      if (!isBusy(err)) break
    }
  }
  throw lastError || new Error(quotaUntil.size ? 'Gemini TTS daily quota used up' : 'Gemini TTS aborted')
}

const PROVIDERS = { uplift, edge, gemini: geminiTts }
const configured = name => (name === 'uplift' ? Boolean(config.upliftKey) : name === 'gemini' ? Boolean(config.geminiKey) : name in PROVIDERS)

// Per-provider patience. A voice reply holds up the text reply behind it, so these stay short; longer
// replies (several entries in one note) get a little more time. TTS_BUDGET_MS caps one reply overall.
const TIMEOUTS = { uplift: [8000, 15], edge: [9000, 20], gemini: [14000, 25] } // [base ms, extra ms per character]
const timeoutFor = (name, text) => {
  const [base, perChar] = TIMEOUTS[name] || [10000, 20]
  return base + perChar * text.length
}
export const BUDGET_MS = Number(process.env.TTS_BUDGET_MS) > 0 ? Number(process.env.TTS_BUDGET_MS) : 22000

// ---------- health: recent results per provider ----------
// Two failures in a row within a minute move a provider to the back of the line for a minute, so the next
// reply doesn't wait out the same timeout again. It is still tried last, and the first success restores it.

const DEMOTE_AFTER = 2
const DEMOTE_MS = 60000
const health = new Map(Object.keys(PROVIDERS).map(name => [name, { ok: 0, failed: 0, streak: 0, lastOkAt: null, lastFailAt: null, lastError: null, lastMs: null }]))

const demoted = (name, now = Date.now()) => {
  const h = health.get(name)
  return Boolean(h && h.streak >= DEMOTE_AFTER && now - h.lastFailAt < DEMOTE_MS)
}

function record(name, ok, ms, error) {
  const h = health.get(name)
  if (!h) return
  h.lastMs = ms
  if (ok) {
    h.ok++
    h.streak = 0
    h.lastOkAt = Date.now()
  } else {
    h.failed++
    h.streak++
    h.lastFailAt = Date.now()
    h.lastError = String(error || 'failed').slice(0, 200)
  }
}

/** Providers in the order they will be tried right now: TTS_ORDER, configured ones only, recently failing ones last. */
export function providerOrder() {
  const names = config.ttsOrder.filter(name => PROVIDERS[name] && configured(name))
  return [...names.filter(n => !demoted(n)), ...names.filter(n => demoted(n))]
}

/** Snapshot of every voice provider for diagnostics (no network calls). */
export function speechStatus() {
  return config.ttsOrder.filter(name => PROVIDERS[name]).map(name => {
    const h = health.get(name)
    return { provider: name, label: PROVIDER_LABELS[name], configured: configured(name), demoted: demoted(name), ...h }
  })
}

// ---------- a tiny cache for short phrases that repeat ("help", "system busy", "kaun se?") ----------

const CACHE_MAX_ENTRIES = 48
const CACHE_MAX_CHARS = 160
const cache = new Map() // key -> { ogg, seconds, provider }

const cacheKey = text => crypto.createHash('sha256').update(`${config.edgeVoice}|${config.upliftVoice}|${config.geminiTtsVoice}|${text}`).digest('hex')

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  cache.delete(key) // re-insert = most recently used
  cache.set(key, hit)
  return hit
}

function cachePut(key, value) {
  cache.set(key, value)
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
}

// ---------- rendering ----------

function withTimeout(promise, ms, controller, name) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`${name} timed out after ${(ms / 1000).toFixed(1)}s`))
      }, ms)
    }),
  ])
}

/** Try providers in order until one produces a voice note at `file`. Never throws. */
async function render(text, file, budgetMs) {
  const deadline = Date.now() + budgetMs
  const attempts = []
  for (const name of providerOrder()) {
    const left = deadline - Date.now()
    if (left < 1500) break
    const t0 = Date.now()
    const controller = new AbortController()
    try {
      const out = await withTimeout(PROVIDERS[name](text, controller.signal), Math.min(timeoutFor(name, text), left), controller, name)
      if (!out) continue
      await toVoiceNote(out.audio, file, out.inputArgs)
      const seconds = await durationOf(file)
      const ms = Date.now() - t0
      record(name, true, ms)
      attempts.push({ provider: name, ok: true, ms, model: out.model })
      return { ok: true, file, seconds, provider: name, model: out.model || null, ms, attempts }
    } catch (err) {
      const ms = Date.now() - t0
      const message = String(err?.message || err).slice(0, 200)
      record(name, false, ms, message)
      attempts.push({ provider: name, ok: false, ms, error: message })
      fs.rmSync(file, { force: true })
      console.warn(`[speech] ${name} failed after ${ms}ms: ${message}`)
    }
  }
  return { ok: false, attempts }
}

const tidy = text => String(text ?? '').replace(/\s+/g, ' ').trim()

/**
 * Speak Urdu text as a WhatsApp voice note written to `file`. Tries providers in TTS_ORDER (recently failing ones
 * last), each with its own timeout, within an overall budget. Returns { file, seconds, provider, ms, cached } or
 * null if no provider produced audio — the text reply then goes out on its own.
 */
export async function speak(text, file, { budgetMs = BUDGET_MS, cache: useCache = true } = {}) {
  const phrase = tidy(text)
  if (!phrase) return null
  const t0 = Date.now()
  const key = useCache && phrase.length <= CACHE_MAX_CHARS ? cacheKey(phrase) : null
  const hit = key && cacheGet(key)
  if (hit) {
    fs.writeFileSync(file, hit.ogg)
    return { file, seconds: hit.seconds, provider: hit.provider, ms: Date.now() - t0, cached: true }
  }
  const r = await render(phrase, file, budgetMs)
  if (!r.ok) return null
  if (key) cachePut(key, { ogg: fs.readFileSync(file), seconds: r.seconds, provider: r.provider })
  return { file, seconds: r.seconds, provider: r.provider, ms: Date.now() - t0, cached: false }
}

export const HEALTH_PHRASE = 'حساب کا نظام ٹھیک کام کر رہا ہے۔'

/**
 * For the system check: render a short phrase the way a real reply would be rendered (same order and timeouts,
 * never from the cache) and report which provider answered and how fast. With `audio: true` the voice note
 * comes back as a data: URL the dashboard can play.
 */
export async function speechHealth({ text = HEALTH_PHRASE, budgetMs = BUDGET_MS, audio = false } = {}) {
  const order = providerOrder()
  if (!order.length) return { ok: false, reason: 'no_provider', order, attempts: [], providers: speechStatus() }
  const file = path.join(os.tmpdir(), `hisaab-voice-check-${process.pid}-${crypto.randomBytes(4).toString('hex')}.ogg`)
  const t0 = Date.now()
  try {
    const r = await render(tidy(text), file, budgetMs)
    const out = { ok: r.ok, ms: Date.now() - t0, order, attempts: r.attempts, providers: speechStatus() }
    if (!r.ok) return { ...out, reason: 'all_failed' }
    const bytes = fs.statSync(file).size
    return {
      ...out,
      provider: r.provider,
      label: PROVIDER_LABELS[r.provider],
      model: r.model,
      seconds: r.seconds,
      bytes,
      audio: audio ? `data:audio/ogg;base64,${fs.readFileSync(file).toString('base64')}` : undefined,
    }
  } finally {
    fs.rmSync(file, { force: true })
  }
}
