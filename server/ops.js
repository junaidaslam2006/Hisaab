// Pitch-day tools for the signed-in shop: a one-tap system check and removable sample data.
// Mounted on the authed /api router, so req.tenant is the shop.
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { config } from './config.js'
import { one, run } from './db.js'
import { getTenant } from './tenants.js'
import { publish } from './realtime.js'
import { speechHealth, BUDGET_MS as VOICE_BUDGET_MS } from './speech.js'
import * as wa from './whatsapp/manager.js'
import { seedSample, removeSample, sampleStatus } from './sample.js'
import { lastBackup } from './backup.js'

const router = express.Router()

const CHECK_GAP_MS = 20_000
// Text parse, live-call connect, voice render and WhatsApp run side by side; the voice-note parse starts as soon as
// its audio is rendered and gets whatever is left of TOTAL_MS. The voice render gets the same budget as a real reply,
// so a stalled Microsoft voice still leaves time for the Gemini TTS fallback, as it would for a real reply. A healthy
// check takes a few seconds; the slowest possible one about 30 s.
const LIMITS = { ai: 20_000, call: 10_000, voice: VOICE_BUDGET_MS + 1000, whatsapp: 10_000 }
const TOTAL_MS = VOICE_BUDGET_MS + 8000
const LOW_DISK = 500 * 1024 * 1024

// A fixed Urdu+English text, the way shopkeepers actually type and talk. Parsed for real; nothing is written.
export const AI_SENTENCE = 'Umar ne 500 rupees ka saman liya on credit aur Ahmed paid 300 back'
// The same two entries spoken in Urdu: rendered by the voice check, then understood as a real voice note.
export const VOICE_SENTENCE = 'عمر نے پانچ سو روپے کا سامان ادھار لیا، اور احمد نے تین سو روپے واپس دیے۔'

const lastRun = new Map() // tenantId -> start time of the last check
const running = new Set()

