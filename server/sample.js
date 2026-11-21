// Optional, clearly-labelled demo data: six weeks of a Peshawar kiryana shop's khata, so a brand-new dashboard
// looks alive on pitch day. Every row is marked (customers.sample = 1, lists.sample = 1, entries.source = 'sample')
// and removeSample() takes out exactly those rows. Sample people have no phone numbers: any number that looks real
// could belong to someone, and a reminder link must never open a chat with a stranger.
import { one, all, run, tx, json } from './db.js'
import { newId, DAY, startOfToday, dayKey } from './util.js'
import * as ledger from './ledger.js'

export const SAMPLE_SOURCE = 'sample'
const WEEKS = 6
const MAX_LISTS = 20

const LISTS = {
  mohalla: { name: 'Mohalla', nameUrdu: 'محلہ', kind: 'customers' },
  factory: { name: 'Factory wale', nameUrdu: 'فیکٹری والے', kind: 'customers' },
  suppliers: { name: 'Suppliers', nameUrdu: 'سپلائرز', kind: 'suppliers' },
}

// Retail prices (Rs, late 2026, rounded) — used to make each udhaar amount the sum of what was bought.
const PRICE = {
  'atta 10kg': 1250, 'atta 5kg': 640, 'ghee 1kg': 560, 'cooking oil 1 litre': 590, 'cheeni 1kg': 165, 'cheeni 2kg': 330,
  'chai patti 1 pack': 480, 'doodh 1 litre': 220, 'doodh 2 litre': 440, 'sabun 2': 260, 'chawal 2kg': 760, 'chawal 5kg': 1900,
  'daal chana 1kg': 320, 'daal masoor 1kg': 360, 'anday 1 darjan': 380, 'double roti': 180, 'dahi 1kg': 260, 'surf 1kg': 540,
  'namak 1 pack': 60, 'biscuit 2 pack': 100, 'besan 1kg': 300, 'lal mirch 250g': 260, 'cold drink 1.5 litre': 230,
}
const BASKETS = {
  family: ['atta 10kg', 'ghee 1kg', 'cheeni 2kg', 'chai patti 1 pack', 'chawal 5kg', 'daal chana 1kg', 'doodh 2 litre', 'sabun 2', 'surf 1kg', 'cooking oil 1 litre', 'lal mirch 250g', 'besan 1kg'],
  daily: ['doodh 1 litre', 'doodh 2 litre', 'double roti', 'anday 1 darjan', 'dahi 1kg', 'cheeni 1kg', 'biscuit 2 pack', 'namak 1 pack', 'chai patti 1 pack'],
  worker: ['chai patti 1 pack', 'cheeni 2kg', 'atta 5kg', 'sabun 2', 'biscuit 2 pack', 'cold drink 1.5 litre', 'ghee 1kg', 'daal masoor 1kg', 'chawal 2kg'],
}
// Wholesale stock the shop buys on credit from its suppliers.
const STOCK = {
  rehman: [['atta 10kg x 20', 22800], ['ghee 1kg x 24', 12600], ['cheeni 50kg bori', 7700], ['cooking oil 1 litre x 12', 6600]],
  hajigul: [['chai patti 1 carton', 10800], ['sabun 1 carton', 8400], ['chawal 25kg bori', 8900], ['daal chana 20kg', 6100], ['surf 1 carton', 11800]],
}

