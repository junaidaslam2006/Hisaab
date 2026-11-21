import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from '@google/genai'
import { config } from './config.js'
import { gemini } from './brain.js'
import * as ledger from './ledger.js'
import { reminderMessage, whatsappLink } from './replies.js'
import { payDetailsOf } from './paydetails.js'
import { getTenant } from './tenants.js'

// Real-time "Talk to Hisaab": browser mic <-> this relay <-> Gemini Live.
// The API key never reaches the browser, and tool calls write into the signed-in shop's ledger only.

const envInt = (name, fallback) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== '' && process.env[name] != null ? Number(process.env[name]) : fallback)

// Model for the call: LIVE_CALL_MODEL, else the best one in the live-call harness on the free key (26 scripted Urdu /
// English / code-mixed turns per run, 31 Oct 2026; right tool calls / median time from end of speech to first audio):
//   3.1-flash-live-preview                               4 runs: 100% answered, 97.1%, 2.2 s (p90 2.8 s)
//   2.5-flash-native-audio-preview-09-2025 ("native dialogue")  5 runs: 100% answered, 92.3%, 2.9 s (p90 4.6 s;
//     one run in a busy hour had a 4.6 s median while 3.1 stayed at 2.4 s)
//   2.5-flash-native-audio-latest (thinking 0)           2 runs: 100%, 92.3%, 2.7-3.0 s, 2 nudges
//   2.5-flash-native-audio-preview-12-2025 (thinking 0)  1 run: 100%, 88.5%, 2.6 s
//   3.8-live                                             1 run: 100%, 88.5%, 2.0 s
// Native audio sounds the most natural but makes more wrong or missed entries, so it comes right after the default:
// LIVE_FALLBACK_MODELS, then LIVE_MODEL (config.liveModel), are tried in that order when Google refuses or drops the
// connection. LIVE_CALL_MODEL=gemini-2.5-flash-native-audio-preview-09-2025 makes native dialogue the call's voice;
// the default fallbacks start with 3.1-flash-live-preview, so the call then falls back to the best measured model
// first (09-2025 > 3.1 > native latest > native 12-2025 > 3.8-live) instead of to two more native variants.
// All of them run on the free Gemini API tier.
export const DEFAULT_CALL_MODEL = 'gemini-3.1-flash-live-preview'
export const DEFAULT_FALLBACK_MODELS = [
  DEFAULT_CALL_MODEL,
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-3.8-live',
].join(',')
const CALL_MODEL = process.env.LIVE_CALL_MODEL || DEFAULT_CALL_MODEL
const FALLBACK_MODELS = (process.env.LIVE_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Gemini 2.5 Flash Native Audio ("native dialogue") speaks with its own voice instead of reading text aloud. Its
// thinking is set with a token budget (the 3.x Live models take a level instead). -latest and preview-12-2025 think
// before every answer: 3.0-3.9 s and 5.3 s median to first audio in the harness. A budget of 0 turns that off
// (latest: 2.7-3.0 s). preview-09-2025 does not think by default (2.7 s as it is), so it gets no thinking setting,
// exactly as measured. LIVE_NATIVE_THINKING_BUDGET=<n> sets one budget for all of them, =auto leaves it to each model.
// Affective dialog (tone that follows the shopkeeper's mood, LIVE_AFFECTIVE=1) exists only on the v1alpha API.
const isNativeAudio = model => /native-audio/.test(model)
const NATIVE_NO_THINKING = new Set(['gemini-2.5-flash-native-audio-preview-09-2025'])
const NATIVE_THINKING_BUDGET = process.env.LIVE_NATIVE_THINKING_BUDGET || ''
const AFFECTIVE = process.env.LIVE_AFFECTIVE === '1'
const usesAlpha = model => AFFECTIVE && isNativeAudio(model)
let alphaClient = null
const liveClient = model => (usesAlpha(model) ? (alphaClient ??= new GoogleGenAI({ apiKey: config.geminiKey, httpOptions: { apiVersion: 'v1alpha' } })) : gemini())

// Free tier: Google answers too many Live sessions per minute on one key with "1011 You exceeded your current quota"
// (at setup or mid-call). This assumes that limit is counted per model (not measured: it may be per key or project):
// the refused model rests for a minute and the next one is asked at once (no retry on the refused one). If the limit
// is per key, that costs one refused setup per call model (5 at most) before the screen says so in plain words
// ('quota').
const QUOTA_REST_MS = 60000
const resting = new Map() // model -> time it may be tried first again
const isQuota = err => /quota|RESOURCE_EXHAUSTED|\b429\b/i.test(`${err?.code ?? ''} ${err?.message || err?.reason || err}`)
function rest(model, why) {
  resting.set(model, Date.now() + QUOTA_REST_MS)
  console.warn(`[live] ${model} hit the free-tier quota (${String(why).slice(0, 120)}); trying other models first for ${QUOTA_REST_MS / 1000} s`)
}
const isResting = model => (resting.get(model) || 0) > Date.now()

// Turn-taking. Shopkeepers pause in the middle of a sentence ("Umar ne… paanch sau… ka saman"), so the end of a
// turn is committed only after a real pause; start of speech is detected eagerly so quiet voices still count.
const SILENCE_MS = envInt('LIVE_SILENCE_MS', 1200)
const NATIVE_SILENCE_MS = envInt('LIVE_NATIVE_SILENCE_MS', SILENCE_MS)
const PREFIX_MS = envInt('LIVE_PREFIX_MS', 60)
const END_SENSITIVITY = process.env.LIVE_END_SENSITIVITY === 'high' ? EndSensitivity.END_SENSITIVITY_HIGH : EndSensitivity.END_SENSITIVITY_LOW
const START_SENSITIVITY = process.env.LIVE_START_SENSITIVITY === 'low' ? StartSensitivity.START_SENSITIVITY_LOW : StartSensitivity.START_SENSITIVITY_HIGH

// Watchdog: after the shopkeeper stops talking, Hisaab must start answering. Times are from the end of their speech.
const FLUSH_MS = envInt('LIVE_FLUSH_MS', 2000) // close the audio stream so Gemini commits the turn
const NUDGE_MS = envInt('LIVE_NUDGE_MS', 6000) // ask once, in text, for the answer
const GIVE_UP_MS = 20000 // tell the screen nothing came back, so the shopkeeper can say it again or type it
// Connecting. A healthy setup takes about 1 s; when Google hangs instead of refusing, the next model gets a turn and
// the whole plan gives up after CONNECT_DEADLINE_MS, so the screen says "busy" instead of "Connecting…" for minutes.
const SETUP_TIMEOUT_MS = 12000
const FALLBACK_SETUP_TIMEOUT_MS = 8000
const CONNECT_DEADLINE_MS = 25000
const REPEAT_WINDOW_MS = 30000 // a repeated write before Hisaab spoke, within this window, is not written again
const SWITCH_WAIT_MS = 6000 // after goAway, the longest wait for a quiet moment before switching connections

const langs = (name, fallback) => (process.env[name] ?? fallback).split(',').map(s => s.trim()).filter(Boolean)
// Urdu + English hints keep the shopkeeper's caption in Urdu script (auto-detect writes Urdu speech in Hindi script).
const INPUT_LANGS = langs('LIVE_INPUT_LANGS', 'ur-PK,en-US')
const OUTPUT_LANGS = langs('LIVE_OUTPUT_LANGS', '')
const SPEECH_LANG = process.env.LIVE_SPEECH_LANG ?? ''
// The extended-thinking Live model refuses a session without a thinking level.
const THINKING_LEVEL = process.env.LIVE_THINKING_LEVEL || ''

// The shop's own speech detector on the 16 kHz PCM16 the browser sends (50 ms frames).
const MIN_SPEECH_RMS = 450
const SPEECH_START_MS = 200
const SPEECH_END_MS = 700
const PREROLL_MS = 400
// Steady room noise louder than the threshold (a busy hall, a PA, a fan) would count as endless speech, because the
// floor is learnt only from quiet frames. After STUCK_MS of "speech", if the last STEADY_FRAMES frames are as flat as
// noise (speech never is: its loud and quiet frames differ several times over), the floor is learnt from them.
const STUCK_MS = 3000
const STEADY_FRAMES = 40 // 2 s
const STEADY_RATIO = 2 // 90th / 10th percentile frame level
const MAX_FLOOR_RMS = 2000
const FLOOR_FALL = 0.03 // per quiet frame
const FLOOR_RISE = 0.005
const GATE_FACTOR = 1.5 // after audioStreamEnd, frames this far above the floor reopen the stream

const NUDGE_TEXT =
  '(Hisaab system note: the shopkeeper has finished speaking and is waiting. Respond now to what they just said: call the right tool if it was an entry or a question, then answer in one or two short Urdu sentences. If you could not hear it clearly, ask them in one short Urdu sentence to say it again.)'

// ---------------------------------------------------------------- tools

const nameParam = { type: 'string', description: 'Name as the shopkeeper said it, in Roman Urdu letters, Title Case, without bhai/sahab/ji (e.g. "Umar", "Gul Khan"). Never Urdu script here.' }
const nameUrduParam = { type: 'string', description: 'The same name in Urdu script (e.g. "عمر")' }
const supplierParam = { type: 'string', description: 'Supplier / wholesaler name in Roman Urdu letters, Title Case (e.g. "Haji Sahib", "Rehman Traders")' }
const amountParam = { type: 'integer', description: 'Whole rupees as a number: "paanch sau"=500, "dhai hazaar"=2500, "5k"=5000, "twelve hundred"=1200' }
const itemsParam = { type: 'array', items: { type: 'string' }, description: 'Optional goods in Roman Urdu with quantity, e.g. "cheeni 2kg"' }
const listParam = { type: 'string', description: 'Only if the shopkeeper named one of their lists, e.g. "Factory wale", "Teachers", "Mohalla". Otherwise leave out.' }
const newCustomerParam = { type: 'boolean', description: 'true only after the shopkeeper confirmed this is a NEW person, not the similar existing one' }
const suppliersParam = { type: 'boolean', description: 'true when the question is about what the SHOP owes its suppliers' }

const TOOLS = [
  {
    name: 'add_udhaar',
    description: 'A customer took goods or cash on credit (udhaar) from the shop. One call per customer entry.',
    parameters: {
      type: 'object',
      properties: { customer_name: nameParam, customer_name_urdu: nameUrduParam, amount: amountParam, items: itemsParam, list_name: listParam, new_customer: newCustomerParam },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'record_payment',
    description: 'A customer paid money back to the shop (wapis / jama / ada / paid back).',
    parameters: {
      type: 'object',
      properties: {
        customer_name: nameParam,
        customer_name_urdu: nameUrduParam,
        amount: { ...amountParam, description: `${amountParam.description}. Leave out if they cleared the whole balance.` },
        full_settlement: { type: 'boolean', description: 'true if they paid off the whole balance (saara hisaab / poora / clear kar diya)' },
        list_name: listParam,
        new_customer: newCustomerParam,
      },
      required: ['customer_name'],
    },
  },
  {
    name: 'record_purchase',
    description: 'The SHOP took goods or stock on credit FROM a supplier or wholesaler (the shop now owes them more). E.g. "Haji Sahib se 20 hazaar ka maal udhaar liya".',
    parameters: {
      type: 'object',
      properties: { supplier_name: supplierParam, supplier_name_urdu: nameUrduParam, amount: amountParam, items: itemsParam, list_name: listParam },
      required: ['supplier_name', 'amount'],
    },
  },
  {
    name: 'pay_supplier',
    description: 'The SHOP paid money to one of its suppliers (the shop now owes them less). E.g. "Haji Sahib ko 10 hazaar de diye".',
    parameters: {
      type: 'object',
      properties: {
        supplier_name: supplierParam,
        supplier_name_urdu: nameUrduParam,
        amount: { ...amountParam, description: `${amountParam.description}. Leave out if the shop paid the whole amount owed.` },
        full_settlement: { type: 'boolean', description: 'true if the shop paid off everything it owed this supplier' },
      },
      required: ['supplier_name'],
    },
  },
  {
    name: 'get_balance',
    description: "Look up one person's current balance (customer or supplier).",
    parameters: { type: 'object', properties: { customer_name: nameParam, customer_name_urdu: nameUrduParam }, required: ['customer_name'] },
  },
  {
    name: 'list_dues',
    description: 'Who owes the shop money (optionally only in one list, or above a minimum). With suppliers=true: whom the shop owes.',
    parameters: { type: 'object', properties: { list_name: listParam, min_amount: { type: 'integer', description: 'Only people owing more than this' }, suppliers: suppliersParam } },
  },
  {
    name: 'shop_summary',
    description: "Total udhaar outstanding, today's credit given and money collected, and what the shop owes suppliers. With list_name: the total of that one list.",
    parameters: { type: 'object', properties: { list_name: listParam, suppliers: suppliersParam } },
  },
  { name: 'lists_summary', description: "All of the shop's lists (e.g. Factory wale, Teachers, Suppliers) with how many people and how much each list owes." },
  {
    name: 'create_list',
    description: 'Make a new list of people, e.g. "naya list banao Factory wale", "make a list called Teachers", "suppliers ki list bana do".',
    parameters: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'The list name as said, Roman letters, e.g. "Factory Wale", "Teachers"' },
        list_name_urdu: { type: 'string', description: 'The list name in Urdu script' },
        kind: { type: 'string', enum: ['customers', 'suppliers'], description: '"suppliers" only for a list of people the shop buys from' },
      },
      required: ['list_name'],
    },
  },
  {
    name: 'move_to_list',
    description: 'Put an existing person into one of the lists, e.g. "Umar ko Factory list mein daal do".',
    parameters: { type: 'object', properties: { customer_name: nameParam, customer_name_urdu: nameUrduParam, list_name: { type: 'string', description: 'The list name as said' } }, required: ['customer_name', 'list_name'] },
  },
  {
    name: 'undo_last',
    description: 'Cancel the most recent entry (galat ho gaya / cancel / undo / mita do).',
    parameters: { type: 'object', properties: { customer_name: { ...nameParam, description: `${nameParam.description}. Only if they named whose entry.` } } },
  },
  {
    name: 'correct_last',
    description: 'Change the amount of the most recent entry ("nahi 300 nahi 400 the", "Umar wali entry 450 kar do").',
    parameters: { type: 'object', properties: { customer_name: { ...nameParam, description: `${nameParam.description}. Only if they named whose entry.` }, amount: { ...amountParam, description: 'The NEW correct amount' } }, required: ['amount'] },
  },
  {
    name: 'send_reminder',
    description: 'Prepare a polite WhatsApp payment reminder for one customer, or for everyone owing in one list (list_name without customer_name).',
    parameters: { type: 'object', properties: { customer_name: nameParam, list_name: listParam } },
  },
  {
    name: 'save_phone',
    description: "Save a customer's mobile number.",
    parameters: { type: 'object', properties: { customer_name: nameParam, phone: { type: 'string', description: 'Digits as said, e.g. "03001234567"' } }, required: ['customer_name', 'phone'] },
  },
]

