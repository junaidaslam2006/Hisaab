// Hisaab understanding eval. See eval/README.md.
//   node eval/run.mjs --set text|audio|all --path generate|live|prod [--models a,b] [--concurrency 4]
//                     [--split all|dev|heldout] [--cat a,b] [--ids a,b] [--limit n] [--label name]
//                     [--out dir] [--audio-dir dir] [--retries 3] [--repeat n] [--opt key=value ...] [--brain file]
//                     [--cases eval/trades.json] [--no-generate] [--max-live n]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const listOpt = name => (opt(name) ? opt(name).split(',').map(s => s.trim()).filter(Boolean) : null)
const extra = {}
argv.forEach((a, i) => {
  if (a !== '--opt') return
  const [k, ...v] = String(argv[i + 1] || '').split('=')
  const raw = v.join('=')
  extra[k] = raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : raw
})

// The ledger module opens a database on import; never let the eval touch the real one.
process.env.HISAAB_DATA_DIR ||= path.join(os.tmpdir(), 'hisaab-eval', 'data')
const evalHome = path.join(os.tmpdir(), 'hisaab-eval')
const OUT = path.resolve(opt('out', process.env.HISAAB_EVAL_OUT || path.join(evalHome, 'results')))
const AUDIO_DIR = path.resolve(opt('audio-dir', process.env.HISAAB_EVAL_AUDIO || path.join(evalHome, 'audio')))

const load = p => import(pathToFileURL(path.resolve(ROOT, p)).href)
const brain = await load(opt('brain', 'server/brain.js'))
const { config } = await load('server/config.js')
const { normalizeName, normalizeUrdu } = await load('server/ledger.js')
const { makeScorer, WRITE_TYPES } = await load('eval/score.mjs')
const { ensureAudio } = await load('eval/audio.mjs')
const { scoreCase } = makeScorer({ normalizeName, normalizeUrdu })

const SET = opt('set', 'text')
const PATH = opt('path', 'generate')
const CONCURRENCY = Math.max(1, Number(opt('concurrency', 4)))
const RETRIES = Number(opt('retries', 3))
const SPLIT = opt('split', 'all')
const LABEL = opt('label', `${PATH}-${SET}`)
// Run every case n times: the models are not deterministic (Pashto voice notes differ run to run), so a category is
// only as good as the cases that pass EVERY time.
const REPEAT = Math.max(1, Number(opt('repeat', 1)))

// Usage of the shared free key by this run: Live sessions opened (every path), and with --no-generate the
// generateContent calls that were stopped before any request. --max-live n: never open more than n Live sessions;
// cases not started by then are reported as errors 'eval_budget'.
const usage = { liveSessions: 0, liveRefused: 0, generateBlocked: 0 }
const MAX_LIVE = opt('max-live') ? Number(opt('max-live')) : Infinity
const NO_GENERATE = argv.includes('--no-generate')
{
  const realBrain = await load('server/brain.js')
  if (config.geminiKey) {
    const client = realBrain.gemini()
    const connect = client.live.connect.bind(client.live)
    client.live.connect = params => {
      if (usage.liveSessions >= MAX_LIVE) {
        usage.liveRefused++
        return Promise.reject(new Error(`eval_budget: --max-live ${MAX_LIVE} reached, no session opened`))
      }
      usage.liveSessions++
      return connect(params)
    }
    // --no-generate: the production understand() keeps its lanes and hedge timer, but every generateContent call fails
    // at once without a request (as it does tonight when every generateContent model is at its daily cap), so the
    // answer always comes from the Live lane and no daily-capped request is spent.
    if (NO_GENERATE) {
      client.models.generateContent = async () => {
        usage.generateBlocked++
        throw Object.assign(new Error('eval_no_generate: generateContent disabled by --no-generate (no request sent)'), { transient: false })
      }
    }
  }
}

