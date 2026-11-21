import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import PaintedSky from './PaintedSky.jsx'
import { money } from '../lib/format.js'
import { useStrings, useLang } from '../lib/i18n.jsx'
import { useMe } from '../lib/me.jsx'
import './LiveCall.css'

// FSI…PDI: a name of unknown script (Latin, Urdu, starting with digits) keeps its own order inside Urdu text.
const iso = n => `⁨${n}⁩`

const STRINGS = {
  en: {
    title: 'Live call with Hisaab',
    into: shop => (shop ? `Entries go straight into ${shop}’s khata.` : 'Entries go straight into your khata.'),
    timer: 'Call time',
    end: 'End call',
    close: 'Close',
    again: 'Call again',
    connecting: 'Connecting…',
    slowConnect: 'Still connecting. Google is slow right now, so this can take up to half a minute.',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Hisaab is speaking…',
    reconnecting: 'Reconnecting…',
    micPaused: 'Your mic is paused while Hisaab speaks.',
    speakNow: 'Speak whenever you are ready. Urdu, English or both.',
    pauseOrDone: 'When you finish, pause for a moment or press Done speaking.',
    thinkingSub: 'Hisaab heard you and is working on it.',
    writingSub: 'Hisaab is writing it in your khata.',
    reconnectingSub: 'The line dropped for a moment. Hold on, your entries are safe.',
    done: 'Done speaking',
    typeLabel: 'Or type it',
    typePlaceholder: 'e.g. Umar ne 500 ka sauda liya',
    typeSend: 'Send',
    ended: 'Call ended',
    failed: 'The call stopped',
    you: 'You',
    hisaab: 'Hisaab',
    trySaying: 'Try saying',
    example: name => `“${name} ne 400 ka sauda liya”`,
    written: 'Written in your khata',
    writtenEmpty: 'Every entry Hisaab writes during this call is listed here, so you can check it.',
    mute: 'Mute my mic while Hisaab speaks',
    muteHint: 'Keep this on with laptop speakers, so Hisaab does not hear its own voice.',
    problem: 'Problem',
    note: 'Note',
    micDenied: 'Hisaab needs your microphone for the call. Tap the lock icon next to the web address, allow the microphone, then press Call again.',
    noMic: 'No microphone was found on this device.',
    audioFailed: 'Sound could not start in this browser. Please use the latest Chrome or Edge.',
    connectFailed: 'Could not reach Hisaab. Check your internet and try again.',
    liveError: 'Hisaab’s call service had a problem. Try again in a minute.',
    busy: 'Google’s voice service is very busy right now. Try the call again in a minute, or send a voice note on WhatsApp.',
    quota: 'Hisaab uses Google’s free voice service, and its limit for this minute is used up. Try the call again in a minute, or send a voice note on WhatsApp.',
    noAnswer: 'Hisaab did not answer that. Say it again, or type it below.',
    reconnected: 'Reconnected. Carry on.',
    closedByHisaab: 'Hisaab’s call service ended the call. You can call again.',
    reason: 'Reason:',
    credit: 'Udhaar',
    payment: 'Payment',
    purchase: 'Bought on credit',
    supplierPayment: 'Paid supplier',
    cancelled: 'Cancelled',
    corrected: 'Corrected',
    phoneSaved: 'Number saved',
    moved: 'Moved to a list',
    listCreated: 'New list',
    alreadyWritten: 'Already written, not added again',
    balance: b => (b > 0 ? `balance ${money(b)}` : b < 0 ? `${money(b)} advance` : 'settled'),
    owe: b => (b > 0 ? `you owe ${money(b)}` : b < 0 ? `${money(b)} paid in advance` : 'nothing owed'),
    newCustomer: 'new khata',
    general: 'General',
    inList: l => `in ${l}`,
    checked: 'Balance checked',
    reminder: 'Reminder ready',
    reminders: 'Reminders ready',
    remindersLine: (n, w) => `${n} ready${w ? ` · ${w} without a number` : ''}`,
    openWa: 'Open in WhatsApp',
    openWaFor: n => `Open WhatsApp for ${n}`,
    duesLabel: 'Who owes',
    dues: n => (n === 1 ? '1 customer owes you' : `${n} customers owe you`),
    owedLabel: 'Whom you owe',
    owed: n => (n === 1 ? 'You owe 1 supplier' : `You owe ${n} suppliers`),
    total: 'Total udhaar',
    listTotal: 'List total',
    payable: 'You owe suppliers',
    todayLine: (g, c) => `Today: given ${g} · received ${c}`,
    listsLabel: 'Your lists',
    lists: n => (n === 1 ? '1 list' : `${n} lists`),
    asked: 'Hisaab asked',
    q: {
      needs_amount: 'How much?',
      needs_name: 'Which customer?',
      ambiguous: 'Which customer?',
      confirm: 'Same customer, or a new one?',
      list_not_found: 'Which list?',
      not_supplier: 'A customer, not a supplier',
    },
    qOther: 'A question',
    info: {
      not_found: 'No khata with that name',
      already_clear: 'Already owes nothing',
      nothing_to_undo: 'Nothing to cancel',
      bad_phone: 'Phone number was not clear',
      exists: 'That list already exists',
      has_entries: 'Has entries, so not moved',
      too_many: 'Already 20 lists, the most allowed',
      error: 'Could not write that. Say it again.',
    },
  },
  ur: {
    title: 'حساب کے ساتھ لائیو کال',
    into: shop => (shop ? `اندراجات سیدھے ⁨${shop}⁩ کے کھاتے میں جاتے ہیں۔` : 'اندراجات سیدھے آپ کے کھاتے میں جاتے ہیں۔'),
    timer: 'کال کا وقت',
    end: 'کال ختم کریں',
    close: 'بند کریں',
    again: 'دوبارہ کال کریں',
    connecting: 'رابطہ ہو رہا ہے…',
    slowConnect: 'رابطہ ابھی ہو رہا ہے۔ گوگل اس وقت سست ہے، اس میں آدھا منٹ لگ سکتا ہے۔',
    listening: 'حساب سن رہا ہے…',
    thinking: 'حساب سوچ رہا ہے…',
    speaking: 'حساب بول رہا ہے…',
    reconnecting: 'دوبارہ رابطہ ہو رہا ہے…',
    micPaused: 'جب حساب بولتا ہے تو آپ کا مائیک رکا رہتا ہے۔',
    speakNow: 'جب چاہیں بولیں، اردو، انگریزی یا دونوں ملا کر۔',
    pauseOrDone: 'بات ختم ہو تو ذرا رکیں، یا بات مکمل کا بٹن دبائیں۔',
    thinkingSub: 'حساب نے آپ کی بات سن لی ہے، کام ہو رہا ہے۔',
    writingSub: 'حساب آپ کے کھاتے میں لکھ رہا ہے۔',
    reconnectingSub: 'رابطہ ایک لمحے کو ٹوٹ گیا۔ ذرا انتظار کریں، آپ کے اندراجات محفوظ ہیں۔',
    done: 'بات مکمل',
    typeLabel: 'یا لکھ کر بھیجیں',
    typePlaceholder: 'مثلاً: عمر نے 500 کا سودا لیا',
    typeSend: 'بھیجیں',
    ended: 'کال ختم ہو گئی',
    failed: 'کال رک گئی',
    you: 'آپ',
    hisaab: 'حساب',
    trySaying: 'ایسے بولیں',
    // No curly quotes in Urdu (Nastaliq draws them mirrored); FSI…PDI isolates the (usually Latin) name.
    example: name => `${iso(name)} نے 400 کا سودا لیا`,
    written: 'آپ کے کھاتے میں لکھا گیا',
    writtenEmpty: 'اس کال میں حساب جو بھی اندراج کرے گا، وہ یہاں نظر آئے گا تاکہ آپ چیک کر سکیں۔',
    mute: 'جب حساب بولے تو میرا مائیک بند رکھیں',
    muteHint: 'لیپ ٹاپ کے اسپیکر پر اسے آن رکھیں، تاکہ حساب اپنی ہی آواز نہ سنے۔',
    problem: 'مسئلہ',
    note: 'اطلاع',
    micDenied: 'کال کے لیے مائیک کی اجازت چاہیے۔ ویب ایڈریس کے ساتھ تالے کے نشان پر ٹیپ کریں، مائیک کی اجازت دیں، پھر دوبارہ کال کریں۔',
    noMic: 'اس ڈیوائس پر کوئی مائیک نہیں ملا۔',
    audioFailed: 'اس براؤزر میں آواز شروع نہیں ہو سکی۔ کروم یا ایج کا نیا ورژن استعمال کریں۔',
    connectFailed: 'حساب سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    liveError: 'کال سروس میں مسئلہ آ گیا۔ ایک منٹ بعد دوبارہ کوشش کریں۔',
    busy: 'گوگل کی وائس سروس اس وقت بہت مصروف ہے۔ ایک منٹ بعد دوبارہ کال کریں، یا واٹس ایپ پر وائس نوٹ بھیج دیں۔',
    quota: 'حساب گوگل کی مفت وائس سروس استعمال کرتا ہے، اور اس منٹ کی حد پوری ہو گئی ہے۔ ایک منٹ بعد دوبارہ کال کریں، یا واٹس ایپ پر وائس نوٹ بھیج دیں۔',
    noAnswer: 'حساب نے اس بات کا جواب نہیں دیا۔ دوبارہ بولیں، یا نیچے لکھ کر بھیجیں۔',
    reconnected: 'رابطہ بحال ہو گیا۔ بات جاری رکھیں۔',
    closedByHisaab: 'حساب کی کال سروس نے کال ختم کر دی۔ آپ دوبارہ کال کر سکتے ہیں۔',
    reason: 'وجہ:',
    credit: 'ادھار',
    payment: 'وصولی',
    purchase: 'ادھار پر مال لیا',
    supplierPayment: 'سپلائر کو ادائیگی',
    cancelled: 'منسوخ',
    corrected: 'درست کیا',
    phoneSaved: 'نمبر محفوظ',
    moved: 'لسٹ میں ڈالا',
    listCreated: 'نئی لسٹ',
    alreadyWritten: 'پہلے ہی لکھا جا چکا، دوبارہ نہیں لکھا',
    balance: b => (b > 0 ? `بقایا ${money(b)}` : b < 0 ? `${money(b)} ایڈوانس` : 'حساب صاف'),
    owe: b => (b > 0 ? `آپ کے ذمے ${money(b)}` : b < 0 ? `${money(b)} پیشگی دیے` : 'کچھ واجب نہیں'),
    newCustomer: 'نیا کھاتہ',
    general: 'عام کھاتہ',
    inList: l => `${iso(l)} میں`,
    checked: 'بقایا دیکھا',
    reminder: 'یاد دہانی تیار',
    reminders: 'یاد دہانیاں تیار',
    remindersLine: (n, w) => `${n} تیار${w ? ` · ${w} کا نمبر نہیں` : ''}`,
    openWa: 'واٹس ایپ میں کھولیں',
    openWaFor: n => `${iso(n)} کے لیے واٹس ایپ کھولیں`,
    duesLabel: 'کس کے ذمے ہے',
    dues: n => (n === 1 ? '1 گاہک کے ذمے ادھار ہے' : `${n} گاہکوں کے ذمے ادھار ہے`),
    owedLabel: 'آپ کس کے مقروض ہیں',
    owed: n => (n === 1 ? '1 سپلائر کو دینا ہے' : `${n} سپلائرز کو دینا ہے`),
    total: 'کل ادھار',
    listTotal: 'لسٹ کا کل',
    payable: 'سپلائرز کو دینا ہے',
    todayLine: (g, c) => `آج: ادھار ${g} · وصولی ${c}`,
    listsLabel: 'آپ کی لسٹیں',
    lists: n => (n === 1 ? '1 لسٹ' : `${n} لسٹیں`),
    asked: 'حساب نے پوچھا',
    q: {
      needs_amount: 'کتنے روپے؟',
      needs_name: 'کون سا گاہک؟',
      ambiguous: 'کون سا گاہک؟',
      confirm: 'یہی گاہک یا نیا؟',
      list_not_found: 'کون سی لسٹ؟',
      not_supplier: 'یہ گاہک ہیں، سپلائر نہیں',
    },
    qOther: 'ایک سوال',
    info: {
      not_found: 'اس نام کا کوئی کھاتہ نہیں ملا',
      already_clear: 'حساب پہلے سے صاف ہے',
      nothing_to_undo: 'منسوخ کرنے کو کوئی اندراج نہیں',
      bad_phone: 'نمبر صاف سمجھ نہیں آیا',
      exists: 'یہ لسٹ پہلے سے موجود ہے',
      has_entries: 'اندراجات موجود ہیں، اس لیے منتقل نہیں کیا',
      too_many: 'پہلے ہی 20 لسٹیں ہیں، اس سے زیادہ نہیں بن سکتیں',
      error: 'یہ لکھا نہیں جا سکا۔ دوبارہ بولیں۔',
    },
  },
}