const secs = ms => `${(ms / 1000).toFixed(1)} s`
const urSecs = ms => `${(ms / 1000).toFixed(1)} سیکنڈ`
const gb = bytes => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`)
// Hisaab runs on the free Gemini tier. Google's quota errors say "please check your plan and billing details" and link
// to its docs; neither is the fix here, so the check never repeats them.
const plain = s =>
  String(s)
    .replace(/,?\s*please check your plan and billing details\.?/gi, '.')
    .replace(/\s*For more information on this error,? head to:?\s*\S+/gi, '')
    .replace(/\.\s*\./g, '.')
// Google's errors arrive as JSON text; the "message" inside is the part a person can read.
const short = err => {
  const s = String(err?.message || err || 'error')
  return plain(/"message":\s*"([^"]+)"/.exec(s)?.[1] || s).replace(/\s+/g, ' ').slice(0, 160)
}

// Free-tier daily caps (generateContent and TTS; none seen on Gemini Live) reset at midnight US Pacific. Pakistan has
// no daylight saving, so that is 12:00 PKT while the US is on daylight time and 13:00 PKT after its clocks go back
// (1 Nov 2026). Pacific offsets are whole hours, so the first whole UTC hour where Los Angeles shows 0 is the reset.
const PACIFIC_HOUR = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' })
const PKT_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const urClock = hhmm => {
  const h = Number(hhmm.slice(0, 2))
  const part = h < 5 ? 'رات' : h < 12 ? 'صبح' : h < 16 ? 'دوپہر' : h < 19 ? 'شام' : 'رات'
  return `${part} ${h % 12 || 12} بجے`
}
/** The next free-tier daily reset: { at, pkt: '13:00', pktUr: 'دوپہر 1 بجے' }. */
export function dailyReset(now = Date.now()) {
  let t = Math.ceil(now / 3600e3) * 3600e3
  for (let i = 0; i < 26 && Number(PACIFIC_HOUR.format(t)) % 24 !== 0; i++) t += 3600e3
  const pkt = PKT_CLOCK.format(t)
  return { at: t, pkt, pktUr: urClock(pkt) }
}

class Timeout extends Error {}
function within(ms, work) {
  let timer
  return Promise.race([
    Promise.resolve().then(work).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Timeout(`no answer in ${ms / 1000}s`)), ms))),
  ])
}

// A free-tier limit: per minute (frees up within a minute) or per day (until the Pacific-midnight reset).
const QUOTA = /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota|quota/i
const PER_DAY = /PerDay|per day/i
const BUSY = /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|busy/i
const KEY = /API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED|\b(401|403)\b/i
const NETWORK = /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network/i

// ---------------------------------------------------------------- AI

const opName = op => `${op.customer_name || op.customerName || ''} ${op.customer_name_urdu || op.customerNameUrdu || ''}`
const isUmar = op => /\b[uo]m[ae]r\b/i.test(opName(op)) || /عمر/.test(opName(op))
const isAhmed = op => /\bahm[ae]d\b/i.test(opName(op)) || /احمد/.test(opName(op))
const describe = ops => ops.map(o => `${o.type} ${opName(o).trim() || '?'} ${o.amount ?? ''}`.trim()).join(', ') || 'no entries'

// brain.js rests a model after a refusal (brain.modelCooldowns): at most a minute after a per-minute limit (a Live quota
// close 30 s, a 429 its retry hint), at most 15 minutes after a daily cap, and an hour after "model not found".
const MINUTE_REST_MS = 2 * 60e3
const LIMIT_REST_MS = 16 * 60e3
const restsNow = brain => (typeof brain?.modelCooldowns === 'function' ? brain.modelCooldowns() : {})

/**
 * A parse that ran out of time while every Live model it could use was resting after a free-tier refusal (at the start
 * or at the end of the test) was held up by the free tier's limit, not by the internet: { models, daily } or null.
 */
function heldByLimit(models, rests) {
  const now = Date.now()
  const until = m => Math.max(0, ...rests.map(r => (r[m] ? Date.parse(r[m]) : 0)))
  if (!models.length || !models.every(m => until(m) > 0)) return null
  const left = models.map(m => until(m) - now)
  if (left.some(ms => ms > LIMIT_REST_MS)) return null
  return { models, daily: left.every(ms => ms > MINUTE_REST_MS) }
}

/** One real parse through brain.understand (text, or a voice note). Never throws. */
async function parseCheck(input, limitMs) {
  const t0 = Date.now()
  // Stopped when the test gives up: a parse waiting out a limit must not go on opening Live sessions for up to 90 s
  // after the check has answered (the shop's real messages need them, and each one prolongs a per-minute limit).
  const stop = new AbortController()
  let brain = null
  let restsAtStart = {}
  try {
    // Imported here so a change to brain.js's other exports can never stop this file from loading.
    brain = await import('./brain.js')
    if (typeof brain.understand !== 'function') throw new Error('brain.understand is not available')
    restsAtStart = restsNow(brain)
    const out = await within(limitMs, () => brain.understand({ ...input, customers: [], lists: [], signal: stop.signal }))
    const ops = Array.isArray(out?.operations) ? out.operations : []
    const right = ops.some(o => o.type === 'credit' && o.amount === 500 && isUmar(o)) && ops.some(o => o.type === 'payment' && o.amount === 300 && isAhmed(o))
    return { ok: right, code: right ? 'ok' : 'wrong', ms: Date.now() - t0, model: out?.model || null, path: out?.path || null, got: right ? undefined : describe(ops) }
  } catch (err) {
    stop.abort()
    if (err instanceof Timeout) {
      const live = typeof brain?.liveModelsFor === 'function' ? brain.liveModelsFor({ audio: input.audio }) : []
      const held = heldByLimit(live, [restsAtStart, restsNow(brain)])
      if (held) {
        return {
          ok: false, code: 'quota', daily: held.daily, timedOut: true, models: held.models, ms: Date.now() - t0, limitMs,
          error: `every Gemini Live model is resting after the limit: ${held.models.join(', ')}`,
        }
      }
      return { ok: false, code: 'slow', ms: Date.now() - t0, error: short(err), limitMs }
    }
    const e = short(err)
    // The whole message: understanding's final error lists the last attempts, and a quota refusal may be any of them.
    const full = `${err?.code || ''} ${err?.message || err}`
    const code = err?.code === 'ai_config' || KEY.test(e) ? 'key'
      : err?.code === 'network' || NETWORK.test(e) ? 'network'
        : QUOTA.test(full) ? 'quota'
          : err?.code === 'busy' || BUSY.test(e) ? 'busy'
            : 'error'
    return { ok: false, code, ms: Date.now() - t0, error: e, limitMs, ...(code === 'quota' ? { daily: PER_DAY.test(full) } : {}) }
  }
}

const via = p => (p.model ? ` (${p.model}${p.path === 'live' ? ', Gemini Live' : ''})` : '')

export function failure(p, what, whatUr, reset = dailyReset()) {
  switch (p.code) {
    case 'slow':
      return {
        en: `${what}: no answer from Google in ${Math.round(p.limitMs / 1000)} s. Check the internet; if it is fine, Google is slow right now and replies will be late.`,
        ur: `${whatUr}: ${Math.round(p.limitMs / 1000)} سیکنڈ میں گوگل سے جواب نہیں آیا۔ انٹرنیٹ چیک کریں؛ اگر ٹھیک ہے تو گوگل ابھی سست ہے اور جواب دیر سے آئیں گے۔`,
      }
    case 'quota':
      // Ran out of time waiting for Live models that rest after a limit: the free tier held it up, not the internet.
      if (p.timedOut) {
        const n = Math.round(p.limitMs / 1000)
        return p.daily
          ? {
              en: `${what}: no answer in ${n} s, because every Gemini Live model is resting after a free Gemini tier daily cap (${p.models.join(', ')}). Hisaab tries them again by itself; the cap resets at ${reset.pkt} Pakistan time.`,
              ur: `${whatUr}: ${n} سیکنڈ میں جواب نہیں آیا، کیونکہ مفت جیمنائی کی روزانہ حد کی وجہ سے جیمنائی لائیو کے سب ماڈل آرام کر رہے ہیں۔ حساب انہیں خود دوبارہ آزماتا ہے؛ یہ حد پاکستانی وقت کے مطابق ${reset.pktUr} نئی ہوتی ہے۔`,
            }
          : {
              en: `${what}: no answer in ${n} s, because every Gemini Live model is resting after the free Gemini tier's per-minute limit (${p.models.join(', ')}). It frees up within a minute; messages sent meanwhile wait for it, with a short "likh raha hoon" note.`,
              ur: `${whatUr}: ${n} سیکنڈ میں جواب نہیں آیا، کیونکہ مفت جیمنائی کی فی منٹ حد کی وجہ سے جیمنائی لائیو کے سب ماڈل آرام کر رہے ہیں۔ یہ ایک منٹ میں کھل جاتی ہے؛ اس دوران آنے والے پیغام اس کا انتظار کرتے ہیں، اور ⁦likh raha hoon⁩ کا مختصر پیغام بھیج دیا جاتا ہے۔`,
            }
      }
      return p.daily
        ? {
            en: `${what}: a free Gemini tier daily cap was reached (${p.error}). The other models carry on; this cap resets at ${reset.pkt} Pakistan time.`,
            ur: `${whatUr}: مفت جیمنائی کی روزانہ حد پوری ہو گئی۔ باقی ماڈل کام کرتے رہیں گے؛ یہ حد پاکستانی وقت کے مطابق ${reset.pktUr} نئی ہوتی ہے۔`,
          }
        : {
            en: `${what}: the free Gemini tier's per-minute limit was reached (${p.error}). It frees up within a minute, and Hisaab moves each message to its next model by itself.`,
            ur: `${whatUr}: مفت جیمنائی کی فی منٹ حد پوری ہو گئی۔ یہ ایک منٹ میں کھل جاتی ہے، اور حساب ہر پیغام خود اگلے ماڈل کو بھیج دیتا ہے۔`,
          }
    case 'busy':
      return {
        en: `${what}: Google is overloaded right now (${p.error}). Messages are retried automatically but may be slow.`,
        ur: `${whatUr}: گوگل ابھی مصروف ہے۔ پیغامات خود بخود دوبارہ کوشش سے سمجھے جائیں گے، مگر دیر سے۔`,
      }
    case 'key':
      return { en: `${what}: Google rejected the API key (${p.error}). Check GEMINI_API_KEY in .env.`, ur: `${whatUr}: گوگل نے API key قبول نہیں کی۔ ‎.env میں GEMINI_API_KEY چیک کریں۔` }
    case 'network':
      return { en: `${what}: cannot reach Google (${p.error}). Check the internet.`, ur: `${whatUr}: گوگل تک رسائی نہیں ہو رہی — انٹرنیٹ چیک کریں۔` }
    case 'wrong':
      return { en: `${what}: Google answered in ${secs(p.ms)}${via(p)} but misread the test (${p.got}).`, ur: `${whatUr}: گوگل نے ${urSecs(p.ms)} میں جواب دیا مگر ٹیسٹ غلط سمجھا۔` }
    default:
      return { en: `${what}: failed (${p.error}).`, ur: `${whatUr}: ناکام رہا۔` }
  }
}

