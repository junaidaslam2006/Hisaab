// Traction numbers from the real database, read-only (safe while the server runs).
// Usage (in the hisaab-app folder):
//   node scripts/metrics.mjs [--exclude <phone,...>] [--since YYYY-MM-DD] [--json] [--data <data dir>]
// --exclude (or METRICS_EXCLUDE in the environment or .env): shops left out, by WhatsApp number (your demo shop).
// --since: only entries and messages from that day (00:00 Pakistan time) on.
// Sample data (customers.sample = 1, their entries, entries with source 'sample') is always left out.
// Every number is counted from the rows; nothing is estimated.
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../server/config.js'
import { normalizePhone, dayKey } from '../server/util.js'

const { emitWarning } = process
process.emitWarning = (w, ...rest) => (/SQLite is an experimental feature/.test(String(w?.message ?? w)) ? undefined : emitWarning.call(process, w, ...rest))
const { DatabaseSync } = await import('node:sqlite')

const HOUR = 3600e3
const DAY = 24 * HOUR
const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const asJson = args.includes('--json')
const dataDir = path.resolve(opt('--data') || config.dataDir)
const dbFile = path.join(dataDir, 'hisaab.db')
const sinceArg = opt('--since')
const excludeArg = opt('--exclude') ?? process.env.METRICS_EXCLUDE ?? ''

const die = msg => {
  console.error(`metrics: ${msg}`)
  process.exit(2)
}
let since = null
if (sinceArg) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceArg)) die('--since needs a date like 2026-11-01')
  since = Date.parse(`${sinceArg}T00:00:00+05:00`)
  if (!Number.isFinite(since)) die(`--since: not a date: ${sinceArg}`)
}
if (!fs.existsSync(dbFile)) die(`no database at ${dbFile}`)

const now = Date.now()
const PKT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' })
const pkt = ts => `${PKT.format(ts)} PKT`
const masked = phone => {
  const d = String(phone || '')
  const local = d.startsWith('92') && d.length === 12 ? `0${d.slice(2)}` : d
  return local.length > 4 ? `${local.slice(0, 4)}…${local.slice(-4)}` : local
}

const db = new DatabaseSync(dbFile, { readOnly: true })
db.exec('PRAGMA busy_timeout = 3000')
const all = (sql, ...p) => db.prepare(sql).all(...p)
const cols = t => all(`PRAGMA table_info(${t})`).map(c => c.name)
const hasSample = cols('customers').includes('sample')
const hasLists = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lists'").length > 0

// ---------------------------------------------------------------- who is left out

const tenants = all('SELECT id, phone, shop_name, wa_dir, wa_status FROM tenants')
const wanted = excludeArg.split(',').map(s => s.trim()).filter(Boolean)
const excludedIds = new Set()
const excludedShops = []
for (const raw of wanted) {
  const phone = normalizePhone(raw)
  const t = tenants.find(x => x.phone === phone)
  if (!t) {
    excludedShops.push({ given: masked(phone || raw), found: false })
    continue
  }
  if (excludedIds.has(t.id)) continue
  excludedIds.add(t.id)
  excludedShops.push({
    given: masked(t.phone),
    found: true,
    shop: t.shop_name || '(no shop name)',
    entries: all('SELECT COUNT(*) AS n FROM entries WHERE tenant_id = ?', t.id)[0].n,
    messages: all('SELECT COUNT(*) AS n FROM messages WHERE tenant_id = ?', t.id)[0].n,
  })
}
const kept = id => !excludedIds.has(id)
const shops = tenants.filter(t => kept(t.id))

const entryRows = all(
  `SELECT e.tenant_id, e.customer_id, e.kind, e.amount, e.source, e.created_at, e.voided_at,
          ${hasSample ? 'c.sample' : '0'} AS sample, c.merged_into, ${hasLists ? 'l.kind' : 'NULL'} AS list_kind
     FROM entries e JOIN customers c ON c.id = e.customer_id
     ${hasLists ? 'LEFT JOIN lists l ON l.id = c.list_id' : ''}`,
).filter(e => kept(e.tenant_id))
const isSampleEntry = e => e.sample === 1 || e.source === 'sample'
const sampleEntries = entryRows.filter(isSampleEntry).length
const sampleCustomers = hasSample ? all('SELECT tenant_id FROM customers WHERE sample = 1').filter(c => kept(c.tenant_id)).length : 0
const realAllTime = entryRows.filter(e => !isSampleEntry(e))
const real = realAllTime.filter(e => since == null || e.created_at >= since)
const messages = all('SELECT tenant_id, kind, status, error, model, ms, created_at FROM messages').filter(m => kept(m.tenant_id) && (since == null || m.created_at >= since))

