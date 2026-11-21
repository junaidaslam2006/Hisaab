import { one, all, run, tx, json } from './db.js'
import { newId, DAY, dayKey, startOfToday, normalizePhone, localPhone } from './util.js'
import { publish } from './realtime.js'

const httpError = (status, code, extra) => Object.assign(new Error(code), { status }, extra ? { extra } : {})

// ---------------------------------------------------------------- name matching

const HONORIFICS = new Set([
  'bhai', 'bhaijan', 'bhaijaan', 'bhaiya', 'sahab', 'sahib', 'saab', 'sb', 'ji', 'jee', 'chacha', 'chachu', 'kaka',
  'mamu', 'mamoo', 'baji', 'baaji', 'bibi', 'uncle', 'aunty', 'anti', 'lala', 'haji', 'hajji', 'ustad', 'mr', 'mrs',
  'miss', 'sir', 'madam', 'ka', 'ki', 'ke', 'ko', 'ne', 'wala', 'wale', 'wali',
])
const URDU_HONORIFICS = new Set(['بھائی', 'صاحب', 'جی', 'چاچا', 'باجی', 'بی', 'انکل', 'لالہ', 'حاجی', 'استاد', 'کا', 'کی', 'کے', 'کو', 'نے', 'والا', 'والے', 'والی'])

// Words that are titles after a name ("Umar wali", "Khan sahib") but real given names when they come first
// ("Wali Khan", "Haji Gul", "Lala Rukh"). Only strip them in non-first position.
const GIVEN_NAMES = new Set(['wali', 'sahib', 'lala', 'haji', 'hajji', 'حاجی', 'لالہ'])

// Drop honorifics ("Umar bhai" -> "umar") but keep them when they are the whole name ("Chacha").
const withoutHonorifics = (tokens, isHonorific) => {
  const words = tokens.filter(Boolean)
  const kept = words.filter((t, i) => !isHonorific(t) || (i === 0 && GIVEN_NAMES.has(t)))
  return kept.length ? kept : words
}

/** Exact spelling (case/space-insensitive), checked before any honorific stripping. */
const rawName = s => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

// Amounts: positive whole rupees up to 10 crore. Anything else is treated as "amount not understood".
export const okAmount = v => Number.isSafeInteger(v) && v > 0 && v <= 100_000_000

const cleanItems = items => (Array.isArray(items) ? items.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 80)).slice(0, 10) : [])

export function normalizeName(name) {
  const tokens = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
  return withoutHonorifics(tokens, t => HONORIFICS.has(t)).join(' ')
}

/** One spelling per Urdu letter (Arabic vs Urdu yeh / heh / kaf), without diacritics. */
const urduLetters = s =>
  String(s ?? '')
    .replace(/[ً-ٰٟ۪-ۭ]/g, '')
    .replace(/[يىے]/g, 'ی')
    .replace(/[هۂۃة]/g, 'ہ')
    .replace(/ك/g, 'ک')

export function normalizeUrdu(name) {
  return withoutHonorifics(urduLetters(name).split(/\s+/), t => URDU_HONORIFICS.has(t)).join(' ')
}