// plan: how this person buys and pays.
//  weekly   — buys often, pays most of it every week on `payDay` (0 = Sunday)
//  partial  — big ration buys, pays round sums every ~10 days, always leaves a balance
//  salary   — factory worker: buys all month, clears the khata on salary day (`salaryDay` of the month)
//  overdue  — stopped paying (and coming) weeks ago
//  paidoff  — cleared everything `clearedDaysAgo` days ago (paying part of it weekly on `payDay` before that, if set)
//  supplier — the shop takes stock on credit and pays part of it later
const PEOPLE = [
  { key: 'gul', name: 'Gul Khan', nameUrdu: 'گل خان', list: null, plan: 'weekly', basket: 'family', visit: 0.35, payDay: 5 },
  { key: 'sher', name: 'Sher Ali', nameUrdu: 'شیر علی', list: null, plan: 'partial', basket: 'family', visit: 0.22 },
  { key: 'bilal', name: 'Bilal Hussain', nameUrdu: 'بلال حسین', list: null, plan: 'paidoff', basket: 'family', visit: 0.3, clearedDaysAgo: 6 },
  { key: 'naveed', name: 'Naveed Akhtar', nameUrdu: 'نوید اختر', list: null, plan: 'overdue', basket: 'family', visit: 0.35, lastSeenDaysAgo: 19, paidOnceDaysAgo: 36 },
  { key: 'zubair', name: 'Zubair Khattak', nameUrdu: 'زبیر خٹک', list: 'mohalla', plan: 'weekly', basket: 'daily', visit: 0.5, payDay: 1 },
  { key: 'imran', name: 'Imran Butt', nameUrdu: 'عمران بٹ', list: 'mohalla', plan: 'partial', basket: 'daily', visit: 0.45 },
  { key: 'farhan', name: 'Farhan Siddiqui', nameUrdu: 'فرحان صدیقی', list: 'mohalla', plan: 'weekly', basket: 'daily', visit: 0.4, payDay: 0 },
  { key: 'ayesha', name: 'Ayesha Noor', nameUrdu: 'عائشہ نور', list: 'mohalla', plan: 'paidoff', basket: 'daily', visit: 0.5, clearedDaysAgo: 2, payDay: 3 },
  { key: 'wajid', name: 'Wajid Afridi', nameUrdu: 'واجد آفریدی', list: 'factory', plan: 'salary', basket: 'worker', visit: 0.4, salaryDay: 1 },
  { key: 'rashid', name: 'Rashid Mehmood', nameUrdu: 'راشد محمود', list: 'factory', plan: 'salary', basket: 'worker', visit: 0.35, salaryDay: 3 },
  { key: 'saleem', name: 'Saleem Yousafzai', nameUrdu: 'سلیم یوسفزئی', list: 'factory', plan: 'salary', basket: 'worker', visit: 0.35, salaryDay: 2 },
  { key: 'kamran', name: 'Kamran Qureshi', nameUrdu: 'کامران قریشی', list: 'factory', plan: 'overdue', basket: 'worker', visit: 0.45, lastSeenDaysAgo: 24, paidOnceDaysAgo: null },
  { key: 'rehman', name: 'Rehman Traders', nameUrdu: 'رحمان ٹریڈرز', list: 'suppliers', plan: 'supplier', stock: 'rehman', every: 7 },
  { key: 'hajigul', name: 'Haji Gul Wholesale', nameUrdu: 'حاجی گل ہول سیل', list: 'suppliers', plan: 'supplier', stock: 'hajigul', every: 9 },
]

// Small seeded PRNG: the same person always gets the same history shape, so the founder can rehearse with it.
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
const seedOf = key => [...key].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)
const pick = (r, list) => list[Math.floor(r() * list.length)]
const round = (n, to) => Math.max(to, Math.round(n / to) * to)
const floorTo = (n, to) => Math.floor(n / to) * to

// PKT has no daylight saving, so "N days ago at 18:30" is plain arithmetic from today's midnight.
const at = (todayStart, daysAgo, minutes) => todayStart - daysAgo * DAY + minutes * 60e3
const weekday = ts => new Date(ts + 5 * 3600e3).getUTCDay()
const dayOfMonth = ts => Number(dayKey(ts).slice(8, 10))

function basketFor(r, person) {
  const items = []
  const n = person.basket === 'family' ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2)
  while (items.length < n) {
    const item = pick(r, BASKETS[person.basket])
    if (!items.includes(item)) items.push(item)
  }
  return { items, amount: round(items.reduce((s, i) => s + PRICE[i], 0), 10) }
}

