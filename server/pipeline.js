import fs from 'node:fs'
import path from 'node:path'
import { config, baseUrl } from './config.js'
import { one, run, json } from './db.js'
import * as ledger from './ledger.js'
import { understand } from './brain.js'
import { speak, toVoiceNote, durationOf } from './speech.js'
import { buildReply, summarize, HELP_TEXT, HELP_SPOKEN, BOT_MARK } from './replies.js'
import { publish } from './realtime.js'
import { getTenant, setTenantSystem } from './tenants.js'
import { createMagicLink } from './auth.js'
import { newId, dayKey } from './util.js'

const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const DASHBOARD_RE = /^\s*(dashboard|dash|login|log in|link|website|web)\s*[.!?]*\s*$/i
const HELP_RE = /^\s*(help|madad|menu|commands|\?)\s*[.!?]*\s*$/i
const LISTS_RE = /^\s*(lists?|meri lists?|my lists?|میری لسٹیں|لسٹیں|لسٹ)\s*[.!?]*\s*$/i
// Sent once to the shop's own chat when Google is slow, so the owner knows the note arrived.
export const INTERIM_TEXT = 'Mil gaya — likh raha hoon, thora waqt lag raha hai ⏳'
const NO_FIELDS = { customer_id: null, customer_name: null, customer_name_urdu: null, amount: null, full_settlement: false, items: [], threshold: null, phone: null, list_name: null, list_name_urdu: null, list_kind: null }

/** Lists the parser sees. Older ledgers had none; never let that block a message. */
function shopLists(tenantId) {
  try {
    return typeof ledger.listLists === 'function' ? ledger.listLists(tenantId) : []
  } catch {
    return []
  }
}