// --cases: another case file in the same format (default eval/cases.json), e.g. eval/trades.json.
const CASES_FILE = path.resolve(ROOT, opt('cases', 'eval/cases.json'))
const corpus = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'))
// A fixed 20% split ('heldout' in the reports) chosen by a hash of the case id. It is NOT independent of the prompt
// (README: some of its sentences are quoted in the prompt, its earlier misses got prompt rules, most cases have a dev
// twin), so it is reported as dev-adjacent, and the console shows only its counts, never which of its cases failed.
const heldOut = id => crypto.createHash('sha1').update(id).digest()[0] % 5 === 0
let cases = [
  ...(SET === 'text' || SET === 'all' ? (corpus.text || []).map(c => ({ ...c, kind: 'text' })) : []),
  ...(SET === 'audio' || SET === 'all' ? (corpus.audio || []).map(c => ({ ...c, kind: 'audio' })) : []),
].map(c => ({ ...c, split: heldOut(c.id) ? 'heldout' : 'dev' }))
if (SPLIT !== 'all') cases = cases.filter(c => c.split === SPLIT)
if (listOpt('cat')) cases = cases.filter(c => listOpt('cat').includes(c.cat))
if (listOpt('ids')) cases = cases.filter(c => listOpt('ids').includes(c.id))
if (opt('limit')) cases = cases.slice(0, Number(opt('limit')))

/** Roster in the shape ledger.listCustomers / the lists API return. */
function brainInput(roster) {
  const lists = roster.lists.map(l => ({ id: l.id, name: l.name, nameUrdu: l.name_urdu || '', kind: l.kind, aliases: l.aliases || [] }))
  const customers = roster.customers.map(c => {
    const l = roster.lists.find(x => x.id === c.list)
    return {
      id: c.id, name: c.name, nameUrdu: c.name_urdu || '', aliases: c.aliases || [], balance: 0,
      listId: l?.id || null, listName: l?.name || null, listKind: l?.kind || 'customers',
    }
  })
  return { customers, lists }
}

const transient = err => /\b(500|502|503|504|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|high demand|overloaded|timed? ?out|timeout|abort|fetch failed|ECONN|ETIMEDOUT|socket|network|1011|internal error|live_/i.test(String(err?.code || '') + ' ' + String(err?.message || err))

async function makeRunner(model) {
  if (PATH === 'prod') return input => brain.understand(input)
  if (PATH === 'live') {
    const { liveParse } = await load('server/liveparse.js')
    return input => liveParse({ ...input, model, options: extra })
  }
  if (brain.parseOnce) return input => brain.parseOnce({ ...input, model, options: extra })
  // The original brain had no single-model entry point: pin its model list instead.
  return input => {
    config.parseModels = [model]
    return brain.understand(input)
  }
}

// Free-tier keys allow ~15 requests per minute per model: pace each model and honour Google's "retry in Ns".
const RPM = Number(opt('rpm', PATH === 'prod' ? 0 : 12))
const gates = new Map()
function gate(model) {
  if (!gates.has(model)) gates.set(model, { next: 0, dayLimit: false })
  return gates.get(model)
}
async function acquire(model) {
  const g = gate(model)
  for (;;) {
    const wait = g.next - Date.now()
    if (wait <= 0) break
    await new Promise(r => setTimeout(r, wait))
  }
  if (RPM) g.next = Math.max(Date.now(), g.next) + 60000 / RPM
}
const retryAfter = err => {
  const m = /retry in (\d+(?:\.\d+)?)s/i.exec(String(err?.message || ''))
  return m ? Math.ceil(Number(m[1]) * 1000) + 500 : null
}

async function runOne(c, model, runner) {
  const roster = corpus.rosters[c.roster || 'shop']
  const input = brainInput(roster)
  if (c.kind === 'text') input.text = c.text
  else input.audio = { mimeType: 'audio/ogg', buffer: fs.readFileSync(await ensureAudio(c, AUDIO_DIR)) }
  const t0 = Date.now()
  const overBudget = () => usage.liveSessions >= MAX_LIVE && PATH !== 'generate'
  const notRun = { id: c.id, cat: c.cat, kind: c.kind, split: c.split, ok: false, error: 'eval_budget: not run (--max-live reached)', score: { falseWrites: 0 }, wallMs: 0, attemptErrors: 0 }
  if (overBudget()) return notRun
  let attemptErrors = 0
  let lastError = null
  const tries = PATH === 'prod' ? 1 : RETRIES + 1
  for (let i = 0; i < tries + 4 && !gate(model).dayLimit; i++) {
    await acquire(model)
    if (overBudget()) return notRun
    const a0 = Date.now()
    try {
      const out = await runner(input)
      const score = scoreCase(c, roster, out.operations)
      return {
        id: c.id, cat: c.cat, kind: c.kind, split: c.split, ok: score.ok, score,
        // From the start of this call: the --rpm pacing wait and the voice-note synthesis are not latency (prod makes one
        // call, and understand() does its own retries inside it). wallMs includes both.
        ms: Date.now() - a0, wallMs: Date.now() - t0, attemptErrors,
        model: out.model, path: out.path || PATH, attempts: out.attempts, hedged: out.hedged, ...(out.nudged ? { nudged: true } : {}),
        ...(lastError ? { retriedAfter: String(lastError?.message || lastError).replace(/\s+/g, ' ').slice(0, 160) } : {}),
        ops: out.operations.map(compact), transcript: out.transcriptRoman || out.transcriptUrdu,
      }
    } catch (err) {
      attemptErrors++
      lastError = err
      const text = String(err?.message || err)
      if (/PerDay/i.test(text)) {
        gate(model).dayLimit = true
        break
      }
      const quota = /\b429\b|RESOURCE_EXHAUSTED/.test(text) ? retryAfter(err) || 20000 : null
      if (quota && PATH !== 'prod') {
        gate(model).next = Math.max(gate(model).next, Date.now() + quota)
        continue
      }
      if (!transient(err) || i >= tries - 1) break
      await new Promise(r => setTimeout(r, 3000 * 2 ** i))
    }
  }
  return {
    id: c.id, cat: c.cat, kind: c.kind, split: c.split, ok: false,
    error: gate(model).dayLimit ? 'quota_per_day' : String(lastError?.code || '') + ' ' + String(lastError?.message || lastError).replace(/\s+/g, ' ').slice(0, 300),
    score: { falseWrites: 0 }, wallMs: Date.now() - t0, attemptErrors,
  }
}

function compact(op) {
  const o = { type: op.type }
  for (const k of ['customer_id', 'customer_name', 'amount', 'threshold', 'phone', 'list_name', 'list_kind']) if (op[k] != null) o[k] = op[k]
  if (op.full_settlement) o.full = true
  return o
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  let done = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
      done++
      if (done % 20 === 0) process.stderr.write(`  ${done}/${items.length}\n`)
    }
  }))
  return out
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const quantile = (xs, q) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