// ---------------------------------------------------------------- numbers

const metrics = {}
const put = (key, label, value, extra = {}) => (metrics[key] = { label, value, ...extra })
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const count = (rows, fn) => rows.reduce((m, r) => m.set(fn(r), (m.get(fn(r)) || 0) + 1), new Map())
const distinct = (rows, fn) => new Set(rows.map(fn)).size

// Shops
const linked = shops.filter(t => t.wa_dir && t.wa_status !== 'logged_out')
put('shops_total', 'Shops (accounts)', shops.length)
put('shops_whatsapp_linked', 'Shops linked to WhatsApp now (a saved WhatsApp login the server reconnects)', linked.length, {
  byStoredStatus: Object.fromEntries(count(shops, t => t.wa_status)),
})
put('shops_with_entry', 'Shops with at least 1 real entry', distinct(real, e => e.tenant_id))
put('shops_active_24h', 'Shops with a real entry in the last 24 h (before this run)', distinct(realAllTime.filter(e => e.created_at >= now - DAY), e => e.tenant_id))
put('shops_active_7d', 'Shops with a real entry in the last 7 days (before this run)', distinct(realAllTime.filter(e => e.created_at >= now - 7 * DAY), e => e.tenant_id))
const daysPerShop = new Map()
for (const e of real) daysPerShop.set(e.tenant_id, (daysPerShop.get(e.tenant_id) || new Set()).add(dayKey(e.created_at)))
put('shops_2_days', 'Shops with real entries on 2 or more different days (Pakistan time)', [...daysPerShop.values()].filter(s => s.size >= 2).length)

// Entries
const SOURCE = {
  whatsapp_voice: ['voice', 'WhatsApp voice note'],
  web_voice: ['voice', 'Voice recorded on the dashboard'],
  whatsapp_text: ['text', 'WhatsApp text'],
  web_text: ['text', 'Text typed in the dashboard box (understood by Gemini)'],
  whatsapp_photo: ['photo', 'WhatsApp photo'],
  web_photo: ['photo', 'Photo sent from the dashboard'],
  call: ['call', 'Live call (Talk to Hisaab)'],
  web: ['form', 'Dashboard form (typed by hand, no AI)'],
}
const GROUP = { voice: 'Voice notes', text: 'Texts', photo: 'Photos', call: 'Live call', form: 'Dashboard form', other: 'Other' }
const groupOf = s => SOURCE[s]?.[0] || 'other'
const voided = real.filter(e => e.voided_at != null).length
put('entries_real', 'Real entries recorded (voided ones included)', real.length)
const byGroup = count(real, e => groupOf(e.source))
const bySource = [...count(real, e => e.source)].sort((a, b) => b[1] - a[1])
put('entries_by_source', 'Real entries by how they came in', Object.fromEntries(Object.keys(GROUP).filter(g => byGroup.get(g)).map(g => [GROUP[g], byGroup.get(g)])), {
  raw: Object.fromEntries(bySource.map(([s, n]) => [`${s} (${SOURCE[s]?.[1] || 'unknown source'})`, n])),
  rawByGroup: Object.fromEntries(Object.keys(GROUP).map(g => [GROUP[g], Object.fromEntries(bySource.filter(([s]) => groupOf(s) === g))]).filter(([, v]) => Object.keys(v).length)),
})
put('entries_voice_pct', '% of real entries from voice notes (WhatsApp + dashboard recordings)', pct(byGroup.get('voice') || 0, real.length), { unit: '%' })
put('entries_spoken_pct', '% of real entries spoken (voice notes + live call)', pct((byGroup.get('voice') || 0) + (byGroup.get('call') || 0), real.length), { unit: '%' })
put('entries_voided', 'Voided entries (undo, "cancel", dashboard cancel)', voided)
put('entries_voided_pct', 'Voided / real entries, an accuracy proxy (it also counts entries undone for other reasons)', pct(voided, real.length), { unit: '%' })