const TOOL_OPS = {
  add_udhaar: 'credit',
  record_payment: 'payment',
  record_purchase: 'purchase',
  pay_supplier: 'supplier_payment',
  get_balance: 'balance',
  list_dues: 'dues_list',
  shop_summary: 'total_due',
  lists_summary: 'lists_summary',
  create_list: 'create_list',
  move_to_list: 'move_to_list',
  undo_last: 'undo',
  correct_last: 'correct',
  send_reminder: 'reminder',
  save_phone: 'set_phone',
}
const DONE_STATUSES = new Set(['written', 'cancelled', 'corrected', 'saved', 'moved', 'list_created'])
const WRITES = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'undo', 'correct', 'create_list', 'move_to_list', 'set_phone'])

const str = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null)
const int = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null)

/** A tool call as a ledger operation (contract op shape). Unknown tools -> null. */
export function opFrom(name, args = {}) {
  const type = TOOL_OPS[name]
  if (!type) return null
  const supplierTool = type === 'purchase' || type === 'supplier_payment'
  const listKind = type === 'create_list' ? (args.kind === 'suppliers' ? 'suppliers' : 'customers') : supplierTool || args.suppliers === true ? 'suppliers' : null
  return {
    type,
    customer_id: null,
    customer_name: str(args.customer_name) || str(args.supplier_name),
    customer_name_urdu: str(args.customer_name_urdu) || str(args.supplier_name_urdu),
    items: Array.isArray(args.items) ? args.items.map(i => str(i)).filter(Boolean).slice(0, 8) : [],
    amount: int(args.amount),
    full_settlement: Boolean(args.full_settlement),
    new_customer: Boolean(args.new_customer),
    threshold: int(args.min_amount),
    phone: typeof args.phone === 'string' ? args.phone.replace(/[^\d+]/g, '').slice(0, 16) : null,
    list_name: str(args.list_name, 60),
    list_name_urdu: str(args.list_name_urdu, 60),
    list_kind: listKind,
  }
}

