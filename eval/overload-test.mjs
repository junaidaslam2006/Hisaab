// Overload policy test: injects 503s, hangs, per-minute and per-day 429s, Live failures and auth errors into the
// real understand() / pipeline path (the Gemini client is replaced in memory; no request leaves the machine).
//   HISAAB_DATA_DIR=<scratch dir> node eval/overload-test.mjs
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.HISAAB_DATA_DIR ||= path.join(os.tmpdir(), 'hisaab-eval', 'overload-data')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = p => import(pathToFileURL(path.join(ROOT, p)).href)
const { config } = await load('server/config.js')
const brain = await load('server/brain.js')
const pipeline = await load('server/pipeline.js')
const tenants = await load('server/tenants.js')
const ledger = await load('server/ledger.js')
const { one } = await load('server/db.js')

// Time-scaled policy: same logic, seconds instead of minutes.
Object.assign(config, {
  geminiKey: 'test-key',
  parseModels: ['primary-lite', 'backup-flash'],
  parseFallbackModels: ['fallback-preview'],
  liveParseModels: ['live-a'],
  liveTextModels: [], // texts use liveParseModels in these scenarios (own order tested in 16)
  voiceParse: 'generate',
  textParse: 'generate',
  parseHedgeMs: 300,
  voiceHedgeMs: 300,
  parseTimeoutMs: 1500,
  parseAudioTimeoutMs: 1500,
  liveParseTimeoutMs: 1500,
  liveParseMaxTimeoutMs: 1500,
  longNoteSeconds: 30,
  parsePatienceMs: 6000,
  interimAfterMs: 1200,
})