// Money (not voided)
const live = real.filter(e => e.voided_at == null)
const sum = rows => rows.reduce((s, e) => s + e.amount, 0)
const supplier = e => e.list_kind === 'suppliers'
put('rs_udhaar', 'Rs udhaar recorded (credit to customers, not voided)', sum(live.filter(e => e.kind === 'credit' && !supplier(e))), { unit: 'Rs' })
put('rs_repaid', 'Rs repaid by customers (not voided)', sum(live.filter(e => e.kind === 'payment' && !supplier(e))), { unit: 'Rs' })
put('rs_supplier_credit', 'Rs bought on credit from suppliers (not voided)', sum(live.filter(e => e.kind === 'credit' && supplier(e))), { unit: 'Rs' })
put('rs_supplier_paid', 'Rs paid to suppliers (not voided)', sum(live.filter(e => e.kind === 'payment' && supplier(e))), { unit: 'Rs' })

// People with a balance: all time, as the dashboard counts it (not voided, merged khatas folded in).
const balances = new Map()
for (const e of realAllTime) {
  if (e.voided_at != null || e.merged_into) continue
  const b = balances.get(e.customer_id) || { balance: 0, supplier: supplier(e) }
  b.balance += e.kind === 'credit' ? e.amount : -e.amount
  balances.set(e.customer_id, b)
}
const people = [...balances.values()]
const owing = people.filter(p => !p.supplier && p.balance > 0)
const owed = people.filter(p => p.supplier && p.balance > 0)
put('customers_owing', 'Customers who owe the shop now (balance > 0, all time)', owing.length, { rs: owing.reduce((s, p) => s + p.balance, 0) })
put('customers_advance', 'Customers who paid in advance now (balance < 0, all time)', people.filter(p => !p.supplier && p.balance < 0).length)
put('suppliers_owed', 'Suppliers the shops owe now (balance > 0, all time)', owed.length, { rs: owed.reduce((s, p) => s + p.balance, 0) })

// Messages
const nearest = (sorted, q) => (sorted.length ? sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] : null)
const timing = rows => {
  const ms = rows.filter(m => m.model && m.ms != null).map(m => m.ms).sort((a, b) => a - b)
  const s = v => (v == null ? null : Math.round(v / 100) / 10)
  return { n: ms.length, medianS: s(nearest(ms, 0.5)), p90S: s(nearest(ms, 0.9)) }
}
put('messages', 'Messages received', messages.length, { byKind: Object.fromEntries(count(messages, m => m.kind)) })
put('understanding_s', 'Gemini understanding time per message, seconds (messages.ms: start of understanding to the answer; not the full time to the WhatsApp reply, which is not stored). Nearest-rank median and p90', timing(messages), {
  byKind: Object.fromEntries(['voice', 'text', 'photo'].map(k => [k, timing(messages.filter(m => m.kind === k))]).filter(([, t]) => t.n)),
})
const ERR = {
  busy: 'Google busy or at a free-tier limit for 90 s',
  network: 'internet problem',
  ai_config: 'API key or setup problem',
  not_understood: 'not understood',
  interrupted: 'server stopped mid-message',
  limit: "shop's daily message limit",
}
const errors = messages.filter(m => m.status === 'error')
put('messages_error', 'Messages that ended in an error', errors.length, {
  pct: pct(errors.length, messages.length),
  byCode: Object.fromEntries([...count(errors, m => m.error || 'unknown')].sort((a, b) => b[1] - a[1]).map(([c, n]) => [`${c}${ERR[c] ? ` (${ERR[c]})` : ''}`, n])),
})
db.close()