function summarize(results) {
  const group = key => {
    const m = {}
    for (const r of results) {
      const g = (m[r[key]] ||= { n: 0, ok: 0 })
      g.n++
      if (r.ok) g.ok++
    }
    for (const g of Object.values(m)) g.acc = pct(g.ok, g.n)
    return m
  }
  const answered = results.filter(r => !r.error)
  const nothing = results.filter(r => r.cat === 'chitchat_unclear')
  const byModel = {}
  for (const r of answered) byModel[`${r.path}:${r.model}`] = (byModel[`${r.path}:${r.model}`] || 0) + 1
  return {
    n: results.length,
    ok: results.filter(r => r.ok).length,
    acc: pct(results.filter(r => r.ok).length, results.length),
    accAnswered: pct(answered.filter(r => r.ok).length, answered.length),
    split: group('split'),
    kind: group('kind'),
    category: group('cat'),
    falseWrites: results.reduce((s, r) => s + (r.score?.falseWrites || 0), 0),
    casesWithFalseWrites: results.filter(r => r.score?.falseWrites).map(r => r.id),
    falseWritesChitchat: nothing.reduce((s, r) => s + (r.score?.falseWrites || 0), 0),
    errors: results.filter(r => r.error).length,
    errorRate: pct(results.filter(r => r.error).length, results.length),
    attemptErrors: results.reduce((s, r) => s + (r.attemptErrors || 0), 0),
    latencyMs: { p50: quantile(answered.map(r => r.ms), 0.5), p95: quantile(answered.map(r => r.ms), 0.95), max: quantile(answered.map(r => r.ms), 1) },
    hedged: answered.filter(r => r.hedged).length,
    nudged: answered.filter(r => r.nudged).length,
    answeredBy: byModel,
    ...(REPEAT > 1 ? { everyRun: everyRun(results) } : {}),
  }
}

/** With --repeat: per category, how many cases passed in every one of their runs. */
function everyRun(results) {
  const byCase = new Map()
  for (const r of results) {
    const c = byCase.get(r.id) || { cat: r.cat, split: r.split, runs: 0, ok: 0 }
    c.runs++
    if (r.ok) c.ok++
    byCase.set(r.id, c)
  }
  const out = { cases: byCase.size, stable: 0, category: {}, flaky: [] }
  for (const [id, c] of byCase) {
    const g = (out.category[c.cat] ||= { n: 0, stable: 0 })
    g.n++
    if (c.ok === c.runs) {
      g.stable++
      out.stable++
    } else if (c.ok > 0) out.flaky.push({ id, split: c.split, ok: c.ok, runs: c.runs })
  }
  return out
}