/** One person's six weeks, oldest first: [{ kind, amount, items, at }]. Pure — no database. */
function historyFor(person, now) {
  const r = rng(seedOf(person.key))
  const todayStart = startOfToday(now)
  const out = []
  let balance = 0
  const add = (kind, amount, items, ts) => {
    if (ts >= now - 10 * 60e3 || !(amount > 0)) return
    out.push({ kind, amount, items, at: ts })
    balance += kind === 'credit' ? amount : -amount
  }
  const days = WEEKS * 7

  if (person.plan === 'supplier') {
    const offset = person.key === 'rehman' ? 1 : 4
    let lastBill = 0
    for (let d = days - offset; d >= 0; d -= person.every) {
      const stock = STOCK[person.stock]
      const first = pick(r, stock)
      const lines = r() < 0.5 ? [first] : [first, pick(r, stock.filter(s => s !== first))]
      lastBill = lines.reduce((s, [, p]) => s + p, 0)
      add('credit', lastBill, lines.map(([name]) => name), at(todayStart, d, 11 * 60 + Math.floor(r() * 120)))
      // Pays part of the running balance a few days after each delivery (never the whole thing).
      const payDay = d - 3
      if (payDay >= 1 && balance > lastBill) add('payment', floorTo(balance * (0.45 + r() * 0.2), 1000), [], at(todayStart, payDay, 17 * 60 + Math.floor(r() * 90)))
    }
    return out
  }

  let paidThisMonth = null
  let lastPartial = days
  for (let d = days; d >= 0; d--) {
    const lastSeen = person.plan === 'overdue' ? person.lastSeenDaysAgo : person.plan === 'paidoff' ? person.clearedDaysAgo + 1 : 0
    if (d >= lastSeen && r() < person.visit) {
      const { items, amount } = basketFor(r, person)
      add('credit', amount, items, at(todayStart, d, 8 * 60 + Math.floor(r() * 13 * 60)))
    }
    const evening = at(todayStart, d, 19 * 60 + Math.floor(r() * 150))
    const morning = at(todayStart, d, 9 * 60 + Math.floor(r() * 120))
    switch (person.plan) {
      case 'weekly':
        if (weekday(evening) === person.payDay && balance > 0) add('payment', balance < 1000 ? balance : floorTo(balance * (0.5 + r() * 0.35), 500), [], evening)
        break
      case 'partial':
        if (lastPartial - d >= 9 + Math.floor(r() * 4) && balance > 2500) {
          add('payment', floorTo(balance * (0.35 + r() * 0.25), 500), [], evening)
          lastPartial = d
        }
        break
      case 'salary': {
        const month = dayKey(morning).slice(0, 7)
        if (dayOfMonth(morning) >= person.salaryDay && dayOfMonth(morning) <= person.salaryDay + 3 && paidThisMonth !== month && balance > 0) {
          add('payment', balance, [], morning)
          paidThisMonth = month
        }
        break
      }
      case 'overdue':
        if (person.paidOnceDaysAgo === d && balance > 1000) add('payment', floorTo(balance * 0.4, 500), [], evening)
        break
      case 'paidoff':
        if (d === person.clearedDaysAgo && balance > 0) add('payment', balance, [], evening)
        else if (d > person.clearedDaysAgo && weekday(evening) === person.payDay && balance >= 1000) add('payment', floorTo(balance * (0.5 + r() * 0.3), 500), [], evening)
        break
    }
  }
  return out
}

/** The whole sample shop: people with their entries, oldest first. Exported for tests. */
export function buildSample(now = Date.now()) {
  return PEOPLE.map(p => ({ ...p, entries: historyFor(p, now) }))
}

// ---------------------------------------------------------------- database

const fail = (code, status) => Object.assign(new Error(code), { code, status })