// ---------------------------------------------------------------- tool results for the model

const isSupplier = c => c?.listKind === 'suppliers'
const listLabel = c => c?.listName || 'General'
const names = list => (Array.isArray(list) && list.length ? list.slice(0, 6).map(x => (typeof x === 'string' ? x : x?.name)).filter(Boolean) : undefined)

function who(c) {
  if (!c) return {}
  if (isSupplier(c)) return { supplier: c.name, supplier_urdu: c.nameUrdu || undefined, shop_owes_them_now: c.balance, list: listLabel(c) }
  return { customer: c.name, customer_urdu: c.nameUrdu || undefined, balance_now: c.balance, list: listLabel(c) }
}

const HINTS = {
  needs_amount: 'Ask how many rupees.',
  needs_name: 'Ask whose khata (or which list name).',
  ambiguous: 'Several people match: ask which one of the candidates they mean.',
  confirm: 'A similar name exists. Ask: "Kya aap ka matlab <candidate> hai, ya naya khata kholun?" Same person: call again with exactly the candidate name. New person: call again with new_customer=true.',
  not_found: 'There is no khata with this name. Say so and ask them to check the name.',
  already_clear: 'Nothing is owed, so nothing was written.',
  nothing_to_undo: 'No recent entry from this call to cancel. Ask whose entry they want to cancel.',
  bad_phone: 'The number was not clear. Ask them to say it again, digit by digit.',
  exists: 'A list with this name already exists. Nothing new was made.',
  has_entries: 'This person already has entries, so they cannot move between customer lists and supplier lists. Nothing was changed.',
  not_supplier: 'This person is a CUSTOMER of the shop, not a supplier. Nothing was written. Ask whether they meant a customer entry, or a different supplier name.',
  list_not_found: 'There is no list with this name. Nothing was written. Say the closest list names (candidates) and ask which one, or offer to create the list.',
  too_many: 'The shop already has 20 lists, the most allowed. Nothing was made.',
  error: 'The khata could not be written because of a problem on our side. Say sorry and ask them to say it once more.',
}
const LIST_STATUSES = new Set(['list_not_found', 'exists', 'too_many', 'has_entries'])
// Hisaab has no way to send WhatsApp messages; only the owner's tap on the screen does.
const REMINDER_NOTE =
  'Nothing was sent: Hisaab cannot send WhatsApp messages. The reminder text is on the owner\'s screen with a WhatsApp button; tell them to press it for each person. Never offer to send it yourself and never say it was sent.'
const REPEAT_HINT =
  'The same entry (same person, same amount) was written a moment ago, so it was NOT written again. Confirm that one entry once, with balance_now from this result. Never add amounts together yourself.'

const positiveTotal = list => list.reduce((s, x) => s + (x.balance > 0 ? x.balance : 0), 0)
const scopeName = scope => (!scope ? 'all customers' : scope.list ? scope.list.name : scope.general ? 'General' : scope.kind === 'suppliers' ? 'all suppliers' : 'all customers')

/** The ledger result as the model hears it: plain words, only the numbers it may say. */
export function toolResult(r, op) {
  if (!r) return { status: 'error', hint: HINTS.error }
  const c = r.customer
  if (r.status !== 'ok') {
    return {
      status: r.status,
      ...who(c),
      list_name: LIST_STATUSES.has(r.status) ? r.listRef?.name || r.name || op.list_name || undefined : undefined,
      candidates: names(r.candidates),
      hint: HINTS[r.status],
    }
  }
  switch (r.type || op.type) {
    case 'credit':
    case 'payment':
    case 'purchase':
    case 'supplier_payment':
      // The ledger already turned a customer-style entry on a supplier into a supplier entry (r.type).
      return {
        status: 'written',
        entry: r.type,
        amount: r.entry?.amount,
        items: op.items?.length ? op.items : undefined,
        new_khata: Boolean(r.isNew),
        list_created: r.listCreated?.name || undefined,
        ...who(c),
      }
    case 'undo':
      return { status: 'cancelled', cancelled_amount: r.entry?.amount, ...who(c) }
    case 'correct':
      return { status: 'corrected', old_amount: r.old?.amount, new_amount: r.entry?.amount, ...who(c) }
    case 'set_phone':
      return { status: 'saved', ...who(c) }
    case 'balance':
      return { status: 'ok', ...who(c), days_without_payment: c?.unpaidDays ?? undefined }
    case 'reminder': {
      if (!c) {
        // A whole list: everyone in it who owes something (suppliers never get reminders).
        if (r.suppliers) return { status: 'ok', list_name: scopeName(r.scope), reminders_ready: 0, hint: 'Suppliers do not get payment reminders; the shop owes them.' }
        const list = Array.isArray(r.list) ? r.list : []
        const withPhone = list.filter(x => x.phone).length
        return { status: 'ok', list_name: scopeName(r.scope), reminders_ready: list.length, with_phone: withPhone, without_phone: list.length - withPhone, note: REMINDER_NOTE }
      }
      if (isSupplier(c)) return { status: 'ok', ...who(c), reminder_ready: false, hint: 'This is a supplier; the shop owes them, so no reminder.' }
      if (c.balance <= 0) return { status: 'already_clear', ...who(c), hint: 'Nothing is owed, so no reminder is needed.' }
      return { status: 'ok', ...who(c), reminder_ready: true, has_phone: Boolean(c.phone), note: REMINDER_NOTE }
    }
    case 'dues_list': {
      const list = Array.isArray(r.list) ? r.list : []
      return {
        status: 'ok',
        scope: scopeName(r.scope),
        about: r.scope?.kind === 'suppliers' ? 'suppliers' : 'customers',
        meaning: r.scope?.kind === 'suppliers' ? 'amount = what the SHOP owes each supplier' : 'amount = what each customer owes the shop',
        people: list.slice(0, 8).map(x => ({ name: x.name, amount: x.balance })),
        count: list.length,
        total: positiveTotal(list),
      }
    }
    case 'total_due':
    case 'full_ledger': {
      const o = r.overview || {}
      const t = o.totals || {}
      if (r.scope?.kind === 'suppliers' && !r.scope.list) return { status: 'ok', scope: 'all suppliers', shop_owes_suppliers: t.payable ?? 0, suppliers_owed: t.suppliersWithDue ?? 0 }
      if (r.scope && r.scoped) {
        const owes = r.scope.kind === 'suppliers' ? { shop_owes_this_list: r.scoped.total } : { total_udhaar_in_list: r.scoped.total }
        return { status: 'ok', list_name: scopeName(r.scope), ...owes, people_owing: r.scoped.owing, people: r.scoped.people }
      }
      return {
        status: 'ok',
        total_udhaar: t.due,
        customers_with_due: t.customersWithDue,
        given_today: o.today?.given,
        collected_today: o.today?.collected,
        shop_owes_suppliers: t.payable || undefined,
      }
    }
    case 'lists_summary': {
      const lists = Array.isArray(r.lists) ? r.lists : []
      return {
        status: 'ok',
        lists: lists.slice(0, 21).map(l => ({ name: l.name || 'General', kind: l.kind || 'customers', people: l.people, people_owing: l.owing, total: l.total })),
        meaning: 'total = udhaar owed to the shop; for a suppliers list, what the shop owes',
      }
    }
    case 'create_list':
      return { status: 'list_created', list_name: r.listRef?.name || op.list_name, kind: r.listRef?.kind || op.list_kind }
    case 'move_to_list':
      return {
        status: 'moved',
        ...who(c),
        list_name: r.listRef?.name || 'General',
        already_there: r.unchanged || undefined,
        list_created: r.listCreated?.name || undefined,
      }
    default:
      return { status: 'ok', ...who(c) }
  }
}

