import { useCallback, useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import VoiceNote from './VoiceNote.jsx'
import { Button, Money } from './ui.jsx'
import { useToast } from './Toast.jsx'
import { api } from '../lib/api.js'
import { mmss, money, whatsappHtml } from '../lib/format.js'
import { useRealtime } from '../lib/realtime.jsx'
import { useStrings, useCommon } from '../lib/i18n.jsx'
// Mic recorder styles (.mic-*) live beside the live-call styles: both are the voice-input surface.
import './LiveCall.css'

// FSI…PDI: a name of unknown script (Latin, Urdu, starting with digits) keeps its own order inside Urdu text.
const iso = n => `\u2068${n}\u2069`

const STRINGS = {
  en: {
    speak: 'Speak an entry',
    recording: 'Recording',
    recordingStarted: 'Recording. Say the entry, then press Send.',
    send: 'Send',
    cancel: 'Cancel',
    unsupported: 'This browser cannot record audio. Send the voice note on WhatsApp instead, or open Hisaab in Chrome.',
    denied: 'Hisaab cannot hear you because the microphone is blocked. Tap the lock icon next to the web address, allow the microphone, then try again.',
    noMic: 'No microphone was found on this device.',
    busyMic: 'Another app is using the microphone. Close it and try again.',
    micFailed: 'The microphone could not start. Please try again.',
    tooShort: 'That was too short. Say the customer’s name and the amount, then press Send.',
    writingTitle: 'Writing it down…',
    stepUploading: 'Sending your recording…',
    stepReceived: 'Hisaab is listening to your voice note…',
    stepThinking: 'Understanding what you said…',
    stepSpeaking: 'Preparing the reply…',
    steps: ['Sending your recording', 'Listening to your voice note', 'Understanding what you said', 'Preparing the reply'],
    stepDone: 'Done',
    canClose: 'You can close this. Hisaab keeps working, and the result shows up on this page and in Messages.',
    doneTitle: 'Written in your khata',
    repliedTitle: 'Hisaab replied',
    errorTitle: 'Nothing was written',
    youSaid: 'You said',
    whatHappened: 'Hisaab wrote',
    reply: 'Reply',
    openKhata: n => `Open ${n}’s khata`,
    speakAgain: 'Speak another',
    failedTitle: 'Not sent',
    sendFailed: 'The recording did not reach Hisaab. Check your internet and try again.',
    tooLarge: 'The recording is too long. Keep it under one minute.',
    sendAgain: 'Send again',
    slowTitle: 'Still working on it',
    slow: 'This is taking longer than usual. The result will appear on the Messages page as soon as it is ready.',
    openMessages: 'Open Messages',
    errors: {
      busy: 'Hisaab is busy right now. Wait a minute and try again.',
      ai_config: 'Hisaab’s voice service is not set up correctly. Please contact Hisaab support.',
      network: 'Hisaab lost its connection while working. Please try again.',
      not_understood: 'Hisaab could not understand that. Speak a little slower and say the customer’s name and the amount.',
      limit: 'You have reached today’s message limit. It resets tomorrow.',
      interrupted: 'Hisaab restarted while working on this, so nothing was written. Please send it again.',
    },
    balance: b => (b > 0 ? `Balance ${money(b)}` : b < 0 ? `${money(b)} advance` : 'Settled'),
    owe: b => (b > 0 ? `You owe ${money(b)}` : b < 0 ? `${money(b)} paid in advance` : 'Nothing owed'),
    inList: l => `List: ${l}`,
    general: 'General',
    r: {
      credit: n => `Udhaar given to ${n}`,
      payment: n => `Payment from ${n}`,
      undo: n => `Cancelled ${n}’s last entry`,
      correct: (n, a, b) => `Changed ${n}’s entry from ${a} to ${b}`,
      set_phone: n => `Saved ${n}’s phone number`,
      balance: n => `${n}’s balance`,
      reminder: n => `Reminder ready for ${n}`,
      dues_list: 'Listed everyone who owes you',
      total_due: 'Total udhaar',
      today_summary: 'Today’s summary',
      full_ledger: 'Full khata',
      help: 'Sent the list of things you can say',
      dashboard_link: 'Sent a dashboard login link to your WhatsApp',
      unclear: 'No entry was found in what you said',
      needs_amount: n => `How much for ${n}? Say the amount too.`,
      needs_name: 'Whose khata? Say the customer’s name too.',
      ambiguous: list => `Which customer: ${list.join(' / ')}? Say the full name.`,
      confirm: list => `Did you mean ${list.join(' / ')}? Say the full name, or say it is a new customer.`,
      not_found: n => `No khata found for “${n}”`,
      already_clear: n => `${n} already owes nothing`,
      nothing_to_undo: 'There was nothing to cancel',
      bad_phone: 'The phone number was not clear. Say it like 0300 1234567.',
      purchase: n => `Goods on credit from ${n}`,
      supplier_payment: n => `Paid ${n}`,
      create_list: l => `Made a new list: ${l}`,
      move_to_list: (n, l) => (l ? `Moved ${n} to ${l}` : `Moved ${n} to another list`),
      lists_summary: 'Listed your lists',
      exists: l => (l ? `A list called “${l}” already exists` : 'That list already exists'),
      has_entries: n => `${n} already has entries, so they cannot move between customer and supplier lists`,
      not_supplier: n => `${n} is a customer, not a supplier. Nothing was written. Say it again as a customer entry, or name the supplier.`,
      list_not_found: (l, list) =>
        list.length ? `${l ? `No list called “${l}”.` : 'That list was not found.'} Did you mean ${list.join(' / ')}?` : l ? `No list called “${l}”. Say “naya list banao ${l}” to make it.` : 'That list was not found. Say the list name too.',
      too_many: 'You already have 20 lists, the most allowed. Nothing new was made.',
      listNeedsName: 'Say the name of the new list too.',
      reminders: (l, n) => (n === 1 ? `Reminder ready for 1 person in ${l}` : `Reminders ready for ${n} people in ${l}`),
      duesIn: l => `Listed who owes you in ${l}`,
      suppliersOwed: 'Listed the suppliers you owe',
      payable: 'What you owe suppliers',
      listTotal: l => `Total udhaar in ${l}`,
    },
  },
  ur: {
    speak: 'بول کر لکھوائیں',
    recording: 'ریکارڈنگ',
    recordingStarted: 'ریکارڈنگ جاری ہے۔ اندراج بولیں، پھر بھیجیں دبائیں۔',
    send: 'بھیجیں',
    cancel: 'منسوخ',
    unsupported: 'یہ براؤزر آواز ریکارڈ نہیں کر سکتا۔ واٹس ایپ پر وائس نوٹ بھیجیں، یا حساب کو کروم میں کھولیں۔',
    denied: 'مائیک بند ہے، اس لیے حساب آپ کی آواز نہیں سن سکتا۔ ویب ایڈریس کے ساتھ تالے کے نشان پر ٹیپ کریں، مائیک کی اجازت دیں اور دوبارہ کوشش کریں۔',
    noMic: 'اس ڈیوائس پر کوئی مائیک نہیں ملا۔',
    busyMic: 'کوئی اور ایپ مائیک استعمال کر رہی ہے۔ اسے بند کر کے دوبارہ کوشش کریں۔',
    micFailed: 'مائیک شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
    tooShort: 'ریکارڈنگ بہت مختصر تھی۔ گاہک کا نام اور رقم بولیں، پھر بھیجیں دبائیں۔',
    writingTitle: 'لکھا جا رہا ہے…',
    stepUploading: 'آپ کی ریکارڈنگ بھیجی جا رہی ہے…',
    stepReceived: 'حساب آپ کا وائس نوٹ سن رہا ہے…',
    stepThinking: 'آپ کی بات سمجھی جا رہی ہے…',
    stepSpeaking: 'جواب تیار ہو رہا ہے…',
    steps: ['ریکارڈنگ بھیجی جا رہی ہے', 'حساب وائس نوٹ سن رہا ہے', 'آپ کی بات سمجھی جا رہی ہے', 'جواب تیار ہو رہا ہے'],
    stepDone: 'مکمل',
    canClose: 'آپ اسے بند کر سکتے ہیں۔ حساب کام جاری رکھے گا، اور نتیجہ اسی صفحے اور پیغامات میں نظر آئے گا۔',
    doneTitle: 'آپ کے کھاتے میں لکھ دیا',
    repliedTitle: 'حساب کا جواب',
    errorTitle: 'کچھ نہیں لکھا گیا',
    youSaid: 'آپ نے کہا',
    whatHappened: 'حساب نے لکھا',
    reply: 'جواب',
    openKhata: n => `${iso(n)} کا کھاتہ کھولیں`,
    speakAgain: 'ایک اور بولیں',
    failedTitle: 'نہیں بھیجا جا سکا',
    sendFailed: 'ریکارڈنگ حساب تک نہیں پہنچی۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    tooLarge: 'ریکارڈنگ بہت لمبی ہے۔ ایک منٹ سے کم رکھیں۔',
    sendAgain: 'دوبارہ بھیجیں',
    slowTitle: 'ابھی کام جاری ہے',
    slow: 'معمول سے زیادہ وقت لگ رہا ہے۔ نتیجہ تیار ہوتے ہی پیغامات والے صفحے پر نظر آئے گا۔',
    openMessages: 'پیغامات کھولیں',
    errors: {
      busy: 'حساب ابھی مصروف ہے۔ ایک منٹ رک کر دوبارہ کوشش کریں۔',
      ai_config: 'حساب کی وائس سروس درست طریقے سے سیٹ نہیں۔ حساب سپورٹ سے رابطہ کریں۔',
      network: 'کام کے دوران رابطہ ٹوٹ گیا۔ دوبارہ کوشش کریں۔',
      not_understood: 'حساب بات نہیں سمجھ سکا۔ تھوڑا آہستہ بولیں اور گاہک کا نام اور رقم بتائیں۔',
      limit: 'آج کے پیغامات کی حد پوری ہو گئی۔ کل سے دوبارہ بھیج سکیں گے۔',
      interrupted: 'کام کے دوران حساب دوبارہ شروع ہوا، اس لیے کچھ نہیں لکھا گیا۔ براہ کرم دوبارہ بھیجیں۔',
    },
    balance: b => (b > 0 ? `بقایا ${money(b)}` : b < 0 ? `${money(b)} ایڈوانس` : 'حساب صاف'),
    owe: b => (b > 0 ? `آپ کے ذمے ${money(b)}` : b < 0 ? `${money(b)} پیشگی دیے` : 'کچھ واجب نہیں'),
    inList: l => `لسٹ: ${iso(l)}`,
    general: 'عام کھاتہ',
    r: {
      credit: n => `${iso(n)} کو ادھار دیا`,
      payment: n => `${iso(n)} سے وصولی`,
      undo: n => `${iso(n)} کا آخری اندراج منسوخ کیا`,
      correct: (n, a, b) => `${iso(n)} کا اندراج ${a} سے بدل کر ${b} کیا`,
      set_phone: n => `${iso(n)} کا فون نمبر محفوظ کیا`,
      balance: n => `${iso(n)} کا بقایا`,
      reminder: n => `${iso(n)} کے لیے یاد دہانی تیار`,
      dues_list: 'جن کے ذمے ادھار ہے، ان کی فہرست بھیجی',
      total_due: 'کل ادھار',
      today_summary: 'آج کا خلاصہ',
      full_ledger: 'پورا کھاتہ',
      help: 'بولنے کے طریقوں کی فہرست بھیجی',
      dashboard_link: 'ڈیش بورڈ کا لاگ ان لنک آپ کے واٹس ایپ پر بھیجا',
      unclear: 'آپ کی بات میں کوئی اندراج نہیں ملا',
      needs_amount: n => `${iso(n)} کے کتنے روپے؟ رقم بھی بولیں۔`,
      needs_name: 'کس کا کھاتہ؟ گاہک کا نام بھی بولیں۔',
      ambiguous: list => `کون سا گاہک: ${list.map(iso).join(' / ')}؟ پورا نام بولیں۔`,
      confirm: list => `کیا آپ کا مطلب ${list.map(iso).join(' / ')} ہے؟ پورا نام بولیں، یا بتائیں کہ نیا گاہک ہے۔`,
      // No curly quotes in Urdu (Nastaliq draws them mirrored); FSI…PDI isolates a Latin or Urdu name.
      not_found: n => `${iso(n)} کا کوئی کھاتہ نہیں ملا`,
      already_clear: n => `${iso(n)} کا حساب پہلے سے صاف ہے`,
      nothing_to_undo: 'منسوخ کرنے کو کوئی اندراج نہیں تھا',
      bad_phone: 'نمبر صاف سمجھ نہیں آیا۔ ایسے بولیں: 0300 1234567',
      purchase: n => `${iso(n)} سے ادھار پر مال لیا`,
      supplier_payment: n => `${iso(n)} کو ادائیگی کی`,
      create_list: l => `نئی لسٹ بنائی: ${iso(l)}`,
      move_to_list: (n, l) => (l ? `${iso(n)} کو ${iso(l)} میں ڈال دیا` : `${iso(n)} کو دوسری لسٹ میں ڈال دیا`),
      lists_summary: 'آپ کی لسٹیں بھیجیں',
      exists: l => (l ? `${iso(l)} نام کی لسٹ پہلے سے موجود ہے` : 'یہ لسٹ پہلے سے موجود ہے'),
      has_entries: n => `${iso(n)} کے اندراجات موجود ہیں، اس لیے انہیں گاہکوں اور سپلائرز کی لسٹ کے درمیان منتقل نہیں کیا جا سکتا`,
      not_supplier: n => `${iso(n)} گاہک ہیں، سپلائر نہیں۔ کچھ نہیں لکھا گیا۔ گاہک کے اندراج کے طور پر دوبارہ بولیں، یا سپلائر کا نام بتائیں۔`,
      list_not_found: (l, list) =>
        list.length
          ? `${l ? `${iso(l)} نام کی کوئی لسٹ نہیں۔` : 'یہ لسٹ نہیں ملی۔'} کیا آپ کا مطلب ${list.map(iso).join(' / ')} ہے؟`
          : l
            ? `${iso(l)} نام کی کوئی لسٹ نہیں۔ بنانے کے لیے بولیں: نئی لسٹ بناؤ ${iso(l)}`
            : 'یہ لسٹ نہیں ملی۔ لسٹ کا نام بھی بولیں۔',
      too_many: 'آپ کی پہلے ہی 20 لسٹیں ہیں، اس سے زیادہ نہیں بن سکتیں۔ کوئی نئی لسٹ نہیں بنی۔',
      listNeedsName: 'نئی لسٹ کا نام بھی بولیں۔',
      reminders: (l, n) => `${iso(l)} میں ${n} لوگوں کے لیے یاد دہانی تیار`,
      duesIn: l => `${iso(l)} میں جن کے ذمے ادھار ہے، ان کی فہرست بھیجی`,
      suppliersOwed: 'جن سپلائرز کو آپ نے دینا ہے، ان کی فہرست بھیجی',
      payable: 'سپلائرز کو کتنا دینا ہے',
      listTotal: l => `${iso(l)} کا کل ادھار`,
    },
  },
}

const MAX_SECONDS = 60
const MIN_SECONDS = 1
// The server stamps createdAt; allow for a small difference between its clock and this browser's.
const CLOCK_SKEW_MS = 10_000
const POLL_MS = 5_000
const GIVE_UP_MS = 90_000
const WROTE = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'undo', 'correct', 'create_list', 'move_to_list'])

