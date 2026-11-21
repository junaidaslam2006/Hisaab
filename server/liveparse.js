import { spawn } from 'node:child_process'
import { Modality } from '@google/genai'
import { config } from './config.js'
import { gemini, SYSTEM, SCHEMA, rosterText, clean, liveTimeoutFor } from './brain.js'

// Voice notes through Gemini Live: open a session, stream the note as 16 kHz PCM, and take the model's single
// submit_operations tool call as the parse. Same output shape as brain.understand(); any failure throws so the
// caller falls back to generateContent.

const TOOL_NAME = 'submit_operations'
const TOOL_DESCRIPTION = 'Submit the ledger operations for the voice note you just heard. Call exactly once per voice note.'

/** SCHEMA (JSON Schema) as the OpenAPI subset that `parameters` takes: Type names, `nullable` instead of a "null" type. */
export function openApiSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const out = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type') {
      const types = [value].flat()
      out.type = String(types.find(t => t !== 'null')).toUpperCase()
      if (types.includes('null')) out.nullable = true
    } else if (key === 'properties') out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, openApiSchema(v)]))
    else if (key === 'items') out.items = openApiSchema(value)
    else out[key] = value
  }
  return out
}

/**
 * Per-model Live settings (probe and eval numbers in eval/README.md, "Free tier").
 * The 2.5 native-audio models ("native dialogue") close the session with 1011 "Internal error occurred" the moment they
 * try to call a tool declared with `parametersJsonSchema` (on v1alpha they ignore it and send operations in a shape of
 * their own), but call it correctly when it is declared with the OpenAPI `parameters` schema. Their default thinking
 * added 0.6–2.4 s before the tool call in the probe, so it is off. Their malformed calls (quoted keys, operations as
 * JSON strings) are read by brain.clean(); a call with nothing in it is a failed attempt (emptyIsFailure).
 * Every other Live model keeps the JSON schema and its own defaults.
 */
const NATIVE_AUDIO = { tool: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: openApiSchema(SCHEMA) }, thinkingBudget: 0, emptyIsFailure: true }
const STANDARD = { tool: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parametersJsonSchema: SCHEMA }, thinkingBudget: null, emptyIsFailure: false }
export const liveProfile = model => (/native-audio/.test(model) ? NATIVE_AUDIO : STANDARD)

const sessionRules = what => `

THIS SESSION
You will get exactly ONE ${what} from the shopkeeper. Do not talk to them. As soon as it ends, call submit_operations
exactly once with the transcripts, language, operations, reply_urdu and reply_roman for the whole ${what}.`

const nudge = what => `Call submit_operations now with the operations for the ${what} you just got. Do not speak.`
// Notes at least this long are checked for a partial answer (dense speech measured at ~9 transcript characters/second).
const PARTIAL_CHECK_SECONDS = 20