/**
 * What the screen needs for an action beyond what the model hears: the reminder text and WhatsApp links. Only the
 * browser gets this (never Gemini), so the shop's payment details go into the text here and nowhere in toolResult.
 */
export function screenExtras(r, tenant) {
  if (r?.type !== 'reminder' || r.status !== 'ok') return undefined
  // Read fresh: a shop name or payment details saved in Settings during the call count at once.
  const shop = getTenant(tenant.id) || tenant
  const pay = payDetailsOf(shop)
  const c = r.customer
  if (!c) {
    if (!Array.isArray(r.list)) return undefined
    return {
      // No saved number: the link opens WhatsApp with the message typed and the owner picks the chat.
      reminders: r.list.slice(0, 30).map(x => {
        const text = reminderMessage(shop.shop_name, x, pay)
        return { name: x.name, nameUrdu: x.nameUrdu || '', balance: x.balance, hasPhone: Boolean(x.phone), link: text ? whatsappLink(x.phone, text) || `https://wa.me/?text=${encodeURIComponent(text)}` : null }
      }),
    }
  }
  const text = reminderMessage(shop.shop_name, c, pay)
  return text ? { reminder_text: text, whatsapp_link: whatsappLink(c.phone, text) } : undefined
}

// ---------------------------------------------------------------- prompt

function roster(tenantId) {
  let people = []
  try {
    people = ledger.listCustomers(tenantId)
  } catch {
    return ''
  }
  if (!people.length) return ''
  const recent = people.slice().sort((a, b) => (b.lastEntryAt || 0) - (a.lastEntryAt || 0)).slice(0, 150)
  const line = c => `${c.name}${c.nameUrdu ? ` (${c.nameUrdu})` : ''}${c.listName ? ` [${c.listName}]` : ''}`
  const suppliers = recent.filter(isSupplier)
  const customers = recent.filter(c => !isSupplier(c))
  let out = ''
  if (customers.length) out += `\nCUSTOMERS already in the khata (match spoken names to these spellings): ${customers.map(line).join(', ')}.`
  if (suppliers.length) out += `\nSUPPLIERS the shop buys from (money the shop gives them = pay_supplier): ${suppliers.map(line).join(', ')}.`
  return out
}

function listsLine(tenantId) {
  try {
    const lists = typeof ledger.listLists === 'function' ? ledger.listLists(tenantId) : ledger.overview(tenantId)?.lists
    const real = (lists || []).filter(l => l?.name)
    if (!real.length) return ''
    return `\nTHE SHOP'S LISTS: ${real.map(l => `${l.name}${l.kind === 'suppliers' ? ' (suppliers)' : ''}`).join(', ')}. People in no list are in "General".`
  } catch {
    return ''
  }
}

export function systemPrompt(tenant) {
  const owner = tenant.owner_name ? ` The owner's name is ${tenant.owner_name}.` : ''
  return `You are "Hisaab", a warm, quick voice munshi (bookkeeper) on a call with the owner of ${tenant.shop_name || 'a small shop'}${tenant.city ? ` in ${tenant.city}` : ''}, Pakistan.${owner}
You keep the shop's khata: customers' udhaar and payments, what the shop owes its suppliers, and the owner's lists of people.

HOW THE OWNER TALKS
They speak Urdu, English, or both mixed in one sentence, the way Pakistani shopkeepers do, sometimes with Punjabi or Pashto words:
"Umar ne 500 rupees ka saman liya on credit", "Ahmed paid 300 back", "Bilal ka balance kya hai", "5k likh do Naveed ke naam", "Factory walon ka total batao", "Haji Sahib se 20 hazaar ka maal udhaar liya".
All of this is normal speech: understand it all. Amounts come as Urdu words (sau=100, hazaar=1000, lakh=100000, dedh sau=150, dhai sau=250, sawa do sau=225, saadhe teen hazaar=3500), English words ("twelve hundred"=1200, "fifteen thousand"=15000), digits, or "5k"=5000.

HOW YOU ANSWER
- Speak natural Pakistani Urdu (shukriya, baqaya, udhaar, ada, hisaab, raqam, sifr, gahak, banda / shakhs, tabdeeli; never Hindi words like dhanyavaad, kripya, dhanrashi, shunya, grahak, vyakti, badlav). When the owner used English words (credit, balance, payment, list, total, supplier, cancel), use those same English words inside your Urdu sentence. Even when they spoke only English, answer in this Urdu with their English words.
- One or two short sentences. Say amounts as Urdu number words.
- Answer EVERY turn out loud. Never stay silent. If you did not catch what they said, say so in one short line and ask them to repeat.

TOOLS: the only way to read or write the khata
- Every udhaar, payment, supplier purchase, supplier payment, list change, lookup, correction or reminder: CALL THE TOOL first. Never say something is written unless the tool result says so.
- Several entries in one sentence ("Bilal ne 250 ka doodh liya aur Naveed ne 1000 ka atta"): one tool call per entry, in the order said.
- Every number you say (balances, totals, counts) must come from a tool result. Never add, subtract or estimate yourself.
- Names: customer_name / supplier_name in Roman letters (Title Case, no bhai/sahab/ji), plus the Urdu-script name. Use the spelling from the CUSTOMERS list below when it is the same person.
- If the amount or the name is missing, ask one short question instead of guessing.

CUSTOMERS AND SUPPLIERS
- A customer took goods/cash on credit: add_udhaar. A customer paid the shop: record_payment.
- The SHOP took goods/stock on credit from a supplier or wholesaler ("se maal udhaar liya", "got stock on credit from"): record_purchase.
- The SHOP paid a supplier ("Haji Sahib ko 10 hazaar de diye", "paid Rehman Traders 5000"): pay_supplier. Money given TO a supplier is never add_udhaar.
- "Mujhe suppliers ko kitna dena hai", "how much do I owe": list_dues or shop_summary with suppliers=true.

LISTS
- The owner keeps separate lists of people ("Factory wale", "Mohalla", "Teachers", "Suppliers"). People in no list are in "General" (aam khata).
- "naya list banao X", "make a list called X": create_list. "Umar ko Factory list mein daal do": move_to_list. "meri lists dikhao", "show my lists": lists_summary.
- A NEW person said with a list ("Teachers list mein Kamran ne 800 liye"): add_udhaar with list_name.
- About one list ("Factory list mein kis kis ka udhaar hai", "Mohalla walon ka total", "Factory walon ko reminder bhejo"): list_dues / shop_summary / send_reminder with list_name.

REMINDERS
- You cannot send WhatsApp messages. send_reminder only puts the reminder on the owner's screen; the owner sends it by pressing the WhatsApp button there. Never offer to send it and never say it was sent.

TOOL RESULTS
- status written / ok / cancelled / corrected / saved / moved / list_created: confirm in one sentence with the numbers from the result, e.g. "Umar ke khate mein paanch sau likh diye, ab un ka baqaya aath sau rupay hai."
- status already_written: that same entry was already written a moment ago and was NOT written twice. Confirm it once with balance_now from the result.
- Any other status: follow its "hint" and ask the owner one short question. Nothing was written.
${listsLine(tenant.id)}${roster(tenant.id)}

START: greet in one short line${tenant.owner_name ? ` using the owner's name (${tenant.owner_name})` : ''}, then ask whose khata to write.`
}