// Message ids whose result was already shown, so a later recording never picks up an older message.
const shown = new Set()

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || ''
}

function micError(err, S) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return S.denied
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return S.noMic
  if (name === 'NotReadableError' || name === 'TrackStartError') return S.busyMic
  return S.micFailed
}

const isMine = (m, w) =>
  Boolean(m) && m.channel === 'web' && m.kind === 'voice' && (w.id ? m.id === w.id : !shown.has(m.id) && m.createdAt >= w.sentAt - CLOCK_SKEW_MS)

/** One result from Message.results in plain words. Rows that need the shopkeeper (tone 'ask') carry an icon. */
function describe(r, S) {
  const name = r.customerName || '?'
  const supplier = r.listKind === 'suppliers' || r.type === 'purchase' || r.type === 'supplier_payment'
  const money0 = r.balance != null ? (supplier ? S.owe(r.balance) : S.balance(r.balance)) : null
  // The list a person is in, when it is a named list (General is the default and goes unsaid).
  const bal = [money0, r.listName && !['create_list', 'move_to_list'].includes(r.type) ? S.inList(r.listName) : null].filter(Boolean).join(' · ') || null
  const ask = (text, icon = 'help') => ({ icon, tone: 'ask', text })
  switch (r.status) {
    case 'exists':
      return ask(S.r.exists(r.listName), 'info')
    case 'has_entries':
      return ask(S.r.has_entries(name), 'info')
    case 'not_supplier':
      return ask(S.r.not_supplier(name))
    // The spoken list name arrives as customerName when no person was involved; with a person it is not known.
    case 'list_not_found':
      return ask(S.r.list_not_found(r.customerId ? null : r.customerName, r.candidates || []))
    case 'too_many':
      return ask(S.r.too_many, 'info')
    case 'needs_amount':
      return ask(S.r.needs_amount(name))
    case 'needs_name':
      return ask(r.type === 'create_list' ? S.r.listNeedsName : S.r.needs_name)
    case 'ambiguous':
      return ask(S.r.ambiguous(r.candidates || []))
    case 'confirm':
      return ask(S.r.confirm(r.candidates || []))
    case 'not_found':
      return ask(S.r.not_found(name), 'info')
    case 'already_clear':
      return ask(S.r.already_clear(name), 'info')
    case 'nothing_to_undo':
      return ask(S.r.nothing_to_undo, 'info')
    case 'bad_phone':
      return ask(S.r.bad_phone, 'alert')
    default:
      break
  }
  // A customer-style entry on a supplier is applied as a supplier entry by the ledger (same maths, other words).
  const type = supplier && r.type === 'credit' ? 'purchase' : supplier && r.type === 'payment' ? 'supplier_payment' : r.type
  switch (type) {
    case 'credit':
      return { tone: 'owed', text: S.r.credit(name), meta: bal, amount: r.amount, sign: 'credit' }
    case 'payment':
      return { tone: 'paid', text: S.r.payment(name), meta: bal, amount: r.amount, sign: 'payment' }
    // Supplier money is never udhaar owed to the shop or money received, so it stays neutral.
    case 'purchase':
      return { tone: 'neutral', text: S.r.purchase(name), meta: bal, amount: r.amount }
    case 'supplier_payment':
      return { tone: 'neutral', text: S.r.supplier_payment(name), meta: bal, amount: r.amount }
    case 'create_list':
      return { tone: 'neutral', text: S.r.create_list(r.listName || '?') }
    case 'move_to_list':
      return { tone: 'neutral', text: S.r.move_to_list(name, r.listName || S.general), meta: money0 }
    case 'lists_summary':
      return { tone: 'neutral', text: S.r.lists_summary }
    case 'undo':
      return { tone: 'neutral', text: S.r.undo(name), meta: bal, amount: r.amount, struck: true }
    case 'correct':
      return { tone: 'neutral', text: S.r.correct(name, money(r.oldAmount), money(r.amount)), meta: bal }
    case 'set_phone':
      return { tone: 'neutral', text: S.r.set_phone(name) }
    case 'balance':
      return { tone: 'neutral', text: S.r.balance(name), meta: bal }
    case 'reminder':
      // No person: reminders for everyone owing in one list.
      if (!r.customerId) return { tone: 'neutral', text: S.r.reminders(r.listName || S.general, r.count ?? 0) }
      return { tone: 'neutral', text: S.r.reminder(name), meta: bal }
    case 'dues_list':
      if (r.listKind === 'suppliers') return { tone: 'neutral', text: S.r.suppliersOwed }
      if (r.listName) return { tone: 'neutral', text: S.r.duesIn(r.listName) }
      return { tone: 'neutral', text: S.r.dues_list }
    case 'total_due':
      if (r.listKind === 'suppliers') return { tone: 'neutral', text: S.r.payable, amount: r.total ?? null }
      if (r.listName) return { tone: 'neutral', text: S.r.listTotal(r.listName), amount: r.total ?? null }
      return { tone: 'neutral', text: S.r.total_due }
    case 'today_summary':
    case 'full_ledger':
    case 'help':
    case 'dashboard_link':
      return { tone: 'neutral', text: S.r[r.type] }
    case 'unclear':
      return ask(S.r.unclear)
    default:
      return null
  }
}

