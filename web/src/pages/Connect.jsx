import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { FootnoteRef, Footnotes, TabPanel, Tabs } from '../components/editorial.jsx'
import { Button, Field, Segmented, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useStrings } from '../lib/i18n.jsx'
import './Connect.css'

const STRINGS = {
  en: {
    eyebrow: 'Step 1 of 2 · Link WhatsApp',
    eyebrowReconnect: 'Your khata · Link WhatsApp again',
    title: 'Connect your WhatsApp',
    titleReconnect: 'Reconnect your WhatsApp',
    lead: 'Hisaab links to your WhatsApp the way WhatsApp Web does. It reads one chat only: your “Message yourself” chat.',
    leadReconnect: (phone, shop) =>
      phone ? (
        <>Link the WhatsApp on <b className="num" dir="ltr">{phone}</b>, the number {shop || 'your shop'} signed up with. Your khata is safe; nothing has been lost.</>
      ) : (
        <>Link the same WhatsApp number you signed up with. Your khata is safe; nothing has been lost.</>
      ),
    signedInAs: who => <>You are already logged in as {who}.</>,
    openKhata: 'Open my khata',
    phoneNote: () => (
      <>On the phone you want to link? Choose <b>Use phone number</b>. WhatsApp lets you type a code instead of scanning.</>
    ),
    methodLabel: 'How to link',
    methodQr: 'Scan QR code',
    methodCode: 'Use phone number',

    howTitle: 'Scan from WhatsApp',
    phoneType: 'Your phone',
    android: 'Android',
    iphone: 'iPhone',
    steps: {
      android: [
        'Open WhatsApp on the phone that has your shop’s number.',
        m => <>Tap {m('⋮')} at the top right, then {m('Linked devices')}.</>,
        m => <>Tap {m('Link a device')}. Unlock with your fingerprint or PIN if it asks.</>,
        'Point the camera at the QR code on this screen.',
      ],
      iphone: [
        'Open WhatsApp on the iPhone that has your shop’s number.',
        m => <>Tap {m('Settings')} at the bottom right, then {m('Linked devices')}.</>,
        m => <>Tap {m('Link a Device')}. Unlock with Face ID or your passcode if it asks.</>,
        'Point the camera at the QR code on this screen.',
      ],
    },
    qrPlaceholder: 'Your QR code will appear here',
    preparing: 'Preparing your QR…',
    preparingHint: 'This takes a few seconds.',
    keepOpen: 'Keep this page open. The code refreshes by itself.',
    qrAlt: 'QR code that links your WhatsApp to Hisaab. Scan it from WhatsApp, Linked devices.',
    troubleTitle: 'QR not scanning?',
    trouble: [
      'Turn up this screen’s brightness and hold your phone about a foot away.',
      'No “Linked devices” option? Update WhatsApp from the Play Store or App Store.',
      'The code changes every few seconds. That is normal, just keep the camera on it.',
    ],
    showQr: 'Show QR code',
    newQr: 'Show a new QR',
    expiredTitle: 'This QR expired',
    expiredBody: 'For your safety, each code works for a few minutes only.',

    codeIdleTitle: 'Link with your phone number',
    phoneLabel: 'Your shop’s WhatsApp number',
    phoneHint: 'We will show an 8-character code to type into WhatsApp on that phone.',
    badPhone: 'Enter a number like 0300 1234567',
    getCode: 'Get my code',
    preparingCode: 'Asking WhatsApp for your code…',
    codeTitle: 'Type this code in WhatsApp',
    codeLabel: 'Your linking code',
    codeFor: phone => <>For the WhatsApp on {phone}</>,
    codeSteps: [
      m => <>On the phone with this number, open WhatsApp → {m('Linked devices')} → {m('Link a device')}.</>,
      m => <>Below the camera, tap {m('Link with phone number instead')}.</>,
      'Type the code shown here. WhatsApp will ask you to confirm.',
    ],
    copyCode: 'Copy code',
    codeCopied: 'Copied',
    copyFailed: 'Copy did not work. Type the code shown above into WhatsApp.',
    changeNumber: 'Use a different number',
    codeKeepOpen: 'Keep this page open. It moves on by itself once WhatsApp confirms.',
    codePlaceholder: 'Your 8-character code will appear here',
    expiredCodeTitle: 'This code expired',
    newCode: 'Get a new code',

    consent: 'I understand Hisaab links like WhatsApp Web and will read only my “Message yourself” chat.',
    errorTitle: 'WhatsApp did not finish linking',
    errorBody: 'This sometimes happens on a weak connection. Try again with a new code.',
    tryAgain: 'Try again',
    mismatchTitle: 'Different WhatsApp number',
    mismatch: phone => (
      <>You linked <b className="num" dir="ltr">{phone}</b>, but this account belongs to a different number. Link the WhatsApp number you signed up with.</>
    ),
    limited: 'Too many linking tries. Wait 10 minutes, then try again.',
    failed: 'Could not reach Hisaab. Check your internet and try again.',
    slow: 'Your internet is slow. Still trying…',

    linkedLabel: 'Linked',
    linked: 'Connected. Opening your khata…',
    linkedNew: 'Connected. Setting up your shop…',
    linkedBody: 'Check your WhatsApp: Hisaab just sent a message in your “Message yourself” chat.',

    trustTitle: 'Your WhatsApp stays yours',
    trust: [
      { t: 'One chat only.', d: 'Hisaab reads your “Message yourself” chat and nothing else. Chats with customers, family and groups are never opened or stored.' },
      { t: 'Unlink any time.', d: 'From Settings in Hisaab, or in WhatsApp under Linked devices.' },
      { t: 'Free during the pilot.', d: 'No card, no fee.' },
    ],
    fnLead: 'Linked devices.',
    fnText: () => (
      <>Hisaab uses WhatsApp’s own linked-devices feature, the one WhatsApp Web uses, not Meta’s business API. What we keep, and how to delete it, is in the <Link to="/privacy">privacy policy</Link>.</>
    ),
    haveAccount: 'Already linked on another computer?',
    loginCode: 'Log in with a code',
    backToKhata: 'Back to my khata',
  },
  ur: {
    eyebrow: 'مرحلہ 1 از 2 · واٹس ایپ جوڑیں',
    eyebrowReconnect: 'آپ کا کھاتہ · واٹس ایپ دوبارہ جوڑیں',
    title: 'اپنا واٹس ایپ جوڑیں',
    titleReconnect: 'واٹس ایپ دوبارہ جوڑیں',
    lead: 'حساب آپ کے واٹس ایپ سے بالکل ویسے جڑتا ہے جیسے واٹس ایپ ویب۔ یہ صرف ایک چیٹ پڑھتا ہے: آپ کی "Message yourself" والی چیٹ۔',
    leadReconnect: (phone, shop) =>
      phone ? (
        <>وہ واٹس ایپ جوڑیں جو <b className="num" dir="ltr">{phone}</b> پر چلتا ہے، یعنی وہ نمبر جس سے {shop || 'آپ کی دکان'} کا اکاؤنٹ بنا تھا۔ آپ کا کھاتہ محفوظ ہے، کچھ ضائع نہیں ہوا۔</>
      ) : (
        <>وہی واٹس ایپ نمبر جوڑیں جس سے آپ نے اکاؤنٹ بنایا تھا۔ آپ کا کھاتہ محفوظ ہے، کچھ ضائع نہیں ہوا۔</>
      ),
    signedInAs: who => <>آپ پہلے سے {who} کے نام سے لاگ اِن ہیں۔</>,
    openKhata: 'میرا کھاتہ کھولیں',
    phoneNote: () => (
      <>کیا آپ اسی فون پر ہیں جسے جوڑنا ہے؟ <b>فون نمبر سے جوڑیں</b> چنیں۔ واٹس ایپ میں اسکین کے بجائے ایک کوڈ لکھا جا سکتا ہے۔</>
    ),
    methodLabel: 'جوڑنے کا طریقہ',
    methodQr: 'QR کوڈ اسکین کریں',
    methodCode: 'فون نمبر سے جوڑیں',

    howTitle: 'واٹس ایپ سے اسکین کریں',
    phoneType: 'آپ کا فون',
    android: 'Android',
    iphone: 'iPhone',
    steps: {
      android: [
        'دکان والے نمبر کے فون پر واٹس ایپ کھولیں۔',
        m => <>اوپر دائیں کونے میں {m('⋮')} پر ٹیپ کریں، پھر {m('Linked devices')} پر۔</>,
        m => <>{m('Link a device')} پر ٹیپ کریں۔ اگر پوچھے تو فنگر پرنٹ یا پِن سے کھولیں۔</>,
        'فون کا کیمرہ اس اسکرین پر موجود QR کوڈ کی طرف کریں۔',
      ],
      iphone: [
        'دکان والے نمبر کے آئی فون پر واٹس ایپ کھولیں۔',
        m => <>نیچے دائیں کونے میں {m('Settings')} پر ٹیپ کریں، پھر {m('Linked devices')} پر۔</>,
        m => <>{m('Link a Device')} پر ٹیپ کریں۔ اگر پوچھے تو Face ID یا پاس کوڈ سے کھولیں۔</>,
        'فون کا کیمرہ اس اسکرین پر موجود QR کوڈ کی طرف کریں۔',
      ],
    },
    qrPlaceholder: 'آپ کا QR کوڈ یہاں نظر آئے گا',
    preparing: 'آپ کا QR تیار ہو رہا ہے…',
    preparingHint: 'اس میں چند سیکنڈ لگتے ہیں۔',
    keepOpen: 'یہ صفحہ کھلا رکھیں۔ کوڈ خود بخود بدلتا رہے گا۔',
    qrAlt: 'واٹس ایپ کو حساب سے جوڑنے کا QR کوڈ۔ واٹس ایپ میں Linked devices سے اسکین کریں۔',
    troubleTitle: 'QR اسکین نہیں ہو رہا؟',
    trouble: [
      'اس اسکرین کی روشنی بڑھائیں اور فون کو تقریباً ایک فٹ دور رکھیں۔',
      'اگر Linked devices نظر نہ آئے تو Play Store یا App Store سے واٹس ایپ اپ ڈیٹ کریں۔',
      'کوڈ ہر چند سیکنڈ بعد بدلتا ہے، یہ معمول کی بات ہے۔ بس کیمرہ اس پر رکھیں۔',
    ],
    showQr: 'QR کوڈ دکھائیں',
    newQr: 'نیا QR دکھائیں',
    expiredTitle: 'اس QR کا وقت ختم ہو گیا',
    expiredBody: 'آپ کی حفاظت کے لیے ہر کوڈ صرف چند منٹ چلتا ہے۔',

    codeIdleTitle: 'اپنے فون نمبر سے جوڑیں',
    phoneLabel: 'دکان کا واٹس ایپ نمبر',
    phoneHint: 'ہم 8 حروف کا ایک کوڈ دکھائیں گے جو اسی فون کے واٹس ایپ میں لکھنا ہے۔',
    badPhone: 'نمبر ایسے لکھیں: 0300 1234567',
    getCode: 'میرا کوڈ دکھائیں',
    preparingCode: 'واٹس ایپ سے آپ کا کوڈ منگوایا جا رہا ہے…',
    codeTitle: 'یہ کوڈ واٹس ایپ میں لکھیں',
    codeLabel: 'آپ کا جوڑنے کا کوڈ',
    codeFor: phone => <>{phone} والے واٹس ایپ کے لیے</>,
    codeSteps: [
      m => <>اسی نمبر والے فون پر واٹس ایپ کھولیں ← {m('Linked devices')} ← {m('Link a device')}۔</>,
      m => <>کیمرے کے نیچے {m('Link with phone number instead')} پر ٹیپ کریں۔</>,
      'یہاں دکھایا گیا کوڈ لکھیں۔ واٹس ایپ تصدیق کے لیے پوچھے گا۔',
    ],
    copyCode: 'کوڈ کاپی کریں',
    codeCopied: 'کاپی ہو گیا',
    copyFailed: 'کاپی نہیں ہو سکا۔ اوپر دکھایا گیا کوڈ واٹس ایپ میں خود لکھیں۔',
    changeNumber: 'دوسرا نمبر استعمال کریں',
    codeKeepOpen: 'یہ صفحہ کھلا رکھیں۔ واٹس ایپ کی تصدیق کے بعد یہ خود آگے بڑھ جائے گا۔',
    codePlaceholder: 'آپ کا 8 حروف کا کوڈ یہاں نظر آئے گا',
    expiredCodeTitle: 'اس کوڈ کا وقت ختم ہو گیا',
    newCode: 'نیا کوڈ لیں',

    consent: 'مجھے معلوم ہے کہ حساب واٹس ایپ ویب کی طرح جڑتا ہے اور صرف میری "Message yourself" والی چیٹ پڑھے گا۔',
    errorTitle: 'واٹس ایپ جڑ نہیں سکا',
    errorBody: 'کمزور انٹرنیٹ پر کبھی کبھی ایسا ہو جاتا ہے۔ نئے کوڈ کے ساتھ دوبارہ کوشش کریں۔',
    tryAgain: 'دوبارہ کوشش کریں',
    mismatchTitle: 'یہ کوئی اور واٹس ایپ نمبر ہے',
    mismatch: phone => (
      <>آپ نے <b className="num" dir="ltr">{phone}</b> جوڑا، لیکن یہ اکاؤنٹ کسی اور نمبر کا ہے۔ وہی واٹس ایپ نمبر جوڑیں جس سے آپ نے اکاؤنٹ بنایا تھا۔</>
    ),
    limited: 'جوڑنے کی بہت زیادہ کوششیں ہو گئیں۔ 10 منٹ انتظار کر کے دوبارہ کوشش کریں۔',
    failed: 'حساب سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    slow: 'انٹرنیٹ سست ہے۔ کوشش جاری ہے…',

    linkedLabel: 'جڑ گیا',
    linked: 'جڑ گیا۔ آپ کا کھاتہ کھل رہا ہے…',
    linkedNew: 'جڑ گیا۔ آپ کی دکان سیٹ اپ ہو رہی ہے…',
    linkedBody: 'اپنا واٹس ایپ دیکھیں: حساب نے ابھی آپ کی "Message yourself" چیٹ میں پیغام بھیجا ہے۔',

    trustTitle: 'آپ کا واٹس ایپ آپ ہی کا رہتا ہے',
    trust: [
      { t: 'صرف ایک چیٹ۔', d: 'حساب صرف آپ کی "Message yourself" والی چیٹ پڑھتا ہے، اور کچھ نہیں۔ گاہکوں، گھر والوں اور گروپس کی چیٹ نہ کھولی جاتی ہے نہ محفوظ کی جاتی ہے۔' },
      { t: 'جب چاہیں الگ کریں۔', d: 'حساب کی سیٹنگز سے، یا واٹس ایپ میں Linked devices سے۔' },
      { t: 'پائلٹ کے دوران مفت۔', d: 'نہ کارڈ، نہ فیس۔' },
    ],
    fnLead: 'لنکڈ ڈیوائسز۔',
    fnText: () => (
      <>حساب واٹس ایپ کا اپنا لنکڈ ڈیوائسز والا فیچر استعمال کرتا ہے، وہی جو واٹس ایپ ویب استعمال کرتا ہے، میٹا کا بزنس API نہیں۔ ہم کیا رکھتے ہیں اور اسے کیسے حذف کریں، یہ <Link to="/privacy">رازداری کی پالیسی</Link> میں لکھا ہے۔</>
    ),
    haveAccount: 'کسی اور کمپیوٹر پر پہلے سے جڑا ہوا ہے؟',
    loginCode: 'کوڈ سے لاگ اِن کریں',
    backToKhata: 'میرے کھاتے پر واپس جائیں',
  },
}