// ---------------------------------------------------------------- captions in Urdu script

// Live transcription sometimes writes Urdu speech in Hindi (Devanagari) script, which most Pakistani shopkeepers
// cannot read. Hindustani is one spoken language, so a letter-by-letter mapping gives a readable Urdu caption
// ("उमर ने 500 का सौदा लिया" -> "امر نے 500 کا سودا لیا"). Captions only: tools never see this text.
const DEV_CONSONANTS = {
  क: 'ک', ख: 'کھ', ग: 'گ', घ: 'گھ', ङ: 'ن', च: 'چ', छ: 'چھ', ज: 'ج', झ: 'جھ', ञ: 'ن', ट: 'ٹ', ठ: 'ٹھ', ड: 'ڈ', ढ: 'ڈھ',
  ण: 'ن', त: 'ت', थ: 'تھ', द: 'د', ध: 'دھ', न: 'ن', प: 'پ', फ: 'پھ', ब: 'ب', भ: 'بھ', म: 'م', य: 'ی', र: 'ر', ल: 'ل',
  व: 'و', श: 'ش', ष: 'ش', स: 'س', ह: 'ہ', क़: 'ق', ख़: 'خ', ग़: 'غ', ज़: 'ز', ड़: 'ڑ', ढ़: 'ڑھ', फ़: 'ف', य़: 'ی',
}
const DEV_NUKTA = { क: 'ق', ख: 'خ', ग: 'غ', ज: 'ز', ड: 'ڑ', ढ: 'ڑھ', फ: 'ف' }
const DEV_INITIAL = { अ: 'ا', आ: 'آ', इ: 'ا', ई: 'ای', उ: 'ا', ऊ: 'او', ए: 'ای', ऐ: 'اے', ओ: 'او', औ: 'او', ऋ: 'ر', ऑ: 'آ' }
const DEV_MEDIAL = { अ: 'ا', आ: 'آ', इ: 'ئ', ई: 'ئی', उ: 'ؤ', ऊ: 'ؤ', ए: 'ئ', ऐ: 'ئ', ओ: 'و', औ: 'و', ऋ: 'ر', ऑ: 'آ' }
const DEV_SIGNS = { 'ा': 'ا', 'ि': '', 'ी': 'ی', 'ु': '', 'ू': 'و', 'ृ': 'ر', 'ॉ': 'ا', 'ो': 'و', 'ौ': 'و', 'ः': 'ہ', '्': '' }
const DEV_PUNCT = { '।': '۔', '॥': '۔', ',': '،', '?': '؟' }
const isDevLetter = ch => ch >= 'ऀ' && ch <= 'ॿ'

export function devanagariToUrdu(text) {
  if (!/[ऀ-ॿ]/.test(text)) return text
  const chars = [...text.normalize('NFC')]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]
    const wordEnd = !next || !isDevLetter(next) || next === '।'
    const prevLetter = i > 0 && isDevLetter(chars[i - 1]) && chars[i - 1] !== '।'
    if (next === '़' && DEV_NUKTA[ch]) {
      out += DEV_NUKTA[ch]
      i++
    } else if (DEV_CONSONANTS[ch]) out += DEV_CONSONANTS[ch]
    else if (DEV_INITIAL[ch]) {
      // A vowel letter inside a word ("गए", "आइए") sits on a hamza seat; ए / ऐ at the end of a word is a final ye.
      if (!prevLetter) out += DEV_INITIAL[ch]
      else out += DEV_MEDIAL[ch] + ((ch === 'ए' || ch === 'ऐ') ? (wordEnd ? 'ے' : 'ی') : '')
    } else if (ch === 'े' || ch === 'ै') out += wordEnd ? 'ے' : 'ی'
    else if (ch === 'ं' || ch === 'ँ') out += wordEnd ? 'ں' : 'ن'
    else if (ch in DEV_SIGNS) out += DEV_SIGNS[ch]
    else if (ch >= '०' && ch <= '९') out += String(ch.charCodeAt(0) - 0x0966)
    else if (ch === '़') continue
    else if (DEV_PUNCT[ch] && /[ऀ-ॿ]/.test(text)) out += DEV_PUNCT[ch]
    else out += ch
  }
  return out
}

// ---------------------------------------------------------------- the call

const transient = err => /\b(503|429|500|502|504|1011|1013|1006|1001)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|timed? ?out|ECONNRESET|socket hang up|deadline/i.test(String(err?.code ?? '') + ' ' + String(err?.message || err))
// What the call screen says when no model connects: 'quota' (free-tier limit, wait a minute), 'busy' or 'config'.
const failCode = err => (err?.quota || isQuota(err) ? 'quota' : transient(err) ? 'busy' : 'config')
// Google's quota refusal tells the reader to check their billing; Hisaab runs on the free tier, so it says what
// actually happened instead.
const QUOTA_MESSAGE = 'Free Gemini tier: too many live voice sessions on this key this minute (Google limit). It frees up within a minute.'
const failMessage = err => (err?.quota || isQuota(err) ? QUOTA_MESSAGE : String(err?.message || err))

function frameLevel(b64) {
  const buf = Buffer.from(b64, 'base64')
  const n = buf.length >> 1
  if (!n) return { rms: 0, ms: 0 }
  let s = 0
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(i * 2)
    s += v * v
  }
  return { rms: Math.sqrt(s / n), ms: (n / 16000) * 1000 }
}

function thinkingFor(model) {
  if (isNativeAudio(model)) {
    if (NATIVE_THINKING_BUDGET === 'auto') return null
    if (NATIVE_THINKING_BUDGET !== '' && Number.isFinite(Number(NATIVE_THINKING_BUDGET))) return { thinkingBudget: Number(NATIVE_THINKING_BUDGET) }
    return NATIVE_NO_THINKING.has(model) ? null : { thinkingBudget: 0 }
  }
  const level = THINKING_LEVEL || (/thinking/.test(model) ? 'LOW' : '')
  return level ? { thinkingLevel: level } : null
}

function sessionConfig(tenant, handle, model, earlier = '') {
  const thinking = thinkingFor(model)
  return {
    ...(thinking ? { thinkingConfig: thinking } : {}),
    ...(usesAlpha(model) ? { enableAffectiveDialog: true } : {}),
    responseModalities: [Modality.AUDIO],
    systemInstruction: systemPrompt(tenant) + earlier,
    tools: [{ functionDeclarations: TOOLS }],
    speechConfig: { ...(SPEECH_LANG ? { languageCode: SPEECH_LANG } : {}), voiceConfig: { prebuiltVoiceConfig: { voiceName: config.liveVoice } } },
    inputAudioTranscription: INPUT_LANGS.length ? { languageCodes: INPUT_LANGS } : {},
    outputAudioTranscription: OUTPUT_LANGS.length ? { languageCodes: OUTPUT_LANGS } : {},
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: handle ? { handle } : {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: START_SENSITIVITY,
        endOfSpeechSensitivity: END_SENSITIVITY,
        prefixPaddingMs: PREFIX_MS,
        silenceDurationMs: isNativeAudio(model) ? NATIVE_SILENCE_MS : SILENCE_MS,
      },
    },
  }
}