/**
 * "Speak an entry": records a voice note in the browser and sends it to Hisaab, which handles it exactly like a
 * WhatsApp voice note. Shows the transcript, what was written and Hisaab's reply in a sheet.
 * `onActiveChange(active)` reports whether it is recording or showing its sheet, so a parent can keep it mounted.
 */
export default function MicRecorder({ label, variant = 'primary', size, onResult, onActiveChange }) {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const toast = useToast()
  const [phase, setPhase] = useState('idle') // idle | starting | recording
  const [elapsed, setElapsed] = useState(0)
  // null | { step: 'uploading' | 'waiting' | 'result' | 'failed' | 'slow', message?, error? }
  const [sheet, setSheet] = useState(null)
  const rec = useRef({ stream: null, recorder: null, ctx: null, raf: 0, timer: 0, startedAt: 0, chunks: [], mime: '', token: null, stopping: false })
  const wait = useRef(null) // { sentAt, id }
  const lastBlob = useRef(null)
  const mounted = useRef(false)
  const levelRef = useRef(null)
  const recRoot = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const onActiveRef = useRef(onActiveChange)
  onActiveRef.current = onActiveChange

  const active = phase !== 'idle' || Boolean(sheet)
  useEffect(() => {
    onActiveRef.current?.(active)
  }, [active])
  useEffect(() => () => onActiveRef.current?.(false), [])

  const release = useCallback(() => {
    const r = rec.current
    r.token = null
    cancelAnimationFrame(r.raf)
    clearInterval(r.timer)
    if (r.recorder && r.recorder.state !== 'inactive') {
      r.recorder.ondataavailable = null
      r.recorder.onstop = null
      try {
        r.recorder.stop()
      } catch {}
    }
    r.stream?.getTracks().forEach(t => t.stop())
    r.ctx?.close().catch(() => {})
    Object.assign(r, { stream: null, recorder: null, ctx: null, raf: 0, timer: 0, chunks: [], stopping: false })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      wait.current = null
      release()
    }
  }, [release])

  // Keyboard users land on Send as soon as recording starts.
  useEffect(() => {
    if (phase === 'recording') recRoot.current?.querySelector('[data-send]')?.focus()
  }, [phase])

  const accept = useCallback(m => {
    const w = wait.current
    if (!w || !isMine(m, w)) return
    w.id = m.id
    if (m.status === 'done' || m.status === 'error') {
      wait.current = null
      shown.add(m.id)
      setSheet({ step: 'result', message: m })
      onResultRef.current?.(m)
    } else {
      setSheet(s => (s ? { ...s, step: 'waiting', message: m } : s))
    }
  }, [])

  const poll = useCallback(async () => {
    const w = wait.current
    if (!w) return
    try {
      const list = await api('/api/messages?limit=8')
      const mine = (list || []).filter(m => isMine(m, w)).sort((a, b) => a.createdAt - b.createdAt)[0]
      if (mine) accept(mine)
    } catch {}
  }, [accept])

  useRealtime(['message'], event => {
    if (event.type === 'resync') poll()
    else accept(event.data)
  })

  // Safety nets while waiting: poll in case a realtime event was missed, and stop waiting after a while.
  const waiting = sheet && (sheet.step === 'uploading' || sheet.step === 'waiting')
  useEffect(() => {
    if (!waiting) return
    const every = setInterval(poll, POLL_MS)
    const giveUp = setTimeout(() => {
      if (!wait.current) return
      wait.current = null
      setSheet({ step: 'slow' })
    }, GIVE_UP_MS)
    return () => {
      clearInterval(every)
      clearTimeout(giveUp)
    }
  }, [waiting, poll])

  async function upload(blob) {
    lastBlob.current = blob
    const mine = { sentAt: Date.now(), id: null }
    wait.current = mine
    setSheet({ step: 'uploading' })
    try {
      await api('/api/messages/voice', { method: 'POST', body: blob })
    } catch (err) {
      if (!mounted.current) return
      const text = err?.status === 413 ? S.tooLarge : S.sendFailed
      // Still watching this upload: show the failure with "Send again". Sheet already closed: just say so.
      if (wait.current === mine) {
        wait.current = null
        setSheet({ step: 'failed', error: text })
      } else toast.error(text)
      return
    }
    if (mounted.current) setSheet(s => (s?.step === 'uploading' ? { ...s, step: 'waiting' } : s))
  }

  function finish(send) {
    const r = rec.current
    const recorder = r.recorder
    if (!recorder || r.stopping) return
    r.stopping = true
    clearInterval(r.timer)
    if (!send) {
      release()
      setPhase('idle')
      return
    }
    const seconds = (Date.now() - r.startedAt) / 1000
    const chunks = r.chunks
    const type = r.mime
    recorder.onstop = () => {
      release()
      setPhase('idle')
      const blob = new Blob(chunks, { type })
      if (seconds < MIN_SECONDS || !blob.size) {
        toast.error(S.tooShort)
        return
      }
      if (mounted.current) upload(blob)
    }
    try {
      recorder.stop()
    } catch {
      recorder.onstop()
    }
  }

  async function start() {
    if (phase !== 'idle' || rec.current.recorder) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error(S.unsupported)
      return
    }
    const token = {}
    rec.current.token = token
    setPhase('starting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    } catch (err) {
      if (rec.current.token === token && mounted.current) {
        rec.current.token = null
        setPhase('idle')
        toast.error(micError(err, S))
      }
      return
    }
    // Cancelled or unmounted while the browser was asking for the mic.
    if (rec.current.token !== token || !mounted.current) {
      stream.getTracks().forEach(t => t.stop())
      return
    }
    const mime = pickMime()
    let recorder
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch {
      stream.getTracks().forEach(t => t.stop())
      rec.current.token = null
      setPhase('idle')
      toast.error(S.unsupported)
      return
    }
    const r = rec.current
    Object.assign(r, { stream, recorder, mime: recorder.mimeType || mime || 'audio/webm', chunks: [], stopping: false, startedAt: Date.now() })
    recorder.ondataavailable = e => {
      if (e.data?.size) r.chunks.push(e.data)
    }
    recorder.start(250)
    setElapsed(0)
    r.timer = setInterval(() => {
      const s = (Date.now() - r.startedAt) / 1000
      setElapsed(s)
      if (s >= MAX_SECONDS) finish(true)
    }, 200)

    // Live level bar. Purely visual: if it fails, recording still works.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      r.ctx = new Ctx()
      // The permission prompt can outlast the click's user activation, leaving the context suspended.
      r.ctx.resume?.().catch(() => {})
      const analyser = r.ctx.createAnalyser()
      analyser.fftSize = 512
      r.ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      const loop = () => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 3.2)
        if (levelRef.current) levelRef.current.style.transform = `scaleX(${Math.max(0.03, lvl).toFixed(3)})`
        r.raf = requestAnimationFrame(loop)
      }
      loop()
    } catch {}
    setPhase('recording')
  }

  const closeSheet = useCallback(() => {
    // A message already seen must never be picked up by the next recording's 10-second matching window.
    if (wait.current?.id) shown.add(wait.current.id)
    wait.current = null
    setSheet(null)
  }, [])

  function speakAgain() {
    closeSheet()
    start()
  }

  function resend() {
    if (lastBlob.current) upload(lastBlob.current)
  }

  // ---------- result sheet ----------
  const m = sheet?.message
  let title = S.writingTitle
  let body = null
  let footer = <Button variant="ghost" onClick={closeSheet}>{C.close}</Button>

  if (sheet?.step === 'uploading' || sheet?.step === 'waiting') {
    const now = sheet.step === 'uploading' ? 0 : m?.status === 'thinking' ? 2 : m?.status === 'speaking' ? 3 : 1
    body = (
      <div className="mic-wait">
        <ol className="mic-steps">
          {S.steps.map((label, i) => (
            <li key={label} className="mic-step" data-state={i < now ? 'done' : i === now ? 'now' : 'next'} aria-current={i === now ? 'step' : undefined}>
              <span className="mic-step-n" aria-hidden="true">{i + 1}</span>
              <span className="mic-step-text">{label}</span>
              {i < now && <Icon name="check" size="sm" label={S.stepDone} />}
              {i === now && <span className="mic-spin" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">{[S.stepUploading, S.stepReceived, S.stepThinking, S.stepSpeaking][now]}</p>
        <p className="mic-wait-note">{S.canClose}</p>
      </div>
    )
  } else if (sheet?.step === 'failed') {
    title = S.failedTitle
    body = (
      <div className="banner warn" role="alert">
        <Icon name="alert" />
        <span className="banner-text">{sheet.error}</span>
      </div>
    )
    footer = (
      <>
        <Button variant="ghost" onClick={closeSheet}>{C.close}</Button>
        <Button variant="primary" icon="refresh" onClick={resend}>{S.sendAgain}</Button>
      </>
    )
  } else if (sheet?.step === 'slow') {
    title = S.slowTitle
    body = <p className="mic-text">{S.slow}</p>
    footer = (
      <>
        <Button variant="ghost" onClick={closeSheet}>{C.close}</Button>
        {/* Close too: on the Messages page itself the link goes nowhere new. */}
        <Button variant="primary" to="/app/activity" onClick={closeSheet}>{S.openMessages}</Button>
      </>
    )
  } else if (sheet?.step === 'result' && m) {
    const results = m.results || []
    const lines = results.map(r => describe(r, S)).filter(Boolean)
    const wrote = results.some(r => WROTE.has(r.type) && r.status === 'ok')
    const target = results.find(r => r.customerId && r.status === 'ok')
    const heard = Boolean(m.audioUrl || m.transcript || m.transcriptRoman)
    const replied = Boolean(m.replyText || m.replyAudioUrl)
    title = m.status === 'error' ? S.errorTitle : wrote ? S.doneTitle : S.repliedTitle
    body = (
      <>
        {m.status === 'error' && (
          <div className="banner warn" role="alert">
            <Icon name="alert" />
            <span className="banner-text">{S.errors[m.error] || S.errors.not_understood}</span>
          </div>
        )}
        {(heard || lines.length > 0 || replied) && (
          <div className="mic-cells">
            {heard && (
              <section className="mic-cell">
                <h3 className="mic-label">{S.youSaid}</h3>
                {m.audioUrl && <VoiceNote src={m.audioUrl} seconds={m.seconds} />}
                {m.transcript && <p className="ur mic-transcript" lang="ur">{m.transcript}</p>}
                {m.transcriptRoman && <p className="latin mic-roman" dir="ltr">“{m.transcriptRoman}”</p>}
              </section>
            )}
            {lines.length > 0 && (
              <section className="mic-cell">
                <h3 className="mic-label">{S.whatHappened}</h3>
                <ul>
                  {lines.map((l, i) => (
                    <li key={i} className="mic-result" data-tone={l.tone}>
                      <div className="mic-result-main">
                        <p className="mic-result-text">
                          {l.icon && <Icon name={l.icon} size="sm" />}
                          <span>{l.text}</span>
                        </p>
                        {l.meta && <p className="mic-result-meta">{l.meta}</p>}
                      </div>
                      {l.amount != null && (
                        <Money value={l.amount} tone={l.tone === 'owed' || l.tone === 'paid' ? l.tone : 'neutral'} sign={l.sign} className={l.struck ? 'mic-struck' : ''} />
                      )}
                    </li>
                  ))}
                </ul>
                {target && (
                  <Button size="sm" to={`/app/customers/${target.customerId}`} iconEnd="arrow-right" className="mic-open">
                    {S.openKhata(target.customerName)}
                  </Button>
                )}
              </section>
            )}
            {replied && (
              <section className="mic-cell mic-cell-reply">
                <h3 className="mic-label">{S.reply}</h3>
                {m.replyAudioUrl && <VoiceNote src={m.replyAudioUrl} seconds={m.replySeconds} reply autoPlay />}
                {m.replyText && <div className="wa-text latin" dir="ltr" dangerouslySetInnerHTML={{ __html: whatsappHtml(m.replyText) }} />}
              </section>
            )}
          </div>
        )}
      </>
    )
    footer = (
      <>
        <Button variant="ghost" onClick={closeSheet}>{C.close}</Button>
        <Button variant="primary" icon="mic" onClick={speakAgain}>{S.speakAgain}</Button>
      </>
    )
  }

  return (
    <div className="mic" ref={recRoot}>
      {phase === 'recording' ? (
        <div className="mic-rec" role="group" aria-label={S.recording}>
          <div className="mic-rec-info">
            <span className="mic-dot" aria-hidden="true" />
            <span className="mic-rec-label">{S.recording}</span>
            <span className="mic-time num" aria-hidden="true">
              {mmss(Math.floor(elapsed))}
              <span className="mic-time-max"> / {mmss(MAX_SECONDS)}</span>
            </span>
            <span className="mic-level" aria-hidden="true">
              <span ref={levelRef} />
            </span>
          </div>
          <div className="mic-rec-actions">
            <Button variant="ghost" size="sm" onClick={() => finish(false)}>{S.cancel}</Button>
            <Button variant="primary" size="sm" icon="send" data-send onClick={() => finish(true)}>{S.send}</Button>
          </div>
          <span className="sr-only" role="status">{S.recordingStarted}</span>
        </div>
      ) : (
        <Button variant={variant} size={size} icon="mic" loading={phase === 'starting'} onClick={start}>
          {label || S.speak}
        </Button>
      )}

      <Sheet open={Boolean(sheet)} onClose={closeSheet} title={title} footer={footer}>
        {body}
      </Sheet>
    </div>
  )
}