/** Text parse + voice-note parse -> the one 'ai' check. */
export function aiResult(text, note) {
  const parts = { text, voiceNote: note }
  const ms = Math.max(text.ms || 0, note.ms || 0)
  if (!text.ok) {
    const f = failure(text, 'Text test', 'لکھے پیغام کا ٹیسٹ')
    const also = note.ok ? { en: ` The voice-note test did pass (${secs(note.ms)}).`, ur: ' وائس نوٹ کا ٹیسٹ البتہ ٹھیک رہا۔' } : { en: '', ur: '' }
    return { ok: false, ms, code: text.code, model: text.model || note.model || null, ...parts, detail: f.en + also.en, detailUr: f.ur + also.ur }
  }
  const line = {
    en: `Understood a mixed Urdu + English message in ${secs(text.ms)}${via(text)}: Umar Rs 500 udhaar, Ahmed Rs 300 paid.`,
    ur: `اردو اور انگریزی ملا پیغام ${urSecs(text.ms)} میں ٹھیک سمجھ لیا: عمر 500 روپے ادھار، احمد 300 روپے واپس۔`,
  }
  if (note.skipped) {
    return {
      ok: true, ms, code: 'ok', model: text.model, ...parts,
      detail: `${line.en} The voice-note test was skipped because no voice could be rendered.`,
      detailUr: `${line.ur} آواز نہ بننے کی وجہ سے وائس نوٹ کا ٹیسٹ نہیں ہوا۔`,
    }
  }
  if (note.ok) {
    return {
      ok: true, ms, code: 'ok', model: text.model, ...parts,
      detail: `${line.en} An Urdu voice note was understood in ${secs(note.ms)}${via(note)}.`,
      detailUr: `${line.ur} اردو وائس نوٹ ${urSecs(note.ms)} میں سمجھ لیا۔`,
    }
  }
  const f = failure(note, 'Voice-note test', 'وائس نوٹ کا ٹیسٹ')
  return {
    ok: false, ms, code: `voice_${note.code}`, model: text.model, ...parts,
    detail: `${line.en} ${f.en} Until it passes, type entries in WhatsApp or on the dashboard instead of speaking.`,
    detailUr: `${line.ur} ${f.ur} جب تک یہ ٹھیک نہ ہو، بولنے کے بجائے لکھ کر بھیجیں۔`,
  }
}