/** Open one Gemini Live session and resolve once Google confirmed the setup (so a refused model fails here). */
function connectOnce(model, tenant, handle, handlers, timeoutMs = SETUP_TIMEOUT_MS, earlier = '') {
  return new Promise((resolve, reject) => {
    let session = null
    let setup = false
    let settled = false
    const done = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        try {
          session?.close()
        } catch {}
        reject(err)
      } else resolve(value)
    }
    const timer = setTimeout(() => done(Object.assign(new Error('Live setup timed out'), { code: 'timeout' })), timeoutMs)
    const ready = () => session && setup && done(null, session)
    liveClient(model)
      .live.connect({
        model,
        config: sessionConfig(tenant, handle, model, earlier),
        callbacks: {
          onmessage: msg => {
            if (!settled) {
              if (msg.setupComplete) {
                setup = true
                ready()
              }
              return
            }
            handlers.onmessage(session, msg)
          },
          onerror: e => {
            if (!settled) done(Object.assign(new Error(e?.message || 'Live API error'), { code: e?.code }))
            else handlers.onerror(session, e)
          },
          onclose: e => {
            if (!settled) done(Object.assign(new Error(e?.reason || `Live connection closed (${e?.code ?? '?'})`), { code: e?.code }))
            else handlers.onclose(session, e)
          },
        },
      })
      .then(s => {
        session = s
        // Connected after the attempt already gave up: nobody will read this session, so close it at once
        // (each open one counts against the key's concurrent Live sessions).
        if (settled) {
          try {
            s.close()
          } catch {}
          return
        }
        ready()
      }, err => done(err))
  })
}

/** Every model a call may use, in order: LIVE_CALL_MODEL, LIVE_FALLBACK_MODELS, then LIVE_MODEL. */
export const allCallModels = () => [...new Set([CALL_MODEL, ...FALLBACK_MODELS, config.liveModel].filter(Boolean))]

/** The order to try now: a model resting after a free-tier quota refusal goes last (still tried if all else fails). */
export function callModels() {
  const all = allCallModels()
  return [...all.filter(m => !isResting(m)), ...all.filter(isResting)]
}

/**
 * For the system check: can "Talk to Hisaab" connect right now? Opens the call's real session (model, voice, tools,
 * this shop's prompt), closes it as soon as Google confirms the setup, and tries the fallbacks the call would try.
 * `model` is the one that connected; `fallback` is true when that is not the call's own first model.
 * `tried`, in the call's own model order, says what happened to each model ahead of the one that connected (every
 * model when none did): a failed setup, or `skipped` because it is resting after a free-tier quota refusal.
 * `resting` names every call model resting now. Never throws.
 */
export async function probeCall(tenant, { timeoutMs = 10000 } = {}) {
  const t0 = Date.now()
  const quiet = { onmessage() {}, onerror() {}, onclose() {} }
  const chain = allCallModels()
  const outcome = new Map()
  for (const model of chain.filter(isResting)) {
    outcome.set(model, { model, ms: 0, error: 'free-tier quota reached a moment ago; resting for a minute', busy: true, quota: true, skipped: true })
  }
  const report = upTo => chain.slice(0, upTo ? chain.indexOf(upTo) : chain.length).filter(m => outcome.has(m)).map(m => outcome.get(m))
  let attempts = 0
  for (const model of callModels()) {
    const left = timeoutMs - (Date.now() - t0)
    if (left < 1500) break
    const a0 = Date.now()
    try {
      const s = await connectOnce(model, tenant, null, quiet, Math.min(left, attempts++ ? FALLBACK_SETUP_TIMEOUT_MS : SETUP_TIMEOUT_MS))
      try {
        s.close()
      } catch {}
      resting.delete(model)
      return { ok: true, model, ms: Date.now() - a0, fallback: model !== chain[0], tried: report(model), resting: chain.filter(isResting) }
    } catch (err) {
      const quota = isQuota(err)
      if (quota) rest(model, err?.message)
      outcome.set(model, { model, ms: Date.now() - a0, error: failMessage(err).slice(0, 160), busy: transient(err) || quota, ...(quota ? { quota } : {}) })
    }
  }
  return { ok: false, model: null, ms: Date.now() - t0, fallback: false, tried: report(null), resting: chain.filter(isResting) }
}