let pass = 0
let fail = 0
const ok = (cond, msg, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}${extra ? `  ${extra}` : ''}`)
}

const answer = ops => ({ text: JSON.stringify({ transcript_urdu: 'ٹیسٹ', transcript_roman: 'test', language: 'mixed', operations: ops, reply_urdu: null }) })
const creditOp = (name, amount) => ({ type: 'credit', customer_id: null, customer_name: name, customer_name_urdu: null, amount, full_settlement: false, items: [], threshold: null, phone: null, list_name: null, list_name_urdu: null, list_kind: null })
const err503 = () => Object.assign(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'), { status: 503 })
const errPerDay = () => new Error('{"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}')
const errAuth = () => new Error('{"error":{"code":403,"message":"Method doesn\'t allow unregistered callers. Please pass a valid API key.","status":"PERMISSION_DENIED"}}')
// Google's real per-minute 429 text (31 Oct 2026), including the "billing details" sentence.
const err429 = (model, seconds = 1) => Object.assign(new Error(`{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: ${model}\\nPlease retry in ${seconds}s.","status":"RESOURCE_EXHAUSTED"}}`), { status: 429 })
const liveQuotaClose = () => new Error('live_closed 1011 You exceeded your current quota, please check your plan and billing details.')
const tone = seconds => spawnSync(config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=300:duration=${seconds}`, '-c:a', 'libopus', '-f', 'ogg', 'pipe:1'], { maxBuffer: 10e6 }).stdout
/** A fake Live session that answers the whole note with one submit_operations call carrying `args`. */
const fakeLive = args => async ({ callbacks }) => {
  calls.push({ model: 'live', n: calls.filter(c => c.model === 'live').length + 1, at: Date.now() })
  const session = { sendRealtimeInput() {}, sendClientContent() {}, sendToolResponse() {}, close() {} }
  setTimeout(() => callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'f1', name: 'submit_operations', args }] } }), 50)
  return session
}

// Each scenario installs a behaviour per model: (call#, signal) => Promise<response>.
const calls = []
function install(behaviours) {
  calls.length = 0
  const client = brain.gemini()
  client.models.generateContent = ({ model, config: cfg }) => {
    const n = calls.filter(c => c.model === model).length + 1
    const entry = { model, n, at: Date.now(), aborted: false }
    calls.push(entry)
    cfg.abortSignal?.addEventListener('abort', () => (entry.aborted = true), { once: true })
    const behave = behaviours[model] || (() => Promise.reject(err503()))
    return new Promise((resolve, reject) => {
      cfg.abortSignal?.addEventListener('abort', () => reject(new Error('This operation was aborted')), { once: true })
      behave(n, cfg.abortSignal).then(resolve, reject)
    })
  }
  client.live.connect = async () => {
    calls.push({ model: 'live', n: calls.filter(c => c.model === 'live').length + 1, at: Date.now() })
    throw (behaviours.live || err503)()
  }
}
const after = (ms, value) => () => new Promise(r => setTimeout(() => r(value), ms))
const hang = () => () => new Promise(() => {})
const failTimes = (k, then) => n => (n <= k ? Promise.reject(err503()) : then(n))
const input = { text: 'Umar ne 500 ka saman liya', customers: [], lists: [] }

// 1. Primary hangs: the backup (other family) starts after the hedge delay, wins, and the primary call is aborted.
install({ 'primary-lite': hang(), 'backup-flash': after(200, answer([creditOp('Umar', 500)])) })
let t0 = Date.now()
let r = await brain.understand(input)
ok(r.model === 'backup-flash' && r.hedged, 'hang -> hedged backup answers', `${Date.now() - t0}ms model=${r.model}`)
ok(Date.now() - t0 < 1000, 'hedged answer arrives within ~hedge+backup latency', `${Date.now() - t0}ms`)
ok(calls.find(c => c.model === 'primary-lite')?.aborted === true, 'losing primary request is aborted')

// 2. Primary answers fast: no hedge, one call.
install({ 'primary-lite': after(100, answer([creditOp('Umar', 500)])) })
r = await brain.understand(input)
ok(r.model === 'primary-lite' && !r.hedged && calls.length === 1, 'fast primary: single call, no hedge', `calls=${calls.length}`)

// 3. Both families 503 a few times, then recover: retried with backoff, answer kept.
install({ 'primary-lite': failTimes(2, after(50, answer([creditOp('Umar', 500)]))), 'backup-flash': failTimes(5, after(50, answer([creditOp('Umar', 500)]))) })
t0 = Date.now()
r = await brain.understand(input)
ok(r.operations[0]?.amount === 500, 'transient 503s retried until an answer', `${Date.now() - t0}ms attempts=${r.attempts} model=${r.model}`)

// 4. Google down for the whole patience window: error 'busy' (never not_understood), interim sent exactly once.
install({})
let interim = 0
t0 = Date.now()
let error = null
try {
  await brain.understand({ ...input, onInterim: () => interim++ })
} catch (e) {
  error = e
}
const elapsed = Date.now() - t0
ok(error?.code === 'busy', 'all 503 -> error code busy', `${error?.code} after ${elapsed}ms, ${calls.length} calls`)
ok(elapsed >= config.parsePatienceMs - 2500 && elapsed <= config.parsePatienceMs + 1000, 'kept trying for the whole patience window', `${elapsed}ms`)
ok(interim === 1, 'one interim line while waiting', `interim=${interim}`)
ok(['primary-lite', 'backup-flash', 'fallback-preview', 'live'].every(m => calls.some(c => c.model === m)), 'primary, Live, backup and fallback model all tried', [...new Set(calls.map(c => c.model))].join(','))
const maxParallel = Math.max(...calls.map(c => calls.filter(o => o.at <= c.at && o.at > c.at - 300).length))
ok(maxParallel <= 3, 'never floods Google', `max ${maxParallel} calls started within 300ms`)

// 5. Timeouts (calls that never return) also end as busy, not not_understood.
install({ 'primary-lite': hang(), 'backup-flash': hang(), 'fallback-preview': hang() })
error = null
try {
  await brain.understand(input)
} catch (e) {
  error = e
}
ok(error?.code === 'busy', 'all calls hang -> busy', String(error?.message).slice(0, 80))

// 6. Daily quota on the primary: the next message skips it at once and goes to the backup.
install({ 'primary-lite': () => Promise.reject(errPerDay()), 'backup-flash': after(100, answer([creditOp('Umar', 500)])) })
r = await brain.understand(input)
ok(r.model === 'backup-flash', 'per-day 429 -> backup answers', r.model)
ok(Boolean(brain.modelCooldowns()['primary-lite']), 'primary remembered as exhausted (cooling down)', JSON.stringify(brain.modelCooldowns()))
install({ 'primary-lite': after(10, answer([creditOp('Umar', 500)])), 'backup-flash': after(100, answer([creditOp('Umar', 500)])) })
r = await brain.understand(input)
ok(!calls.some(c => c.model === 'primary-lite') && r.model === 'backup-flash', 'exhausted primary not called again today', calls.map(c => c.model).join(','))

// 7. Wrong / missing API key everywhere: ai_config, quickly.
config.parseModels = ['auth-a', 'auth-b']
config.parseFallbackModels = []
install({ 'auth-a': () => Promise.reject(errAuth()), 'auth-b': () => Promise.reject(errAuth()), live: errAuth })
t0 = Date.now()
error = null
try {
  await brain.understand(input)
} catch (e) {
  error = e
}
ok(error?.code === 'ai_config' && Date.now() - t0 < 2000, 'auth error -> ai_config without waiting', `${error?.code} ${Date.now() - t0}ms`)
config.parseModels = ['primary-lite2', 'backup-flash2']
config.parseFallbackModels = []

// 8. Voice note with VOICE_PARSE=live: Live failing falls back to generateContent at once.
config.voiceParse = 'live'
install({ 'primary-lite2': after(100, answer([creditOp('Umar', 500)])) })
// A real 1.5 s Ogg/Opus clip, so the Live lane gets as far as connecting (which then fails with 503).
const ogg = spawnSync(config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1.5', '-c:a', 'libopus', '-f', 'ogg', 'pipe:1'], { maxBuffer: 10e6 }).stdout
try {
  r = await brain.understand({ audio: { mimeType: 'audio/ogg', buffer: ogg }, customers: [], lists: [] })
  ok(r.path === 'generate' && r.operations[0]?.amount === 500 && calls.some(c => c.model === 'live'), 'live 503 -> generateContent fallback answers', `${r.path} ${r.model} live tries=${calls.filter(c => c.model === 'live').length}`)
} catch (e) {
  ok(false, 'live failure -> generateContent fallback answers', e.message)
}
config.voiceParse = 'generate'

// 8b. Text with TEXT_PARSE=live: Live failing hands the message to generateContent at once.
config.textParse = 'live'
install({ 'primary-lite2': after(100, answer([creditOp('Umar', 500)])) })
t0 = Date.now()
r = await brain.understand(input)
ok(r.path === 'generate' && calls[0].model === 'live' && Date.now() - t0 < 1500, 'text: live 503 -> generateContent answers', `${r.path} ${r.model} ${Date.now() - t0}ms`)
// 8c. Live closes for quota (per-minute): that Live model cools down, so the next message skips it.
config.liveParseModels = ['live-quota', 'live-b']
install({ 'primary-lite2': after(100, answer([creditOp('Umar', 500)])), live: () => new Error('live_closed 1011 You exceeded your current quota, please check your plan and billing details.') })
r = await brain.understand(input)
ok(Boolean(brain.modelCooldowns()['live-quota']) && r.operations[0]?.amount === 500, 'Live quota close -> answered elsewhere, Live model cooling down', JSON.stringify(brain.modelCooldowns()))
config.liveParseModels = ['live-a']
config.textParse = 'generate'

// 8d. Google's real per-minute 429 says "check your plan and billing details": still a wait-and-retry, never ai_config.
ok(brain.isTransient(err429('x')), 'real per-minute 429 text (mentions billing) counts as transient')
config.parseModels = ['rl-a', 'rl-b']
config.parseFallbackModels = []
let tRL = Date.now()
install({ 'rl-a': () => (Date.now() - tRL < 1000 ? Promise.reject(err429('rl-a')) : after(50, answer([creditOp('Umar', 500)]))()), 'rl-b': () => Promise.reject(err429('rl-b')) })
error = null
try {
  r = await brain.understand({ image: { mimeType: 'image/jpeg', buffer: Buffer.from('x') }, customers: [], lists: [] })
} catch (e) {
  error = e
}
ok(!error && r.operations[0]?.amount === 500, 'photo: per-minute 429 on every model -> waits "retry in 1s" and answers', error ? `${error.code} after ${Date.now() - tRL}ms` : `${Date.now() - tRL}ms model=${r.model}`)
config.parseModels = ['rl-c']
install({ 'rl-c': () => Promise.reject(err429('rl-c', 30)) })
config.parsePatienceMs = 2500
error = null
try {
  await brain.understand(input)
} catch (e) {
  error = e
}
ok(error?.code === 'busy', 'rate-limited for longer than the patience -> busy, not ai_config', error?.code)
config.parsePatienceMs = 6000

// 8e. Every Live model cooling down (after a Live quota close): generateContent starts at once, not after the hedge.
config.textParse = 'live'
config.liveParseModels = ['cool-live-a', 'cool-live-b']
config.parseModels = ['cool-gen']
install({ 'cool-gen': after(100, answer([creditOp('Umar', 500)])), live: liveQuotaClose })
await brain.understand(input)
t0 = Date.now()
const callsBefore = calls.length
r = await brain.understand(input)
const asked = calls.slice(callsBefore)
ok(r.path === 'generate' && asked.length === 1 && asked[0].model === 'cool-gen' && asked[0].at - t0 < config.parseHedgeMs / 2, 'Live models cooling -> no Live call, generateContent asked at once', `asked ${asked.map(c => `${c.model}@${c.at - t0}ms`).join(' ')} (hedge ${config.parseHedgeMs}ms)`)
config.textParse = 'generate'
config.liveParseModels = ['live-a']

// 8f. The caller gives up (system check limit): the parse stops at once and makes no more calls.
config.parseModels = ['ab-a', 'ab-b']
install({ 'ab-a': hang(), 'ab-b': hang() })
const ac = new AbortController()
setTimeout(() => ac.abort(), 200)
t0 = Date.now()
error = null
try {
  await brain.understand({ ...input, signal: ac.signal })
} catch (e) {
  error = e
}
const abortedAfter = Date.now() - t0
const callsAtAbort = calls.length
await new Promise(res => setTimeout(res, 1200))
ok(error?.code === 'aborted' && abortedAfter < 400, 'abort signal ends understand() at once', `${error?.code} after ${abortedAfter}ms`)
ok(calls.length === callsAtAbort && calls.every(c => c.aborted !== false), 'no calls after the abort, in-flight calls aborted', `${callsAtAbort} -> ${calls.length}`)

// 8g. Long voice notes: Live gets more time per session, and the generateContent hedge starts at once.
const saved = { liveParseTimeoutMs: config.liveParseTimeoutMs, liveParseMaxTimeoutMs: config.liveParseMaxTimeoutMs }
Object.assign(config, { liveParseTimeoutMs: 20000, liveParseMaxTimeoutMs: 70000 })
const limits = [5, 13, 40, 70, 200].map(s => brain.liveTimeoutFor(s))
ok(limits.join(',') === '20000,20000,40000,62500,70000', 'Live session limit grows with the note (5/13/40/70/200 s)', limits.join(','))
Object.assign(config, saved)
config.voiceParse = 'live'
config.parseModels = ['long-gen']
config.longNoteSeconds = 1
install({ 'long-gen': after(100, answer([creditOp('Umar', 500)])) })
brain.gemini().live.connect = () => (calls.push({ model: 'live', at: Date.now() }), new Promise(() => {}))
r = await brain.understand({ audio: { mimeType: 'audio/ogg', buffer: tone(1.5) }, customers: [], lists: [] })
const gap = calls.find(c => c.model === 'long-gen')?.at - calls.find(c => c.model === 'live')?.at
ok(r.path === 'generate' && gap < config.voiceHedgeMs / 2, 'long note: generateContent starts with Live, not after the hedge', `generate asked ${gap}ms after Live (hedge ${config.voiceHedgeMs}ms)`)
config.longNoteSeconds = 30

// 8h. A long note that Live answers with no operations was only partly heard: retried / answered by generateContent.
const long21 = tone(21)
install({ 'long-gen': after(100, answer([creditOp('Umar', 500)])) })
brain.gemini().live.connect = fakeLive({ transcript_urdu: '', transcript_roman: 'Umar', language: 'mixed', operations: [], reply_urdu: null, reply_roman: null })
r = await brain.understand({ audio: { mimeType: 'audio/ogg', buffer: long21 }, customers: [], lists: [] })
ok(r.path === 'generate' && r.operations.length === 1, 'long note: empty Live answer rejected, generateContent answers', `${r.path} ops=${r.operations.length}`)
install({ 'long-gen': hang() })
brain.gemini().live.connect = fakeLive({ transcript_urdu: 'عمر', transcript_roman: 'Umar ne 500 liye aur Ahmed ne 300 diye', language: 'mixed', operations: [creditOp('Umar', 500), { ...creditOp('Ahmed', 300), type: 'payment' }], reply_urdu: null, reply_roman: null })
r = await brain.understand({ audio: { mimeType: 'audio/ogg', buffer: long21 }, customers: [], lists: [] })
ok(r.path === 'live' && r.operations.length === 2, 'long note: a full Live answer is kept', `${r.path} ops=${r.operations.length}`)
config.voiceParse = 'generate'

// 8i. clean(): whole-balance payments need settlement words; language is always a known name; "list se nikal do".
const settle = (said, language = 'urdu', more = []) => brain.clean({ transcript_urdu: '', transcript_roman: said, language, operations: [{ ...creditOp('Umar', null), type: 'payment', full_settlement: true }, ...more] }).operations[0].full_settlement
ok(settle('Umar 500 rupay poor soda akiwda', 'pashto') === false, 'full_settlement dropped when nothing says the whole balance was paid')
ok(settle('Umar 500 rupay poora sauda', 'pashto') === false, 'Pashto "pur" (udhaar) heard as "poora" with Rs 500 said: no whole-balance payment')
ok(settle('Umar poora sauda yowra', 'pashto') === false, 'Pashto: "poora" alone is not a settlement word')
ok(settle('Umar ne 500 diye, poora hisaab', 'urdu') === false, 'one money entry with a figure said: asks the amount rather than clear the balance')
ok(['Gul Khan ne saara hisaab chuka diya', 'Gul Khan cleared his full balance', 'hisaab settle ho gaya', 'گل خان نے سارا حساب چکا دیا', 'Asad ne poora hisaab chuka diya'].every(s => settle(s) === true), 'full_settlement kept for saara / full / settle / سارا / poora (Urdu)')
ok(settle('Gul Khan ne saara hisaab chuka diya aur Asad ne 900 ka naya saman liya', 'mixed', [creditOp('Asad', 900)]) === true, 'full settlement kept next to another entry with its own amount')
ok(settle('Gul Khan ne saara hisaab mukka dita', 'pashto') === true, 'Pashto/Punjabi with an unambiguous word (mukka) kept')
ok(brain.clean({ language: ['urdu', 'english'], operations: [] }).language === 'mixed', 'a non-string language becomes "mixed"')
const moved = brain.clean({ operations: [{ type: 'move_to_list', customer_name: 'Hamid', list_name: 'aam khata' }] }).operations[0]
ok(moved.list_name === 'General', 'move_to_list to "aam khata" keeps General as the target', JSON.stringify(moved.list_name))
ok(brain.clean({ operations: [{ ...creditOp('Rafiq', 500), list_name: 'General' }] }).operations[0].list_name === null, 'a credit "in General" still means no list')
config.parseModels = ['primary-lite2', 'backup-flash2']
config.parseFallbackModels = []

// 9. Pipeline: busy message gets error 'busy' + "masroof" reply (never "samajh nahi aaya"); per-shop order kept.
const t = tenants.createTenant(`92399${Date.now() % 10000000}`)
tenants.updateTenant(t.id, { voice_replies: false, shop_name: 'Overload Test' })
install({})
config.parsePatienceMs = 4500
const interims = []
const res = await pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'Umar ne 500 ka saman liya', onInterim: line => interims.push(line) })
let msg = one('SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', t.id)
ok(msg.status === 'error' && msg.error === 'busy', 'pipeline marks the message busy', `${msg.status}/${msg.error}`)
ok(/masroof/i.test(res.text) && !/samajh nahi/i.test(res.text), 'reply asks to resend in a minute', JSON.stringify(res.text.slice(-70)))
ok(interims.length === 1 && /likh raha hoon/.test(interims[0]), 'one interim WhatsApp line', JSON.stringify(interims))

// Slow first message, fast second message: written in arrival order.
config.parsePatienceMs = 6000
install({ 'primary-lite2': (n) => after(n === 1 ? 900 : 50, answer([creditOp(n === 1 ? 'Order First' : 'Order Second', 100)]))() })
const turnA = pipeline.reserveTurn(t.id)
const turnB = pipeline.reserveTurn(t.id)
await Promise.all([
  pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'first' }, turnA),
  pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'second' }, turnB),
])
const order = ledger.listCustomers(t.id).filter(c => c.name.startsWith('Order')).sort((a, b) => a.createdAt - b.createdAt).map(c => c.name)
ok(order.join(',') === 'Order First,Order Second', 'per-shop order kept when the first answer is slower', order.join(','))

// 10. "lists" typed on WhatsApp: answered without any AI call.
install({})
const before = calls.length
await pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'meri lists' })
msg = one('SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', t.id)
ok(calls.length === before && msg.status === 'done' && JSON.parse(msg.results)[0]?.type === 'lists_summary', '"meri lists" -> lists_summary with no AI call', `${msg.status} ${msg.results}`)

// 11. A parse whose language is not a string (Live tool arguments are not schema-checked): written and replied normally.
const entriesOf = name => one('SELECT COUNT(*) AS n FROM entries e JOIN customers c ON c.id = e.customer_id WHERE e.tenant_id = ? AND c.name = ? AND e.voided_at IS NULL', t.id, name).n
install({ 'primary-lite2': after(20, { text: JSON.stringify({ transcript_urdu: 'عمر', transcript_roman: 'Lang Case ne 500 liye', language: ['urdu', 'english'], operations: [creditOp('Lang Case', 500)], reply_urdu: null, reply_roman: null }) }) })
config.parseModels = ['primary-lite2']
let res2 = await pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'Lang Case ne 500 liye' })
msg = one('SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', t.id)
ok(msg.status === 'done' && msg.language === 'mixed' && entriesOf('Lang Case') === 1 && /500/.test(res2.text), 'array language -> saved as "mixed", normal reply', `${msg.status} ${msg.language} entries=${entriesOf('Lang Case')}`)

// 12. Anything failing AFTER the ledger write: the reply says what was saved and never asks to resend.
// (Injected: a model name that SQLite cannot store makes the message UPDATE after applyOperations throw.)
const unstorable = { toString: () => 'unstorable-model' }
config.parseModels = [unstorable]
install({ 'unstorable-model': after(20, answer([creditOp('After Write', 700)])) })
res2 = await pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'After Write ne 700 liye' })
msg = one('SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', t.id)
ok(msg.status === 'done' && entriesOf('After Write') === 1, 'post-write failure -> message done, entry written once', `${msg.status}/${msg.error} entries=${entriesOf('After Write')}`)
ok(/After Write/.test(res2.text) && /700/.test(res2.text) && !/samajh nahi|dobara bol|masroof/i.test(res2.text), 'post-write failure reply lists the saved entry, no "dobara bol dein"', JSON.stringify(res2.text))
config.parseModels = ['primary-lite2']

// ---------------------------------------------------------------- free tier
const { liveProfile, liveParse, liveSlots } = await load('server/liveparse.js')
const liveArgs = (ops = [creditOp('Umar', 500)]) => ({ transcript_urdu: 'عمر', transcript_roman: 'Umar ne 500 liye', language: 'mixed', operations: ops, reply_urdu: null, reply_roman: null })
/** Fake Live per model: answer after ms, close for quota / with an internal error after ms, or hang. Records open sessions and each setup config. */
function fakeLiveBy(behaviour) {
  const state = { open: 0, maxOpen: 0, connects: [] }
  brain.gemini().live.connect = async ({ model, config: cfg, callbacks }) => {
    const b = behaviour(model)
    calls.push({ model: `live:${model}`, at: Date.now() })
    state.connects.push({ model, at: Date.now(), cfg })
    state.open++
    state.maxOpen = Math.max(state.maxOpen, state.open)
    let closed = false
    const close = () => {
      if (!closed) (closed = true), state.open--
    }
    if (b.kind === 'answer') setTimeout(() => !closed && callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'f1', name: 'submit_operations', args: b.args || liveArgs() }] } }), b.ms)
    if (b.kind === 'quota') setTimeout(() => !closed && (close(), callbacks.onclose({ code: 1011, reason: 'You exceeded your current quota, please check your plan and billing details.' })), b.ms)
    if (b.kind === 'internal') setTimeout(() => !closed && (close(), callbacks.onclose({ code: 1011, reason: 'Internal error occurred.' })), b.ms)
    return { sendRealtimeInput() {}, sendClientContent() {}, sendToolResponse() {}, close }
  }
  return state
}
const capped = { 'cap-a': () => Promise.reject(errPerDay()), 'cap-b': () => Promise.reject(errPerDay()), 'cap-c': () => Promise.reject(errPerDay()) }
const askedCapped = () => calls.filter(c => c.model.startsWith('cap-')).map(c => c.model)

// 13. Every generateContent model at its daily cap (free tier): texts and voice notes are answered by Live, never 'busy';
// each capped model is asked at most once, and the next message asks none of them (they cool down).
Object.assign(config, { textParse: 'live', voiceParse: 'live', parseModels: ['cap-a', 'cap-b'], parseFallbackModels: ['cap-c'], liveParseModels: ['free-live'], parseHedgeMs: 50, voiceHedgeMs: 50, parsePatienceMs: 6000 })
install(capped)
fakeLiveBy(() => ({ kind: 'answer', ms: 400 }))
r = await brain.understand(input)
ok(r.path === 'live' && r.operations[0]?.amount === 500, 'every generateContent model capped: text answered by Live', `${r.path} ${r.model} ${r.ms}ms`)
ok(askedCapped().length <= 3 && new Set(askedCapped()).size === askedCapped().length, 'each capped model asked at most once', askedCapped().join(',') || 'none')
install(capped)
fakeLiveBy(() => ({ kind: 'answer', ms: 400 }))
r = await brain.understand({ audio: { mimeType: 'audio/ogg', buffer: tone(1.5) }, customers: [], lists: [] })
ok(r.path === 'live' && askedCapped().length === 0, 'next message (voice note): Live answers, capped models not asked again', `${r.path} asked=${askedCapped().join(',') || 'none'}`)

// 14. A Live quota close moves to the next Live model at once (no backoff), still with every generateContent model capped.
config.liveParseModels = ['quota-live', 'next-live']
install(capped)
let liveState = fakeLiveBy(model => (model === 'quota-live' ? { kind: 'quota', ms: 30 } : { kind: 'answer', ms: 100 }))
r = await brain.understand(input)
const quotaAt = liveState.connects.find(c => c.model === 'quota-live')?.at
const nextAt = liveState.connects.find(c => c.model === 'next-live')?.at
ok(r.path === 'live' && r.model === 'next-live', 'Live quota close -> the next Live model answers', `${r.path} ${r.model}`)
ok(nextAt - quotaAt < 30 + 250, 'next Live model asked right after the quota close, before any backoff', `${nextAt - quotaAt}ms after the first connect (close at 30ms)`)
ok(Boolean(brain.modelCooldowns()['quota-live']) && askedCapped().length === 0, 'quota-closed Live model cooling down; capped generateContent models not asked', JSON.stringify(Object.keys(brain.modelCooldowns())))
r = await brain.understand(input)
ok(r.model === 'next-live' && liveState.connects.filter(c => c.model === 'quota-live').length === 1, 'next message goes straight to the next Live model', liveState.connects.map(c => c.model).join(','))

// 14a. A Live model's "1011 Internal error" (native audio, 31 Oct) is answered by the next Live model inside the hedge
// delay, without spending a generateContent request; when every Live model fails, generateContent is asked after one
// round of Live models, not in a tight loop.
Object.assign(config, { liveParseModels: ['flaky-live', 'steady-live'], parseModels: ['spare-gen'], parseFallbackModels: [], parseHedgeMs: 1000 })
install({ 'spare-gen': after(50, answer([creditOp('Umar', 500)])) })
fakeLiveBy(model => (model === 'flaky-live' ? { kind: 'internal', ms: 30 } : { kind: 'answer', ms: 100 }))
r = await brain.understand(input)
ok(r.path === 'live' && r.model === 'steady-live' && !calls.some(c => c.model === 'spare-gen'), 'Live internal error -> next Live model answers, no generateContent request spent', `${r.path} ${r.model} asked=${calls.map(c => c.model).join(',')}`)
install({ 'spare-gen': after(50, answer([creditOp('Umar', 500)])) })
liveState = fakeLiveBy(() => ({ kind: 'internal', ms: 10 }))
t0 = Date.now()
r = await brain.understand(input)
const genAt = calls.find(c => c.model === 'spare-gen')?.at - t0
ok(r.path === 'generate' && liveState.connects.length === 2 && genAt < 300, 'every Live model failing -> generateContent after one round of Live models', `live tries=${liveState.connects.length}, generate asked at ${genAt}ms`)
config.parseHedgeMs = 50

// 14b. Live AND generateContent both out: only then 'busy'.
config.liveParseModels = ['quota-live2']
config.parsePatienceMs = 2500
install(capped)
fakeLiveBy(() => ({ kind: 'quota', ms: 30 }))
error = null
try {
  await brain.understand(input)
} catch (e) {
  error = e
}
ok(error?.code === 'busy', 'every Live model quota-closed and every generateContent model capped -> busy', error?.code)
config.parsePatienceMs = 6000

// 14c. Nothing can answer (every Live model closes "1011 Internal error", every generateContent model capped): the Live
// lane's first round asks each Live model at once, then waits its backoff before every further session, so one message
// cannot flood the key's per-minute Live quota (it used to open a whole round of Live models per backoff step).
Object.assign(config, { liveParseModels: ['storm-a', 'storm-b', 'storm-c'], parseModels: ['cap-a', 'cap-b'], parseFallbackModels: ['cap-c'] })
install(capped)
liveState = fakeLiveBy(() => ({ kind: 'internal', ms: 10 }))
error = null
t0 = Date.now()
try {
  await brain.understand(input)
} catch (e) {
  error = e
}
const stormAt = liveState.connects.map(c => c.at - t0)
const stormGaps = stormAt.slice(3).map((at, k) => at - stormAt[k + 2])
ok(error?.code === 'busy' && stormAt.length >= 4 && stormAt.length <= 6, 'nothing answers: Live sessions per message bounded (one round, then one per backoff step)', `${stormAt.length} sessions at ${stormAt.join(',')}ms`)
ok(stormAt.slice(0, 3).every(at => at < 300) && stormGaps.every(g => g >= 900), 'first round of Live models at once, then at least ~1 s between Live sessions', `gaps after the round: ${stormGaps.join(',')}ms`)

// 14d. The hedge timer does not launch a lane that was already handed over and is sleeping in its backoff (that ran
// a second retry loop on it: twice the requests or Live sessions for one message).
Object.assign(config, { liveParseModels: ['dl-live'], parseModels: ['dl-gen'], parseFallbackModels: [], parseHedgeMs: 2000, parsePatienceMs: 5000 })
install({ 'dl-gen': () => new Promise((_, reject) => setTimeout(() => reject(err503()), 50)) })
fakeLiveBy(() => ({ kind: 'internal', ms: 10 }))
t0 = Date.now()
try {
  await brain.understand(input)
} catch {}
const dlGenAt = calls.filter(c => c.model === 'dl-gen').map(c => c.at - t0)
ok(dlGenAt[0] < 300 && !dlGenAt.some(at => Math.abs(at - 2000) < 150), 'hedge timer does not start a second retry loop on a lane in its backoff', `generateContent asked at ${dlGenAt.join(',')}ms`)
Object.assign(config, { parseHedgeMs: 50, parsePatienceMs: 6000 })

// 15. Live slots: with LIVE_PARSE_CONCURRENCY=1 two messages take the one slot in turn (never 2 sessions open), and a
// message that cannot get a slot within LIVE_SLOT_WAIT_MS is answered by generateContent instead of failing.
Object.assign(config, { liveParseModels: ['slot-live'], liveParseConcurrency: 1, liveSlotWaitMs: 3000, parseModels: ['slot-gen'], parseFallbackModels: [], parseHedgeMs: 5000 })
install({ 'slot-gen': hang() })
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 300 }))
const both = await Promise.all([brain.understand(input), brain.understand(input)])
ok(both.every(x => x.path === 'live') && liveState.maxOpen === 1, 'one Live slot: two messages answered by Live one after the other', `maxOpen=${liveState.maxOpen} ms=${both.map(x => x.ms).join(',')}`)
ok(liveSlots().inUse === 0 && liveSlots().waiting === 0, 'every Live slot released afterwards', JSON.stringify(liveSlots()))
config.liveSlotWaitMs = 200
config.parseModels = ['slot-gen2']
install({ 'slot-gen2': after(100, answer([creditOp('Umar', 500)])) })
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 900 })) // inside the test's 1.5 s Live session limit
const pair = await Promise.all([brain.understand(input), brain.understand(input)])
ok(pair.some(x => x.path === 'live') && pair.some(x => x.path === 'generate') && liveState.maxOpen === 1, 'no free Live slot in time -> that message answered by generateContent', pair.map(x => `${x.path}:${x.ms}ms`).join(' '))
await new Promise(res => setTimeout(res, 1200))
ok(liveSlots().inUse === 0 && liveSlots().waiting === 0, 'slots released after the slot-wait timeout too', JSON.stringify(liveSlots()))
config.liveParseConcurrency = 3

// 16. Per-model Live profiles: native-audio models get the OpenAPI `parameters` schema and thinking off; others unchanged.
const na = liveProfile('gemini-2.5-flash-native-audio-latest')
const naAmount = na.tool.parameters?.properties?.operations?.items?.properties?.amount
ok(na.tool.parameters && !na.tool.parametersJsonSchema && na.thinkingBudget === 0 && !/"null"|"type":\[/.test(JSON.stringify(na.tool.parameters)) && naAmount?.type === 'INTEGER' && naAmount?.nullable === true,
  'native-audio profile: OpenAPI parameters (nullable, no "null" types), thinking budget 0', JSON.stringify(naAmount))
const std = liveProfile('gemini-3.8-live')
ok(std.tool.parametersJsonSchema === brain.SCHEMA && !std.tool.parameters && std.thinkingBudget === null, 'other Live models keep parametersJsonSchema and their default thinking')
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 20 }))
await liveParse({ model: 'gemini-2.5-flash-native-audio-latest', text: 'Umar ne 500 liye' })
await liveParse({ model: 'gemini-3.8-live', text: 'Umar ne 500 liye' })
const [cfgNa, cfgStd] = liveState.connects.map(c => c.cfg)
ok(cfgNa.tools[0].functionDeclarations[0].parameters && cfgNa.thinkingConfig?.thinkingBudget === 0 && cfgStd.tools[0].functionDeclarations[0].parametersJsonSchema && !cfgStd.thinkingConfig,
  'liveParse sends each model its own tool schema and thinking config')
// Native audio's malformed tool calls (31 Oct): keys wrapped in quotes, operations as JSON strings. clean() reads them.
const op500 = creditOp('Umar', 500)
const quoted = Object.fromEntries(Object.entries(op500).map(([k, v]) => [`"${k}"`, v]))
let tidy = brain.clean({ '"transcript_roman"': 'Umar ne 500 liye', 'operations"': [quoted] })
ok(tidy.operations[0]?.type === 'credit' && tidy.operations[0]?.amount === 500 && tidy.transcriptRoman === 'Umar ne 500 liye', 'clean(): keys wrapped in quotes are read', JSON.stringify(tidy.operations))
tidy = brain.clean({ transcript_roman: 'x', operations: [JSON.stringify(op500), JSON.stringify({ ...op500, customer_name: 'Ahmed', type: 'payment' })] })
ok(tidy.operations.map(o => `${o.type}:${o.customer_name}`).join() === 'credit:Umar,payment:Ahmed', 'clean(): operations sent as JSON strings are read', JSON.stringify(tidy.operations.map(o => o.type)))
tidy = brain.clean({ transcript_roman: 'x', operations: JSON.stringify([op500]) })
ok(tidy.operations[0]?.amount === 500, 'clean(): an operations array sent as one JSON string is read')
tidy = brain.clean({ transcript_roman: '[shor] Umar ne 500 liye', operations: ['not json', 7, null] })
ok(tidy.operations.length === 0 && tidy.transcriptRoman === '[shor] Umar ne 500 liye', 'clean(): junk entries dropped, a transcript starting with "[" kept as text')
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 20, args: { '"transcript_roman"': 'Umar ne 500 liye', 'operations"': [quoted] } }))
let lp = await liveParse({ model: 'gemini-2.5-flash-native-audio-latest', text: 'Umar ne 500 liye' })
ok(lp.operations[0]?.amount === 500, 'native audio: a quoted-keys call is parsed, not taken as "nothing said"')
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 20, args: {} }))
error = null
try {
  await liveParse({ model: 'gemini-2.5-flash-native-audio-latest', text: 'Umar ne 500 liye' })
} catch (e) {
  error = e
}
ok(/live_empty_answer/.test(error?.message) && brain.isTransient(error), 'native audio: a call with no operations and no transcript is a failed (retried) attempt', error?.message)
lp = await liveParse({ model: 'gemini-3.8-live', text: 'Umar ne 500 liye' })
ok(lp.operations.length === 0, 'other Live models: an empty call is taken as before')

// Texts and voice notes have their own Live order (LIVE_TEXT_MODELS / LIVE_PARSE_MODELS).
Object.assign(config, { liveParseModels: ['voice-first', 'voice-second'], liveTextModels: ['text-first'] })
ok(brain.liveModelsFor({ audio: null }).join() === 'text-first' && brain.liveModelsFor({ audio: {} }).join() === 'voice-first,voice-second', 'texts use LIVE_TEXT_MODELS, voice notes LIVE_PARSE_MODELS')
Object.assign(config, { textParse: 'live', parseModels: ['order-gen'], parseFallbackModels: [], parseHedgeMs: 5000 })
install({ 'order-gen': hang() })
liveState = fakeLiveBy(() => ({ kind: 'answer', ms: 20 }))
r = await brain.understand(input)
ok(r.model === 'text-first' && liveState.connects[0].model === 'text-first', 'a text goes to the first text model', r.model)
config.liveTextModels = []
ok(brain.liveModelsFor({ audio: null }).join() === 'voice-first,voice-second', 'empty LIVE_TEXT_MODELS: texts use the voice-note order')

// 17. Pipeline with every generateContent model capped: Live writes the entry, the reply is a normal one (no "masroof").
Object.assign(config, { liveParseModels: ['free-live'], parseModels: ['cap-a', 'cap-b'], parseFallbackModels: ['cap-c'], parseHedgeMs: 50 })
install(capped)
fakeLiveBy(() => ({ kind: 'answer', ms: 100, args: liveArgs([creditOp('Free Tier', 900)]) }))
res2 = await pipeline.handleMessage(t.id, { channel: 'whatsapp', text: 'Free Tier ne 900 liye' })
msg = one('SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', t.id)
ok(msg.status === 'done' && entriesOf('Free Tier') === 1 && /900/.test(res2.text) && !/masroof/i.test(res2.text), 'pipeline: generateContent all capped -> Live writes the entry, normal reply', `${msg.status}/${msg.error} entries=${entriesOf('Free Tier')}`)
Object.assign(config, { textParse: 'generate', voiceParse: 'generate', parseModels: ['primary-lite2'], parseFallbackModels: [], liveParseModels: ['live-a'], parseHedgeMs: 300, voiceHedgeMs: 300 })

// 18. Live call (server/live.js): the model chain and the system check's probe on the free tier's quota refusals.
const live = await load('server/live.js')
const fallbacks = live.DEFAULT_FALLBACK_MODELS.split(',')
const nativeChain = [...new Set(['gemini-2.5-flash-native-audio-preview-09-2025', ...fallbacks])]
ok(fallbacks[0] === live.DEFAULT_CALL_MODEL && nativeChain[1] === live.DEFAULT_CALL_MODEL && nativeChain.length === 5,
  'LIVE_CALL_MODEL=native dialogue: the default model is still in the chain, right after it', nativeChain.join(' > '))
const chain = live.allCallModels()
let probeBehaviour = () => 'ok'
const probeConnects = []
brain.gemini().live.connect = async ({ model, callbacks }) => {
  const b = probeBehaviour(model)
  probeConnects.push(model)
  setTimeout(() => {
    if (b === 'quota') callbacks.onclose({ code: 1011, reason: 'You exceeded your current quota, please check your plan and billing details.' })
    else if (b === 'drop') callbacks.onclose({ code: 1006, reason: 'connection dropped' })
    else callbacks.onmessage({ setupComplete: {} })
  }, 10)
  return { close() {}, sendRealtimeInput() {}, sendClientContent() {}, sendToolResponse() {} }
}
const probeTenant = { id: 't_probe', shop_name: 'Probe Shop' }
const realNow = Date.now
const later = ms => {
  const base = Date.now
  Date.now = () => base() + ms
}
const describeProbe = p => `model=${p.model} fallback=${p.fallback} tried=${p.tried.map(x => `${x.model}${x.skipped ? '(skipped)' : x.quota ? '(quota)' : ''}`).join(',') || '-'}`
probeBehaviour = () => 'quota'
let probe = await live.probeCall(probeTenant)
ok(!probe.ok && probe.tried.map(x => x.model).join() === chain.join() && probe.tried.every(x => x.quota && !x.skipped), 'probe: every call model refused for quota -> all named, in call order', describeProbe(probe))
probeBehaviour = () => 'ok'
probe = await live.probeCall(probeTenant)
ok(probe.ok && probe.model === chain[0] && !probe.fallback && probe.tried.length === 0, 'probe: a moment later the call\'s own model connects -> no fallback reported (all were resting)', describeProbe(probe))
later(61000)
probeBehaviour = m => (m === chain[0] ? 'quota' : 'ok')
probe = await live.probeCall(probeTenant)
ok(probe.ok && probe.model === chain[1] && probe.fallback && probe.tried.length === 1 && probe.tried[0].model === chain[0] && probe.tried[0].quota, 'probe: own model refused for quota -> fallback, tried[0] is the own model', describeProbe(probe))
probe = await live.probeCall(probeTenant)
ok(probe.ok && probe.model === chain[1] && probe.fallback && probe.tried[0]?.model === chain[0] && probe.tried[0].skipped, 'probe: own model still resting -> skipped and named first', describeProbe(probe))
later(61000)
probeBehaviour = m => (m === chain[0] ? 'drop' : m === chain[1] ? 'quota' : 'ok')
await live.probeCall(probeTenant)
probeBehaviour = () => 'ok'
probe = await live.probeCall(probeTenant)
ok(probe.ok && probe.model === chain[0] && !probe.fallback && probe.tried.length === 0 && probe.resting.includes(chain[1]), 'probe: own model connects while a later one rests -> no false fallback, the resting one listed in `resting`', `${describeProbe(probe)} resting=${probe.resting.join(',')}`)
Date.now = realNow

tenants.deleteTenant?.(t.id)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