// ---------------------------------------------------------------- the live call

/** "Talk to Hisaab": open the call's real Gemini Live session (model, voice, tools, prompt) and close it. Never throws. */
async function checkCall(tenant) {
  const t0 = Date.now()
  try {
    const live = await import('./live.js')
    return await live.probeCall(tenant, { timeoutMs: LIMITS.call })
  } catch (err) {
    return { ok: false, model: null, ms: Date.now() - t0, fallback: false, tried: [], error: short(err) }
  }
}

/** The live call joins the 'ai' check: messages can be fine while the call cannot connect, and the other way round. */
export function withCall(ai, call) {
  const tried = call.tried || []
  const first = tried[0]
  const why = tried.map(t => `${t.model}: ${plain(t.error).slice(0, 70)}`).join('; ') || call.error || 'no answer'
  if (call.ok) {
    const line = !call.fallback
      ? { en: ` The live call (Talk to Hisaab) connected in ${secs(call.ms)} (${call.model}, Gemini Live).`, ur: ` لائیو کال (حساب سے بات کریں) ${urSecs(call.ms)} میں جڑ گئی۔` }
      : first?.quota
        ? {
            en: ` The live call connected in ${secs(call.ms)} on ${call.model}: its first model ${first.model} is resting for a minute after the free tier's per-minute limit. Calls still work.`,
            ur: ` لائیو کال ${urSecs(call.ms)} میں اگلے ماڈل پر جڑ گئی؛ پہلا ماڈل مفت حد کی وجہ سے ایک منٹ آرام کر رہا ہے۔ کال چلتی رہے گی۔`,
          }
        : {
            en: ` The live call connected in ${secs(call.ms)} on its fallback model ${call.model}; its own model ${first?.model} did not (${plain(first?.error || '')}). Calls still work.`,
            ur: ` لائیو کال ${urSecs(call.ms)} میں متبادل ماڈل پر جڑ گئی؛ کال چلتی رہے گی۔`,
          }
    return { ...ai, call, ms: Math.max(ai.ms || 0, call.ms || 0), detail: ai.detail + line.en, detailUr: ai.detailUr + line.ur }
  }
  const quota = tried.length > 0 && tried.every(t => t.quota)
  const busy = tried.some(t => t.busy)
  const line = quota
    ? {
        en: ` The live call (Talk to Hisaab) could not connect: every call model is at the free Gemini tier's per-minute limit right now (${tried.map(t => t.model).join(', ')}). It frees up within a minute. WhatsApp voice notes and typed entries do not need the call.`,
        ur: ` لائیو کال (حساب سے بات کریں) نہیں جڑ سکی: کال کے سب ماڈل اس وقت مفت جیمنائی کی فی منٹ حد پر ہیں۔ یہ ایک منٹ میں کھل جاتی ہے۔ واٹس ایپ وائس نوٹ اور لکھے پیغام کو کال کی ضرورت نہیں۔`,
      }
    : {
        en: ` The live call (Talk to Hisaab) could not connect (${why}). WhatsApp voice notes and typed entries do not need it; use them in the demo until this passes.`,
        ur: ` لائیو کال (حساب سے بات کریں) نہیں جڑ سکی۔ واٹس ایپ وائس نوٹ اور لکھے پیغام اس کے بغیر چلتے ہیں؛ جب تک یہ ٹھیک نہ ہو، ڈیمو میں وہی استعمال کریں۔`,
      }
  return {
    ...ai,
    ok: false,
    call,
    ms: Math.max(ai.ms || 0, call.ms || 0),
    code: ai.ok ? (quota ? 'call_quota' : busy ? 'call_busy' : 'call_failed') : ai.code,
    detail: ai.detail + line.en,
    detailUr: ai.detailUr + line.ur,
  }
}

/**
 * What the free tier looks like right now, for the 'ai' check: when the daily caps reset, which models
 * understanding is skipping after a limit (brain.modelCooldowns), and how many Live parse sessions are open.
 */
async function freeTierState(call) {
  const reset = dailyReset()
  let cooldowns = {}
  let liveSlots = null
  try {
    const brain = await import('./brain.js')
    if (typeof brain.modelCooldowns === 'function') cooldowns = brain.modelCooldowns()
  } catch {}
  try {
    const lp = await import('./liveparse.js')
    if (typeof lp.liveSlots === 'function') liveSlots = lp.liveSlots()
  } catch {}
  const resting = [...new Set([...Object.keys(cooldowns), ...(call?.resting || []), ...(call?.tried || []).filter(t => t.quota).map(t => t.model)])]
  return { tier: 'free', resetAt: reset.at, resetPkt: reset.pkt, resetPktUr: reset.pktUr, resting, liveSlots }
}