const POLL_MS = 1500
const ACTIVE = ['starting', 'reconnecting', 'qr', 'code']
// Phases where a wrong number can be the reason it is not working: offer to change it.
const CHANGE_NUMBER = ['code', 'expired', 'error', 'limited', 'failed']
// Phones can't scan their own screen, so they default to linking with a typed code.
const prefersCode = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px), (pointer: coarse)').matches
const safeNext = next => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/app')
const menuLabel = text => <b className="connect-menu latin">{text}</b>
const digits = v => String(v || '').replace(/\D/g, '')

/** Same rule as Login: 03001234567, +92 300 1234567, 0092…, 3001234567. */
function looksLikePhone(value) {
  const d = digits(value)
  if (d.startsWith('0092')) return d.length === 14
  if (d.startsWith('92')) return d.length === 12
  if (d.startsWith('0')) return d.length === 11
  if (d.startsWith('3')) return d.length === 10
  return d.length >= 10 && d.length <= 15
}

/** "03001234567" → "0300 1234567" for display. */
function prettyPhone(value) {
  let d = digits(value)
  if (d.startsWith('0092')) d = d.slice(2)
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2)
  if (d.startsWith('3') && d.length === 10) d = '0' + d
  return d.length === 11 && d.startsWith('0') ? `${d.slice(0, 4)} ${d.slice(4)}` : String(value).trim()
}