const URDU_SCRIPT = /[؀-ۿ]/
// Code-mixed captions ("Haji Sahib سے بیس ہزار…") read right to left as soon as they hold Urdu script.
const captionDir = text => (URDU_SCRIPT.test(text) ? 'rtl' : 'auto')
const pad = n => String(n).padStart(2, '0')
const clock = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
// Thinking that never ends (a lost message) falls back to listening after this long.
const THINKING_MAX_MS = 25000
const TOOL_THINKING_MAX_MS = 10000
// "Connecting…" this long gets a line saying Google is slow (the server gives up after 25 s).
const SLOW_CONNECT_MS = 8000

function timeOfDay(ts, lang) {
  return new Date(ts || Date.now()).toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' })
}

function f32ToB64(f32) {
  const i16 = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(i16.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function level(an) {
  if (!an) return 0
  const d = new Uint8Array(an.fftSize)
  an.getByteTimeDomainData(d)
  let s = 0
  for (const v of d) s += ((v - 128) / 128) ** 2
  return Math.min(1, Math.sqrt(s / d.length) * 3.2)
}

const safeLink = l => (typeof l === 'string' && l.startsWith('https://') ? l : null)

/** A `{type:'action'}` event from /live as a labeled card: { tone, label, main, sub, links }. */
function describeAction(m, S, lang) {
  const r = m.result || {}
  const screen = m.screen || {}
  const ur = lang === 'ur'
  const supplier = r.supplier != null
  const who = (ur && (r.customer_urdu || r.supplier_urdu)) || r.customer || r.supplier || ''
  const bal = supplier ? (r.shop_owes_them_now != null ? S.owe(r.shop_owes_them_now) : '') : r.balance_now != null ? S.balance(r.balance_now) : ''
  const inList = r.list && r.list !== 'General' ? S.inList(r.list) : ''
  const join = (...parts) => parts.filter(Boolean).join(' · ')
  const person = (label, tone = 'neutral') => ({ tone, label, main: who || bal, sub: who ? join(bal, inList) : '' })

  switch (r.status) {
    case 'written': {
      const kind = r.entry || (m.op === 'credit' || m.op === 'payment' ? m.op : 'credit')
      const label = { credit: S.credit, payment: S.payment, purchase: S.purchase, supplier_payment: S.supplierPayment }[kind] || S.credit
      const tone = kind === 'credit' ? 'owed' : kind === 'payment' ? 'paid' : 'neutral'
      return { tone, label, main: join(money(r.amount), who), sub: join(bal, inList, r.new_khata ? S.newCustomer : '') }
    }
    case 'already_written':
      // Hisaab asked to write the same entry twice before it spoke: shown, so the screen matches what it says.
      return { tone: 'neutral', label: S.note, main: S.alreadyWritten, sub: join(r.amount ? money(r.amount) : '', who, bal) }
    case 'cancelled':
      return { tone: 'neutral', label: S.cancelled, main: join(money(r.cancelled_amount), who), sub: bal }
    case 'corrected':
      return { tone: 'neutral', label: S.corrected, main: join(`${money(r.old_amount)} → ${money(r.new_amount)}`, who), sub: bal }
    case 'saved':
      return person(S.phoneSaved)
    case 'moved':
      return { tone: 'neutral', label: S.moved, main: who, sub: S.inList(!r.list_name || r.list_name === 'General' ? S.general : r.list_name) }
    case 'list_created':
      return { tone: 'neutral', label: S.listCreated, main: r.list_name || '', sub: '' }
    case 'ok':
      break
    default: {
      if (S.q[r.status]) {
        const options = r.candidates?.length ? r.candidates.join(' / ') : r.status === 'list_not_found' ? r.list_name || '' : who
        return { tone: 'ask', label: S.asked, main: S.q[r.status], sub: options }
      }
      const info = S.info[r.status]
      return { tone: 'ask', label: info ? S.note : S.asked, main: info || S.qOther, sub: r.status === 'exists' || r.status === 'too_many' ? r.list_name || '' : who }
    }
  }

  // status 'ok': lookups, summaries, reminders
  switch (m.op) {
    case 'reminder': {
      if (Array.isArray(screen.reminders)) {
        const list = screen.reminders
        const links = list.filter(x => safeLink(x.link)).slice(0, 5).map(x => ({ href: x.link, label: S.openWaFor((ur && x.nameUrdu) || x.name) }))
        return { tone: 'neutral', label: S.reminders, main: r.list_name || '', sub: S.remindersLine(list.length, list.filter(x => !x.hasPhone).length), links }
      }
      // No saved number: open WhatsApp with the message typed, so the owner picks the chat (same as ReminderSheet).
      const href = safeLink(screen.whatsapp_link) || (typeof screen.reminder_text === 'string' && screen.reminder_text ? `https://wa.me/?text=${encodeURIComponent(screen.reminder_text)}` : null)
      if (r.reminder_ready === false) return person(S.checked)
      return { ...person(S.reminder), links: href ? [{ href, label: S.openWa }] : [] }
    }
    case 'dues_list': {
      const people = Array.isArray(r.people) ? r.people : []
      const suppliers = r.about === 'suppliers'
      const head = m.args?.list_name && r.scope ? `${r.scope === 'General' ? S.general : r.scope}: ` : ''
      return {
        tone: 'neutral',
        label: suppliers ? S.owedLabel : S.duesLabel,
        main: head + (suppliers ? S.owed(r.count ?? people.length) : S.dues(r.count ?? people.length)),
        sub: join(r.total != null ? money(r.total) : '', people.slice(0, 4).map(x => `${x.name} ${money(x.amount)}`).join(', ')),
      }
    }
    case 'total_due': {
      if (r.shop_owes_suppliers != null && r.total_udhaar == null) return { tone: 'neutral', label: S.payable, main: money(r.shop_owes_suppliers), sub: '' }
      const listTotal = r.total_udhaar_in_list ?? r.shop_owes_this_list
      if (r.list_name && listTotal != null) return { tone: 'neutral', label: S.listTotal, main: money(listTotal), sub: r.list_name === 'General' ? S.general : r.list_name }
      return {
        tone: 'neutral',
        label: S.total,
        main: money(r.total_udhaar || 0),
        sub: join(S.todayLine(money(r.given_today || 0), money(r.collected_today || 0)), r.shop_owes_suppliers ? `${S.payable} ${money(r.shop_owes_suppliers)}` : ''),
      }
    }
    case 'lists_summary': {
      const lists = Array.isArray(r.lists) ? r.lists : []
      const named = l => (l.name === 'General' ? S.general : l.name)
      return { tone: 'neutral', label: S.listsLabel, main: S.lists(lists.filter(l => l.name !== 'General').length), sub: lists.slice(0, 6).map(l => `${named(l)} ${money(l.total || 0)}`).join(' · ') }
    }
    default:
      return person(S.checked)
  }
}

/**
 * Real-time voice call with Hisaab (Gemini Live through the server's /live relay).
 * Mic audio goes up as 16 kHz PCM16; Hisaab's voice comes back as 24 kHz PCM16. Tool calls write into this shop's
 * khata on the server and arrive here as `action` events.
 */
export default function LiveCall({ open, onClose, hintName }) {
  if (!open) return null
  return createPortal(<CallScreen onClose={onClose} hintName={hintName} />, document.body)
}

function CallScreen({ onClose, hintName = 'Umar' }) {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const { me } = useMe()
  const titleId = useId()
  const descId = useId()
  const typeId = useId()
  const dialogRef = useRef(null)
  const meterRef = useRef(null)
  const actsRef = useRef(null)

  const [phase, setPhase] = useState('connecting') // connecting | live | ended | failed
  const [talk, setTalk] = useState('listening') // listening | thinking | speaking | reconnecting
  // Why Hisaab is thinking: 'tool' (writing), 'pause' (the server heard a pause; the shopkeeper may carry on), or ''.
  const [thinkWhy, setThinkWhy] = useState('')
  const [spoke, setSpoke] = useState(false) // the shopkeeper said something this turn
  const [slow, setSlow] = useState(false) // still connecting after SLOW_CONNECT_MS
  const [seconds, setSeconds] = useState(0)
  const [you, setYou] = useState('')
  const [ai, setAi] = useState('')
  const [typed, setTyped] = useState('')
  const [actions, setActions] = useState([])
  const [notice, setNotice] = useState(null) // { tone: 'warn' | 'info', text, detail?, soft? }
  const [mute, setMute] = useState(true)
  const muteRef = useRef(true)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const call = useRef({
    ws: null, stream: null, inCtx: null, outCtx: null, node: null, inAn: null, outAn: null, outGain: null,
    sources: new Set(), nextT: 0, ready: false, t0: 0, timer: 0, raf: 0, token: null, slowTimer: 0,
    newYou: true, newAi: true, you: '', ai: '', talk: 'listening',
    thinkingSince: 0, thinkWhy: '', toolAt: 0, reconnecting: false, spoke: false, connected: false,
  })

  const stopPlayback = useCallback(() => {
    const c = call.current
    for (const s of c.sources) {
      try {
        s.stop()
      } catch {}
    }
    c.sources.clear()
    c.nextT = 0
  }, [])

  const playPcm = useCallback(b64 => {
    const c = call.current
    if (!c.outCtx || !c.outGain) return
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const i16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
    if (!i16.length) return
    const buf = c.outCtx.createBuffer(1, i16.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 0x8000
    const src = c.outCtx.createBufferSource()
    src.buffer = buf
    src.connect(c.outGain)
    const at = Math.max(c.outCtx.currentTime + 0.03, c.nextT)
    src.start(at)
    c.nextT = at + buf.duration
    c.sources.add(src)
    src.onended = () => c.sources.delete(src)
  }, [])

  const aiSpeaking = (tail = 0.35) => {
    const c = call.current
    return Boolean(c.outCtx && c.nextT > c.outCtx.currentTime - tail)
  }

  const think = useCallback(why => {
    const c = call.current
    const fresh = !c.thinkingSince
    if (fresh) c.thinkingSince = Date.now()
    // A pause only starts "thinking" when nothing else did; "Done speaking", a typed line or a nudge commit the turn.
    let next = c.thinkWhy
    if (why === 'tool') {
      c.toolAt = Date.now()
      next = 'tool'
    } else if (why === 'end_of_speech') {
      if (fresh) next = 'pause'
    } else if (next !== 'tool') next = ''
    c.thinkWhy = next
    setThinkWhy(next)
  }, [])
  const stopThinking = useCallback(() => {
    const c = call.current
    c.thinkingSince = 0
    c.thinkWhy = ''
    setThinkWhy('')
  }, [])

  /** Release the mic, both AudioContexts, the socket and all timers. Safe to call any number of times. */
  const release = useCallback(() => {
    const c = call.current
    const ws = c.ws
    c.ws = null
    c.token = null
    c.ready = false
    if (ws && ws.readyState <= 1) {
      try {
        ws.close()
      } catch {}
    }
    cancelAnimationFrame(c.raf)
    clearInterval(c.timer)
    clearTimeout(c.slowTimer)
    setSlow(false)
    stopPlayback()
    if (c.node) c.node.port.onmessage = null
    c.stream?.getTracks().forEach(t => t.stop())
    c.inCtx?.close().catch(() => {})
    c.outCtx?.close().catch(() => {})
    Object.assign(c, {
      stream: null, inCtx: null, outCtx: null, node: null, inAn: null, outAn: null, outGain: null, raf: 0, timer: 0, slowTimer: 0,
      newYou: true, newAi: true, you: '', ai: '', thinkingSince: 0, thinkWhy: '', toolAt: 0, reconnecting: false, spoke: false, connected: false,
    })
    meterRef.current?.style.setProperty('--lvl', '0')
  }, [stopPlayback])

  const fail = useCallback(
    (text, detail) => {
      release()
      setPhase('failed')
      setNotice({ tone: 'warn', text, detail })
    },
    [release],
  )

  const onMessage = useCallback(
    m => {
      const c = call.current
      switch (m.type) {
        case 'ready':
          c.ready = true
          if (c.reconnecting) {
            c.reconnecting = false
            setNotice({ tone: 'info', text: S.reconnected, soft: true })
            break
          }
          c.connected = true
          c.t0 = Date.now()
          clearTimeout(c.slowTimer)
          setSlow(false)
          setPhase('live')
          clearInterval(c.timer)
          c.timer = setInterval(() => setSeconds(Math.floor((Date.now() - c.t0) / 1000)), 500)
          break
        case 'audio':
          if (c.thinkingSince) stopThinking()
          if (m.data) playPcm(m.data)
          break
        // Transcripts stream in pieces and the shopkeeper's can arrive after Hisaab starts talking,
        // so each buffer resets only when a new turn begins, never on a role switch.
        case 'you':
          if (c.newYou) {
            c.you = ''
            c.newYou = false
          }
          c.you += m.text || ''
          setYou(c.you.trim())
          break
        case 'ai':
          if (c.newAi) {
            c.ai = ''
            c.newAi = false
          }
          c.ai += m.text || ''
          setAi(c.ai.trim())
          break
        case 'thinking':
          think(m.reason)
          break
        case 'listening':
          // The shopkeeper carried on after a pause: back to "Listening", with "Done speaking" usable.
          if (c.thinkWhy === 'pause') stopThinking()
          break
        case 'interrupted':
          stopPlayback()
          c.newYou = c.newAi = true
          break
        case 'turn_complete':
          c.newYou = c.newAi = true
          c.spoke = false
          setSpoke(false)
          // A tool call ends a model turn before Hisaab speaks the result: stay "thinking" until the voice comes.
          if (Date.now() - c.toolAt > 3000) stopThinking()
          break
        case 'action':
          think('tool')
          setActions(list => [...list, { ...m, key: `${m.ts || Date.now()}-${list.length}` }])
          break
        case 'nudge':
          think()
          break
        case 'no_answer':
          stopThinking()
          setNotice({ tone: 'info', text: S.noAnswer, soft: true })
          break
        case 'reconnecting':
          c.reconnecting = true
          stopPlayback()
          stopThinking()
          break
        case 'error':
          fail(m.code === 'quota' ? S.quota : m.code === 'busy' ? S.busy : S.liveError, m.message)
          break
        case 'closed':
          release()
          setPhase(p => (p === 'failed' ? p : 'ended'))
          if (m.reason) setNotice({ tone: 'info', text: S.closedByHisaab, detail: m.reason })
          break
        default:
          break
      }
    },
    [S, fail, playPcm, release, stopPlayback, think, stopThinking],
  )
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const start = useCallback(async () => {
    const c = call.current
    release()
    // If the call is ended while the mic is still opening, this token goes stale and setup stops.
    const token = {}
    c.token = token
    setPhase('connecting')
    setTalk('listening')
    c.talk = 'listening'
    setThinkWhy('')
    setSpoke(false)
    setSeconds(0)
    setYou('')
    setAi('')
    setNotice(null)

    let stream = null
    let inCtx = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no mediaDevices'), { name: 'AudioUnsupported' })
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      if (c.token !== token) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      inCtx = new AudioContext({ sampleRate: 16000 })
      await inCtx.audioWorklet.addModule('/pcm-worklet.js')
      if (c.token !== token) {
        stream.getTracks().forEach(t => t.stop())
        inCtx.close().catch(() => {})
        return
      }
      c.stream = stream
      c.inCtx = inCtx
      const src = inCtx.createMediaStreamSource(stream)
      c.node = new AudioWorkletNode(inCtx, 'pcm-capture')
      c.inAn = inCtx.createAnalyser()
      c.inAn.fftSize = 512
      src.connect(c.inAn)
      src.connect(c.node)
      const sink = inCtx.createGain()
      sink.gain.value = 0
      c.node.connect(sink).connect(inCtx.destination)

      c.outCtx = new AudioContext({ sampleRate: 24000 })
      c.outGain = c.outCtx.createGain()
      c.outAn = c.outCtx.createAnalyser()
      c.outAn.fftSize = 512
      c.outGain.connect(c.outAn)
      c.outAn.connect(c.outCtx.destination)
      // The permission prompt can outlast the click's user activation; make sure both contexts actually run.
      inCtx.resume().catch(() => {})
      c.outCtx.resume().catch(() => {})
    } catch (err) {
      if (c.token !== token) return
      if (!c.stream) {
        stream?.getTracks().forEach(t => t.stop())
        inCtx?.close().catch(() => {})
      }
      const name = err?.name || ''
      fail(name === 'NotAllowedError' || name === 'SecurityError' ? S.micDenied : name === 'NotFoundError' || name === 'OverconstrainedError' ? S.noMic : S.audioFailed)
      return
    }

    let ws
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`)
    } catch {
      fail(S.connectFailed)
      return
    }
    c.ws = ws
    c.slowTimer = setTimeout(() => c.ws === ws && !c.connected && setSlow(true), SLOW_CONNECT_MS)
    ws.onmessage = e => {
      if (c.ws !== ws) return
      let m
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      onMessageRef.current(m)
    }
    ws.onclose = () => {
      if (c.ws !== ws) return
      const wasReady = c.connected
      release()
      if (wasReady) setPhase(p => (p === 'failed' ? p : 'ended'))
      else {
        setPhase('failed')
        setNotice({ tone: 'warn', text: S.connectFailed })
      }
    }

    c.node.port.onmessage = e => {
      if (!c.ready || ws.readyState !== WebSocket.OPEN) return
      if (muteRef.current && aiSpeaking()) return
      ws.send(JSON.stringify({ type: 'audio', data: f32ToB64(e.data) }))
    }

    const loop = () => {
      if (c.ws !== ws) return
      const speaking = aiSpeaking(0.15)
      const lvl = speaking ? level(c.outAn) : level(c.inAn)
      meterRef.current?.style.setProperty('--lvl', lvl.toFixed(3))
      if (!speaking && c.ready && lvl > 0.18 && !c.spoke) {
        c.spoke = true
        setSpoke(true)
      }
      // After a write the card already shows it, so a silent Hisaab stops "thinking" sooner.
      const thinkLimit = c.toolAt >= c.thinkingSince ? Date.now() - c.toolAt > TOOL_THINKING_MAX_MS : Date.now() - c.thinkingSince > THINKING_MAX_MS
      if (c.thinkingSince && thinkLimit) {
        c.thinkingSince = 0
        c.thinkWhy = ''
        setThinkWhy('')
      }
      const t = speaking ? 'speaking' : c.reconnecting ? 'reconnecting' : c.thinkingSince ? 'thinking' : 'listening'
      if (t !== c.talk) {
        c.talk = t
        setTalk(t)
      }
      c.raf = requestAnimationFrame(loop)
    }
    loop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, fail, release])

  // Start on open, release everything on close (also covers React's dev double-mount via the token).
  useEffect(() => {
    start()
    return release
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dialog behaviour: focus inside, Escape ends the call, Tab stays inside, page behind does not scroll.
  useEffect(() => {
    const node = dialogRef.current
    const opener = document.activeElement
    node?.focus()
    const focusables = () => [...node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled)
    const onKey = e => {
      if (e.key === 'Escape') {
        // Escape in the typing box with text in it only leaves the box alone; it does not hang up.
        if (e.target?.tagName === 'INPUT' && e.target.value) return
        e.stopPropagation()
        onCloseRef.current?.()
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (!els.length) return
        const [a, z] = [els[0], els[els.length - 1]]
        if (e.shiftKey && (document.activeElement === a || document.activeElement === node)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    node?.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node?.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  // Keep the newest action in view (desktop side column scrolls on its own; on phones the page scrolls).
  useEffect(() => {
    const el = actsRef.current
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight
  }, [actions.length])

  // A soft notice (reconnected, no answer) clears itself once the conversation moves on.
  useEffect(() => {
    if (!notice?.soft) return
    const t = setTimeout(() => setNotice(n => (n === notice ? null : n)), 8000)
    return () => clearTimeout(t)
  }, [notice])

  function toggleMute(e) {
    muteRef.current = e.target.checked
    setMute(e.target.checked)
  }

  function send(msg) {
    const ws = call.current.ws
    if (!call.current.ready || ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(msg))
    return true
  }

  function doneSpeaking() {
    // Thinking only when something was said; pressed early it just closes the mic stream for a moment.
    if (send({ type: 'done' }) && call.current.spoke) think()
  }

  function sendTyped(e) {
    e.preventDefault()
    const text = typed.trim()
    if (!text || call.current.reconnecting || !send({ type: 'text', text })) return
    const c = call.current
    c.you = text
    c.newYou = true
    setYou(text)
    setTyped('')
    think()
  }

  const over = phase === 'ended' || phase === 'failed'
  const live = phase === 'live'
  const status =
    phase === 'connecting' ? S.connecting : phase === 'ended' ? S.ended : phase === 'failed' ? S.failed : { speaking: S.speaking, thinking: S.thinking, reconnecting: S.reconnecting }[talk] || S.listening
  const substatus = !live
    ? phase === 'connecting' && slow
      ? S.slowConnect
      : ''
    : talk === 'speaking'
      ? mute
        ? S.micPaused
        : ''
      : talk === 'thinking'
        ? thinkWhy === 'tool'
          ? S.writingSub
          : S.thinkingSub
        : talk === 'reconnecting'
          ? S.reconnectingSub
          : spoke
            ? S.pauseOrDone
            : S.speakNow
  const hasCaptions = Boolean(you || ai)
  const example = S.example(hintName)
  const end = () => onCloseRef.current?.()

  return (
    <div ref={dialogRef} className="lc" data-phase={phase} data-talk={talk} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} tabIndex={-1}>
      <header className="lc-top">
        <h2 id={titleId} className="lc-label lc-title">{S.title}</h2>
        <p id={descId} className="lc-context">{S.into(me?.shopName)}</p>
        {over ? (
          <button type="button" className="lc-pill lc-pill-ghost lc-top-action" onClick={end}>{S.close}</button>
        ) : (
          <button type="button" className="lc-pill lc-pill-ivory lc-top-action lc-hangup" onClick={end}>
            <Icon name="phone" />
            <span>{S.end}</span>
          </button>
        )}
      </header>

      {/* The night sky is painted behind the stage only; the header and the khata column are solid night. */}
      <div className="lc-sky">
        <PaintedSky look="night" />
        <div className="lc-veil" aria-hidden="true" />
      </div>

      <div className="lc-body">
        <div className="lc-stage">
          <p className="lc-eyebrow">
            <span className="lc-dot" aria-hidden="true" />
            <span className="sr-only">{S.timer} </span>
            <span className="lc-clock">{clock(seconds)}</span>
          </p>

          <div className="lc-status-wrap" role="status" aria-live="polite">
            <p className="lc-status">{status}</p>
            <span ref={meterRef} className="lc-meter" aria-hidden="true" />
            {substatus && <p className="lc-substatus">{substatus}</p>}
          </div>

          {live && (talk === 'listening' || talk === 'thinking') && (
            <button type="button" className="lc-pill lc-pill-ivory lc-done" onClick={doneSpeaking} disabled={talk === 'thinking' && thinkWhy !== 'pause'}>
              <Icon name="check" />
              <span>{S.done}</span>
            </button>
          )}

          {notice && (
            <div className="lc-card lc-notice" data-tone={notice.tone} role={notice.tone === 'warn' ? 'alert' : undefined}>
              <span className="lc-card-label">{notice.tone === 'warn' ? S.problem : S.note}</span>
              <p className="lc-card-main">{notice.text}</p>
              {/* The reason comes from the call service in English, so only it is set left-to-right. */}
              {notice.detail && (
                <p className="lc-card-sub">
                  {S.reason}{' '}
                  <span className="latin" dir="ltr">{notice.detail}</span>
                </p>
              )}
            </div>
          )}

          {over && (
            <div className="lc-again">
              <button type="button" className="lc-pill lc-pill-ivory" onClick={start}>
                <Icon name="phone" />
                <span>{S.again}</span>
              </button>
              <button type="button" className="lc-pill lc-pill-ghost" onClick={end}>{S.close}</button>
            </div>
          )}

          {!over && (
            <div className="lc-captions">
              {hasCaptions ? (
                <>
                  <div className="lc-cell">
                    <span className="lc-label">{S.you}</span>
                    <p dir={captionDir(you)} className={`lc-you${URDU_SCRIPT.test(you) ? ' is-urdu' : ''}`}>{you || '…'}</p>
                  </div>
                  <div className="lc-cell">
                    <span className="lc-label">{S.hisaab}</span>
                    <p dir={captionDir(ai)} className={`lc-ai${URDU_SCRIPT.test(ai) ? ' is-urdu' : ''}`}>{ai || '…'}</p>
                  </div>
                </>
              ) : (
                <div className="lc-cell">
                  <span className="lc-label">{S.trySaying}</span>
                  <p className={`lc-ai${URDU_SCRIPT.test(example) ? ' is-urdu' : ''}`}>{example}</p>
                </div>
              )}
            </div>
          )}

          {live && (
            <form className="lc-type" onSubmit={sendTyped}>
              <label htmlFor={typeId} className="lc-label">{S.typeLabel}</label>
              <div className="lc-type-row">
                <input
                  id={typeId}
                  className="lc-type-input"
                  dir="auto"
                  type="text"
                  autoComplete="off"
                  maxLength={500}
                  value={typed}
                  placeholder={S.typePlaceholder}
                  onChange={e => setTyped(e.target.value)}
                />
                <button type="submit" className="lc-pill lc-pill-ghost lc-type-send" disabled={!typed.trim() || talk === 'reconnecting'}>
                  <Icon name="send" />
                  <span>{S.typeSend}</span>
                </button>
              </div>
            </form>
          )}

          <label className="lc-mute">
            <input className="lc-switch-input" type="checkbox" role="switch" checked={mute} onChange={toggleMute} />
            <span className="lc-switch" aria-hidden="true" />
            <span>
              <span className="lc-mute-title">{S.mute}</span>
              <span className="lc-mute-hint">{S.muteHint}</span>
            </span>
          </label>
        </div>

        <aside ref={actsRef} className="lc-log" aria-labelledby={`${titleId}-acts`}>
          <div className="lc-log-head">
            <h3 id={`${titleId}-acts`} className="lc-label">{S.written}</h3>
            {actions.length > 0 && <span className="lc-count">{actions.length}</span>}
          </div>
          {actions.length === 0 ? (
            <p className="lc-log-empty">{S.writtenEmpty}</p>
          ) : (
            <ol className="lc-cards" aria-live="polite">
              {actions.map(a => {
                const d = describeAction(a, S, lang)
                return (
                  <li key={a.key} className="lc-card" data-tone={d.tone}>
                    <div className="lc-card-head">
                      <span className="lc-card-label">{d.label}</span>
                      <time className="lc-card-time" dateTime={new Date(a.ts || Date.now()).toISOString()}>{timeOfDay(a.ts, lang)}</time>
                    </div>
                    {d.main && <p className="lc-card-main">{d.main}</p>}
                    {d.sub && <p className="lc-card-sub">{d.sub}</p>}
                    {d.links?.length > 0 && (
                      <div className="lc-card-links">
                        {d.links.map(l => (
                          <a key={l.href} className="lc-card-link" href={l.href} target="_blank" rel="noopener noreferrer">
                            <Icon name="whatsapp" size="sm" />
                            <span>{l.label}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}