/** One closing sentence about models that are being skipped after a free-tier limit, when there are any. */
function restingLine(free) {
  if (!free.resting.length) return { en: '', ur: '' }
  const used = [...new Set([...config.liveTextModels, ...config.liveParseModels, ...config.parseModels, ...config.parseFallbackModels])]
  const others = used.some(m => !free.resting.includes(m))
  return {
    en: ` Skipped for now after a free-tier limit or error: ${free.resting.join(', ')}; ${others ? 'the other models carry on' : 'Hisaab tries them again by itself'}. Daily caps reset at ${free.resetPkt} Pakistan time.`,
    ur: ` مفت حد یا خرابی کی وجہ سے ابھی یہ ماڈل چھوڑے جا رہے ہیں: ⁦${free.resting.join(', ')}⁩؛ ${others ? 'باقی ماڈل کام کرتے رہیں گے' : 'حساب انہیں خود دوبارہ آزماتا ہے'}۔ روزانہ کی حد پاکستانی وقت کے مطابق ${free.resetPktUr} نئی ہوتی ہے۔`,
  }
}

// ---------------------------------------------------------------- voice

async function checkVoice(tenant) {
  const t0 = Date.now()
  let h
  try {
    h = await within(LIMITS.voice, () => speechHealth({ text: VOICE_SENTENCE, budgetMs: VOICE_BUDGET_MS, audio: true }))
  } catch (err) {
    h = { ok: false, reason: err instanceof Timeout ? 'timeout' : short(err), attempts: [] }
  }
  const ms = Date.now() - t0
  const off = tenant?.voice_replies ? null : { en: ' Voice replies are switched off for this shop in Settings.', ur: ' اس دکان کے لیے آواز والے جواب سیٹنگز میں بند ہیں۔' }
  const failed = (h.attempts || []).filter(a => !a.ok)
  const failedNote = failed.length ? ` First tried: ${failed.map(a => `${a.provider} (${plain(a.error)})`).join('; ')}.` : ''
  // Gemini TTS is the only voice with a small free-tier daily cap; say so when it is the one answering.
  const capped = h.provider === 'gemini'
    ? { en: ' Gemini TTS allows only 10 replies a day per model on the free tier; the Microsoft voice has no such cap.', ur: ' مفت سطح پر Gemini TTS ایک ماڈل سے روزانہ صرف 10 جواب دیتا ہے؛ Microsoft کی آواز پر ایسی کوئی حد نہیں۔' }
    : { en: '', ur: '' }
  if (h.ok) {
    return {
      ok: true, ms, code: failed.length ? 'fallback' : 'ok', provider: h.provider, model: h.model || null, seconds: h.seconds, audio: h.audio,
      detail: `Voice reply rendered by ${h.label} in ${secs(h.attempts.at(-1).ms)} (${h.seconds.toFixed(1)} s of audio).${failedNote}${capped.en}${off?.en || ''}`,
      detailUr: `آواز والا جواب ${h.label} سے ${urSecs(h.attempts.at(-1).ms)} میں تیار ہوا۔${capped.ur}${off?.ur || ''}`,
    }
  }
  if (h.reason === 'no_provider') {
    return { ok: false, ms, code: 'no_provider', detail: 'No voice provider is configured (TTS_ORDER in .env).', detailUr: 'کوئی آواز سروس سیٹ نہیں (‎.env میں TTS_ORDER)۔' }
  }
  return {
    ok: false, ms, code: 'failed',
    detail: `No voice provider answered${failed.length ? ` (${failed.map(a => `${a.provider}: ${plain(a.error)}`).join('; ')})` : h.reason ? ` (${plain(h.reason)})` : ''}. Replies will go as text only.`,
    detailUr: 'کوئی آواز سروس جواب نہیں دے رہی۔ جواب صرف لکھ کر جائیں گے۔',
  }
}

// ---------------------------------------------------------------- WhatsApp

async function checkWhatsApp(tenant, send) {
  const t0 = Date.now()
  const state = wa.whatsappState(tenant.id) || tenant.wa_status || 'disconnected'
  const who = tenant.wa_name || tenant.phone
  if (state !== 'open') {
    const reconnecting = ['starting', 'reconnecting', 'connecting'].includes(state)
    return {
      ok: false, ms: Date.now() - t0, code: reconnecting ? 'reconnecting' : 'not_connected', state,
      detail: reconnecting
        ? 'Reconnecting to WhatsApp… run the check again in a minute. If it stays like this, re-link from Settings.'
        : state === 'replaced'
          ? 'Another WhatsApp Web session took over this link. Re-link from Settings.'
          : 'WhatsApp is not connected. Link it again from Settings (Linked devices → Link a device).',
      detailUr: reconnecting ? 'واٹس ایپ دوبارہ جڑ رہا ہے… ایک منٹ بعد دوبارہ چیک کریں۔' : 'واٹس ایپ جڑا ہوا نہیں — سیٹنگز سے دوبارہ لنک کریں۔',
    }
  }
  if (!send) {
    return {
      ok: true, ms: Date.now() - t0, code: 'ok', state, sent: false,
      detail: `Connected as ${who}.`,
      detailUr: `واٹس ایپ جڑا ہوا ہے (${who})۔`,
    }
  }
  try {
    await within(LIMITS.whatsapp, () => wa.sendToSelf(tenant.id, '✅ Hisaab system check'))
    return {
      ok: true, ms: Date.now() - t0, code: 'sent', state, sent: true,
      detail: `Connected as ${who}. A test message was sent to your own "Message yourself" chat.`,
      detailUr: `واٹس ایپ جڑا ہوا ہے (${who})۔ آپ کی اپنی چیٹ میں ٹیسٹ پیغام بھیج دیا۔`,
    }
  } catch (err) {
    return {
      ok: false, ms: Date.now() - t0, code: 'send_failed', state, sent: false,
      detail: `Connected, but the test message did not go through: ${short(err)}.`,
      detailUr: 'واٹس ایپ جڑا ہوا ہے مگر ٹیسٹ پیغام نہیں گیا۔',
    }
  }
}