const vowelClass = c => ('ou'.includes(c) ? 'o' : 'ei'.includes(c) ? 'e' : c)
function skeleton(n) {
  const s = n.replace(/\s+/g, '')
  return vowelClass(s[0] || '') + s.slice(1).replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1')
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

const titleCase = s => String(s).trim().replace(/\s+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())

// ---------------------------------------------------------------- list names

export const MAX_LISTS = 20
const LIST_KINDS = new Set(['customers', 'suppliers'])

// Words people wrap around a list's name: "Factory walon ki list", "mohalle wale log", "teachers ka khata".
const LIST_FILLER = new Set([
  'list', 'lst', 'ki', 'ka', 'ke', 'ko', 'mein', 'me', 'main', 'mai', 'se', 'wale', 'wala', 'wali', 'walay', 'walon',
  'walo', 'waale', 'waala', 'waali', 'waalon', 'vale', 'vala', 'valon', 'log', 'logon', 'logo', 'khata', 'khaata',
  'khate', 'khaate', 'group', 'the', 'my', 'meri', 'mera', 'mere', 'sab', 'saare', 'sare', 'all', 'people',
])
const URDU_LIST_FILLER = new Set(
  ['لسٹ', 'فہرست', 'کی', 'کا', 'کے', 'کو', 'میں', 'والے', 'والا', 'والی', 'والوں', 'لوگ', 'لوگوں', 'کھاتہ', 'کھاتے', 'گروپ', 'میری', 'میرے', 'سب'].map(urduLetters),
)
// Said instead of a list's own name: the General khata, or "the suppliers" as a whole.
const GENERAL_WORDS = new Set(['general', 'genral', 'jenral', 'aam', 'normal', 'default', ...['عام', 'جنرل'].map(urduLetters)])
const SUPPLIER_WORDS = new Set(['supplier', 'suplier', 'supplyer', 'saplayer', 'saplair', 'vendor', ...['سپلائر', 'سپلائرز', 'سپلائیر'].map(urduLetters)])
const SUPPLIERS_DEFAULT = { name: 'Suppliers', nameUrdu: 'سپلائرز', kind: 'suppliers' }

const isUrduScript = s => /[؀-ۿ]/.test(s) && !/[a-z]/i.test(s)

/** Comparable form of a list name: "Factory walon ki list" -> "factory", "Teachers" -> "teacher". */
export function listKey(name) {
  const s = String(name ?? '').trim()
  if (!s) return ''
  let tokens
  let filler
  if (isUrduScript(s)) {
    tokens = urduLetters(s).replace(/[^؀-ۿ0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    filler = URDU_LIST_FILLER
  } else {
    tokens = s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    filler = LIST_FILLER
  }
  const kept = tokens.filter(t => !filler.has(t))
  return (kept.length ? kept : tokens).join(' ')
}

/** How a list name is stored: as said, minus a trailing "list" ("Teachers ki list" -> "Teachers"). */
function cleanListName(name) {
  let s = String(name ?? '').replace(/["'`*_~“”‘’]/g, '').trim().replace(/\s+/g, ' ')
  const stripped = s
    .replace(/\s+(?:(?:ki|ka|ke)\s+)?(?:list|lists|lst)$/i, '')
    .replace(/\s+(?:(?:کی|کا|کے)\s+)?(?:لسٹ|فہرست)$/, '')
    .trim()
  if (stripped) s = stripped
  s = s.slice(0, 40).trim()
  if (!/[\p{L}\p{N}]/u.test(s)) return ''
  return /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s
}

// Urdu script for common list words, so a spoken reply can say "فیکٹری والے" instead of reading Roman letters.
const URDU_WORDS = {
  factory: 'فیکٹری', wale: 'والے', wala: 'والا', wali: 'والی', walon: 'والوں', walay: 'والے', waale: 'والے', log: 'لوگ',
  ki: 'کی', ka: 'کا', ke: 'کے', mohalla: 'محلہ', mohallah: 'محلہ', muhalla: 'محلہ', mohalle: 'محلے', teacher: 'ٹیچر',
  teachers: 'ٹیچرز', supplier: 'سپلائر', suppliers: 'سپلائرز', school: 'سکول', wholesale: 'ہول سیل', wholesalers: 'ہول سیلرز',
  relatives: 'رشتہ دار', rishtedar: 'رشتہ دار', rishtedaar: 'رشتہ دار', family: 'فیملی', dost: 'دوست', friends: 'دوست',
  office: 'آفس', staff: 'سٹاف', worker: 'ورکر', workers: 'ورکرز', mazdoor: 'مزدور', market: 'مارکیٹ', bazaar: 'بازار',
  bazar: 'بازار', gali: 'گلی', masjid: 'مسجد', madrasa: 'مدرسہ', hospital: 'ہسپتال', doctor: 'ڈاکٹر', doctors: 'ڈاکٹرز',
  driver: 'ڈرائیور', drivers: 'ڈرائیورز', police: 'پولیس', fauji: 'فوجی', students: 'سٹوڈنٹس', hostel: 'ہاسٹل', mill: 'مل',
  customers: 'کسٹمرز', regular: 'ریگولر', dukaan: 'دکان', dukan: 'دکان', gaon: 'گاؤں', colony: 'کالونی', town: 'ٹاؤن',
  road: 'روڈ', chowk: 'چوک', phase: 'فیز', block: 'بلاک', sector: 'سیکٹر', kiryana: 'کریانہ', karyana: 'کریانہ',
  salary: 'سیلری', mahana: 'ماہانہ', monthly: 'منتھلی', weekly: 'ویکلی', daily: 'ڈیلی', dihari: 'دیہاڑی', university: 'یونیورسٹی',
  college: 'کالج', bank: 'بینک', medical: 'میڈیکل', traders: 'ٹریڈرز', company: 'کمپنی', distributors: 'ڈسٹری بیوٹرز',
  distributor: 'ڈسٹری بیوٹر', agency: 'ایجنسی', store: 'سٹور', purane: 'پرانے', naye: 'نئے', khaas: 'خاص', vip: 'وی آئی پی',
  buyers: 'بائرز', kapra: 'کپڑا', kapre: 'کپڑے', sabzi: 'سبزی', phal: 'پھل', fruit: 'فروٹ', doodh: 'دودھ', gosht: 'گوشت',
  mandi: 'منڈی', hamsaye: 'ہمسائے', padosi: 'پڑوسی', neighbours: 'ہمسائے', khandan: 'خاندان',
}
function urduListName(name) {
  const words = String(name).toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length || !words.every(w => URDU_WORDS[w] || /^\d+$/.test(w))) return null
  return words.map(w => URDU_WORDS[w] || w).join(' ')
}

// ---------------------------------------------------------------- reads

const CUSTOMER_SQL = `
  SELECT c.*, l.name AS list_name, l.name_urdu AS list_name_urdu, l.kind AS list_kind,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL THEN CASE e.kind WHEN 'credit' THEN e.amount ELSE -e.amount END END), 0) AS balance,
    MAX(CASE WHEN e.voided_at IS NULL AND e.kind = 'credit' THEN e.created_at END) AS last_credit_at,
    MAX(CASE WHEN e.voided_at IS NULL AND e.kind = 'payment' THEN e.created_at END) AS last_payment_at,
    MIN(CASE WHEN e.voided_at IS NULL AND e.kind = 'credit' THEN e.created_at END) AS first_credit_at,
    MAX(CASE WHEN e.voided_at IS NULL THEN e.created_at END) AS last_entry_at,
    COUNT(CASE WHEN e.id IS NOT NULL AND e.voided_at IS NULL THEN 1 END) AS entries_count
  FROM customers c
  LEFT JOIN lists l ON l.id = c.list_id
  LEFT JOIN entries e ON e.customer_id = c.id
  WHERE c.tenant_id = ? AND c.merged_into IS NULL`

function view(row, now = Date.now()) {
  const balance = Number(row.balance) || 0
  // "Waiting since": the last time they paid anything, or their first udhaar if they never paid.
  const since = balance > 0 ? row.last_payment_at || row.first_credit_at : null
  return {
    id: row.id,
    name: row.name,
    nameUrdu: row.name_urdu || '',
    phone: row.phone || '',
    phoneLocal: localPhone(row.phone),
    aliases: json(row.aliases, []),
    // Suppliers keep the same sign: balance > 0 means the shop owes them.
    balance,
    listId: row.list_id || null,
    listName: row.list_name || null,
    listNameUrdu: row.list_name_urdu || null,
    listKind: row.list_kind || 'customers',
    sample: Boolean(row.sample),
    lastCreditAt: row.last_credit_at || null,
    lastPaymentAt: row.last_payment_at || null,
    lastEntryAt: row.last_entry_at || null,
    entriesCount: Number(row.entries_count) || 0,
    unpaidDays: since ? Math.floor((now - since) / DAY) : null,
    createdAt: row.created_at,
  }
}

export function listCustomers(tenantId) {
  return all(`${CUSTOMER_SQL} GROUP BY c.id`, tenantId).map(r => view(r))
}

export function getCustomer(tenantId, id) {
  const row = one(`${CUSTOMER_SQL} AND c.id = ? GROUP BY c.id`, tenantId, id)
  return row ? view(row) : null
}

const RAW_CUSTOMER_SQL = 'SELECT c.*, l.kind AS list_kind FROM customers c LEFT JOIN lists l ON l.id = c.list_id'
const rawCustomers = tenantId => all(`${RAW_CUSTOMER_SQL} WHERE c.tenant_id = ? AND c.merged_into IS NULL`, tenantId)
const rawCustomer = id => one(`${RAW_CUSTOMER_SQL} WHERE c.id = ?`, id)
const kindOf = raw => raw?.list_kind || 'customers'
const isSupplierRow = raw => kindOf(raw) === 'suppliers'
const liveEntries = customerId => one('SELECT COUNT(*) AS n FROM entries WHERE customer_id = ? AND voided_at IS NULL', customerId).n

export function customerDetail(tenantId, id) {
  const customer = getCustomer(tenantId, id)
  if (!customer) return null
  const rows = all(
    `SELECT e.*, m.audio AS message_audio, m.seconds AS message_seconds, m.transcript_ur, m.transcript_roman, m.channel
     FROM entries e LEFT JOIN messages m ON m.id = e.message_id
     WHERE e.tenant_id = ? AND e.customer_id = ? ORDER BY e.created_at ASC`,
    tenantId,
    id,
  )
  let running = 0
  const entries = rows.map(e => {
    if (!e.voided_at) running += e.kind === 'credit' ? e.amount : -e.amount
    return {
      id: e.id,
      kind: e.kind,
      amount: e.amount,
      items: cleanItems(json(e.items, [])),
      note: e.note || '',
      source: e.source,
      createdAt: e.created_at,
      voidedAt: e.voided_at,
      voidReason: e.void_reason || '',
      runningBalance: running,
      transcript: e.transcript_ur || '',
      transcriptRoman: e.transcript_roman || '',
      audio: e.message_audio || null,
      audioSeconds: e.message_seconds || null,
    }
  })
  return { ...customer, entries: entries.reverse() }
}

// ---------------------------------------------------------------- lists: reads

const rawLists = tenantId => all('SELECT * FROM lists WHERE tenant_id = ? ORDER BY created_at, rowid', tenantId)
const rawList = (tenantId, id) => (id && typeof id === 'string' ? one('SELECT * FROM lists WHERE id = ? AND tenant_id = ?', id, tenantId) : null)
const listKindOf = (tenantId, listId) => (listId ? rawList(tenantId, listId)?.kind || 'customers' : 'customers')
const keysOf = l => [l.name, l.name_urdu, ...json(l.aliases, [])].filter(Boolean).map(listKey).filter(Boolean)

/** The short form results and replies carry (null = General). */
const listRef = l => (l ? { id: l.id, name: l.name, nameUrdu: l.name_urdu || '', kind: l.kind } : null)

function stats(members) {
  const owing = members.filter(c => c.balance > 0)
  return { people: members.length, owing: owing.length, total: owing.reduce((s, c) => s + c.balance, 0) }
}

function listView(l, customers) {
  return {
    id: l.id,
    name: l.name,
    nameUrdu: l.name_urdu || '',
    kind: l.kind,
    aliases: json(l.aliases, []),
    sample: Boolean(l.sample),
    ...stats(customers.filter(c => c.listId === l.id)),
    createdAt: l.created_at,
  }
}

/** The shop's real lists, oldest first, each with people / owing (balance > 0) / total (sum of positive balances). */
export function listLists(tenantId, customers = listCustomers(tenantId)) {
  return rawLists(tenantId).map(l => listView(l, customers))
}

export function getList(tenantId, id) {
  const l = rawList(tenantId, id)
  return l ? listView(l, listCustomers(tenantId)) : null
}

/** General (everyone not in a list) first, then every list: what the overview and "meri lists" show. */
export function listsWithGeneral(tenantId, customers = listCustomers(tenantId)) {
  const general = { id: null, name: null, nameUrdu: null, kind: 'customers', aliases: [], sample: false, ...stats(customers.filter(c => !c.listId)), createdAt: null }
  return [general, ...listLists(tenantId, customers)]
}

/** A spelling variant of the list's name, or a part of it ("teachers" for "School teachers" — never the reverse). */
function nearKey(listKeyValue, spokenKey) {
  const shortest = Math.min(listKeyValue.length, spokenKey.length)
  if (shortest >= 4 && levenshtein(listKeyValue, spokenKey) <= (shortest >= 8 ? 2 : 1)) return true
  const listTokens = listKeyValue.split(' ')
  return spokenKey.replace(/\s/g, '').length >= 3 && spokenKey.split(' ').every(t => listTokens.includes(t))
}

function closestLists(lists, key, n = 3) {
  const score = l => Math.min(...keysOf(l).map(k => levenshtein(k, key) / Math.max(k.length, key.length, 1)))
  return lists.map(l => [score(l), l]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1])
}

/**
 * Which list a spoken name means. Most specific first: the exact name (or Urdu name / alias), then "General" or
 * "suppliers" said as a word, then a spelling variant ("Mohalle" for "Mohalla"), then part of a name ("Factory" for
 * "Factory workers"). Returns { list } | { general } | { suppliers } | { ambiguous: lists } | { none, candidates }.
 * `kind` breaks a tie between lists of different kinds.
 */
export function matchList(tenantId, spoken, { kind = null } = {}) {
  const key = listKey(spoken)
  if (!key) return { none: true, candidates: [] }
  const lists = rawLists(tenantId)
  const pick = hits => {
    if (hits.length === 1) return { list: hits[0] }
    const ofKind = kind ? hits.filter(l => l.kind === kind) : []
    return ofKind.length === 1 ? { list: ofKind[0] } : { ambiguous: hits }
  }
  const exact = lists.filter(l => keysOf(l).includes(key))
  if (exact.length) return pick(exact)
  if (GENERAL_WORDS.has(key)) return { general: true }
  if (SUPPLIER_WORDS.has(key)) return { suppliers: true }
  const sk = skeleton(key)
  if (sk.length >= 3) {
    const hits = lists.filter(l => keysOf(l).some(k => skeleton(k) === sk))
    if (hits.length) return pick(hits)
  }
  const near = lists.filter(l => keysOf(l).some(k => nearKey(k, key)))
  if (near.length) return pick(near)
  return { none: true, candidates: closestLists(lists, key) }
}

// ---------------------------------------------------------------- lists: writes

function sameNameLists(tenantId, names, exceptId = null) {
  const keys = names.map(listKey).filter(Boolean)
  return rawLists(tenantId).filter(l => l.id !== exceptId && keysOf(l).some(k => keys.includes(k)))
}
const sameNameList = (tenantId, names, exceptId = null) => sameNameLists(tenantId, names, exceptId)[0] || null

/** A list called "Suppliers" / "Vendors" / "سپلائرز" can only hold suppliers. */
const isSupplierListName = names => names.some(n => n && SUPPLIER_WORDS.has(listKey(n)))

/**
 * Refuse a name another list already has (409 exists) and return the Urdu name to store. An Urdu name made up
 * from known words ("Relatives" -> رشتہ دار) only joins synonyms of the same kind: a suppliers "Relatives" and a
 * customers "Rishtedar" are different lists, so the new one then keeps just its own name.
 */
function uniqueListNames(tenantId, { clean, urdu, autoUrdu, kind, exceptId = null }) {
  // "General" always exists: it is everyone who is not in a list.
  if (GENERAL_WORDS.has(listKey(clean))) throw httpError(409, 'exists', { list: null })
  const own = sameNameList(tenantId, autoUrdu ? [clean] : [clean, urdu], exceptId)
  if (own) throw httpError(409, 'exists', { list: listRef(own) })
  if (!autoUrdu || !urdu) return urdu
  const synonyms = sameNameLists(tenantId, [urdu], exceptId)
  const sameKind = synonyms.find(l => l.kind === kind)
  if (sameKind) throw httpError(409, 'exists', { list: listRef(sameKind) })
  return synonyms.length ? null : urdu
}

const cleanAliases = aliases => (Array.isArray(aliases) ? aliases.map(cleanListName).filter(Boolean).slice(0, 12) : [])

export function createList(tenantId, { name, nameUrdu, kind, aliases = [], sample = false } = {}) {
  if ((name != null && typeof name !== 'string') || (nameUrdu != null && typeof nameUrdu !== 'string')) throw httpError(400, 'bad_name')
  const clean = cleanListName(name || nameUrdu)
  if (!clean) throw httpError(400, 'bad_name')
  if (kind != null && kind !== '' && !LIST_KINDS.has(kind)) throw httpError(400, 'bad_kind')
  const givenUrdu = nameUrdu && cleanListName(nameUrdu) ? cleanListName(nameUrdu) : isUrduScript(clean) ? clean : null
  // "Suppliers" made with the dashboard's default kind would turn every purchase into "not a supplier".
  const k = isSupplierListName([clean, givenUrdu]) ? 'suppliers' : kind || 'customers'
  const urdu = uniqueListNames(tenantId, { clean, urdu: givenUrdu || urduListName(clean), autoUrdu: !givenUrdu, kind: k })
  if (one('SELECT COUNT(*) AS n FROM lists WHERE tenant_id = ?', tenantId).n >= MAX_LISTS) throw httpError(400, 'too_many')
  const id = newId('l')
  run(
    'INSERT INTO lists (id, tenant_id, name, name_urdu, kind, aliases, sample, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tenantId, clean, urdu || null, k, JSON.stringify(cleanAliases(aliases)), sample ? 1 : 0, Date.now(),
  )
  changed(tenantId)
  return getList(tenantId, id)
}

/** Rename only; a list's kind never changes. */
export function renameList(tenantId, id, { name, nameUrdu } = {}) {
  const l = rawList(tenantId, id)
  if (!l) return null
  if ((name != null && typeof name !== 'string') || (nameUrdu != null && typeof nameUrdu !== 'string')) throw httpError(400, 'bad_name')
  const clean = name != null ? cleanListName(name) : l.name
  if (!clean) throw httpError(400, 'bad_name')
  let urdu = l.name_urdu
  let autoUrdu = false
  if (nameUrdu != null) urdu = cleanListName(nameUrdu) || null
  else if (listKey(clean) !== listKey(l.name)) {
    autoUrdu = !isUrduScript(clean)
    urdu = autoUrdu ? urduListName(clean) : clean
  }
  const renamedTo = [name != null && clean, nameUrdu != null && urdu]
  urdu = uniqueListNames(tenantId, { clean, urdu, autoUrdu, kind: l.kind, exceptId: id })
  // A customers list renamed "Suppliers" would still be a customers list (the kind never changes).
  if (l.kind !== 'suppliers' && isSupplierListName(renamedTo)) throw httpError(400, 'bad_kind')
  run('UPDATE lists SET name = ?, name_urdu = ? WHERE id = ?', clean, urdu || null, id)
  changed(tenantId)
  return getList(tenantId, id)
}

/**
 * Delete a list. Its customers move to General. A suppliers list that still has people is refused: moving them
 * to General would turn money the shop owes into udhaar the supplier owes.
 */
export function deleteList(tenantId, id) {
  const l = rawList(tenantId, id)
  if (!l) return null
  const members = one('SELECT COUNT(*) AS n FROM customers WHERE list_id = ? AND merged_into IS NULL', id).n
  if (l.kind === 'suppliers' && members) throw httpError(409, 'not_empty', { people: members })
  tx(() => {
    run('UPDATE customers SET list_id = NULL WHERE list_id = ?', id)
    run('DELETE FROM lists WHERE id = ?', id)
  })
  changed(tenantId)
  return { ok: true, moved: members }
}

// ---------------------------------------------------------------- overview

// Entries of customers only: supplier khatas never count as udhaar given or collected.
const CUSTOMER_ENTRIES = `entries e JOIN customers c ON c.id = e.customer_id LEFT JOIN lists l ON l.id = c.list_id
  WHERE e.tenant_id = ? AND e.voided_at IS NULL AND l.kind IS NOT 'suppliers'`

export function overview(tenantId) {
  const now = Date.now()
  const everyone = listCustomers(tenantId)
  const customers = everyone.filter(c => c.listKind !== 'suppliers')
  const suppliers = everyone.filter(c => c.listKind === 'suppliers')
  const owing = customers.filter(c => c.balance > 0)
  const owed = suppliers.filter(c => c.balance > 0)
  const todayStart = startOfToday(now)
  const sum = (from, kind) => one(`SELECT COALESCE(SUM(e.amount), 0) AS s, COUNT(*) AS n FROM ${CUSTOMER_ENTRIES} AND e.kind = ? AND e.created_at >= ?`, tenantId, kind, from)

  const givenToday = sum(todayStart, 'credit')
  const collectedToday = sum(todayStart, 'payment')
  const monthStart = now - 30 * DAY
  const given30 = sum(monthStart, 'credit')
  const collected30 = sum(monthStart, 'payment')

  const days = []
  for (let i = 13; i >= 0; i--) days.push({ day: dayKey(now - i * DAY), given: 0, collected: 0 })
  const byDay = Object.fromEntries(days.map(d => [d.day, d]))
  for (const e of all(`SELECT e.kind, e.amount, e.created_at FROM ${CUSTOMER_ENTRIES} AND e.created_at >= ?`, tenantId, now - 15 * DAY)) {
    const d = byDay[dayKey(e.created_at)]
    if (d) d[e.kind === 'credit' ? 'given' : 'collected'] += e.amount
  }

  return {
    totals: {
      due: owing.reduce((s, c) => s + c.balance, 0),
      customersWithDue: owing.length,
      customers: customers.length,
      advance: customers.filter(c => c.balance < 0).reduce((s, c) => s - c.balance, 0),
      payable: owed.reduce((s, c) => s + c.balance, 0),
      suppliersWithDue: owed.length,
      suppliers: suppliers.length,
    },
    today: { given: givenToday.s, givenCount: givenToday.n, collected: collectedToday.s, collectedCount: collectedToday.n },
    last30: { given: given30.s, collected: collected30.s },
    // Who to chase: longest without paying first, then by size.
    followUp: owing
      .filter(c => (c.unpaidDays ?? 0) >= 7)
      .sort((a, b) => (b.unpaidDays ?? 0) - (a.unpaidDays ?? 0) || b.balance - a.balance)
      .slice(0, 6),
    largest: owing.slice().sort((a, b) => b.balance - a.balance).slice(0, 6),
    recent: recentEntries(tenantId, 12, { suppliers: false }),
    daily: days,
    lists: listsWithGeneral(tenantId, everyone),
  }
}

export function recentEntries(tenantId, limit = 20, { suppliers = true } = {}) {
  return all(
    `SELECT e.id, e.kind, e.amount, e.items, e.source, e.created_at, e.voided_at, c.id AS customer_id, c.name, c.name_urdu,
       c.list_id, l.name AS list_name, l.kind AS list_kind
     FROM entries e JOIN customers c ON c.id = e.customer_id LEFT JOIN lists l ON l.id = c.list_id
     WHERE e.tenant_id = ? ${suppliers ? '' : "AND l.kind IS NOT 'suppliers'"} ORDER BY e.created_at DESC LIMIT ?`,
    tenantId,
    limit,
  ).map(e => ({
    id: e.id,
    kind: e.kind,
    amount: e.amount,
    items: cleanItems(json(e.items, [])),
    source: e.source,
    createdAt: e.created_at,
    voidedAt: e.voided_at,
    customer: { id: e.customer_id, name: e.name, nameUrdu: e.name_urdu || '', listId: e.list_id || null, listName: e.list_name || null, listKind: e.list_kind || 'customers' },
  }))
}

// ---------------------------------------------------------------- matching

export function matchCustomer(tenantId, { id, name, nameUrdu } = {}, { fuzzy = true, only = null } = {}) {
  const list = only ? rawCustomers(tenantId).filter(only) : rawCustomers(tenantId)
  if (id) {
    const byId = list.find(c => c.id === id)
    if (byId) return { customer: byId, candidates: [byId], exact: true }
  }
  // A name can arrive only in Urdu script (voice, live calls): then it is the Urdu name too.
  const n = normalizeName(name)
  const u = normalizeUrdu(nameUrdu || (/[a-z]/i.test(String(name ?? '')) ? '' : name))
  const raw = rawName(name)
  if (!n && !u && !raw) return { customer: null, candidates: [], exact: false }

  // Most specific first, stopping at the first tier with a hit: the exact spelling ("Haji Gul") beats an
  // alias, and a real name beats someone else's alias. Two hits within one tier = ask which one.
  const aliases = c => json(c.aliases, [])
  const tiers = [
    c => raw && rawName(c.name) === raw,
    c => raw && aliases(c).some(a => rawName(a) === raw),
    c => n && normalizeName(c.name) === n,
    c => u && c.name_urdu && normalizeUrdu(c.name_urdu) === u,
    c => n && aliases(c).some(a => normalizeName(a) === n),
    c => u && aliases(c).some(a => normalizeUrdu(a) === u),
  ]
  for (const test of tiers) {
    const hits = list.filter(test)
    if (hits.length === 1) return { customer: hits[0], candidates: hits, exact: true }
    if (hits.length > 1) return { customer: null, candidates: hits, exact: true }
  }

  if (n && fuzzy) {
    const first = n.split(' ')[0]
    const close = list.filter(c => {
      const cn = normalizeName(c.name)
      const cFirst = cn.split(' ')[0]
      if (Math.abs(cn.length - n.length) > 3 && Math.abs(cFirst.length - first.length) > 2) return false
      if (skeleton(cn) === skeleton(n)) return true
      if (n.length >= 4 && levenshtein(cn, n) <= 1) return true
      return first.length >= 3 && (cFirst === first || skeleton(cFirst) === skeleton(first)) && !n.includes(' ')
    })
    if (close.length === 1) return { customer: close[0], candidates: close, exact: false }
    if (close.length > 1) return { customer: null, candidates: close, exact: false }
  }
  return { customer: null, candidates: [], exact: false }
}

/**
 * Two people answer to the name: pick the one in the list the shopkeeper named ("Factory wale Asif"), else the only
 * one of the kind this message is about (a purchase means the supplier, an udhaar the customer). Null = still ask.
 */
function narrowCandidates(tenantId, candidates, op, want) {
  if (candidates.length < 2) return null
  let pool = candidates
  const listName = op.list_name || op.list_name_urdu
  if (listName) {
    const m = matchList(tenantId, listName, { kind: want })
    const listId = m.list ? m.list.id : m.general ? null : undefined
    if (listId !== undefined) {
      const inList = pool.filter(c => (c.list_id || null) === listId)
      if (inList.length === 1) return inList[0]
      if (inList.length > 1) pool = inList
    } else if (m.suppliers) {
      pool = pool.filter(isSupplierRow).length ? pool.filter(isSupplierRow) : pool
    }
  }
  if (want) {
    const ofKind = pool.filter(c => kindOf(c) === want)
    if (ofKind.length === 1) return ofKind[0]
  }
  return pool.length === 1 ? pool[0] : null
}

function learnAlias(customer, spokenName) {
  const n = normalizeName(spokenName)
  if (!n || normalizeName(customer.name) === n) return
  const aliases = json(customer.aliases, [])
  if (aliases.some(a => normalizeName(a) === n)) return
  aliases.push(titleCase(n))
  run('UPDATE customers SET aliases = ? WHERE id = ?', JSON.stringify(aliases.slice(-12)), customer.id)
}

// ---------------------------------------------------------------- writes

export function createCustomer(tenantId, { name, nameUrdu, phone, listId = null, sample = false } = {}) {
  const clean = titleCase(String(name || nameUrdu || '').slice(0, 60))
  if (!clean) throw Object.assign(new Error('Name is required'), { status: 400 })
  if (listId && !rawList(tenantId, listId)) throw httpError(400, 'bad_list')
  const id = newId('c')
  run(
    'INSERT INTO customers (id, tenant_id, name, name_urdu, phone, list_id, sample, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tenantId, clean, nameUrdu ? String(nameUrdu).slice(0, 60) : null, normalizePhone(phone) || null, listId || null, sample ? 1 : 0, Date.now(),
  )
  changed(tenantId)
  return rawCustomer(id)
}

/** `listId`: undefined = unchanged, null/'' = General. Customer <-> supplier only while the khata has no entries. */
export function updateCustomer(tenantId, id, { name, nameUrdu, phone, listId } = {}) {
  const c = one('SELECT * FROM customers WHERE id = ? AND tenant_id = ?', id, tenantId)
  if (!c) return null
  if (phone != null && String(phone).trim() && !normalizePhone(phone)) throw Object.assign(new Error('bad_phone'), { status: 400 })
  let nextList = c.list_id
  if (listId !== undefined) {
    if (listId !== null && typeof listId !== 'string') throw httpError(400, 'bad_list')
    nextList = listId || null
    if (nextList && !rawList(tenantId, nextList)) throw httpError(400, 'bad_list')
    if (listKindOf(tenantId, nextList) !== listKindOf(tenantId, c.list_id) && liveEntries(id) > 0) throw httpError(409, 'has_entries')
  }
  run(
    'UPDATE customers SET name = ?, name_urdu = ?, phone = ?, list_id = ? WHERE id = ?',
    name != null && String(name).trim() ? titleCase(String(name).slice(0, 60)) : c.name,
    nameUrdu != null ? String(nameUrdu).trim().slice(0, 60) || null : c.name_urdu,
    phone != null ? normalizePhone(phone) || null : c.phone,
    nextList,
    id,
  )
  changed(tenantId)
  return getCustomer(tenantId, id)
}

export function deleteCustomer(tenantId, id) {
  const r = run('DELETE FROM customers WHERE id = ? AND tenant_id = ?', id, tenantId)
  changed(tenantId)
  return r.changes > 0
}

/**
 * Fold a duplicate khata ("Umer") into the real one ("Umar"): entries move, the name becomes an alias.
 * A customer and a supplier khata are never merged once either has entries (the entries would flip meaning).
 */
export function mergeCustomers(tenantId, fromId, intoId) {
  if (fromId === intoId) return null
  const from = one('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND merged_into IS NULL', fromId, tenantId)
  const into = one('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND merged_into IS NULL', intoId, tenantId)
  if (!from || !into) return null
  if (listKindOf(tenantId, from.list_id) !== listKindOf(tenantId, into.list_id) && (liveEntries(fromId) > 0 || liveEntries(intoId) > 0)) {
    throw httpError(409, 'has_entries')
  }
  tx(() => {
    run('UPDATE entries SET customer_id = ? WHERE customer_id = ?', intoId, fromId)
    const aliases = [...json(into.aliases, []), from.name, ...json(from.aliases, [])]
    const unique = [...new Map(aliases.map(a => [normalizeName(a), a])).values()].filter(a => normalizeName(a) !== normalizeName(into.name))
    run('UPDATE customers SET aliases = ?, phone = COALESCE(phone, ?), name_urdu = COALESCE(name_urdu, ?) WHERE id = ?', JSON.stringify(unique), from.phone, from.name_urdu, intoId)
    run('UPDATE customers SET merged_into = ? WHERE id = ?', intoId, fromId)
  })
  changed(tenantId)
  return getCustomer(tenantId, intoId)
}

function insertEntry(tenantId, { customerId, kind, amount, items = [], note = null, source, messageId = null, createdAt = Date.now() }) {
  if (!okAmount(amount)) throw Object.assign(new Error('Invalid amount'), { status: 400 })
  const id = newId('e')
  run(
    'INSERT INTO entries (id, tenant_id, customer_id, kind, amount, items, note, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, tenantId, customerId, kind, amount, JSON.stringify(cleanItems(items)), note, source, messageId, createdAt,
  )
  return one('SELECT * FROM entries WHERE id = ?', id)
}

export function addManualEntry(tenantId, { customerId, kind, amount, note }) {
  const c = one('SELECT id FROM customers WHERE id = ? AND tenant_id = ? AND merged_into IS NULL', customerId, tenantId)
  const value = Math.round(Number(amount))
  if (!c || !['credit', 'payment'].includes(kind) || !(value > 0) || value > 100_000_000) {
    throw Object.assign(new Error('Invalid entry'), { status: 400 })
  }
  const entry = insertEntry(tenantId, { customerId, kind, amount: value, note: note ? String(note).slice(0, 200) : null, source: 'web' })
  changed(tenantId)
  return entry
}

export function voidEntry(tenantId, entryId, reason = 'cancelled') {
  const r = run('UPDATE entries SET voided_at = ?, void_reason = ? WHERE id = ? AND tenant_id = ? AND voided_at IS NULL', Date.now(), reason, entryId, tenantId)
  changed(tenantId)
  return r.changes > 0
}

// "Last" means most recently *recorded* (rowid), so a corrected entry that keeps its original date
// is still the one the next "undo" cancels.
function lastLiveEntry(tenantId, customerId) {
  return customerId
    ? one('SELECT * FROM entries WHERE tenant_id = ? AND customer_id = ? AND voided_at IS NULL ORDER BY rowid DESC LIMIT 1', tenantId, customerId)
    : one('SELECT * FROM entries WHERE tenant_id = ? AND voided_at IS NULL ORDER BY rowid DESC LIMIT 1', tenantId)
}

function balanceOf(customerId) {
  return one("SELECT COALESCE(SUM(CASE kind WHEN 'credit' THEN amount ELSE -amount END), 0) AS b FROM entries WHERE customer_id = ? AND voided_at IS NULL", customerId).b
}

/**
 * Where a NEW person goes. `want` is the kind of khata the message is about. Returns a plan:
 * { list } (null = General) | { create: { name, nameUrdu, kind } } | { ambiguous: lists }.
 * Customers go to the named list (created if missing). Suppliers go to the named suppliers list, else the
 * shop's first suppliers list ("Suppliers" is created when the shop has none) — never into a customers list.
 */
function placementFor(tenantId, op, want) {
  const spoken = op.list_name || op.list_name_urdu
  const name = spoken && listKey(spoken) ? spoken : null
  const firstSuppliers = () => {
    const l = rawLists(tenantId).find(x => x.kind === 'suppliers')
    return l ? { list: l } : { create: SUPPLIERS_DEFAULT }
  }
  if (!name) return want === 'suppliers' ? firstSuppliers() : { list: null }
  const m = matchList(tenantId, name, { kind: want })
  if (want === 'suppliers') {
    if (m.list?.kind === 'suppliers') return { list: m.list }
    if (m.ambiguous) {
      const s = m.ambiguous.filter(l => l.kind === 'suppliers')
      return s.length > 1 ? { ambiguous: s } : firstSuppliers()
    }
    if (m.none) return { create: { name, nameUrdu: op.list_name_urdu || null, kind: 'suppliers' } }
    return firstSuppliers()
  }
  if (m.list) return { list: m.list }
  if (m.general) return { list: null }
  if (m.suppliers) return firstSuppliers()
  if (m.ambiguous) return { ambiguous: m.ambiguous }
  return { create: { name, nameUrdu: op.list_name_urdu || null, kind: op.list_kind === 'suppliers' ? 'suppliers' : 'customers' } }
}

/**
 * Carry out a placement plan, creating the list when needed. A new customer whose list cannot be created (20
 * lists already) goes to General with `listFull`; a supplier cannot, so that is a `too_many` problem.
 */
function realizePlacement(tenantId, plan, { allowGeneral = true } = {}) {
  if (plan.ambiguous) return { problem: 'list_not_found', candidates: plan.ambiguous, listAmbiguous: true }
  if (!plan.create) return { listId: plan.list?.id ?? null, kind: plan.list?.kind || 'customers', list: plan.list || null }
  try {
    const created = createList(tenantId, plan.create)
    const list = rawList(tenantId, created.id)
    return { listId: list.id, kind: list.kind, list, created: true }
  } catch (err) {
    if (err.message === 'exists' && err.extra?.list) {
      const list = rawList(tenantId, err.extra.list.id)
      // The name belongs to a list of the other kind (an older customers list called "Suppliers"): udhaar must
      // never land in a suppliers khata, nor a purchase in a customers one.
      if (list.kind !== plan.create.kind) return { problem: 'list_not_found', candidates: [list], kindConflict: true }
      return { listId: list.id, kind: list.kind, list }
    }
    if (err.message === 'too_many' && allowGeneral && plan.create.kind === 'customers') return { listId: null, kind: 'customers', list: null, listFull: true }
    if (err.message === 'too_many') return { problem: 'too_many' }
    if (err.message === 'bad_name' && plan.create.kind === 'customers') return { listId: null, kind: 'customers', list: null }
    throw err
  }
}

/**
 * Decide which khata a credit/payment/purchase goes to.
 * - WhatsApp/dashboard: Gemini saw the customer list and already matched spelling variants (customer_id),
 *   so only exact/alias matches merge here; anything else is a genuinely new customer (Umair is not Umar).
 * - Live call: the voice model never sees the list, so a spelling-only match comes back as "confirm".
 * No side effects on an existing person (aliases are learned by the caller once the write is certain).
 */
function resolveForWrite(tenantId, op, ctx, want) {
  const live = ctx.source === 'call'
  const ref = { id: op.customer_id, name: op.customer_name, nameUrdu: op.customer_name_urdu }
  const fuzzy = live && !op.new_customer
  let { customer: hit, candidates, exact } = matchCustomer(tenantId, ref, { fuzzy })
  let customer = hit || narrowCandidates(tenantId, candidates, op, want)
  // "Haji se maal liya": the exact spelling is a customer "Haji", but the supplier "Haji Sahib" is meant.
  if (want === 'suppliers' && !op.customer_id && !(customer && isSupplierRow(customer))) {
    const s = matchCustomer(tenantId, ref, { fuzzy, only: isSupplierRow })
    if (s.customer) ({ customer, candidates, exact } = s)
  }
  if (customer && (exact || !live)) return { customer, isNew: false }
  if (customer && live) return { confirm: [customer] }
  if (candidates.length > 1) return { ambiguous: candidates }
  if (!op.customer_name && !op.customer_name_urdu) return { missingName: true }
  const place = realizePlacement(tenantId, placementFor(tenantId, op, want))
  if (place.problem) return { listProblem: place }
  const created = createCustomer(tenantId, { name: op.customer_name || op.customer_name_urdu, nameUrdu: op.customer_name_urdu, listId: place.listId })
  return { customer: created, isNew: true, place }
}

/**
 * The existing customer an edit (undo / correct / save number / move) refers to. Edits never act on a spelling
 * guess: WhatsApp/dashboard use exact names (Gemini already matched variants to an id); on a live call a
 * near-match comes back as "confirm" so the voice assistant asks first.
 */
function existingCustomer(tenantId, op, ctx) {
  const live = ctx.source === 'call'
  const { customer, candidates, exact } = matchCustomer(tenantId, { id: op.customer_id, name: op.customer_name, nameUrdu: op.customer_name_urdu }, { fuzzy: live })
  if (customer && exact) return { customer }
  if (customer) return { confirm: [customer] }
  if (candidates.length > 1) return { ambiguous: candidates }
  const name = op.customer_name || op.customer_name_urdu
  // "number save karo 0300…" with nobody named: ask whose, never fail the whole message.
  return name ? { notFound: name } : { missingName: true }
}

const UNDO_WINDOW = 30 * 60 * 1000

/**
 * What a plain "undo" / "nahi 450 the" (no name) refers to: only what the shopkeeper's previous message
 * wrote, in the same channel, within 30 minutes. Never an older entry — if the previous message wrote
 * nothing (it asked a question, or failed), there is nothing to undo. On a live call: entries from this call.
 */
function lastUndoable(tenantId, ctx) {
  if (ctx.source === 'call') {
    const ids = ctx.callEntryIds || []
    for (let i = ids.length - 1; i >= 0; i--) {
      const e = one('SELECT * FROM entries WHERE id = ? AND tenant_id = ? AND voided_at IS NULL', ids[i], tenantId)
      if (e) return e
    }
    return null
  }
  if (!ctx.messageId) return null
  // The message just before this one, whatever became of it (a failed or busy message wrote nothing, so there is
  // nothing to undo). Messages that arrived after this one are still being understood and are not "previous".
  const self = one('SELECT created_at, rowid AS seq FROM messages WHERE id = ?', ctx.messageId) || { created_at: Date.now(), seq: Number.MAX_SAFE_INTEGER }
  const prev = one(
    `SELECT id, created_at FROM messages WHERE tenant_id = ? AND channel = ? AND id != ?
       AND (created_at < ? OR (created_at = ? AND rowid < ?))
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    tenantId, ctx.channel, ctx.messageId, self.created_at, self.created_at, self.seq,
  )
  if (!prev || Date.now() - prev.created_at > UNDO_WINDOW) return null
  return one('SELECT * FROM entries WHERE tenant_id = ? AND message_id = ? AND voided_at IS NULL ORDER BY rowid DESC LIMIT 1', tenantId, prev.id)
}

function targetEntry(tenantId, op, ctx) {
  const named = op.customer_id || op.customer_name || op.customer_name_urdu
  if (!named) return { entry: lastUndoable(tenantId, ctx) }
  const found = existingCustomer(tenantId, op, ctx)
  return found.customer ? { entry: lastLiveEntry(tenantId, found.customer.id) } : found
}

/** A placement problem as a result: `name` is the list as said (for a kind clash: the clashing list). */
const listProblemResult = (p, spoken) => ({
  status: p.problem,
  name: spoken || (p.kindConflict ? p.candidates[0].name : null),
  listAmbiguous: Boolean(p.listAmbiguous),
  kindConflict: Boolean(p.kindConflict),
  candidates: (p.candidates || []).map(listRef),
})

const cv = (tenantId, customer) => getCustomer(tenantId, customer.id)
const cvs = (tenantId, list) => list.map(c => getCustomer(tenantId, c.id))

// purchase / supplier_payment are credit / payment on a supplier's khata: same maths, opposite meaning.
const ENTRY_KIND = { credit: 'credit', payment: 'payment', purchase: 'credit', supplier_payment: 'payment' }
const AS_SUPPLIER = { credit: 'purchase', payment: 'supplier_payment', purchase: 'purchase', supplier_payment: 'supplier_payment' }

function writeEntry(tenantId, op, ctx) {
  const supplierOp = op.type === 'purchase' || op.type === 'supplier_payment'
  const want = supplierOp || op.list_kind === 'suppliers' ? 'suppliers' : 'customers'
  const asked = { type: op.type }
  const r = resolveForWrite(tenantId, op, ctx, want)
  if (r.missingName) return { ...asked, status: 'needs_name' }
  if (r.ambiguous) return { ...asked, status: 'ambiguous', candidates: cvs(tenantId, r.ambiguous) }
  if (r.confirm) return { ...asked, status: 'confirm', candidates: cvs(tenantId, r.confirm), name: op.customer_name }
  if (r.listProblem) return { ...asked, ...listProblemResult(r.listProblem, op.list_name || op.list_name_urdu) }
  const dropIfNew = () => {
    if (!r.isNew) return
    run('DELETE FROM customers WHERE id = ?', r.customer.id)
    if (r.place.created) run('DELETE FROM lists WHERE id = ? AND NOT EXISTS (SELECT 1 FROM customers WHERE list_id = ?)', r.place.list.id, r.place.list.id)
  }
  const supplier = isSupplierRow(r.customer)
  // "Umar se maal liya" when Umar is a customer: never guess which khata they meant.
  if (supplierOp && !supplier) {
    const view0 = cv(tenantId, r.customer)
    dropIfNew()
    return { ...asked, status: 'not_supplier', customer: view0 }
  }
  if (!r.isNew) {
    learnAlias(r.customer, op.customer_name)
    if (!r.customer.name_urdu && op.customer_name_urdu) run('UPDATE customers SET name_urdu = ? WHERE id = ?', op.customer_name_urdu, r.customer.id)
  }
  const base = { type: supplier ? AS_SUPPLIER[op.type] : op.type }
  const placed = r.isNew ? { listCreated: r.place.created ? listRef(r.place.list) : null, listFull: Boolean(r.place.listFull) } : {}
  const kind = ENTRY_KIND[op.type]
  let amount = op.amount
  if (kind === 'payment' && op.full_settlement && !amount) {
    amount = Math.max(0, balanceOf(r.customer.id))
    if (!amount) {
      const view0 = cv(tenantId, r.customer)
      dropIfNew()
      return { ...base, status: 'already_clear', customer: view0 }
    }
  }
  if (!okAmount(amount)) {
    const view0 = cv(tenantId, r.customer)
    dropIfNew()
    return { ...base, status: 'needs_amount', customer: view0 }
  }
  // Catch-up notes (sent while the server was down) keep the time the shopkeeper sent them.
  const entry = insertEntry(tenantId, { customerId: r.customer.id, kind, amount, items: op.items, source: ctx.source, messageId: ctx.messageId, createdAt: ctx.createdAt || Date.now() })
  return { ...base, status: 'ok', isNew: r.isNew, entry, customer: cv(tenantId, r.customer), ...placed }
}

/**
 * What a query is about: null = every customer (never suppliers); { kind, list } = one list;
 * { kind: 'customers', general: true } = General; { kind: 'suppliers' } = every supplier.
 */
function scopeFor(tenantId, op) {
  const spoken = op.list_name || op.list_name_urdu
  if (spoken && listKey(spoken)) {
    const m = matchList(tenantId, spoken, { kind: op.list_kind || null })
    if (m.list) return { scope: { kind: m.list.kind, list: listRef(m.list) } }
    if (m.general) return { scope: { kind: 'customers', general: true } }
    if (m.suppliers) return { scope: { kind: 'suppliers' } }
    return { notFound: spoken, listAmbiguous: Boolean(m.ambiguous), candidates: (m.ambiguous || m.candidates).map(listRef) }
  }
  if (op.list_kind === 'suppliers') return { scope: { kind: 'suppliers' } }
  return { scope: null }
}

const inScope = scope => c => {
  if (!scope) return c.listKind !== 'suppliers'
  if (scope.list) return c.listId === scope.list.id
  if (scope.general) return !c.listId
  return c.listKind === scope.kind
}

const listNotFound = (type, s) => ({ type, status: 'list_not_found', name: s.notFound, listAmbiguous: s.listAmbiguous, candidates: s.candidates })

function scopedQuery(tenantId, op) {
  const base = { type: op.type }
  const s = scopeFor(tenantId, op)
  if (s.notFound) return listNotFound(op.type, s)
  const { scope } = s
  const members = listCustomers(tenantId).filter(inScope(scope))
  const scoped = scope ? { scoped: stats(members) } : {}
  if (op.type === 'dues_list') {
    const threshold = op.threshold || 0
    return { ...base, status: 'ok', threshold, scope, ...scoped, list: members.filter(c => c.balance > threshold).sort((a, b) => b.balance - a.balance) }
  }
  const everyone = op.type === 'full_ledger' && !scope ? listCustomers(tenantId) : null
  return {
    ...base,
    status: 'ok',
    scope,
    ...scoped,
    overview: overview(tenantId),
    customers: members,
    ...(everyone ? { suppliers: everyone.filter(c => c.listKind === 'suppliers') } : {}),
  }
}

/** "Factory walon ko reminder bhejo": everyone owing in that list (suppliers never get reminders). */
function listReminders(tenantId, op) {
  const base = { type: 'reminder' }
  const s = scopeFor(tenantId, op)
  if (s.notFound) return listNotFound('reminder', s)
  const { scope } = s
  if (scope?.kind === 'suppliers') return { ...base, status: 'ok', scope, suppliers: true, list: [] }
  const list = listCustomers(tenantId).filter(inScope(scope)).filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance)
  return { ...base, status: 'ok', scope, list }
}

/** Where "move X to <list>" points: an existing list, General, or a list to create (not created yet). */
function moveTarget(tenantId, spoken, op) {
  const m = matchList(tenantId, spoken, { kind: op.list_kind || null })
  if (m.list) return { list: m.list }
  if (m.general) return { list: null }
  if (m.ambiguous) return { ambiguous: m.ambiguous }
  if (m.suppliers) {
    const l = rawLists(tenantId).find(x => x.kind === 'suppliers')
    return l ? { list: l } : { create: SUPPLIERS_DEFAULT }
  }
  return { create: { name: spoken, nameUrdu: op.list_name_urdu || null, kind: op.list_kind === 'suppliers' ? 'suppliers' : 'customers' } }
}

function moveToList(tenantId, op, ctx) {
  const base = { type: op.type }
  const found = existingCustomer(tenantId, op, ctx)
  if (found.ambiguous) return { ...base, status: 'ambiguous', candidates: cvs(tenantId, found.ambiguous) }
  if (found.confirm) return { ...base, status: 'confirm', candidates: cvs(tenantId, found.confirm), name: op.customer_name }
  if (found.missingName) return { ...base, status: 'needs_name' }
  if (!found.customer) return { ...base, status: 'not_found', name: found.notFound }
  const from = cv(tenantId, found.customer)
  const spoken = op.list_name || op.list_name_urdu
  if (!spoken || !listKey(spoken)) return { ...base, status: 'list_not_found', name: null, customer: from, candidates: rawLists(tenantId).map(listRef) }
  const plan = moveTarget(tenantId, spoken, op)
  if (plan.ambiguous) return { ...base, status: 'list_not_found', name: spoken, listAmbiguous: true, customer: from, candidates: plan.ambiguous.map(listRef) }
  const targetKind = plan.create ? plan.create.kind : plan.list?.kind || 'customers'
  if (!plan.create && (plan.list?.id ?? null) === from.listId) return { ...base, status: 'ok', unchanged: true, customer: from, listRef: listRef(plan.list) }
  // Entries of a customer mean "they owe the shop", of a supplier "the shop owes them": never flip them.
  if (targetKind !== from.listKind && from.entriesCount > 0) {
    return { ...base, status: 'has_entries', customer: from, listRef: plan.list ? listRef(plan.list) : plan.create ? { id: null, name: cleanListName(plan.create.name), nameUrdu: '', kind: targetKind } : null }
  }
  const place = realizePlacement(tenantId, plan, { allowGeneral: false })
  if (place.problem) return { ...base, ...listProblemResult(place, spoken), customer: from }
  run('UPDATE customers SET list_id = ? WHERE id = ?', place.listId, from.id)
  const fromList = from.listId ? { id: from.listId, name: from.listName, nameUrdu: from.listNameUrdu || '', kind: from.listKind } : null
  return { ...base, status: 'ok', customer: cv(tenantId, from), listRef: listRef(place.list), fromList, listCreated: place.created ? listRef(place.list) : null }
}

function createListOp(tenantId, op) {
  const base = { type: op.type }
  const spoken = op.list_name || op.list_name_urdu
  if (!spoken || !listKey(spoken)) return { ...base, status: 'needs_name' }
  const kind = op.list_kind === 'suppliers' || SUPPLIER_WORDS.has(listKey(spoken)) ? 'suppliers' : 'customers'
  try {
    const list = createList(tenantId, { name: op.list_name || op.list_name_urdu, nameUrdu: op.list_name_urdu || null, kind })
    return { ...base, status: 'ok', listRef: list }
  } catch (err) {
    if (err.message === 'exists') return { ...base, status: 'exists', listRef: err.extra?.list ? getList(tenantId, err.extra.list.id) : listsWithGeneral(tenantId)[0] }
    if (err.message === 'too_many') return { ...base, status: 'too_many', name: spoken }
    if (err.message === 'bad_name') return { ...base, status: 'needs_name' }
    throw err
  }
}

function applyOne(tenantId, op, ctx) {
  const base = { type: op.type }
  switch (op.type) {
    case 'credit':
    case 'payment':
    case 'purchase':
    case 'supplier_payment':
      return writeEntry(tenantId, op, ctx)
    case 'undo':
    case 'correct': {
      const t = targetEntry(tenantId, op, ctx)
      if (t.ambiguous) return { ...base, status: 'ambiguous', candidates: cvs(tenantId, t.ambiguous) }
      if (t.confirm) return { ...base, status: 'confirm', candidates: cvs(tenantId, t.confirm), name: op.customer_name }
      if (t.notFound) return { ...base, status: 'not_found', name: t.notFound }
      const entry = t.entry
      if (!entry) return { ...base, status: 'nothing_to_undo' }
      if (op.type === 'correct' && !okAmount(op.amount)) return { ...base, status: 'needs_amount', customer: cv(tenantId, { id: entry.customer_id }) }
      run('UPDATE entries SET voided_at = ?, void_reason = ? WHERE id = ?', Date.now(), op.type === 'undo' ? 'undo' : 'corrected', entry.id)
      const customer = { id: entry.customer_id }
      if (op.type === 'undo') return { ...base, status: 'ok', entry, customer: cv(tenantId, customer) }
      // A correction replaces the amount but keeps the original date and note. It belongs to the correcting
      // message, so a following "undo" cancels the corrected entry.
      const fixed = insertEntry(tenantId, {
        customerId: entry.customer_id, kind: entry.kind, amount: op.amount,
        items: op.items?.length ? op.items : json(entry.items, []), note: entry.note,
        source: entry.source, messageId: ctx.messageId || entry.message_id, createdAt: entry.created_at,
      })
      return { ...base, status: 'ok', old: entry, entry: fixed, customer: cv(tenantId, customer) }
    }
    case 'set_phone': {
      const phone = normalizePhone(op.phone)
      const found = existingCustomer(tenantId, op, ctx)
      if (found.ambiguous) return { ...base, status: 'ambiguous', candidates: cvs(tenantId, found.ambiguous) }
      if (found.confirm) return { ...base, status: 'confirm', candidates: cvs(tenantId, found.confirm), name: op.customer_name }
      if (found.missingName) return { ...base, status: 'needs_name' }
      if (!found.customer) return { ...base, status: 'not_found', name: found.notFound }
      if (!phone) return { ...base, status: 'bad_phone', customer: cv(tenantId, found.customer) }
      run('UPDATE customers SET phone = ? WHERE id = ?', phone, found.customer.id)
      return { ...base, status: 'ok', customer: cv(tenantId, found.customer) }
    }
    case 'balance':
    case 'reminder': {
      const named = op.customer_id || op.customer_name || op.customer_name_urdu
      if (!named) {
        // "Factory walon ka hisaab" = that list's khata; "Factory walon ko reminder" = reminders for that list.
        if (op.list_name || op.list_name_urdu || op.list_kind) return op.type === 'balance' ? scopedQuery(tenantId, { ...op, type: 'full_ledger' }) : listReminders(tenantId, op)
        return { ...base, status: 'needs_name' }
      }
      const { customer: hit, candidates } = matchCustomer(tenantId, { id: op.customer_id, name: op.customer_name, nameUrdu: op.customer_name_urdu })
      const customer = hit || narrowCandidates(tenantId, candidates, op, op.list_kind || null)
      if (!customer) {
        return candidates.length > 1
          ? { ...base, status: 'ambiguous', candidates: cvs(tenantId, candidates) }
          : { ...base, status: 'not_found', name: op.customer_name || op.customer_name_urdu }
      }
      return { ...base, status: 'ok', customer: cv(tenantId, customer) }
    }
    case 'dues_list':
    case 'total_due':
    case 'full_ledger':
      return scopedQuery(tenantId, op)
    case 'today_summary':
      return { ...base, status: 'ok', overview: overview(tenantId), customers: listCustomers(tenantId).filter(inScope(null)) }
    case 'create_list':
      return createListOp(tenantId, op)
    case 'move_to_list':
      return moveToList(tenantId, op, ctx)
    case 'lists_summary': {
      const everyone = listCustomers(tenantId)
      const totals = overview(tenantId).totals
      return { ...base, status: 'ok', lists: listsWithGeneral(tenantId, everyone), totals }
    }
    default:
      return { ...base, status: 'ok' }
  }
}

/** "Umer" for "Umar", "Navid" for "Naveed": the whole name spelt differently, never just a shared first name. */
function spellingVariant(n, c) {
  const sk = skeleton(n)
  return [c.name, ...json(c.aliases, [])].some(name => {
    const cn = normalizeName(name)
    if (!cn) return false
    return (sk.length >= 3 && skeleton(cn) === sk) || (Math.min(cn.length, n.length) >= 4 && levenshtein(cn, n) <= 1)
  })
}

/**
 * Messages are understood in parallel, so Gemini may not have seen a customer that the message just before
 * this one created ("Umar ne 500…" then "Umer ne 300 wapis"). Before writing, point such a spelling variant at
 * the one khata of the same kind created since this message's customer-list snapshot, instead of opening a
 * duplicate. Anything less certain is left alone: a separate khata can be merged later, money on the wrong
 * khata (a customer's udhaar on a supplier "Rehman Traders") goes unnoticed.
 */
export function adoptNewCustomers(tenantId, operations, since) {
  for (const op of operations) {
    if (op.customer_id || !(op.customer_name || op.customer_name_urdu)) continue
    // An exact name (or several) is matched when the op is applied.
    const exact = matchCustomer(tenantId, { name: op.customer_name, nameUrdu: op.customer_name_urdu }, { fuzzy: false })
    if (exact.customer || exact.candidates.length) continue
    const n = normalizeName(op.customer_name)
    if (!n) continue
    const want = !ENTRY_KIND[op.type] ? null : op.type === 'purchase' || op.type === 'supplier_payment' || op.list_kind === 'suppliers' ? 'suppliers' : 'customers'
    const hits = rawCustomers(tenantId).filter(c => (!want || kindOf(c) === want) && spellingVariant(n, c))
    if (hits.length === 1 && hits[0].created_at >= since) op.customer_id = hits[0].id
  }
  return operations
}

/** Apply parsed operations atomically. The model only says who / how much / what; all maths is here. */
export function applyOperations(tenantId, operations, ctx) {
  const results = tx(() => operations.map(op => applyOne(tenantId, { list_name: null, list_kind: null, ...op }, ctx)))
  changed(tenantId)
  return results
}

function changed(tenantId) {
  publish(tenantId, 'ledger')
}

// ---------------------------------------------------------------- export

export function exportCsv(tenantId) {
  const rows = all(
    `SELECT e.created_at, c.name, c.phone, l.name AS list_name, l.kind AS list_kind, e.kind, e.amount, e.items, e.note, e.source, e.voided_at
     FROM entries e JOIN customers c ON c.id = e.customer_id LEFT JOIN lists l ON l.id = c.list_id
     WHERE e.tenant_id = ? ORDER BY e.created_at ASC`,
    tenantId,
  )
  // Always quote, and defuse cells Excel would run as formulas (=, +, -, @ at the start).
  const cell = v => {
    let s = String(v ?? '')
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }
  const type = r =>
    r.list_kind === 'suppliers'
      ? r.kind === 'credit' ? 'Supplier: goods taken on credit' : 'Supplier: payment made'
      : r.kind === 'credit' ? 'Udhaar (credit given)' : 'Payment received'
  const header = ['Date', 'Time', 'Customer', 'Phone', 'List', 'Type', 'Amount (Rs)', 'Items', 'Note', 'Recorded via', 'Status']
  const lines = rows.map(r => {
    const d = new Date(r.created_at)
    return [
      d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }),
      d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }),
      r.name,
      localPhone(r.phone),
      r.list_name || 'General',
      type(r),
      r.amount,
      cleanItems(json(r.items, [])).join('; '),
      r.note,
      r.source,
      r.voided_at ? 'Cancelled' : 'Active',
    ].map(cell).join(',')
  })
  return '﻿' + [header.join(','), ...lines].join('\r\n')
}