const report = {
  runAt: new Date(now).toISOString(),
  runAtPkt: pkt(now),
  database: `${dbFile} (opened read-only)`,
  period: since == null ? 'all time' : `since ${pkt(since)}`,
  excluded: {
    sample: { customers: sampleCustomers, entries: sampleEntries },
    shops: excludedShops,
  },
  metrics,
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// ---------------------------------------------------------------- text

const n = v => (v == null ? 'none' : Number(v).toLocaleString('en-US'))
const p1 = v => (v == null ? 'none' : `${v.toFixed(1)}%`)
const s1 = v => `${v.toFixed(1)} s`
const show = m => (m.unit === 'Rs' ? `Rs ${n(m.value)}` : m.unit === '%' ? p1(m.value) : n(m.value))
const line = (label, value) => console.log(`  ${label}${' '.repeat(Math.max(2, 60 - label.length))}${value}`)
const sub = obj => Object.entries(obj).map(([k, v]) => `${k} ${n(v)}`).join(' · ')
const M = metrics

console.log(`Hisaab metrics · run ${report.runAtPkt}`)
console.log(`Database: ${report.database}`)
console.log(`Period: ${report.period}. "Real" = not sample data and not an excluded shop.`)
console.log(`Excluded: sample data (${n(sampleCustomers)} ${sampleCustomers === 1 ? 'person' : 'people'}, ${n(sampleEntries)} ${sampleEntries === 1 ? 'entry' : 'entries'})` +
  (excludedShops.length ? `; shops: ${excludedShops.map(s => (s.found ? `${s.shop} ${s.given} (${n(s.entries)} entries, ${n(s.messages)} messages)` : `${s.given} (no such shop)`)).join('; ')}` : '; no shops (use --exclude <phone> for your demo shop)'))
console.log('')
console.log('Shops')
line('Shops (accounts)', n(M.shops_total.value))
line('Linked to WhatsApp now', n(M.shops_whatsapp_linked.value))
console.log(`    stored WhatsApp status: ${sub(M.shops_whatsapp_linked.byStoredStatus) || 'none'}`)
line('With at least 1 real entry', n(M.shops_with_entry.value))
line('With a real entry in the last 24 h', n(M.shops_active_24h.value))
line('With a real entry in the last 7 days', n(M.shops_active_7d.value))
line('With real entries on 2 or more days (PKT)', n(M.shops_2_days.value))
console.log('')
console.log('Entries')
line('Real entries recorded (voided included)', n(M.entries_real.value))
for (const [g, v] of Object.entries(M.entries_by_source.value)) line(`  ${g} (${Object.keys(M.entries_by_source.rawByGroup[g]).join(', ')})`, n(v))
line('From voice notes', show(M.entries_voice_pct))
line('Spoken (voice notes + live call)', show(M.entries_spoken_pct))
line('Voided (an accuracy proxy)', `${n(M.entries_voided.value)} = ${show(M.entries_voided_pct)}`)
console.log('')
console.log('Money (entries not voided)')
line('Udhaar recorded (credit to customers)', show(M.rs_udhaar))
line('Repaid by customers', show(M.rs_repaid))
line('Bought on credit from suppliers', show(M.rs_supplier_credit))
line('Paid to suppliers', show(M.rs_supplier_paid))
line('Customers who owe now (all time)', `${n(M.customers_owing.value)} · Rs ${n(M.customers_owing.rs)}`)
line('Customers paid in advance now (all time)', n(M.customers_advance.value))
line('Suppliers owed now (all time)', `${n(M.suppliers_owed.value)} · Rs ${n(M.suppliers_owed.rs)}`)
console.log('')
console.log('Messages')
line('Messages received', `${n(M.messages.value)}${M.messages.value ? ` (${sub(M.messages.byKind)})` : ''}`)
const t = M.understanding_s.value
line(`Gemini understanding time, median / p90 (n = ${n(t.n)})`, t.n ? `${s1(t.medianS)} / ${s1(t.p90S)}` : 'none')
for (const [k, v] of Object.entries(M.understanding_s.byKind)) line(`  ${k} (n = ${n(v.n)})`, `${s1(v.medianS)} / ${s1(v.p90S)}`)
console.log('    messages.ms: start of understanding to the answer. Not the full time to the WhatsApp reply (not stored).')
line('Ended in an error (nothing written)', `${n(M.messages_error.value)}${M.messages_error.pct != null ? ` = ${p1(M.messages_error.pct)}` : ''}`)
for (const [c, v] of Object.entries(M.messages_error.byCode)) line(`  ${c}`, n(v))