// ---------------------------------------------------------------- database

const PKT_HHMM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
// The dashboard's own clock ("Checked Today 11:46 pm", web/src/lib/format.js), so the row matches the line above it.
const PKT_AMPM = new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' })
const PKT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' })
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const UR_MONTHS = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر']
const ltr = s => `⁦${s}⁩`
const size = bytes => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** A backup's time in Pakistan time: { en: 'today 7:40 am', ur: 'آج صبح 7:40' }. */
export function backupWhen(ts, now = Date.now()) {
  const hhmm = PKT_HHMM.format(ts)
  const h = Number(hhmm.slice(0, 2))
  const en = PKT_AMPM.format(ts)
  const ur = `${h < 5 ? 'رات' : h < 12 ? 'صبح' : h < 16 ? 'دوپہر' : h < 19 ? 'شام' : 'رات'} ${h % 12 || 12}:${hhmm.slice(3)}`
  const day = PKT_DATE.format(ts)
  if (day === PKT_DATE.format(now)) return { en: `today ${en}`, ur: `آج ${ur}` }
  if (day === PKT_DATE.format(now - 864e5)) return { en: `yesterday ${en}`, ur: `کل ${ur}` }
  const [, m, d] = day.split('-').map(Number)
  return { en: `${d} ${EN_MONTHS[m - 1]} ${en}`, ur: `${d} ${UR_MONTHS[m - 1]}، ${ur}` }
}

const backupAge = ms => {
  const min = Math.floor(ms / 60e3)
  if (min < 1) return { en: 'just now', ur: 'ابھی' }
  if (min < 60) return { en: `${min} min ago`, ur: `${min} منٹ پہلے` }
  const h = Math.floor(min / 60)
  if (h < 48) return { en: `${h} h ago`, ur: `${h} گھنٹے پہلے` }
  return { en: `${Math.floor(h / 24)} days ago`, ur: `${Math.floor(h / 24)} دن پہلے` }
}

/**
 * The database row's backup sentence, from backup.js's lastBackup(). A late or failed backup is said plainly but does
 * not fail the row: the khata itself still works.
 */
export function backupLine(b, now = Date.now()) {
  // The folder as the founder knows it: "data\backups" inside the app folder, else the full path.
  const place = dir => {
    const rel = dir ? path.relative(config.root, dir) : ''
    return dir ? (rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : dir) : '?'
  }
  const where = place(b.dir)
  // A missing or unwritable BACKUP_DIR is named as written in .env, not as its hisaab-<8 hex> subfolder.
  const root = place(b.root || b.dir)
  const kept = { en: `${b.kept} kept in ${where}`, ur: `${ltr(where)} میں ${b.kept} بیک اپ محفوظ ${b.kept === 1 ? 'ہے' : 'ہیں'}` }
  const good = b.at ? { when: backupWhen(b.at, now), ago: backupAge(now - b.at), size: size(b.bytes || 0) } : null
  if (b.failed) {
    const at = backupWhen(b.error.at, now)
    const why = {
      dir_missing: `بیک اپ کا فولڈر نہیں ملا (${ltr(root)})۔ ڈرائیو لگائیں یا ‎.env میں BACKUP_DIR ٹھیک کریں`,
      dir_unwritable: `بیک اپ کے فولڈر میں لکھا نہیں جا سکتا (${ltr(root)})`,
      no_space: 'ڈسک بھر گئی ہے',
      bad_key: '‎.env میں BACKUP_KEY درست نہیں: 32 بائٹ چاہییں، یعنی 64 ہیکس یا 44 base64 حروف',
      check_failed: 'نئی کاپی SQLite کی جانچ (quick_check) میں ناکام رہی',
      timeout: 'بیک اپ میں 10 منٹ سے زیادہ لگ گئے',
      no_database: 'ڈیٹا بیس کی فائل نہیں ملی',
    }[b.error.code] || 'ایک خرابی آئی؛ سرور کے لاگ میں ⁦[backup]⁩ والی لائن دیکھیں'
    const prev = good
      ? { en: ` The last good backup is from ${good.when.en} (${good.ago.en}); ${kept.en}.`, ur: ` آخری ٹھیک بیک اپ ${good.when.ur} (${good.ago.ur}) کا ہے؛ ${kept.ur}۔` }
      : b.error.code === 'dir_missing'
        ? { en: '', ur: '' }
        : { en: ` No earlier backup was found in ${where}.`, ur: ` ${ltr(where)} میں کوئی پچھلا بیک اپ نہیں ملا۔` }
    return {
      en: ` The last backup FAILED (${at.en}): ${b.error.message}${prev.en}`,
      ur: ` آخری بیک اپ نہیں بن سکا (${at.ur}): ${why}۔${prev.ur}`,
    }
  }
  if (!good) {
    return b.running
      ? { en: ' The first backup is being made now.', ur: ' پہلا بیک اپ ابھی بن رہا ہے۔' }
      : { en: ` No backup yet: the server makes one when it starts and every ${b.everyHours} hours.`, ur: ` ابھی تک کوئی بیک اپ نہیں بنا: سرور چلتے ہی ایک بیک اپ بناتا ہے، پھر ہر ${b.everyHours} گھنٹے بعد۔` }
  }
  const enc = b.encrypted ? { en: ', encrypted', ur: '، انکرپٹ شدہ' } : { en: '', ur: '' }
  if (b.stale) {
    const h = Math.floor((now - b.at) / 3600e3)
    return {
      en: ` The last backup is ${h} hours old (${good.when.en}, ${good.size}${enc.en}); ${kept.en}. Backups run every ${b.everyHours} hours while the server runs; run node scripts/backup-now.mjs to make one now.`,
      ur: ` آخری بیک اپ ${h} گھنٹے پرانا ہے (${good.when.ur}، ${ltr(good.size)}${enc.ur})؛ ${kept.ur}۔ سرور چلتا رہے تو ہر ${b.everyHours} گھنٹے بعد بیک اپ بنتا ہے؛ ابھی بنانے کے لیے ${ltr('node scripts/backup-now.mjs')} چلائیں۔`,
    }
  }
  return {
    en: ` Last backup ${good.when.en} (${good.ago.en}), ${good.size}${enc.en}; ${kept.en}.`,
    ur: ` آخری بیک اپ ${good.when.ur} (${good.ago.ur})، ${ltr(good.size)}${enc.ur}؛ ${kept.ur}۔`,
  }
}