function print(run) {
  const s = run.summary
  console.log(`\n== ${run.label} | path=${run.path} model=${run.model} set=${run.set} n=${s.n}`)
  console.log(`   exact-op accuracy ${s.acc}% (answered ${s.accAnswered}%) | dev ${s.split.dev?.acc ?? '-'}% | dev-adjacent 20% ${s.split.heldout?.ok ?? 0}/${s.split.heldout?.n ?? 0} (not a true held-out set)`)
  console.log(`   errors ${s.errors} (${s.errorRate}%), attempt errors ${s.attemptErrors} | latency p50 ${s.latencyMs.p50} ms p95 ${s.latencyMs.p95} ms | false writes ${s.falseWrites} (chitchat ${s.falseWritesChitchat})`)
  if (Object.keys(s.answeredBy).length > 1 || PATH === 'prod') console.log(`   answered by ${JSON.stringify(s.answeredBy)} hedged ${s.hedged}`)
  console.log('   ' + Object.entries(s.category).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' | '))
  if (s.everyRun) {
    const e = s.everyRun
    console.log(`   passed all ${REPEAT} runs: ${e.stable}/${e.cases} cases | ` + Object.entries(e.category).map(([k, v]) => `${k} ${v.stable}/${v.n}`).join(' | '))
    const flaky = e.flaky.filter(f => f.split !== 'heldout')
    if (flaky.length) console.log(`   flaky (passed only some runs): ${flaky.map(f => `${f.id} ${f.ok}/${f.runs}`).join(', ')}`)
  }
  const bad = run.results.filter(r => !r.ok)
  for (const r of bad.filter(r => r.split !== 'heldout').slice(0, 60)) console.log(`   x ${r.id} ${r.error ? `ERROR ${r.error}` : JSON.stringify(r.ops)}`)
  const hidden = bad.filter(r => r.split === 'heldout').length
  if (hidden) console.log(`   + ${hidden} failed run(s) in the dev-adjacent 20% split (details only in the JSON report)`)
}

const models = PATH === 'prod' ? ['(production config)'] : listOpt('models') || (PATH === 'live' ? config.liveParseModels || [] : config.parseModels)
fs.mkdirSync(OUT, { recursive: true })
const runners = {}
for (const model of models) runners[model] = await makeRunner(model)
// Interleave models so each one's pacing overlaps with the others' calls.
const tasks = cases.flatMap((c, i) => models.flatMap(model => Array.from({ length: REPEAT }, (_, rep) => ({ c, model, i, rep }))))
const t0 = Date.now()
// Every result is appended as it lands, so a run stopped half way (quota, Ctrl+C) still leaves its numbers.
const partial = path.join(OUT, `${LABEL}-${new Date(t0).toISOString().replace(/[:.]/g, '-')}.partial.jsonl`)
const done = await pool(tasks, CONCURRENCY, async t => {
  const r = { ...(await runOne(t.c, t.model, runners[t.model])), evalModel: t.model, rep: t.rep, liveSessionsSoFar: usage.liveSessions }
  fs.appendFileSync(partial, `${JSON.stringify(r)}\n`)
  return r
})
const runs = models.map(model => {
  const results = done.filter(r => r.evalModel === model)
  const run = { label: LABEL, path: PATH, model, set: SET, cases: path.relative(ROOT, CASES_FILE), options: extra, noGenerate: NO_GENERATE, startedAt: new Date(t0).toISOString(), seconds: Math.round((Date.now() - t0) / 1000), summary: summarize(results), results }
  if (PATH === 'prod') run.config = Object.fromEntries(Object.entries(config).filter(([k]) => /parse|hedge|patience|interim|voice|live/i.test(k)))
  print(run)
  return run
})
// Whole process (all models of this run together).
runs.forEach(r => (r.usage = usage))
console.log(`   key usage: ${usage.liveSessions} Live sessions opened${usage.liveRefused ? `, ${usage.liveRefused} refused by --max-live` : ''}${NO_GENERATE ? `, ${usage.generateBlocked} generateContent calls blocked (none sent)` : ''}`)
const file = path.join(OUT, `${LABEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(file, JSON.stringify(runs, null, 1))
console.log(`\nreport: ${file}`)
process.exit(0)