/** Migration 4 (lists, customers.list_id, customers.sample) must be in place. */
export function schemaReady() {
  const cols = all('PRAGMA table_info(customers)').map(c => c.name)
  return cols.includes('sample') && cols.includes('list_id') && Boolean(one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'lists'"))
}

const norm = typeof ledger.normalizeName === 'function' ? ledger.normalizeName : s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const normUr = typeof ledger.normalizeUrdu === 'function' ? ledger.normalizeUrdu : s => String(s ?? '').replace(/\s+/g, ' ').trim()
const sameName = (a, b) => {
  const x = norm(a)
  return Boolean(x) && x === norm(b)
}
// Lists compare the way the ledger compares them ("Factory walon ki list" = "Factory wale"), by name, Urdu name or alias.
const listKey = typeof ledger.listKey === 'function' ? ledger.listKey : norm
const listKeys = l => [l.name, l.name_urdu, ...json(l.aliases, [])].filter(Boolean).map(listKey).filter(Boolean)
const sameList = (l, def) => [def.name, def.nameUrdu].map(listKey).some(k => k && listKeys(l).includes(k))

export function sampleStatus(tenantId) {
  if (!schemaReady()) return { ready: false, present: false, people: 0, lists: 0, entries: 0 }
  const people = one('SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND sample = 1', tenantId).n
  const lists = one('SELECT COUNT(*) AS n FROM lists WHERE tenant_id = ? AND sample = 1', tenantId).n
  const entries = one('SELECT COUNT(*) AS n FROM entries WHERE tenant_id = ? AND source = ?', tenantId, SAMPLE_SOURCE).n
  return { ready: true, present: people + lists + entries > 0, people, lists, entries }
}

/**
 * Add the sample shop history. Reuses the shop's own lists when the names match (those stay the shop's), never adds
 * a person whose name is already in the khata (two "Gul Khan"s would make voice entries ask "which one?"), and keeps
 * within the 20-list limit (people whose list cannot be created go to General).
 */
export function seedSample(tenantId, now = Date.now()) {
  if (!schemaReady()) throw fail('schema_not_ready', 503)
  if (sampleStatus(tenantId).present) throw fail('already_has_sample', 409)
  const history = buildSample(now)
  const start = startOfToday(now) - WEEKS * 7 * DAY

  return tx(() => {
    const existing = all('SELECT name, name_urdu, aliases FROM customers WHERE tenant_id = ? AND merged_into IS NULL', tenantId)
    const taken = p => existing.some(c => sameName(c.name, p.name) || json(c.aliases, []).some(a => sameName(a, p.name)) || (c.name_urdu && normUr(c.name_urdu) === normUr(p.nameUrdu)))

    const lists = all('SELECT id, name, name_urdu, aliases, kind FROM lists WHERE tenant_id = ? ORDER BY created_at, rowid', tenantId)
    const listIds = {}
    let createdLists = 0
    for (const [key, def] of Object.entries(LISTS)) {
      const same = lists.find(l => sameList(l, def) && l.kind === def.kind)
      if (same) {
        listIds[key] = same.id
        continue
      }
      // Suppliers can go in any supplier list the shop already has.
      const anySuppliers = def.kind === 'suppliers' && lists.find(l => l.kind === 'suppliers')
      if (anySuppliers) {
        listIds[key] = anySuppliers.id
        continue
      }
      if (lists.length + createdLists >= MAX_LISTS) {
        listIds[key] = def.kind === 'suppliers' ? undefined : null
        continue
      }
      // The same name on a list of the other kind: names are unique per shop, so the sample one gets a suffix.
      const clash = lists.some(l => sameList(l, def))
      const id = newId('l')
      run(
        'INSERT INTO lists (id, tenant_id, name, name_urdu, kind, aliases, sample, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        id, tenantId, clash ? `${def.name} (sample)` : def.name, clash ? null : def.nameUrdu, def.kind, '[]', start + createdLists * 60e3,
      )
      listIds[key] = id
      createdLists++
    }

    const skipped = []
    let customers = 0
    let suppliers = 0
    const rows = []
    for (const p of history) {
      const listId = p.list ? listIds[p.list] : null
      // A supplier with no supplier list would look like a customer who owes the shop; leave it out instead.
      if (taken(p) || listId === undefined || !p.entries.length) {
        skipped.push(p.name)
        continue
      }
      const id = newId('c')
      run(
        'INSERT INTO customers (id, tenant_id, name, name_urdu, phone, aliases, created_at, list_id, sample) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1)',
        id, tenantId, p.name, p.nameUrdu, '[]', Math.max(start, p.entries[0].at - 3600e3), listId,
      )
      if (p.plan === 'supplier') suppliers++
      else customers++
      for (const e of p.entries) rows.push({ ...e, customerId: id })
    }
    // Inserted in time order, so "the last entry" (rowid order) is also the latest one.
    rows.sort((a, b) => a.at - b.at)
    for (const e of rows) {
      run(
        'INSERT INTO entries (id, tenant_id, customer_id, kind, amount, items, note, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)',
        newId('e'), tenantId, e.customerId, e.kind, e.amount, JSON.stringify(e.items), SAMPLE_SOURCE, e.at,
      )
    }
    return { people: customers + suppliers, customers, suppliers, lists: createdLists, entries: rows.length, skipped }
  })
}

/**
 * Remove every sample person (their entries go with them, including any added to them during a demo), every
 * sample entry, and the sample lists. A sample list that a real person was added to stays, as an ordinary list.
 */
export function removeSample(tenantId) {
  if (!schemaReady()) return { people: 0, customers: 0, suppliers: 0, lists: 0, keptLists: 0, entries: 0, realEntries: 0 }
  return tx(() => {
    const people = all(
      `SELECT c.id, COALESCE(l.kind, 'customers') AS kind FROM customers c LEFT JOIN lists l ON l.id = c.list_id
       WHERE c.tenant_id = ? AND c.sample = 1`,
      tenantId,
    )
    const ids = people.map(p => p.id)
    const marks = ids.map(() => '?').join(',') || "''"
    const onPeople = one(`SELECT COUNT(*) AS n, COUNT(CASE WHEN source != ? THEN 1 END) AS real FROM entries WHERE customer_id IN (${marks})`, SAMPLE_SOURCE, ...ids)
    // Sample entries that a merge moved onto a real person.
    const strays = run(`DELETE FROM entries WHERE tenant_id = ? AND source = ? AND customer_id NOT IN (${marks})`, tenantId, SAMPLE_SOURCE, ...ids).changes
    // Someone merged a real khata into a sample person: bring that row back instead of leaving it hidden.
    if (ids.length) run(`UPDATE customers SET merged_into = NULL WHERE tenant_id = ? AND sample = 0 AND merged_into IN (${marks})`, tenantId, ...ids)
    run('DELETE FROM customers WHERE tenant_id = ? AND sample = 1', tenantId)

    let lists = 0
    let keptLists = 0
    for (const l of all('SELECT id FROM lists WHERE tenant_id = ? AND sample = 1', tenantId)) {
      const members = one('SELECT COUNT(*) AS n FROM customers WHERE list_id = ? AND merged_into IS NULL', l.id).n
      if (members) {
        run('UPDATE lists SET sample = 0 WHERE id = ?', l.id)
        keptLists++
      } else {
        run('DELETE FROM lists WHERE id = ?', l.id)
        lists++
      }
    }
    const suppliers = people.filter(p => p.kind === 'suppliers').length
    return {
      people: people.length,
      customers: people.length - suppliers,
      suppliers,
      lists,
      keptLists,
      entries: onPeople.n + strays,
      realEntries: onPeople.real,
    }
  })
}