/**
 * What any other shop sees: whether backups are on time, nothing about the server (no folder, size, count or
 * commands). The backups are server-wide, so the time is the server's newest backup.
 */
export function shopBackupLine(b, now = Date.now()) {
  if (!b.at) return b.running ? { en: ' The first backup is being made now.', ur: ' پہلا بیک اپ ابھی بن رہا ہے۔' } : { en: ' No backup yet.', ur: ' ابھی تک کوئی بیک اپ نہیں بنا۔' }
  const when = backupWhen(b.at, now)
  if (b.stale) {
    const h = Math.floor((now - b.at) / 3600e3)
    return { en: ` Backups are late: the last one was made ${when.en} (${h} hours ago).`, ur: ` بیک اپ میں دیر ہو گئی ہے: آخری بیک اپ ${when.ur} بنا تھا (${h} گھنٹے پہلے)۔` }
  }
  return { en: ` Backups OK: the last one was made ${when.en}.`, ur: ` بیک اپ ٹھیک ہیں: آخری بیک اپ ${when.ur} بنا۔` }
}

// The founder's own browser on the server's computer: a direct loopback connection with a local Host and no
// forwarding header. A tunnel or proxy (cloudflared, PUBLIC_URL) adds a forwarding header or a public Host.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
export function onThisComputer(req) {
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return false
  const h = req.headers || {}
  if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['cf-connecting-ip'] || h['x-forwarded-host']) return false
  return LOCAL_HOSTS.has(String(h.host || '').toLowerCase().replace(/:\d+$/, ''))
}

function backupState(operator) {
  const b = lastBackup()
  let line
  try {
    line = operator ? backupLine(b) : shopBackupLine(b)
  } catch (err) {
    line = { en: ` Backup status unknown${operator ? ` (${short(err)})` : ''}.`, ur: ' بیک اپ کی صورت حال معلوم نہیں ہو سکی۔' }
  }
  const info = operator
    ? { at: b.at, ageMs: b.ageMs ?? null, bytes: b.bytes ?? null, kept: b.kept, dir: b.dir, encrypted: Boolean(b.encrypted), running: Boolean(b.running), stale: Boolean(b.stale), failed: Boolean(b.failed), error: b.error || null }
    : { at: b.at, ageMs: b.ageMs ?? null, running: Boolean(b.running), stale: Boolean(b.stale) }
  return { info, line }
}