export function mediaDir(tenantId) {
  const dir = path.join(config.mediaDir, tenantId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const media = name => (name ? `/media/${name}` : null)

/** The shape the dashboard's activity log uses. */
export function publicMessage(m) {
  return {
    id: m.id,
    channel: m.channel,
    kind: m.kind,
    text: m.text,
    audioUrl: media(m.audio),
    imageUrl: media(m.image),
    seconds: m.seconds,
    transcript: m.transcript_ur,
    transcriptRoman: m.transcript_roman,
    language: m.language,
    results: json(m.results, []),
    replyText: m.reply_text ? m.reply_text.replace(BOT_MARK, '') : null,
    replySpoken: m.reply_spoken,
    replyAudioUrl: media(m.reply_audio),
    replySeconds: m.reply_seconds,
    status: m.status,
    error: m.error,
    ms: m.ms,
    createdAt: m.created_at,
  }
}

function update(tenantId, id, patch) {
  const keys = Object.keys(patch)
  if (keys.length) run(`UPDATE messages SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => patch[k]), id)
  publish(tenantId, 'message', publicMessage(one('SELECT * FROM messages WHERE id = ?', id)))
}

function useQuota(tenantId) {
  const day = dayKey(Date.now())
  run('INSERT INTO usage (tenant_id, day, messages) VALUES (?, ?, 1) ON CONFLICT(tenant_id, day) DO UPDATE SET messages = messages + 1', tenantId, day)
  return one('SELECT messages FROM usage WHERE tenant_id = ? AND day = ?', tenantId, day).messages <= config.dailyMessageLimit
}

function friendlyError(err) {
  // brain.understand() names its own failures: busy (Google overloaded / slow), network, ai_config.
  if (['busy', 'network', 'ai_config'].includes(err?.code)) return err.code
  const e = String(err?.message || err)
  if (/quota|429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|high demand|overloaded/i.test(e)) return 'busy'
  if (/denied|PERMISSION|API key|403|401|UNAUTHENTICATED|missing/i.test(e)) return 'ai_config'
  if (/timeout|abort|fetch failed|ENOTFOUND|ECONN/i.test(e)) return 'network'
  return 'not_understood'
}

// Per shop: messages are understood in parallel but written in arrival order,
// so "undo" or "nahi 450 the" always hits the entry the shopkeeper meant.
// Each turn waits for the previous one; a turn that ends early (help, error) still
// counts as finished only after everything before it has finished.
const turns = new Map()

/** Take this shop's next place in line. Call synchronously, in arrival order. */
export function reserveTurn(tenantId) {
  const previous = turns.get(tenantId) || Promise.resolve()
  let release
  const gate = new Promise(resolve => (release = resolve))
  const mine = previous.then(() => gate)
  turns.set(tenantId, mine)
  mine.then(() => {
    if (turns.get(tenantId) === mine) turns.delete(tenantId)
  })
  return { wait: () => previous, release }
}

export async function handleMessage(tenantId, args, reserved = null) {
  const turn = reserved || reserveTurn(tenantId)
  try {
    return await processMessage(tenantId, args, turn.wait, turn.release)
  } finally {
    turn.release()
  }
}

/** True if this WhatsApp message was already handled (dedupes catch-up after a restart). */
export function alreadyHandled(tenantId, waId) {
  return Boolean(waId && one('SELECT 1 AS x FROM messages WHERE tenant_id = ? AND wa_id = ?', tenantId, waId))
}

/**
 * Record an incoming WhatsApp message the instant it arrives, before any download or AI call. If the server
 * stops mid-way the row survives, so the owner can be told to resend it, and a redelivery is not processed twice.
 */
export function registerIncoming(tenantId, { id, channel, kind, waId, sentAt }) {
  run(
    'INSERT OR IGNORE INTO messages (id, tenant_id, channel, kind, status, wa_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, tenantId, channel, kind, 'received', waId, sentAt || Date.now(),
  )
}

/** Mark a message as failed (e.g. its voice note could not be downloaded) so it never sits in 'received'. */
export function markFailed(tenantId, id, error) {
  update(tenantId, id, { status: 'error', error })
}

/** Resolves when no shop has a message in progress (used for a clean shutdown). */
export function idle() {
  return Promise.all([...turns.values()])
}

const SAVED_LABEL = { credit: 'Udhaar', payment: 'Wasooli', purchase: 'Supplier se maal', supplier_payment: 'Supplier ko adaigi' }
const CHANGES = new Set([...Object.keys(SAVED_LABEL), 'undo', 'correct', 'set_phone', 'create_list', 'move_to_list'])

/**
 * The reply when something broke AFTER the ledger write committed: a plain card of what was saved, built only from
 * the ledger's own results, that never asks to send the message again when anything was changed.
 */
function savedReply(results) {
  const lines = []
  for (const r of results) {
    try {
      const label = SAVED_LABEL[r?.type]
      const amount = Number(r?.entry?.amount)
      if (r?.status === 'ok' && label && Number.isFinite(amount)) lines.push(`• ${label}: ${r.customer?.name || '—'} — Rs ${amount.toLocaleString('en-US')}`)
    } catch {}
  }
  if (!results.some(r => r?.status === 'ok' && CHANGES.has(r?.type))) {
    return {
      text: `${BOT_MARK}*Hisaab*\nJawab banane mein masla hua. Kuch likha ya badla nahi gaya — sawal dobara bhej sakte hain.`,
      spoken: 'جواب بنانے میں مسئلہ ہوا۔ کچھ لکھا یا بدلا نہیں گیا، سوال دوبارہ بھیج سکتے ہیں۔',
    }
  }
  return {
    text: `${BOT_MARK}*Hisaab* ✓\n${lines.length ? lines.join('\n') : 'Aap ki baat hisaab mein likh li gayi.'}\n_Dobara na bhejein — poori tafseel dashboard par hai._`,
    spoken: 'حساب میں لکھ لیا ہے۔ دوبارہ نہ بھیجیں، پوری تفصیل ڈیش بورڈ پر ہے۔',
  }
}

/** summarize() for the activity log, or the bare type/status of each result if even that fails. */
function safeSummary(results) {
  try {
    return JSON.stringify(summarize(results))
  } catch {
    return JSON.stringify(results.map(r => ({ type: r?.type ?? null, status: r?.status ?? null })))
  }
}

function magicLinkReply(tenantId) {
  const token = createMagicLink(tenantId)
  return `Aap ke dashboard ka login link (15 minute tak chalega):\n${baseUrl()}/auth/magic?t=${token}\n\n_Yeh link kisi aur ko na bhejein._`
}

async function processMessage(tenantId, { channel, audio, image, text, id = newId('m'), waId = null, sentAt = null, onInterim = null }, waitTurn, releaseTurn) {
  const tenant = getTenant(tenantId)
  const dir = mediaDir(tenantId)
  const kind = audio ? 'voice' : image ? 'photo' : 'text'
  // When the shopkeeper actually sent it (catch-up after downtime), never in the future or > 2 days back.
  const at = sentAt ? Math.min(Date.now(), Math.max(sentAt, Date.now() - 2 * 864e5)) : null
  registerIncoming(tenantId, { id, channel, kind, waId, sentAt: at })
  update(tenantId, id, { kind, text: text || null })
  const now = Date.now()
  setTenantSystem(tenantId, { last_message_at: now, ...(tenant.first_message_at ? {} : { first_message_at: now }) })
  publish(tenantId, 'tenant')

  const finish = async (replyText, spoken, extra = {}) => {
    let voice = null
    if (spoken && tenant.voice_replies) {
      voice = await speak(spoken, path.join(dir, `out-${id}.ogg`)).catch(() => null)
    }
    update(tenantId, id, {
      reply_text: replyText,
      reply_spoken: spoken || null,
      reply_audio: voice ? `out-${id}.ogg` : null,
      reply_seconds: voice?.seconds ?? null,
      status: extra.status || 'done',
      ...extra.patch,
    })
    return { text: replyText, voice }
  }

  // The ledger results once applyOperations has committed. From then on a failure must never ask for a resend:
  // the entries are saved, and sending the note again would write them twice.
  let written = null
  try {
    let geminiAudio = null
    let geminiImage = null
    if (audio) {
      const file = path.join(dir, `in-${id}.ogg`)
      const mime = (audio.mimeType || '').split(';')[0].trim()
      if (mime === 'audio/ogg' || mime === 'audio/opus') fs.writeFileSync(file, audio.buffer)
      else await toVoiceNote(audio.buffer, file)
      geminiAudio = { mimeType: 'audio/ogg', buffer: fs.readFileSync(file) }
      run('UPDATE messages SET audio = ?, seconds = ? WHERE id = ?', `in-${id}.ogg`, await durationOf(file), id)
    }
    if (image) {
      const name = `in-${id}.${IMAGE_EXT[image.mimeType] || 'jpg'}`
      fs.writeFileSync(path.join(dir, name), image.buffer)
      run('UPDATE messages SET image = ? WHERE id = ?', name, id)
      geminiImage = image
    }

    if (!audio && !image && DASHBOARD_RE.test(text || '')) {
      return finish(`${BOT_MARK}*Hisaab*\n${magicLinkReply(tenantId)}`, null, { patch: { results: JSON.stringify([{ type: 'dashboard_link', status: 'ok' }]) } })
    }
    if (!audio && !image && HELP_RE.test(text || '')) {
      return finish(`${BOT_MARK}${HELP_TEXT}`, HELP_SPOKEN, { patch: { results: JSON.stringify([{ type: 'help', status: 'ok' }]) } })
    }
    if (!useQuota(tenantId)) {
      return finish(`${BOT_MARK}*Hisaab*\nAaj ki hadd (${config.dailyMessageLimit} messages) poori ho gayi. Kal phir se bhejein.`, null, { status: 'error', patch: { error: 'limit' } })
    }

    update(tenantId, id, { status: 'thinking' })
    const rosterAt = Date.now()
    // "lists" / "meri lists" typed on WhatsApp: answer from the ledger without an AI call.
    const parsed = !audio && !image && LISTS_RE.test(text || '')
      ? { transcriptUrdu: '', transcriptRoman: text.trim(), language: null, replyUrdu: null, operations: [{ type: 'lists_summary', ...NO_FIELDS }], model: null, ms: 0 }
      : await understand({
        audio: geminiAudio,
        image: geminiImage,
        // A photo's caption ("Umar ka bill", "yeh sab wapsi hai") tells Gemini who and which direction.
        text: audio ? null : text,
        customers: ledger.listCustomers(tenantId),
        lists: shopLists(tenantId),
        onInterim: onInterim ? () => onInterim(INTERIM_TEXT) : null,
      })

    // "dashboard" said in a voice note: answer with a login link instead of a ledger operation.
    const wantsLink = parsed.operations.some(op => op.type === 'dashboard_link')
    const operations = parsed.operations.filter(op => op.type !== 'dashboard_link')

    await waitTurn()
    ledger.adoptNewCustomers(tenantId, operations, rosterAt)
    const results = ledger.applyOperations(tenantId, operations, {
      source: channel === 'whatsapp' ? `whatsapp_${kind}` : `web_${kind}`,
      channel,
      messageId: id,
      createdAt: at,
    })
    written = results
    releaseTurn()

    const summary = summarize(results)
    let reply = operations.length || !wantsLink ? buildReply(results, parsed, { tenant: getTenant(tenantId), totals: ledger.overview(tenantId).totals }) : null
    if (wantsLink) {
      summary.push({ type: 'dashboard_link', status: 'ok' })
      const link = magicLinkReply(tenantId)
      reply = reply
        ? { text: `${reply.text}\n\n${link}`, spoken: reply.spoken }
        : { text: `${BOT_MARK}*Hisaab*\n${link}`, spoken: 'ڈیش بورڈ کا لنک بھیج دیا ہے۔' }
    }
    run(
      'UPDATE messages SET transcript_ur = ?, transcript_roman = ?, language = ?, results = ?, model = ?, ms = ? WHERE id = ?',
      parsed.transcriptUrdu || null, parsed.transcriptRoman || null, parsed.language || null, JSON.stringify(summary), parsed.model, parsed.ms, id,
    )
    update(tenantId, id, { status: 'speaking' })
    return await finish(reply.text, reply.spoken)
  } catch (err) {
    console.error(`[pipeline ${tenantId}]`, err?.message || err)
    releaseTurn()
    if (written) {
      const fallback = savedReply(written)
      return finish(fallback.text, fallback.spoken, { patch: { results: safeSummary(written) } })
    }
    const code = friendlyError(err)
    // Only a genuine failure of ours says "samajh nahi aaya"; Google being busy or the internet being down never does.
    const REPLIES = {
      busy: ['ابھی سسٹم مصروف ہے، کچھ لکھا نہیں گیا۔ ایک منٹ بعد دوبارہ بھیجیں۔', 'Abhi system masroof hai, kuch likha nahi gaya. Ek minute baad dobara bhejein.'],
      network: ['انٹرنیٹ کا مسئلہ ہے، کچھ لکھا نہیں گیا۔ ایک منٹ بعد دوبارہ بھیجیں۔', 'Internet ka masla hai, kuch likha nahi gaya. Ek minute baad dobara bhejein.'],
      ai_config: ['حساب کی سیٹنگ میں مسئلہ ہے، کچھ لکھا نہیں گیا۔ ڈیش بورڈ پر سسٹم چیک کریں۔', 'Hisaab ki setting mein masla hai, kuch likha nahi gaya. Dashboard par system check karein.'],
      not_understood: ['معاف کیجیے، ٹھیک سے سمجھ نہیں آیا۔ ایک بار دوبارہ بول دیں۔', 'Maaf kijiye, samajh nahi aaya. Dobara bol dein.'],
    }
    const [spoken, textReply] = REPLIES[code] || REPLIES.not_understood
    return finish(`${BOT_MARK}*Hisaab*\n${textReply}`, spoken, { status: 'error', patch: { error: code } })
  }
}