/** Any audio container -> raw 16-bit little-endian mono PCM at 16 kHz (what Live expects). */
export function toPcm16k(buffer) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], { windowsHide: true })
    const out = []
    const err = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('error', reject)
    p.stdin.on('error', () => {})
    p.on('close', code => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(-300)}`))))
    p.stdin.end(buffer)
  })
}

/** Seconds of audio in a 16 kHz mono s16le buffer. */
export const pcmSeconds = pcm => pcm.length / 32000

const fail = (message, extra = {}) => Object.assign(new Error(message), extra)
// A dropped or refused session is worth retrying; a bad key or a blocked project is not.
const NOT_RETRYABLE = /API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED|\b(401|403)\b/i
const sessionError = (message, cause) => fail(message, { transient: !NOT_RETRYABLE.test(`${message} ${cause?.message || ''}`), cause })

// Live sessions this process holds for parsing at once (LIVE_PARSE_CONCURRENCY): the free key accepted 5 open sessions
// at once (31 Oct; more not measured), so a burst of messages never depends on unmeasured capacity. Over the limit a
// message waits up to LIVE_SLOT_WAIT_MS for a free slot (part of the Live attempt, so it counts against the parse
// patience), then the generateContent lane answers it.
let slotsInUse = 0
const slotQueue = []
function slotRelease() {
  let released = false
  return () => {
    if (released) return
    released = true
    const next = slotQueue.shift()
    if (next) next.grant()
    else slotsInUse--
  }
}

/** Wait for a free Live session slot; resolves with its release function. Rejects (transient) after `waitMs` or on abort. */
export function takeLiveSlot(signal, waitMs = config.liveSlotWaitMs) {
  if (signal?.aborted) return Promise.reject(fail('aborted', { transient: true }))
  if (slotsInUse < config.liveParseConcurrency) {
    slotsInUse++
    return Promise.resolve(slotRelease())
  }
  return new Promise((resolve, reject) => {
    const entry = {}
    const leave = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      const i = slotQueue.indexOf(entry)
      if (i >= 0) slotQueue.splice(i, 1)
    }
    const onAbort = () => (leave(), reject(fail('aborted', { transient: true })))
    const timer = setTimeout(() => (leave(), reject(fail(`live_busy: no free Live session slot within ${waitMs}ms (${slotsInUse} in use)`, { transient: true }))), waitMs)
    entry.grant = () => (leave(), resolve(slotRelease()))
    signal?.addEventListener('abort', onAbort, { once: true })
    slotQueue.push(entry)
  })
}

/** Live parse sessions open now and messages waiting for one (for the system check and tests). */
export const liveSlots = () => ({ inUse: slotsInUse, waiting: slotQueue.length, max: config.liveParseConcurrency })

/**
 * Parse one voice note (or one text message) in a fresh Live session. `pcm` (16 kHz s16le) may be passed in when the
 * caller already converted the note; the timeout then grows with the note's length (liveTimeoutFor).
 */
export async function liveParse({ model, audio, pcm: givenPcm = null, text, customers = [], lists = [], signal, timeoutMs = null, options = {} }) {
  const t0 = Date.now()
  const what = audio ? 'WhatsApp voice note' : 'WhatsApp text message'
  const pcm = audio ? givenPcm || (await toPcm16k(audio.buffer)) : null
  if (audio && pcm.length < 16000) throw fail('live_empty_audio: voice note is shorter than half a second', { transient: false })
  if (!audio && !String(text || '').trim()) throw fail('live_empty_text', { transient: false })
  signal?.throwIfAborted()
  const seconds = pcm ? pcmSeconds(pcm) : 0
  timeoutMs ||= liveTimeoutFor(seconds)
  const profile = liveProfile(model)
  const thinkingBudget = options.thinkingBudget ?? profile.thinkingBudget
  const release = await takeLiveSlot(signal)

  return new Promise((resolve, reject) => {
    let session = null
    let settled = false
    let nudged = false
    const onAbort = () => finish(fail('aborted', { transient: true }))
    const finish = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      try {
        session?.close()
      } catch {}
      release()
      if (err) reject(err)
      else resolve(value)
    }
    const timer = setTimeout(() => finish(fail(`live_timeout: no tool call from ${model} within ${timeoutMs}ms`, { transient: true })), timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) return onAbort()

    const onmessage = msg => {
      const call = msg.toolCall?.functionCalls?.find(c => c.name === TOOL_NAME)
      if (call) {
        const parsed = clean(call.args || {}, { customers, lists, text })
        const heard = Math.max(parsed.transcriptRoman.length, parsed.transcriptUrdu.length)
        // A call with neither operations nor a transcript heard nothing (seen only from native audio): a failed attempt,
        // retried in a new session or answered by generateContent, never a "samajh nahi aaya" reply. (Handing the call
        // back in the same session was tried: the session closed 1011, or the second call was as malformed as the first.)
        if (profile.emptyIsFailure && !parsed.operations.length && !heard) {
          return finish(fail(`live_empty_answer: ${model} called ${TOOL_NAME} with no operations and no transcript`, { transient: true }))
        }
        try {
          session?.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response: { output: { status: 'received' } } }] })
        } catch {}
        // A long note answered with no operations at all, or (after the nudge) with a transcript far shorter than
        // the audio, was only partly heard: try again (or let generateContent answer) instead of replying from a
        // fragment and silently dropping the rest of the entries.
        if (seconds >= PARTIAL_CHECK_SECONDS && (!parsed.operations.length || (nudged && heard < 3 * seconds))) {
          return finish(fail(`live_partial: ${model} gave ${parsed.operations.length} operations and ${heard} transcript characters for a ${Math.round(seconds)} s note`, { transient: true }))
        }
        return finish(null, { ...parsed, model, ms: Date.now() - t0, path: 'live', nudged })
      }
      // The model answered with speech or text instead of the tool: ask once, then let generateContent take over.
      if (msg.serverContent?.turnComplete) {
        if (nudged) return finish(fail(`live_no_tool: ${model} answered without calling ${TOOL_NAME}`, { transient: true }))
        nudged = true
        try {
          session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: nudge(what) }] }], turnComplete: true })
        } catch (err) {
          finish(err)
        }
      }
    }

    let connecting
    try {
      connecting = gemini().live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `${SYSTEM}${sessionRules(what)}\n\n${rosterText(customers, lists)}`,
          tools: [{ functionDeclarations: [profile.tool] }],
          // The whole note is already recorded: mark its start and end ourselves instead of waiting for silence.
          realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          ...(thinkingBudget != null ? { thinkingConfig: { thinkingBudget } } : {}),
        },
        callbacks: {
          onmessage,
          onerror: e => finish(sessionError(`live_error: ${e?.message || 'Live API error'}`)),
          onclose: e => finish(sessionError(`live_closed ${e?.code || ''} ${e?.reason || ''}`.trim())),
        },
      })
    } catch (err) {
      return finish(sessionError(`live_connect_failed: ${err?.message || err}`, err))
    }
    connecting
      .then(s => {
        session = s
        if (settled) return s.close()
        if (!audio) return s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `MESSAGE: ${text}` }] }], turnComplete: true })
        s.sendRealtimeInput({ activityStart: {} })
        const CHUNK = 32000 // one second of audio per message
        for (let i = 0; i < pcm.length; i += CHUNK) {
          s.sendRealtimeInput({ audio: { data: pcm.subarray(i, i + CHUNK).toString('base64'), mimeType: 'audio/pcm;rate=16000' } })
        }
        s.sendRealtimeInput({ activityEnd: {} })
      }, err => finish(sessionError(`live_connect_failed: ${err?.message || err}`, err)))
      .catch(err => finish(sessionError(`live_send_failed: ${err?.message || err}`, err)))
  })
}