/** Copy without the async clipboard API, which plain http (a phone on the shop's Wi-Fi) does not have. */
function copyWithCommand(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  const before = document.activeElement
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  before?.focus?.({ preventScroll: true })
  return ok
}

export default function Connect() {
  const S = useStrings(STRINGS)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const reconnect = params.get('reconnect') === '1'

  const [session, setSession] = useState(null)
  const [phoneKind, setPhoneKind] = useState('android')
  const [consent, setConsent] = useState(false)
  // idle | starting | qr | code | expired | error | mismatch | linked | limited | failed
  const [phase, setPhase] = useState('idle')
  const [qr, setQr] = useState(null)
  const [method, setMethod] = useState(() => (prefersCode() ? 'code' : 'qr'))
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  const [code, setCode] = useState(null)
  const [mismatchPhone, setMismatchPhone] = useState('')
  const [linkedNext, setLinkedNext] = useState('/app')
  const [polling, setPolling] = useState(false)
  const [misses, setMisses] = useState(0)
  const goTimer = useRef(null)
  const linkedRef = useRef(false)
  const activeRef = useRef(false)
  // Bumped whenever an attempt is started or abandoned, so a late POST reply can tell it is stale.
  const attemptRef = useRef(0)
  // POST and DELETE /api/link run one after the other, so each carries the link cookie the previous one set.
  const linkOps = useRef(Promise.resolve())
  const frameRef = useRef(null)
  const codeTitleRef = useRef(null)
  const phoneRef = useRef(null)
  // Whether keyboard focus was inside the frame just before a phase change swapped its controls out.
  const keepFocus = useRef(false)

  const apply = useCallback(
    status => {
      const state = status?.state
      if (!state || linkedRef.current) return
      keepFocus.current = Boolean(frameRef.current?.contains(document.activeElement))
      if (state === 'starting' || state === 'reconnecting') {
        setPhase('starting')
      } else if (state === 'qr') {
        // A live QR (e.g. resumed on a phone that opened on the code tab) is shown on the QR tab.
        if (status.qr) setQr(status.qr)
        setMethod('qr')
        setPhase('qr')
      } else if (state === 'code') {
        if (status.code) setCode(status.code)
        setMethod('code')
        setPhase('code')
      } else if (state === 'expired' || state === 'none') {
        setPolling(false)
        setQr(null)
        setPhase('expired')
      } else if (state === 'error') {
        setPolling(false)
        setQr(null)
        setPhase('error')
      } else if (state === 'mismatch') {
        setPolling(false)
        setQr(null)
        setMismatchPhone(status.phone || '')
        setPhase('mismatch')
      } else if (state === 'linked') {
        // Handled once: a repeat read of a finished link has no `next`, and must not redirect elsewhere.
        linkedRef.current = true
        setPolling(false)
        setQr(null)
        const next = safeNext(status.next)
        setLinkedNext(next)
        setPhase('linked')
        clearTimeout(goTimer.current)
        goTimer.current = setTimeout(() => navigate(next, { replace: true }), 900)
      } else {
        // 'replaced', 'logged_out' or anything new: the attempt is over, offer a fresh one.
        setPolling(false)
        setQr(null)
        setPhase('error')
      }
    },
    [navigate],
  )

  useEffect(() => {
    activeRef.current = phase === 'starting' || phase === 'qr' || phase === 'code'
  }, [phase])

  // On arrival: who is signed in (for reconnect wording), and resume a QR that was already showing.
  useEffect(() => {
    let alive = true
    api('/api/session')
      .then(s => alive && setSession(s))
      .catch(() => alive && setSession({ signedIn: false, tenant: null }))
    api('/api/link')
      .then(s => {
        // A finished link is handed out once, so act on it even if this effect was re-run.
        if (s?.state === 'linked') return apply(s)
        if (alive && ACTIVE.includes(s?.state)) {
          setConsent(true)
          apply(s)
          setPolling(true)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [apply])

  /** Abandon the current attempt. Queued behind a POST still in flight, so it closes the link that POST opens. */
  const cancelLink = useCallback(() => {
    attemptRef.current++
    linkOps.current = linkOps.current.then(() => api('/api/link', { method: 'DELETE' })).catch(() => {})
  }, [])

  // Leaving the page mid-scan (not a reload): close the WhatsApp socket the server opened for this QR.
  useEffect(
    () => () => {
      clearTimeout(goTimer.current)
      if (activeRef.current && !linkedRef.current) cancelLink()
    },
    [cancelLink],
  )

  useEffect(() => {
    if (!polling) return
    let alive = true
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const status = await api('/api/link')
        if (!alive) return
        setMisses(0)
        apply(status)
      } catch {
        if (alive) setMisses(n => n + 1)
      } finally {
        busy = false
      }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [polling, apply])

  const tenant = session?.signedIn ? session.tenant : null
  // ?reconnect=1 only re-links when a shop is signed in (assumed until /api/session answers); otherwise ask for the number.
  const relinking = reconnect && (!session || Boolean(tenant))
  const byCode = method === 'code'
  const showingCode = byCode && phase === 'code' && Boolean(code)

  // The start button or Copy was removed by a phase change: put focus back in the frame (or on the new code).
  useEffect(() => {
    const frame = frameRef.current
    const held = keepFocus.current
    keepFocus.current = false
    if (!frame) return
    const active = document.activeElement
    const lost = held && (!active || active === document.body)
    if (showingCode && (lost || active === frame)) codeTitleRef.current?.focus()
    else if (lost) frame.focus({ preventScroll: true })
  }, [phase, showingCode])

  const focusPhone = () => setTimeout(() => phoneRef.current?.focus(), 0)

  const start = async () => {
    if (byCode && !relinking && !looksLikePhone(phone)) {
      setPhoneError(true)
      phoneRef.current?.focus()
      return
    }
    const attempt = ++attemptRef.current
    keepFocus.current = Boolean(frameRef.current?.contains(document.activeElement))
    setPhoneError(false)
    setPolling(false)
    setQr(null)
    setCode(null)
    setMisses(0)
    setPhase('starting')
    const body = { ...(relinking ? { reconnect: true } : {}), ...(byCode ? { method: 'code', phone } : {}) }
    const post = linkOps.current.then(() => api('/api/link', { method: 'POST', body }))
    linkOps.current = post.catch(() => {})
    try {
      await post
      // Abandoned meanwhile (other method, other number, page left): cancelLink() already queued its DELETE.
      if (attemptRef.current === attempt) setPolling(true)
    } catch (err) {
      if (attemptRef.current !== attempt) return
      if (err.code === 'bad_phone') {
        setPhoneError(true)
        setPhase('idle')
        focusPhone()
        return
      }
      setPhase(err.status === 429 ? 'limited' : 'failed')
    }
  }

  const reset = () => {
    if (phase === 'starting' || phase === 'qr' || phase === 'code') cancelLink()
    keepFocus.current = false
    setPolling(false)
    setQr(null)
    setCode(null)
    setPhase('idle')
  }

  const switchMethod = value => {
    if (value === method) return
    reset()
    setMethod(value)
  }

  // Back to the number field, with the number as typed, to fix a typo.
  const changeNumber = () => {
    reset()
    focusPhone()
  }

  // Status line and the one next action, shared by both ways of linking.
  const foot = (
    <div className="connect-foot">
      <div className="connect-status" aria-live="polite">
        {phase === 'starting' && <p className="connect-status-line">{S.preparingHint}</p>}
        {(phase === 'qr' || phase === 'code') && (
          <p className="connect-status-line">
            <Icon name="clock" />
            <span>{phase === 'code' ? S.codeKeepOpen : S.keepOpen}</span>
          </p>
        )}
        {polling && misses >= 3 && <p className="connect-status-line is-warn">{S.slow}</p>}
        {(phase === 'limited' || phase === 'failed') && (
          <p className="connect-status-line is-warn" role="alert">
            <Icon name="alert" />
            <span>{phase === 'limited' ? S.limited : S.failed}</span>
          </p>
        )}
      </div>
      {phase === 'idle' && (
        <>
          <label className="checkbox connect-consent">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>{S.consent}</span>
          </label>
          <Button variant="primary" size="lg" icon={byCode ? 'smartphone' : 'qr'} disabled={!consent} onClick={start}>
            {byCode ? S.getCode : S.showQr}
          </Button>
        </>
      )}
      {phase === 'expired' && (
        <Button variant="primary" size="lg" icon="refresh" onClick={start}>{byCode ? S.newCode : S.newQr}</Button>
      )}
      {(phase === 'error' || phase === 'mismatch' || phase === 'failed' || phase === 'limited') && (
        <Button variant="primary" size="lg" icon="refresh" onClick={start}>{S.tryAgain}</Button>
      )}
      {byCode && !relinking && CHANGE_NUMBER.includes(phase) && (
        <Button variant="ghost" icon="edit" onClick={changeNumber}>{S.changeNumber}</Button>
      )}
    </div>
  )

  return (
    <div className="connect-page">
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">{reconnect ? S.eyebrowReconnect : S.eyebrow}</p>
          <h1>{reconnect ? S.titleReconnect : S.title}</h1>
          <p className="lead">{reconnect ? S.leadReconnect(tenant?.phoneLocal, tenant?.shopName) : S.lead}</p>
        </div>
      </header>

      {tenant && !reconnect && (
        <div className="banner info connect-signed">
          <Icon name="info" />
          <span className="banner-text">
            {S.signedInAs(tenant.shopName ? <bdi>{tenant.shopName}</bdi> : <span className="num" dir="ltr">{tenant.phoneLocal}</span>)}
          </span>
          <Button variant="primary" size="sm" to="/app" iconEnd="arrow-right">{S.openKhata}</Button>
        </div>
      )}

      {phase === 'linked' ? (
        <section className="connect-linked" role="status">
          <p className="label">
            <Icon name="check" size="sm" />
            {S.linkedLabel}
          </p>
          <p className="connect-linked-title">{linkedNext === '/welcome' ? S.linkedNew : S.linked}</p>
          <p className="connect-linked-text">{S.linkedBody}</p>
        </section>
      ) : (
        <div className="tabs-block">
          {!byCode && (
            <p className="connect-note">
              <Icon name="smartphone" />
              <span>{S.phoneNote()}</span>
            </p>
          )}
          <Tabs
            id="connect-method"
            controls="connect-method-panel"
            label={S.methodLabel}
            value={method}
            onChange={switchMethod}
            tabs={[
              { value: 'qr', label: S.methodQr },
              { value: 'code', label: S.methodCode },
            ]}
          />
          <TabPanel tabsId="connect-method" value={method}>
            {byCode ? (
              <section
                ref={frameRef}
                tabIndex={-1}
                className="frame connect-frame"
                aria-label={showingCode ? undefined : S.codeIdleTitle}
                aria-labelledby={showingCode ? 'connect-code-title' : undefined}
              >
                {showingCode && (
                  <div className="frame-head">
                    <h2 ref={codeTitleRef} tabIndex={-1} className="frame-title" id="connect-code-title">{S.codeTitle}</h2>
                  </div>
                )}
                <div className={showingCode ? 'connect-code-body' : 'frame-body'}>
                  {showingCode ? (
                    <CodeCard S={S} code={code} phone={relinking ? tenant?.phoneLocal : prettyPhone(phone)} />
                  ) : (
                    <CodeStage
                      S={S}
                      phase={phase}
                      relinking={relinking}
                      phoneRef={phoneRef}
                      phone={phone}
                      onPhone={value => {
                        setPhone(value)
                        if (phoneError) setPhoneError(false)
                      }}
                      phoneError={phoneError}
                      mismatchPhone={mismatchPhone}
                    />
                  )}
                </div>
                {foot}
              </section>
            ) : (
              <section ref={frameRef} tabIndex={-1} className="frame connect-frame" aria-labelledby="connect-how">
                <div className="frame-head">
                  <h2 className="frame-title" id="connect-how">{S.howTitle}</h2>
                  <Segmented
                    className="connect-os"
                    label={S.phoneType}
                    value={phoneKind}
                    onChange={setPhoneKind}
                    options={[
                      { value: 'android', label: S.android },
                      { value: 'iphone', label: S.iphone },
                    ]}
                  />
                </div>
                <div className="frame-body connect-figure">
                  <QrBox S={S} phase={phase} qr={qr} mismatchPhone={mismatchPhone} />
                  <Steps items={S.steps[phoneKind]} keyBase={phoneKind} />
                </div>
                {foot}
              </section>
            )}
          </TabPanel>
          {!byCode && (
            <details className="connect-trouble">
              <summary>
                <span>{S.troubleTitle}</span>
                <Icon name="chevron-down" className="connect-trouble-chev" />
              </summary>
              <ul>
                {S.trouble.map(tip => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <section className="connect-trust" aria-labelledby="connect-trust-title">
        <h2 id="connect-trust-title">{S.trustTitle}</h2>
        {S.trust.map((item, i) => (
          <p key={item.t} className="body-serif">
            <strong>{item.t}</strong> {item.d}
            {i === 0 && <FootnoteRef n={1} />}
          </p>
        ))}
      </section>

      <p className="connect-alt">
        {reconnect ? (
          <Link to="/app">{S.backToKhata}</Link>
        ) : (
          <>
            <span>{S.haveAccount}</span> <Link to="/login">{S.loginCode}</Link>
          </>
        )}
      </p>

      <Footnotes items={[{ lead: S.fnLead, text: S.fnText() }]} />
    </div>
  )
}

/** "[1] Step" list. Menu names inside a step come wrapped by menuLabel. */
function Steps({ items, keyBase }) {
  return (
    <ol className="connect-steps">
      {items.map((step, i) => (
        <li key={`${keyBase}-${i}`}>
          <span className="connect-step-n num" aria-hidden="true">[{i + 1}]</span>
          <span className="connect-step-text">{typeof step === 'function' ? step(menuLabel) : step}</span>
        </li>
      ))}
    </ol>
  )
}

/** Icon (or spinner), a serif title and a short line: what the stage shows when there is no code on it. */
function StateNote({ icon, busy, tone, title, alert, children }) {
  return (
    <div className={`connect-state${tone ? ` is-${tone}` : ''}`} role={alert ? 'alert' : undefined}>
      {busy ? <Spinner size="lg" /> : <Icon name={icon} className="connect-state-icon" />}
      {title && <p className="connect-state-title">{title}</p>}
      {children && <p className="connect-state-text">{children}</p>}
    </div>
  )
}

/** The white square the QR is shown in, beside the steps. */
function QrBox({ S, phase, qr, mismatchPhone }) {
  if (phase === 'qr' && qr) {
    return (
      <div className="connect-qr is-live">
        <img src={qr} alt={S.qrAlt} width="280" height="280" />
      </div>
    )
  }
  let inner
  if (phase === 'starting' || phase === 'qr') inner = <StateNote busy title={S.preparing} />
  else if (phase === 'expired')
    inner = (
      <StateNote icon="clock" title={S.expiredTitle}>
        {S.expiredBody}
      </StateNote>
    )
  else if (phase === 'error')
    inner = (
      <StateNote alert icon="alert" tone="warn" title={S.errorTitle}>
        {S.errorBody}
      </StateNote>
    )
  else if (phase === 'mismatch')
    inner = (
      <StateNote alert icon="phone" tone="warn" title={S.mismatchTitle}>
        {S.mismatch(mismatchPhone)}
      </StateNote>
    )
  else
    inner = (
      <StateNote icon="qr" tone="muted">
        {S.qrPlaceholder}
      </StateNote>
    )
  return <div className="connect-qr">{inner}</div>
}

/** Phone-number linking before a code is on screen: the number field, progress, or what went wrong. */
function CodeStage({ S, phase, relinking, phoneRef, phone, onPhone, phoneError, mismatchPhone }) {
  if (phase === 'starting' || phase === 'code') return <StateNote busy title={S.preparingCode} />
  if (phase === 'expired')
    return (
      <StateNote icon="clock" title={S.expiredCodeTitle}>
        {S.expiredBody}
      </StateNote>
    )
  if (phase === 'error')
    return (
      <StateNote alert icon="alert" tone="warn" title={S.errorTitle}>
        {S.errorBody}
      </StateNote>
    )
  if (phase === 'mismatch')
    return (
      <StateNote alert icon="phone" tone="warn" title={S.mismatchTitle}>
        {S.mismatch(mismatchPhone)}
      </StateNote>
    )
  if (phase === 'idle') {
    if (relinking) return <p className="connect-body-note">{S.phoneHint}</p>
    return (
      <Field label={S.phoneLabel} hint={S.phoneHint} error={phoneError ? S.badPhone : ''} htmlFor="connect-phone">
        <input
          ref={phoneRef}
          id="connect-phone"
          className="input lg num"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0300 1234567"
          value={phone}
          onChange={e => onPhone(e.target.value)}
          aria-invalid={phoneError}
        />
      </Field>
    )
  }
  return (
    <StateNote icon="smartphone" tone="muted">
      {S.codePlaceholder}
    </StateNote>
  )
}

/** The 8-character pairing code, big, on sage, with the number it is for, a Copy pill and the three steps under it. */
function CodeCard({ S, code, phone }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    const text = code.replace('-', '')
    let ok = false
    if (navigator.clipboard?.writeText) ok = await navigator.clipboard.writeText(text).then(() => true, () => false)
    if (!ok) ok = copyWithCommand(text)
    // Nothing reached the clipboard: say so, so nobody pastes an empty or old clipboard into WhatsApp.
    setCopyFailed(!ok)
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="connect-code">
      <div className="connect-code-top">
        <p className="label">{S.codeLabel}</p>
        <p className="connect-code-value">
          <span className="connect-code-chars" dir="ltr" aria-hidden="true">
            {code.split('').map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
          </span>
          <span className="sr-only">{code.split('').join(' ')}</span>
        </p>
        {phone && <p className="connect-code-for">{S.codeFor(<b className="num" dir="ltr">{phone}</b>)}</p>}
        <Button variant="primary" icon={copied ? 'check' : 'copy'} onClick={copy}>
          {copied ? S.codeCopied : S.copyCode}
        </Button>
        {copyFailed && (
          <p className="connect-copy-failed" role="alert">
            {S.copyFailed}
          </p>
        )}
      </div>
      <Steps items={S.codeSteps} keyBase="code" />
    </div>
  )
}