function checkDatabase(tenantId, operator) {
  const t0 = Date.now()
  const backup = backupState(operator)
  try {
    const counts = one(
      `SELECT (SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND merged_into IS NULL) AS people,
              (SELECT COUNT(*) FROM entries WHERE tenant_id = ? AND voided_at IS NULL) AS entries`,
      tenantId, tenantId,
    )
    // A committed write that changes nothing: the database file is writable and not locked.
    run('UPDATE tenants SET created_at = created_at WHERE id = ?', tenantId)
    // The folder that holds voice notes is writable too.
    const probe = path.join(config.dataDir, `.write-check-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    const st = fs.statfsSync(config.dataDir)
    const free = Number(st.bavail) * Number(st.bsize)
    const ms = Date.now() - t0
    const base = { ms, people: counts.people, entries: counts.entries, freeBytes: free, backup: backup.info }
    if (free < LOW_DISK) {
      return {
        ...base, ok: false, code: 'low_disk',
        detail: `Database works, but only ${gb(free)} is free on this disk. Free some space: voice notes are saved here.${backup.line.en}`,
        detailUr: `ڈیٹا بیس ٹھیک ہے مگر ڈسک پر صرف ${ltr(gb(free))} جگہ باقی ہے۔ کچھ جگہ خالی کریں۔${backup.line.ur}`,
      }
    }
    return {
      ...base, ok: true, code: 'ok',
      detail: `Read and write OK in ${ms} ms · ${counts.people} people · ${counts.entries} entries · ${gb(free)} free.${backup.line.en}`,
      detailUr: `ڈیٹا بیس ٹھیک ہے — ${counts.people} لوگ، ${counts.entries} اندراج، ${ltr(gb(free))} جگہ خالی۔${backup.line.ur}`,
    }
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, code: 'error', backup: backup.info, detail: `Database error: ${short(err)}${backup.line.en}`, detailUr: `ڈیٹا بیس میں مسئلہ ہے۔${backup.line.ur}` }
  }
}

// ---------------------------------------------------------------- routes

const tenantOf = (req, res) => {
  if (req.tenant?.id) return req.tenant
  res.status(401).json({ error: 'signed_out' })
  return null
}

router.get('/system-check', async (req, res) => {
  const tenant = tenantOf(req, res)
  if (!tenant) return
  const now = Date.now()
  const last = lastRun.get(tenant.id)
  if (running.has(tenant.id) || (last && now - last < CHECK_GAP_MS)) {
    const retryAfter = Math.max(1, Math.ceil((CHECK_GAP_MS - (now - (last || now))) / 1000))
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'too_soon', retryAfter })
  }
  for (const [id, at] of lastRun) if (now - at > 3600e3) lastRun.delete(id)
  lastRun.set(tenant.id, now)
  running.add(tenant.id)
  try {
    const fresh = getTenant(tenant.id) || tenant
    const send = ['1', 'true', 'yes'].includes(String(req.query.send || '').toLowerCase())
    const voiceP = checkVoice(fresh)
    const textP = config.geminiKey ? parseCheck({ text: AI_SENTENCE }, LIMITS.ai) : null
    const callP = config.geminiKey ? checkCall(fresh) : null
    // The rendered Urdu sentence goes back in as a real voice note: the path WhatsApp voice notes take.
    const noteP = voiceP.then(v => {
      if (!config.geminiKey) return null
      if (!v.ok || !v.audio) return { ok: false, skipped: true, ms: 0 }
      const buffer = Buffer.from(v.audio.slice(v.audio.indexOf(',') + 1), 'base64')
      return parseCheck({ audio: { mimeType: 'audio/ogg', buffer } }, Math.max(3000, TOTAL_MS - (Date.now() - now)))
    })
    const [text, note, call, voice, whatsapp] = await Promise.all([textP, noteP, callP, voiceP, checkWhatsApp(fresh, send)])
    let ai
    if (config.geminiKey) {
      const free = await freeTierState(call)
      const checked = withCall(aiResult(text, note), call)
      const tail = restingLine(free)
      ai = { ...checked, freeTier: free, detail: checked.detail + tail.en, detailUr: checked.detailUr + tail.ur }
    } else {
      ai = { ok: false, ms: 0, code: 'no_key', detail: 'GEMINI_API_KEY is missing in .env (a free key from aistudio.google.com/apikey).', detailUr: '‎.env میں GEMINI_API_KEY موجود نہیں (مفت key: ‎aistudio.google.com/apikey)۔' }
    }
    const database = checkDatabase(tenant.id, onThisComputer(req))
    const checks = [
      { id: 'ai', ...ai },
      { id: 'voice', ...voice },
      { id: 'whatsapp', ...whatsapp },
      { id: 'database', ...database },
    ]
    const ok = checks.every(c => c.ok)
    console.log(`[ops] system check ${tenant.id}: ${checks.map(c => `${c.id} ${c.ok ? 'ok' : c.code} ${c.ms}ms`).join(', ')}`)
    res.json({ ok, ms: Date.now() - now, ranAt: now, checks })
  } finally {
    running.delete(tenant.id)
  }
})

router.get('/sample-data', (req, res) => {
  const tenant = tenantOf(req, res)
  if (!tenant) return
  res.json(sampleStatus(tenant.id))
})

router.post('/sample-data', (req, res) => {
  const tenant = tenantOf(req, res)
  if (!tenant) return
  try {
    const added = seedSample(tenant.id)
    publish(tenant.id, 'ledger')
    console.log(`[ops] sample data added for ${tenant.id}: ${added.people} people, ${added.entries} entries`)
    res.status(201).json({ ok: true, added: added.people, details: added })
  } catch (err) {
    if (err.code === 'already_has_sample') return res.status(409).json({ error: 'already_has_sample', ...sampleStatus(tenant.id) })
    if (err.code === 'schema_not_ready') return res.status(503).json({ error: 'schema_not_ready' })
    throw err
  }
})

router.delete('/sample-data', (req, res) => {
  const tenant = tenantOf(req, res)
  if (!tenant) return
  const removed = removeSample(tenant.id)
  publish(tenant.id, 'ledger')
  console.log(`[ops] sample data removed for ${tenant.id}: ${removed.people} people, ${removed.entries} entries, ${removed.lists} lists`)
  res.json({ ok: true, removed: removed.people, details: removed })
})

export default router