/** Handle one browser WebSocket for a signed-in shop. */
export async function handleLiveSocket(ws, tenant) {
  const out = msg => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }
  let session = null
  let model = null
  let closed = false
  let ready = false
  let handle = null
  let reconnecting = false
  let reconnects = []
  let switchAt = 0 // goAway received: switch connections at the next quiet moment
  const held = []
  // Entries written during this call: a plain "undo" on the call may only cancel one of these.
  const callEntryIds = []

  // Turn bookkeeping for the watchdog. `recent`: the last frame levels; `speechMs`: time in the current "speech";
  // `toldThinking`: the screen was told the shopkeeper stopped, so it must hear when they carry on.
  const vad = { floor: 120, voicedMs: 0, quietMs: 0, speaking: false, startedAt: 0, speechMs: 0, peak: 0, recent: [], toldThinking: false }
  const turn = { endedAt: 0, flushed: false, nudged: false, gaveUp: false }
  // Writes Hisaab has not yet confirmed out loud: signature -> [{ result, at, items, customerId }]. Cleared once
  // Hisaab speaks.
  const unheard = new Map()
  let modelAt = 0 // last sign of life from the model (audio, transcript, tool call)
  let modelTurnOpen = false
  let streamEnded = false
  const preroll = []

  // What happened on this call, for a fresh session that cannot resume the old one (another model after a quota
  // refusal, or a refused resumption): the last words of both sides and every entry already written.
  const said = [] // [who, text]
  const writtenOnCall = []
  function remember(who, text) {
    const last = said.at(-1)
    if (last && last[0] === who) last[1] = (last[1] + text).slice(-300)
    else said.push([who, text.slice(-300)])
    if (said.length > 10) said.shift()
  }
  function earlierInCall() {
    if (!said.length && !writtenOnCall.length) return ''
    const lines = ['\n\nEARLIER IN THIS CALL (the call moved to a new connection; all of this already happened):']
    if (writtenOnCall.length) lines.push('Already in the khata from this call. Never write these again:', ...writtenOnCall.slice(-12).map(l => `- ${l}`))
    if (said.length) lines.push('Last words on the call:', ...said.map(([who, text]) => `${who}: ${text.trim()}`))
    return lines.join('\n')
  }

  const userTurnStarted = () => {
    turn.endedAt = 0
    turn.flushed = turn.nudged = turn.gaveUp = false
  }
  const userTurnEnded = () => {
    turn.endedAt = Date.now()
  }
  const modelAlive = () => {
    modelAt = Date.now()
  }

  function learnSteadyNoise() {
    if (vad.recent.length < STEADY_FRAMES) return
    const sorted = vad.recent.slice().sort((a, b) => a - b)
    const p10 = sorted[Math.floor(sorted.length * 0.1)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    if (!(p10 * 3 > Math.max(MIN_SPEECH_RMS, vad.floor * 3) && p90 < p10 * STEADY_RATIO)) return
    vad.floor = Math.min(p10, MAX_FLOOR_RMS)
    // Nothing in this "speech" rose clearly above the noise: it was the room, not the shopkeeper. Drop it quietly,
    // so the watchdog never asks Hisaab to answer a turn nobody spoke.
    if (vad.peak <= vad.floor * 3) {
      vad.speaking = false
      vad.voicedMs = vad.quietMs = 0
    }
  }

  function onAudio(data) {
    const { rms, ms } = frameLevel(data)
    vad.recent.push(rms)
    if (vad.recent.length > STEADY_FRAMES) vad.recent.shift()
    if (vad.speaking) {
      vad.speechMs += ms
      vad.peak = Math.max(vad.peak, rms)
      if (vad.speechMs >= STUCK_MS) learnSteadyNoise()
    }
    const threshold = Math.max(MIN_SPEECH_RMS, vad.floor * 3)
    const voiced = rms > threshold
    if (voiced) {
      vad.voicedMs += ms
      vad.quietMs = 0
      if (!vad.speaking && vad.voicedMs >= SPEECH_START_MS) {
        vad.speaking = true
        vad.speechMs = 0
        vad.peak = rms
        vad.startedAt = Date.now()
        userTurnStarted()
        if (vad.toldThinking) {
          // They carried on after a pause: the screen goes back to "Listening" and keeps "Done speaking" usable.
          vad.toldThinking = false
          out({ type: 'listening' })
        }
      }
    } else {
      // The floor falls quickly and rises slowly, so the quieter frames inside speech cannot drag it up.
      const level = Math.min(rms, MAX_FLOOR_RMS)
      vad.floor += (level - vad.floor) * (level > vad.floor ? FLOOR_RISE : FLOOR_FALL)
      vad.quietMs += ms
      if (!vad.speaking) vad.voicedMs = Math.max(0, vad.voicedMs - ms)
      if (vad.speaking && vad.quietMs >= SPEECH_END_MS) {
        vad.speaking = false
        vad.voicedMs = 0
        userTurnEnded()
        if (!modelTurnOpen) {
          vad.toldThinking = true
          out({ type: 'thinking', reason: 'end_of_speech' })
        }
      }
    }
    // After an explicit end of the audio stream, silence is not forwarded; speaking again reopens the stream. The
    // last 400 ms are kept and sent first, so the quiet start of the next sentence ("د" of "دکان") is not cut off.
    // Anything clearly above the room noise reopens it: in a noisy room a soft first word ("Ahmed …") is below the
    // speech threshold but must still reach Gemini.
    const opens = rms > Math.max(MIN_SPEECH_RMS, vad.floor * GATE_FACTOR)
    if (streamEnded && !opens) {
      preroll.push({ data, ms })
      while (preroll.reduce((t, f) => t + f.ms, 0) > PREROLL_MS) preroll.shift()
      return
    }
    if (streamEnded) {
      streamEnded = false
      for (const f of preroll.splice(0)) session.sendRealtimeInput({ audio: { data: f.data, mimeType: 'audio/pcm;rate=16000' } })
    }
    session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })
  }

  function endAudioStream() {
    if (streamEnded) return
    streamEnded = true
    preroll.length = 0
    try {
      session.sendRealtimeInput({ audioStreamEnd: true })
    } catch {}
  }

  // Register socket handlers first: the browser may hang up while Gemini is still connecting.
  ws.on('message', raw => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!session || !ready) {
      // Mid-switch: keep up to 10 s of the shopkeeper's audio for the new connection.
      if (reconnecting && msg.type === 'audio' && typeof msg.data === 'string' && held.length < 200) held.push(msg.data)
      return
    }
    try {
      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data) onAudio(msg.data)
      else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
        userTurnStarted()
        session.sendRealtimeInput({ text: msg.text.trim().slice(0, 500) })
        userTurnEnded()
        out({ type: 'thinking', reason: 'text' })
      } else if (msg.type === 'done') {
        // "Done speaking": commit the turn now instead of waiting for Gemini to notice the pause.
        const pending = vad.speaking || turn.endedAt > modelAt
        if (vad.speaking) {
          vad.speaking = false
          vad.voicedMs = 0
          userTurnEnded()
        }
        endAudioStream()
        if (pending) {
          turn.flushed = true
          out({ type: 'thinking', reason: 'done' })
        }
      }
    } catch (err) {
      console.warn('[live] could not forward input:', err?.message)
    }
  })
  ws.on('close', () => {
    closed = true
    clearInterval(watchdog)
    try {
      session?.close()
    } catch {}
  })

  const watchdog = setInterval(() => {
    if (switchAt && ready && !reconnecting) {
      const quiet = !modelTurnOpen && !vad.speaking && !(turn.endedAt && modelAt < turn.endedAt)
      if (quiet || Date.now() - switchAt > SWITCH_WAIT_MS) reconnect('go_away')
      return
    }
    if (!ready || reconnecting || !turn.endedAt || turn.gaveUp) return
    if (modelAt > turn.endedAt || modelTurnOpen) return
    const idle = Date.now() - turn.endedAt
    try {
      if (idle >= FLUSH_MS && !turn.flushed) {
        turn.flushed = true
        endAudioStream()
      }
      if (idle >= NUDGE_MS && !turn.nudged) {
        turn.nudged = true
        session.sendRealtimeInput({ text: NUDGE_TEXT })
        out({ type: 'nudge' })
        console.warn(`[live] ${tenant.id} no answer ${idle}ms after the shopkeeper spoke; nudged ${model}`)
      }
      if (idle >= GIVE_UP_MS) {
        turn.gaveUp = true
        out({ type: 'no_answer' })
      }
    } catch (err) {
      console.warn('[live] watchdog:', err?.message)
    }
  }, 250)

  const itemKeys = op => op.items.map(i => ledger.normalizeName(i) || i)
  // Both calls name goods and none of them match ("atta" / "ghee"): two entries. A repeat may drop some items.
  const otherGoods = (a, b) => a.length > 0 && b.length > 0 && !a.some(x => b.includes(x))

  function handleTools(s, calls) {
    modelAlive()
    out({ type: 'thinking', reason: 'tool' })
    const responses = []
    // Writes of this message join `unheard` only after it: two calls in ONE message are two entries the shopkeeper
    // said ("Umar ne 500 ka atta liya aur 500 ka ghee bhi"), never a repeat of each other.
    const written = []
    for (const call of calls) {
      const args = call.args || {}
      const op = opFrom(call.name, args)
      let result = { status: 'unknown_tool' }
      if (op) {
        // The same write again in a LATER message, before Hisaab has said anything, is a repeat, not a second entry:
        // Live models sometimes call a tool again right after its result, act on half a sentence and then on the
        // whole one after a pause ("Ahmed … 350 … on udhaar"), or answer twice after a nudge. All were seen in
        // testing. Once Hisaab has confirmed an entry out loud, saying it again is a real new entry. A repeat may drop
        // items or the Urdu name, so who / how much / which list identify it; wholly different goods are a new entry.
        const sig = WRITES.has(op.type)
          ? JSON.stringify([op.type, ledger.normalizeName(op.customer_name) || op.customer_name_urdu || '', op.amount, op.full_settlement, ledger.normalizeName(op.list_name || '')])
          : null
        const items = itemKeys(op)
        const repeat = ((sig && unheard.get(sig)) || []).find(w => Date.now() - w.at < REPEAT_WINDOW_MS && !otherGoods(items, w.items))
        if (repeat) {
          // The balance as it is now, from the ledger, so the model has the real number to say.
          const now = repeat.customerId ? ledger.getCustomer(tenant.id, repeat.customerId) : null
          result = { ...repeat.result, ...who(now), status: 'already_written', new_khata: undefined, list_created: undefined, hint: REPEAT_HINT }
          console.warn(`[live] ${tenant.id} ignored a repeated ${call.name} call before Hisaab confirmed the first`)
          out({ type: 'action', name: call.name, op: op.type, args, result, ts: Date.now() })
        } else {
          let r
          try {
            ;[r] = ledger.applyOperations(tenant.id, [op], { source: 'call', messageId: null, callEntryIds })
          } catch (err) {
            console.error('[live] ledger error', err)
            r = { type: op.type, status: 'error' }
          }
          if (r?.status === 'ok' && r.entry && ['credit', 'payment', 'purchase', 'supplier_payment', 'correct'].includes(r.type || op.type)) callEntryIds.push(r.entry.id)
          result = toolResult(r, op)
          if (sig && DONE_STATUSES.has(result.status)) {
            written.push([sig, { result, at: Date.now(), items, customerId: r?.customer?.id || null }])
            writtenOnCall.push(`${call.name} ${JSON.stringify(args)} -> ${JSON.stringify(result)}`.slice(0, 300))
          }
          out({ type: 'action', name: call.name, op: op.type, args, result, screen: screenExtras(r, tenant), ts: Date.now() })
        }
      }
      responses.push({ id: call.id, name: call.name, response: { output: result } })
    }
    for (const [sig, w] of written) unheard.set(sig, [...(unheard.get(sig) || []), w])
    try {
      s.sendToolResponse({ functionResponses: responses })
    } catch (err) {
      console.warn('[live] tool response not sent:', err?.message)
    }
  }

  const handlers = {
    onmessage: (s, msg) => {
      if (s !== session) return
      const sc = msg.serverContent
      if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) handle = msg.sessionResumptionUpdate.newHandle
      for (const p of sc?.modelTurn?.parts || []) {
        if (p.inlineData?.data) {
          if (!modelTurnOpen && vad.speaking) {
            // Hisaab answered: the shopkeeper's turn is over (with the mic paused while Hisaab talks, no
            // silence frames arrive to tell the speech detector so).
            vad.speaking = false
            vad.voicedMs = vad.quietMs = 0
            userTurnEnded()
          }
          modelAlive()
          modelTurnOpen = true
          vad.toldThinking = false
          unheard.clear()
          out({ type: 'audio', data: p.inlineData.data })
        }
      }
      if (sc?.inputTranscription?.text) {
        // Speech the shop's own detector missed entirely (a very quiet voice) still counts as a turn to answer.
        const missed = !vad.speaking && !modelTurnOpen && vad.startedAt <= modelAt && Date.now() - modelAt > 2500
        if (missed) {
          if (turn.endedAt <= modelAt) userTurnStarted()
          userTurnEnded()
        }
        const text = devanagariToUrdu(sc.inputTranscription.text)
        remember('Owner', text)
        out({ type: 'you', text })
      }
      if (sc?.outputTranscription?.text) {
        modelAlive()
        const text = devanagariToUrdu(sc.outputTranscription.text)
        remember('Hisaab', text)
        out({ type: 'ai', text })
      }
      if (sc?.interrupted) {
        modelTurnOpen = false
        out({ type: 'interrupted' })
      }
      if (sc?.turnComplete) {
        if (modelTurnOpen) modelAlive()
        modelTurnOpen = false
        out({ type: 'turn_complete' })
      }
      if (msg.toolCall?.functionCalls?.length) handleTools(s, msg.toolCall.functionCalls)
      if (msg.goAway && !switchAt) {
        // Google ends every Live connection after a while; carry the conversation over before it does, at a
        // moment when neither side is talking.
        switchAt = Date.now()
      }
    },
    onerror: (s, e) => {
      if (s !== session) return
      console.warn('[live] error', e?.message)
    },
    onclose: (s, e) => {
      if (s !== session || closed) return
      console.warn(`[live] ${tenant.id} ${model} closed mid-call: ${e?.code ?? '?'} ${String(e?.reason || '').slice(0, 160)}`)
      // 1007/1008: Google rejected the request itself (bad config, key, policy). Reconnecting cannot help.
      if (e?.code === 1007 || e?.code === 1008) {
        out({ type: 'error', code: 'config', message: e?.reason || `Live closed (${e?.code})` })
        ws.close()
        return
      }
      // Free-tier quota reached mid-call ("1011 You exceeded your current quota"): this model rests and the call
      // carries on, on the next model, with what was said so far.
      if (isQuota(e)) {
        rest(model, e?.reason)
        reconnect('quota', e)
        return
      }
      reconnect('closed', e)
    },
  }

  async function open(resumeHandle) {
    // Resume on the same model first (unless it is resting after a quota refusal); then a fresh session on each model
    // in callModels() order.
    const plan = []
    if (resumeHandle && model && !isResting(model)) plan.push({ m: model, h: resumeHandle })
    for (const m of callModels()) plan.push({ m, h: null })
    const deadline = Date.now() + CONNECT_DEADLINE_MS
    let lastErr = null
    let tries = 0
    const quotaHit = new Set()
    for (const { m, h } of plan) {
      if (quotaHit.has(m)) continue
      for (let attempt = 0; attempt < 2; attempt++) {
        if (closed) return null
        const left = deadline - Date.now()
        if (left < 1500) {
          console.warn(`[live] ${tenant.id} no Live connection within ${CONNECT_DEADLINE_MS / 1000} s; giving up`)
          throw Object.assign(new Error(`Google's Live service did not answer within ${CONNECT_DEADLINE_MS / 1000} s (${String(lastErr?.message || 'timed out').slice(0, 120)})`), { code: 'timeout', quota: isQuota(lastErr) })
        }
        try {
          const s = await connectOnce(m, tenant, h, handlers, Math.min(left, tries++ ? FALLBACK_SETUP_TIMEOUT_MS : SETUP_TIMEOUT_MS), h ? '' : earlierInCall())
          resting.delete(m)
          return { s, m, resumed: Boolean(h) }
        } catch (err) {
          lastErr = err
          console.warn(`[live] ${m} connect failed (attempt ${attempt + 1}): ${String(err?.message).slice(0, 200)}`)
          // Over the free-tier quota: this model will refuse again for a while; the next model may still have quota
          // (assumed per model, not measured).
          if (isQuota(err)) {
            rest(m, err?.message)
            quotaHit.add(m)
            break
          }
          // A refused model will refuse again; a hung setup is better spent on the next model.
          if (!transient(err) || err?.code === 'timeout') break
          await new Promise(r => setTimeout(r, Math.min(800 * (attempt + 1), Math.max(0, deadline - Date.now()))))
        }
      }
    }
    throw lastErr || new Error('Live connect failed')
  }

  async function reconnect(reason, e) {
    if (reconnecting || closed) return
    switchAt = 0
    const now = Date.now()
    reconnects = reconnects.filter(t => now - t < 120000)
    if (reconnects.length >= 4) {
      out({ type: 'error', code: e && isQuota(e) ? 'quota' : 'busy', message: e && isQuota(e) ? QUOTA_MESSAGE : e?.reason || 'The Live connection kept dropping' })
      ws.close()
      return
    }
    reconnects.push(now)
    reconnecting = true
    ready = false
    out({ type: 'reconnecting', reason })
    // Google serves a resumable session to one connection at a time, so the old one is closed before resuming.
    // The shopkeeper's audio is kept meanwhile and sent on once the new connection is up.
    const old = session
    session = null
    try {
      old?.close()
    } catch {}
    try {
      const next = await open(handle)
      if (!next || closed) {
        try {
          next?.s.close()
        } catch {}
        return
      }
      session = next.s
      model = next.m
      modelTurnOpen = false
      streamEnded = false
      ready = true
      reconnecting = false
      out({ type: 'ready', model, resumed: next.resumed })
      if (!next.resumed) {
        const note = said.length || writtenOnCall.length
          ? '(Hisaab system note: the call moved to a new connection. What happened before is in your instructions under EARLIER IN THIS CALL; those entries are already written. Say in one short Urdu line that you are back, and ask what to write next.)'
          : '(Hisaab system note: the call reconnected after a network problem. Say in one short Urdu line that you are back, and ask what to write.)'
        session.sendRealtimeInput({ text: note })
      }
      const backlog = held.splice(0)
      for (const data of backlog) onAudio(data)
    } catch (err) {
      reconnecting = false
      out({ type: 'error', code: failCode(err), message: failMessage(err) })
      ws.close()
    }
  }

  try {
    const first = await open(null)
    if (!first) return
    if (closed) {
      first.s.close()
      return
    }
    session = first.s
    model = first.m
    ready = true
    out({ type: 'ready', model })
    session.sendRealtimeInput({ text: 'The call just connected. Greet me now.' })
  } catch (err) {
    out({ type: 'error', code: failCode(err), message: failMessage(err) })
    ws.close()
  }
}
