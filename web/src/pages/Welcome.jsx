import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import VoiceNote from '../components/VoiceNote.jsx'
import { FootnoteRef, Footnotes, LabeledCells, QuoteCard } from '../components/editorial.jsx'
import { Avatar, Badge, Button, Field, LoadError, Money, Skeleton, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { whatsappHtml } from '../lib/format.js'
import { useLang, useStrings } from '../lib/i18n.jsx'
import '../lib/lists.css'
import './Welcome.css'

// What the shopkeeper actually says to WhatsApp (Roman Urdu + Urdu script), tailored to their kind of shop.
const SAY = {
  kiryana: { roman: 'Umar ne 500 rupaye ka sauda liya', urdu: 'عمر نے 500 روپے کا سودا لیا' },
  pharmacy: { roman: 'Umar ne 500 rupaye ki dawai udhaar li', urdu: 'عمر نے 500 روپے کی دوائی ادھار لی' },
  wholesale: { roman: 'Umar ne 5000 rupaye ka maal udhaar liya', urdu: 'عمر نے 5000 روپے کا مال ادھار لیا' },
  clothing: { roman: 'Umar ne 2000 rupaye ka suit udhaar liya', urdu: 'عمر نے 2000 روپے کا سوٹ ادھار لیا' },
  hardware: { roman: 'Umar ne 1500 rupaye ka saman udhaar liya', urdu: 'عمر نے 1500 روپے کا سامان ادھار لیا' },
  mobile: { roman: 'Umar ne 800 rupaye ka charger udhaar liya', urdu: 'عمر نے 800 روپے کا چارجر ادھار لیا' },
  other: { roman: 'Umar ne 500 rupaye ka sauda liya', urdu: 'عمر نے 500 روپے کا سودا لیا' },
  pay: { roman: 'Umar ne 300 wapis diye', urdu: 'عمر نے 300 واپس دیے' },
  // Urdu and English in one sentence (eval cm01 / a_cm01: understood as text and as a voice note).
  mix: { roman: 'Umar ne 500 rupees ka saman liya on credit', urdu: 'عمر نے پانچ سو rupees کا سامان لیا on credit' },
}

const STRINGS = {
  en: {
    s1Eyebrow: 'Step 2 of 2 · Your shop',
    s1Title: 'Tell us about your shop',
    s1Lead: (name, phone) => (
      <>
        {name ? `Salaam, ${name}. ` : ''}WhatsApp <span className="num" dir="ltr">{phone}</span> is linked. Name your shop and your khata is ready.
      </>
    ),
    formTitle: 'Your shop',
    formMeta: 'Change any of this later in Settings',
    linked: 'Linked WhatsApp',
    waStatus: 'Status',
    waOn: 'Connected',
    waOff: 'Not connected',
    shopName: 'Shop name',
    shopPh: 'e.g. Gul Traders',
    shopHint: 'Customers see this name in payment reminders.',
    shopRequired: 'Enter your shop’s name. Customers see it in reminders.',
    ownerName: 'Your name',
    ownerPh: 'e.g. Haji Gul',
    ownerHint: 'Hisaab uses it when it talks to you.',
    city: 'City or area',
    cityPh: 'e.g. Qissa Khwani, Peshawar',
    type: 'Type of shop',
    typeHint: 'So the examples we show match what you sell.',
    types: {
      kiryana: 'Kiryana / general store',
      pharmacy: 'Medical store',
      wholesale: 'Wholesale',
      clothing: 'Clothing',
      hardware: 'Hardware',
      mobile: 'Mobile shop',
      other: 'Other',
    },
    voiceTitle: 'Reply with a voice note too',
    voiceHint: 'Along with the written reply, Hisaab sends a short Urdu voice note with the new balance.',
    langLegend: 'Language for the dashboard',
    langHint: 'Hisaab’s WhatsApp replies are in Urdu either way.',
    langEn: 'English',
    langEnSub: 'Dashboard in English',
    langUr: 'اردو',
    langUrSub: 'ڈیش بورڈ اردو میں',
    save: 'Save and continue',
    saveError: 'Could not save. Check your internet and try again.',

    s2Eyebrow: shop => (shop ? `${shop} · First voice note` : 'First voice note'),
    s2Title: 'Send your first voice note',
    s2Lead: shop => `${shop ? `${shop}’${/s$/i.test(shop) ? '' : 's'}` : 'Your'} khata is ready. Say your first udhaar into WhatsApp and watch it appear here.`,
    guideLabel: 'On your phone',
    st1Title: 'Open your own chat in WhatsApp',
    st1Body: 'Search for your own name. It shows with “(You)” next to it, or as “Message yourself”.',
    you: '(You)',
    youAlone: 'You',
    msgYourself: 'Message yourself',
    st2Title: 'Hold the mic and say',
    sayLabel: 'Say',
    meansLabel: 'Means',
    meaning: {
      kiryana: 'Umar took Rs 500 of goods on credit.',
      pharmacy: 'Umar took Rs 500 of medicine on credit.',
      wholesale: 'Umar took Rs 5,000 of stock on credit.',
      clothing: 'Umar took a Rs 2,000 suit on credit.',
      hardware: 'Umar took Rs 1,500 of hardware on credit.',
      mobile: 'Umar took an Rs 800 charger on credit.',
      other: 'Umar took Rs 500 of goods on credit.',
    },
    whenPays: 'When he pays back, say',
    orMixed: 'Or mix in English',
    st3Title: 'Hisaab replies in about ten seconds',
    st3Body: 'You get an Urdu voice note and a written reply in the same chat, and the entry shows up in your khata here.',

    liveTitle: 'From your WhatsApp',
    liveState: {
      connecting: 'Connecting…',
      open: 'Live',
      off: 'Checking every few seconds',
    },
    waiting: 'Waiting for your voice note…',
    waitingFrom: phone =>
      phone ? (
        <>Send it from the WhatsApp on <span className="num" dir="ltr">{phone}</span>. This page updates by itself the moment Hisaab hears you.</>
      ) : (
        'This page updates by itself the moment Hisaab hears you.'
      ),
    offline: 'Live updates are slow on this connection. Your note will still be recorded, and this page checks every few seconds.',
    progress: {
      received: 'Got your message…',
      thinking: 'Hisaab is understanding what you said…',
      speaking: 'Hisaab is writing your entry and reply…',
    },
    heard: 'Hisaab heard you',
    youSaid: 'You said',
    recorded: 'Written in your khata',
    replied: 'Hisaab replied in WhatsApp',
    openKhata: 'Open my khata',
    again: 'Send another one any time. This page keeps listening.',
    errTitle: 'Hisaab could not finish that one',
    errors: {
      busy: 'Hisaab is busy right now. Send it again in a minute.',
      not_understood: 'It did not catch the name or the amount. Say it again slowly, like the example.',
      network: 'Something went wrong on our side. Send it again in a minute.',
      ai_config: 'Something went wrong on our side. Send it again in a minute.',
      limit: 'You have reached today’s message limit. It resets tomorrow.',
      interrupted: 'Hisaab restarted before this was written. Send it again.',
    },
    r: {
      credit: (name, amt) => <>Udhaar {amt} for <b>{name}</b></>,
      payment: (name, amt) => <>Payment {amt} from <b>{name}</b></>,
      undo: 'Last entry cancelled',
      correct: (name, from, to) => <><b>{name}</b>’s entry changed from {from} to {to}</>,
      set_phone: name => <>Saved <b>{name}</b>’s phone number</>,
      reminder: name => <>Reminder ready for <b>{name}</b></>,
      answered: 'Answered from your khata',
      help: 'Sent you the help guide in WhatsApp',
      dashboard_link: 'Sent you a login link in WhatsApp',
      needs_amount: name => (name ? <>Asked how much for <b>{name}</b></> : 'Asked for the amount'),
      needs_name: 'Asked for the customer’s name',
      ambiguous: list => `Asked which one you meant: ${list}`,
      not_found: name => `No customer named “${name}” yet`,
      already_clear: name => <><b>{name}</b> owes nothing</>,
      nothing_to_undo: 'Nothing to undo',
      bad_phone: 'That phone number did not look right',
      purchase: (name, amt) => <>Goods worth {amt} taken on credit from <b>{name}</b></>,
      supplier_payment: (name, amt) => <>Paid {amt} to <b>{name}</b></>,
      create_list: list => <>New list made: <b>{list}</b></>,
      move_to_list: (name, list) => <>Moved <b>{name}</b> to <b>{list}</b></>,
      lists_summary: 'Sent you your lists in WhatsApp',
      exists: list => (list ? <>A list called <b>{list}</b> already exists</> : 'That list already exists'),
      not_supplier: name => <><b>{name}</b> is a customer, not a supplier — nothing written</>,
      list_not_found: list => (list ? <>No list called <b>{list}</b> yet</> : 'Asked which list you meant'),
      too_many: 'You already have 20 lists — nothing written',
      has_entries: name => <><b>{name}</b> has entries, so cannot move between customers and suppliers</>,
      general: 'General',
      none: 'Nothing was written in the khata.',
    },
    youOweNow: (name, amt) => <>You now owe {name} {amt}</>,
    owesNow: (name, amt) => <>{name} now owes {amt}</>,
    settledNow: name => `${name} is settled`,
    advanceNow: (name, amt) => <>{name} has {amt} advance</>,

    tryToggle: 'Prefer typing? Try it here',
    tryLabel: 'Type it the way you would say it',
    tryHint: 'This goes into your real khata. Send “undo” afterwards to cancel it.',
    send: 'Send',
    sendError: 'Could not send. Check your internet and try again.',
    editShop: 'Change shop details',
    skip: 'Skip for now',
    fnLead: 'Reply time.',
    fnText: 'On our pilot server a voice note is understood in about 3½ seconds and a typed message in about 2; the reply with its voice note arrives about 10 seconds after you send (medians from our October 2026 tests). It depends on your network.',
  },
  ur: {
    s1Eyebrow: 'مرحلہ 2 از 2 · آپ کی دکان',
    s1Title: 'اپنی دکان کے بارے میں بتائیں',
    s1Lead: (name, phone) => (
      <>
        {name ? `السلام علیکم، ${name}۔ ` : ''}واٹس ایپ <span className="num" dir="ltr">{phone}</span> جڑ گیا ہے۔ اپنی دکان کا نام لکھیں اور آپ کا کھاتہ تیار ہے۔
      </>
    ),
    formTitle: 'آپ کی دکان',
    formMeta: 'یہ سب بعد میں سیٹنگز سے بدل سکتے ہیں',
    linked: 'جڑا ہوا واٹس ایپ',
    waStatus: 'کیفیت',
    waOn: 'منسلک',
    waOff: 'منسلک نہیں',
    shopName: 'دکان کا نام',
    shopPh: 'مثلاً Gul Traders',
    shopHint: 'گاہکوں کو وصولی کی یاد دہانی میں یہی نام نظر آتا ہے۔',
    shopRequired: 'اپنی دکان کا نام لکھیں۔ گاہک یاد دہانی میں یہی نام دیکھتے ہیں۔',
    ownerName: 'آپ کا نام',
    ownerPh: 'مثلاً حاجی گل',
    ownerHint: 'حساب آپ سے بات کرتے ہوئے یہی نام لیتا ہے۔',
    city: 'شہر یا علاقہ',
    cityPh: 'مثلاً قصہ خوانی، پشاور',
    type: 'دکان کی قسم',
    typeHint: 'تاکہ ہم آپ کے کاروبار کے مطابق مثالیں دکھائیں۔',
    types: {
      kiryana: 'کریانہ / جنرل اسٹور',
      pharmacy: 'میڈیکل اسٹور',
      wholesale: 'ہول سیل',
      clothing: 'کپڑے',
      hardware: 'ہارڈ ویئر',
      mobile: 'موبائل شاپ',
      other: 'کوئی اور',
    },
    voiceTitle: 'جواب وائس نوٹ میں بھی',
    voiceHint: 'تحریری جواب کے علاوہ حساب اردو میں ایک مختصر وائس نوٹ بھی بھیجتا ہے جس میں نیا بقایا بتایا جاتا ہے۔',
    langLegend: 'ڈیش بورڈ کی زبان',
    langHint: 'واٹس ایپ پر حساب کے جواب ہر صورت اردو میں ہوں گے۔',
    langEn: 'English',
    langEnSub: 'Dashboard in English',
    langUr: 'اردو',
    langUrSub: 'ڈیش بورڈ اردو میں',
    save: 'محفوظ کر کے آگے بڑھیں',
    saveError: 'محفوظ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',

    s2Eyebrow: shop => (shop ? `${shop} · پہلا وائس نوٹ` : 'پہلا وائس نوٹ'),
    s2Title: 'اپنا پہلا وائس نوٹ بھیجیں',
    s2Lead: shop => `${shop || 'آپ کی دکان'} کا کھاتہ تیار ہے۔ واٹس ایپ میں اپنا پہلا ادھار بول کر لکھوائیں اور اسے یہاں آتا دیکھیں۔`,
    guideLabel: 'اپنے فون پر',
    st1Title: 'واٹس ایپ میں اپنی چیٹ کھولیں',
    st1Body: 'اپنا نام تلاش کریں۔ اس کے ساتھ "(You)" لکھا ہوتا ہے، یا "Message yourself" نظر آتا ہے۔',
    you: '(You)',
    youAlone: 'You',
    msgYourself: 'Message yourself',
    st2Title: 'مائیک دبا کر بولیں',
    sayLabel: 'بولیں',
    meansLabel: 'مطلب',
    meaning: {
      kiryana: '',
      pharmacy: '',
      wholesale: '',
      clothing: '',
      hardware: '',
      mobile: '',
      other: '',
    },
    whenPays: 'جب وہ پیسے واپس کرے تو بولیں',
    orMixed: 'یا انگریزی ملا کر',
    st3Title: 'تقریباً دس سیکنڈ میں حساب جواب دیتا ہے',
    st3Body: 'اسی چیٹ میں آپ کو اردو وائس نوٹ اور لکھا ہوا جواب ملتا ہے، اور اندراج یہاں آپ کے کھاتے میں نظر آ جاتا ہے۔',

    liveTitle: 'آپ کے واٹس ایپ سے',
    liveState: {
      connecting: 'جڑ رہا ہے…',
      open: 'لائیو',
      off: 'ہر چند سیکنڈ بعد دیکھ رہا ہے',
    },
    waiting: 'آپ کے وائس نوٹ کا انتظار ہے…',
    waitingFrom: phone =>
      phone ? (
        <><span className="num" dir="ltr">{phone}</span> والے واٹس ایپ سے بھیجیں۔ جیسے ہی حساب سنے گا، یہ صفحہ خود بخود بدل جائے گا۔</>
      ) : (
        'جیسے ہی حساب سنے گا، یہ صفحہ خود بخود بدل جائے گا۔'
      ),
    offline: 'اس کنکشن پر لائیو اپ ڈیٹ سست ہیں۔ آپ کا نوٹ پھر بھی ریکارڈ ہو گا، اور یہ صفحہ ہر چند سیکنڈ بعد دیکھتا رہے گا۔',
    progress: {
      received: 'آپ کا پیغام مل گیا…',
      thinking: 'حساب آپ کی بات سمجھ رہا ہے…',
      speaking: 'حساب اندراج اور جواب تیار کر رہا ہے…',
    },
    heard: 'حساب نے آپ کی بات سن لی',
    youSaid: 'آپ نے کہا',
    recorded: 'کھاتے میں لکھا گیا',
    replied: 'حساب نے واٹس ایپ پر جواب دیا',
    openKhata: 'میرا کھاتہ کھولیں',
    again: 'جب چاہیں اگلا بھیجیں۔ یہ صفحہ سنتا رہے گا۔',
    errTitle: 'حساب یہ پیغام مکمل نہیں کر سکا',
    errors: {
      busy: 'ابھی حساب مصروف ہے۔ ایک منٹ بعد دوبارہ بھیجیں۔',
      not_understood: 'نام یا رقم سمجھ نہیں آئی۔ مثال کی طرح آہستہ سے دوبارہ بولیں۔',
      network: 'ہماری طرف کوئی خرابی ہوئی۔ ایک منٹ بعد دوبارہ بھیجیں۔',
      ai_config: 'ہماری طرف کوئی خرابی ہوئی۔ ایک منٹ بعد دوبارہ بھیجیں۔',
      limit: 'آج کے پیغامات کی حد پوری ہو گئی۔ کل سے دوبارہ بھیج سکیں گے۔',
      interrupted: 'لکھے جانے سے پہلے حساب دوبارہ شروع ہو گیا۔ یہ پیغام دوبارہ بھیجیں۔',
    },
    r: {
      credit: (name, amt) => <><b>{name}</b> کے کھاتے میں {amt} ادھار</>,
      payment: (name, amt) => <><b>{name}</b> سے {amt} وصول</>,
      undo: 'پچھلا اندراج منسوخ کر دیا',
      correct: (name, from, to) => <><b>{name}</b> کا اندراج {from} سے {to} کر دیا</>,
      set_phone: name => <><b>{name}</b> کا فون نمبر محفوظ کر لیا</>,
      reminder: name => <><b>{name}</b> کے لیے یاد دہانی تیار</>,
      answered: 'آپ کے کھاتے سے جواب دیا',
      help: 'واٹس ایپ پر استعمال کا طریقہ بھیج دیا',
      dashboard_link: 'واٹس ایپ پر لاگ اِن لنک بھیج دیا',
      needs_amount: name => (name ? <><b>{name}</b> کی رقم پوچھی</> : 'رقم پوچھی'),
      needs_name: 'گاہک کا نام پوچھا',
      ambiguous: list => `پوچھا کہ کون سا: ${list}`,
      not_found: name => `"${name}" نام کا کوئی گاہک ابھی نہیں`,
      already_clear: name => <><b>{name}</b> کے ذمے کچھ نہیں</>,
      nothing_to_undo: 'منسوخ کرنے کو کچھ نہیں تھا',
      bad_phone: 'فون نمبر درست نہیں لگا',
      purchase: (name, amt) => <><b>{name}</b> سے {amt} کا مال ادھار لیا</>,
      supplier_payment: (name, amt) => <><b>{name}</b> کو {amt} ادا کیے</>,
      create_list: list => <>نئی لسٹ بن گئی: <b>{list}</b></>,
      move_to_list: (name, list) => <><b>{name}</b> کو <b>{list}</b> میں ڈال دیا</>,
      lists_summary: 'واٹس ایپ پر آپ کی لسٹیں بھیج دیں',
      exists: list => (list ? <><b>{list}</b> نام کی لسٹ پہلے سے موجود ہے</> : 'یہ لسٹ پہلے سے موجود ہے'),
      not_supplier: name => <><b>{name}</b> گاہک ہیں، سپلائر نہیں — کچھ نہیں لکھا</>,
      list_not_found: list => (list ? <><b>{list}</b> نام کی کوئی لسٹ ابھی نہیں</> : 'پوچھا کون سی لسٹ'),
      too_many: 'پہلے ہی 20 لسٹیں ہیں — کچھ نہیں لکھا',
      has_entries: name => <><b>{name}</b> کے اندراجات ہیں، اس لیے گاہکوں اور سپلائرز کے درمیان منتقل نہیں ہو سکتے</>,
      general: 'عام کھاتہ',
      none: 'کھاتے میں کچھ نہیں لکھا گیا۔',
    },
    youOweNow: (name, amt) => <>اب آپ نے {name} کو {amt} دینے ہیں</>,
    owesNow: (name, amt) => <>اب {name} کے ذمے {amt}</>,
    settledNow: name => `${name} کا حساب صاف`,
    advanceNow: (name, amt) => <>{name} کا {amt} ایڈوانس</>,

    tryToggle: 'لکھنا آسان ہے؟ یہاں آزمائیں',
    tryLabel: 'ویسے ہی لکھیں جیسے آپ بولتے ہیں',
    tryHint: 'یہ آپ کے اصل کھاتے میں لکھا جائے گا۔ منسوخ کرنے کے لیے بعد میں "undo" بھیج دیں۔',
    send: 'بھیجیں',
    sendError: 'بھیجا نہیں جا سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    editShop: 'دکان کی تفصیل بدلیں',
    skip: 'ابھی چھوڑیں',
    fnLead: 'جواب کا وقت۔',
    fnText: 'ہمارے پائلٹ سرور پر وائس نوٹ تقریباً ساڑھے تین سیکنڈ میں اور لکھا ہوا پیغام تقریباً 2 سیکنڈ میں سمجھا جاتا ہے؛ وائس نوٹ والا جواب بھیجنے کے تقریباً 10 سیکنڈ بعد آتا ہے (اکتوبر 2026 کے ٹیسٹ کی درمیانی پیمائش)۔ وقت آپ کے انٹرنیٹ پر منحصر ہے۔',
  },
}

const TYPES = ['kiryana', 'pharmacy', 'wholesale', 'clothing', 'hardware', 'mobile', 'other']
const WORKING = ['received', 'thinking', 'speaking']
const RECENT_MS = 30 * 60 * 1000
const LIVE_DOT = { open: 'ok', off: 'wait', connecting: '' }

/** The newest message this shop has sent, or null. */
async function newestMessage() {
  const list = await api('/api/messages?limit=1')
  return list?.[0] || null
}

/** Live `message` events for this shop over /ws, with a polling fallback when sockets are blocked. */
function useLiveMessages(enabled, onMessage) {
  const [status, setStatus] = useState('connecting') // connecting | open | off
  const saved = useRef(onMessage)
  saved.current = onMessage

  useEffect(() => {
    if (!enabled) return
    let ws = null
    let timer = null
    let closed = false
    let failures = 0
    let opened = false
    const connect = () => {
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`)
      ws.onopen = () => {
        // Back after a drop: events sent while we were away are gone, so read the newest message once.
        if (opened)
          newestMessage()
            .then(m => !closed && m && saved.current(m))
            .catch(() => {})
        opened = true
        failures = 0
        setStatus('open')
      }
      ws.onmessage = e => {
        let event
        try {
          event = JSON.parse(e.data)
        } catch {
          return
        }
        if (event?.type === 'message' && event.data) saved.current(event.data)
      }
      ws.onclose = () => {
        if (closed) return
        failures++
        setStatus(failures >= 3 ? 'off' : 'connecting')
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** failures))
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [enabled])

  // Fallback: when the socket keeps failing, look at the newest message every few seconds.
  useEffect(() => {
    if (!enabled || status !== 'off') return
    let alive = true
    const tick = async () => {
      try {
        const m = await newestMessage()
        if (alive && m) saved.current(m)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled, status])

  return status
}

export default function Welcome() {
  const S = useStrings(STRINGS)
  const { lang, setLang } = useLang()
  const navigate = useNavigate()

  const [me, setMe] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [step, setStep] = useState(1)
  const headingRef = useRef(null)
  const stepChanged = useRef(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api('/api/me')
      setMe(data)
      if (data.onboarded) {
        setLang(data.uiLang)
        setStep(2)
      }
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true })
      else setLoadError(err)
    }
  }, [navigate, setLang])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!stepChanged.current) return
    window.scrollTo(0, 0)
    headingRef.current?.focus()
  }, [step])

  const goTo = n => {
    stepChanged.current = true
    setStep(n)
  }

  // The newest message from this shop (first voice note), kept live for step 2.
  const [latest, setLatest] = useState(null)
  const [pending, setPending] = useState(false)
  const take = useCallback(m => {
    if (!m?.id) return
    if (Date.now() - (m.createdAt || 0) > RECENT_MS) return
    setPending(false)
    setLatest(prev => (!prev || prev.id === m.id || (m.createdAt || 0) >= (prev.createdAt || 0) ? m : prev))
  }, [])
  const live = useLiveMessages(Boolean(me), take)

  // A note sent before this page was open (e.g. while filling the form) still counts.
  useEffect(() => {
    if (!me) return
    let alive = true
    newestMessage()
      .then(m => alive && m && take(m))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [me?.id, take]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net while something is in flight: if a live event is ever missed, the spinner must not hang.
  const inFlight = Boolean(me) && live !== 'off' && (pending || Boolean(latest && WORKING.includes(latest.status)))
  useEffect(() => {
    if (!inFlight) return
    let alive = true
    const id = setInterval(() => {
      newestMessage()
        .then(m => alive && m && take(m))
        .catch(() => {})
    }, 6000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [inFlight, take])

  if (loadError) {
    return (
      <div className="welcome-page">
        <LoadError onRetry={load} />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="welcome-page" aria-busy="true">
        <div className="welcome-skel-head">
          <Skeleton width={180} height={14} />
          <Skeleton width="82%" height={44} style={{ marginTop: 16 }} />
          <Skeleton width="96%" height={22} style={{ marginTop: 24 }} />
          <Skeleton width="70%" height={22} style={{ marginTop: 8 }} />
        </div>
        <div className="frame welcome-skel">
          <Skeleton height={46} />
          <Skeleton height={46} />
          <Skeleton height={46} />
          <Skeleton height={72} />
        </div>
      </div>
    )
  }

  return (
    <div className="welcome-page">
      {step === 1 ? (
        <ShopStep
          S={S}
          me={me}
          lang={lang}
          setLang={setLang}
          headingRef={headingRef}
          onSaved={t => {
            setMe(t)
            goTo(2)
          }}
          onSignedOut={() => navigate('/login', { replace: true })}
        />
      ) : (
        <FirstNoteStep
          S={S}
          me={me}
          headingRef={headingRef}
          latest={latest}
          pending={pending}
          setPending={setPending}
          live={live}
          onEdit={() => goTo(1)}
        />
      )}
    </div>
  )
}

/** Eyebrow · serif title · serif lead. The title takes focus when the step changes. */
function Head({ eyebrow, title, lead, headingRef }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
        <p className="lead">{lead}</p>
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------- step 1: the shop */

function ShopStep({ S, me, lang, setLang, headingRef, onSaved, onSignedOut }) {
  const [form, setForm] = useState(() => ({
    shop_name: me.shopName || '',
    owner_name: me.ownerName || me.whatsapp?.name || '',
    city: me.city || '',
    business_type: TYPES.includes(me.businessType) ? me.businessType : 'kiryana',
    voice_replies: me.voiceReplies !== false,
  }))
  const [shopError, setShopError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saving, setSaving] = useState(false)
  const shopRef = useRef(null)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  const connected = me.whatsapp?.status === 'connected'

  const submit = async e => {
    e.preventDefault()
    setSaveError(false)
    if (!form.shop_name.trim()) {
      setShopError(true)
      shopRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const tenant = await api('/api/onboarding', {
        method: 'POST',
        body: {
          shop_name: form.shop_name.trim(),
          owner_name: form.owner_name.trim(),
          city: form.city.trim(),
          business_type: form.business_type,
          voice_replies: form.voice_replies,
          ui_lang: lang,
        },
      })
      onSaved(tenant)
    } catch (err) {
      if (err.status === 401) onSignedOut()
      else setSaveError(true)
      setSaving(false)
    }
  }

  return (
    <>
      <Head eyebrow={S.s1Eyebrow} title={S.s1Title} lead={S.s1Lead(me.whatsapp?.name, me.phoneLocal)} headingRef={headingRef} />

      <form className="frame welcome-form" onSubmit={submit} noValidate aria-labelledby="welcome-form-title">
        <div className="frame-head">
          <h2 className="frame-title" id="welcome-form-title">{S.formTitle}</h2>
          <span className="frame-meta">{S.formMeta}</span>
        </div>

        <LabeledCells
          className="welcome-linked"
          framed={false}
          min={150}
          cells={[
            { label: S.linked, value: <span className="welcome-linked-phone num" dir="ltr">{me.phoneLocal}</span> },
            { label: S.waStatus, value: <Badge tone={connected ? 'paid' : 'warn'} dot>{connected ? S.waOn : S.waOff}</Badge> },
          ]}
        />

        <div className="frame-body welcome-fields">
          <Field label={S.shopName} hint={S.shopHint} error={shopError ? S.shopRequired : ''} htmlFor="welcome-shop">
            <input
              ref={shopRef}
              id="welcome-shop"
              className="input lg"
              value={form.shop_name}
              onChange={e => {
                set('shop_name')(e)
                if (shopError) setShopError(false)
              }}
              placeholder={S.shopPh}
              autoComplete="organization"
              maxLength={60}
              aria-invalid={shopError ? 'true' : undefined}
              required
            />
          </Field>

          <div className="welcome-pair">
            <Field label={S.ownerName} hint={S.ownerHint} htmlFor="welcome-owner">
              <input id="welcome-owner" className="input" value={form.owner_name} onChange={set('owner_name')} placeholder={S.ownerPh} autoComplete="name" maxLength={60} />
            </Field>
            <Field label={S.city} htmlFor="welcome-city">
              <input id="welcome-city" className="input" value={form.city} onChange={set('city')} placeholder={S.cityPh} autoComplete="address-level2" maxLength={60} />
            </Field>
          </div>

          <Field label={S.type} hint={S.typeHint} htmlFor="welcome-type">
            <select id="welcome-type" className="select" value={form.business_type} onChange={set('business_type')}>
              {TYPES.map(t => (
                <option key={t} value={t}>{S.types[t]}</option>
              ))}
            </select>
          </Field>

          <label className="checkbox welcome-voice">
            <input
              type="checkbox"
              checked={form.voice_replies}
              onChange={e => setForm(f => ({ ...f, voice_replies: e.target.checked }))}
              aria-describedby="welcome-voice-hint"
            />
            <span className="welcome-voice-text">
              <span className="welcome-voice-title">{S.voiceTitle}</span>
              <span className="welcome-voice-hint" id="welcome-voice-hint">{S.voiceHint}</span>
            </span>
          </label>

          <fieldset className="welcome-lang">
            <legend className="field-label">{S.langLegend}</legend>
            <div className="welcome-lang-cards">
              <label className="welcome-lang-card" lang="en">
                <input type="radio" name="ui_lang" value="en" checked={lang === 'en'} onChange={() => setLang('en')} />
                <span className="welcome-lang-text">
                  <span className="welcome-lang-name latin">{S.langEn}</span>
                  <span className="welcome-lang-sub latin">{S.langEnSub}</span>
                </span>
                <Icon name="check" className="welcome-lang-check" />
              </label>
              <label className="welcome-lang-card" lang="ur">
                <input type="radio" name="ui_lang" value="ur" checked={lang === 'ur'} onChange={() => setLang('ur')} />
                <span className="welcome-lang-text">
                  <span className="welcome-lang-name ur">{S.langUr}</span>
                  <span className="welcome-lang-sub ur">{S.langUrSub}</span>
                </span>
                <Icon name="check" className="welcome-lang-check" />
              </label>
            </div>
            <p className="field-hint">{S.langHint}</p>
          </fieldset>

          {saveError && (
            <p className="welcome-error" role="alert">
              <Icon name="alert" /> <span>{S.saveError}</span>
            </p>
          )}
        </div>

        <div className="welcome-form-foot">
          <Button type="submit" variant="primary" size="lg" iconEnd="arrow-right" loading={saving}>
            {S.save}
          </Button>
        </div>
      </form>
    </>
  )
}

/* ---------------------------------------------------------------- step 2: first voice note */

function FirstNoteStep({ S, me, headingRef, latest, pending, setPending, live, onEdit }) {
  const kind = TYPES.includes(me.businessType) ? me.businessType : 'other'
  const say = SAY[kind]
  const meaning = S.meaning[kind]
  const selfName = me.whatsapp?.name || me.ownerName || ''
  const liveRef = useRef(null)

  // On a phone the live frame sits below the steps: bring the result into view when it lands.
  const finished = latest && !WORKING.includes(latest.status) ? `${latest.id}:${latest.status}` : null
  useEffect(() => {
    const node = liveRef.current
    if (!finished || !node) return
    const box = node.getBoundingClientRect()
    if (box.top > window.innerHeight - 80 || box.bottom < 0) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [finished])

  const sayCells = [
    ...(meaning ? [{ label: S.meansLabel, value: meaning }] : []),
    {
      label: S.orMixed,
      value: (
        <span className="welcome-pays">
          <span className="welcome-pays-roman latin" dir="ltr">“{SAY.mix.roman}”</span>
          <span className="welcome-pays-urdu ur" lang="ur">{SAY.mix.urdu}</span>
        </span>
      ),
    },
    {
      label: S.whenPays,
      value: (
        <span className="welcome-pays">
          <span className="welcome-pays-roman latin" dir="ltr">“{SAY.pay.roman}”</span>
          <span className="welcome-pays-urdu ur" lang="ur">{SAY.pay.urdu}</span>
        </span>
      ),
    },
  ]

  return (
    <>
      <Head eyebrow={S.s2Eyebrow(me.shopName)} title={S.s2Title} lead={S.s2Lead(me.shopName)} headingRef={headingRef} />

      <section className="welcome-guide" aria-labelledby="welcome-guide-label">
        <p className="label welcome-guide-label" id="welcome-guide-label">{S.guideLabel}</p>
        <ol>
          <li>
            <span className="welcome-guide-n num" aria-hidden="true">[1]</span>
            <div className="welcome-guide-main">
              <h2 className="welcome-guide-title">{S.st1Title}</h2>
              <p className="welcome-guide-text">{S.st1Body}</p>
              <div className="welcome-chatrow" aria-hidden="true" dir="ltr">
                <Avatar name={selfName || S.youAlone} size="sm" />
                <span className="welcome-chatrow-text">
                  <span className="welcome-chatrow-name">{selfName ? `${selfName} ${S.you}` : S.youAlone}</span>
                  <span className="welcome-chatrow-sub">{S.msgYourself}</span>
                </span>
              </div>
            </div>
          </li>
          <li>
            <span className="welcome-guide-n num" aria-hidden="true">[2]</span>
            <div className="welcome-guide-main">
              <h2 className="welcome-guide-title">
                <Icon name="mic" /> {S.st2Title}
              </h2>
              <QuoteCard label={S.sayLabel} cells={sayCells} className="welcome-say">
                <span className="welcome-say-roman latin" lang="en" dir="ltr">“{say.roman}”</span>
                <span className="welcome-say-urdu ur" lang="ur">{say.urdu}</span>
              </QuoteCard>
            </div>
          </li>
          <li>
            <span className="welcome-guide-n num" aria-hidden="true">[3]</span>
            <div className="welcome-guide-main">
              <h2 className="welcome-guide-title">
                {S.st3Title}
                <FootnoteRef n={1} />
              </h2>
              <p className="welcome-guide-text">{S.st3Body}</p>
            </div>
          </li>
        </ol>
      </section>

      <section ref={liveRef} className="frame welcome-live" aria-labelledby="welcome-live-title">
        <div className="frame-head">
          <h2 className="frame-title" id="welcome-live-title">{S.liveTitle}</h2>
          <span className="frame-meta welcome-live-meta">
            <span className={`status-dot ${LIVE_DOT[live]}`} aria-hidden="true" />
            {S.liveState[live]}
          </span>
        </div>
        <div aria-live="polite">
          <LiveState S={S} me={me} latest={latest} pending={pending} live={live} />
        </div>
      </section>

      <TryTyping S={S} example={say.roman} onSending={setPending} />

      <div className="welcome-foot">
        <Button variant="ghost" icon="edit" onClick={onEdit}>
          {S.editShop}
        </Button>
        <Button variant="secondary" to="/app">{S.skip}</Button>
      </div>

      <Footnotes items={[{ lead: S.fnLead, text: S.fnText }]} />
    </>
  )
}

function LiveState({ S, me, latest, pending, live }) {
  const working = latest && WORKING.includes(latest.status)
  if (pending && (!latest || !working)) {
    return (
      <div className="welcome-pad welcome-wait">
        <p className="welcome-wait-title">
          <Spinner /> {S.progress.received}
        </p>
      </div>
    )
  }
  if (!latest) {
    return (
      <div className="welcome-pad welcome-wait">
        <p className="welcome-wait-title">
          <span className="welcome-pulse" aria-hidden="true" /> {S.waiting}
        </p>
        <p className="welcome-wait-text">{S.waitingFrom(me.phoneLocal)}</p>
        {live === 'off' && <p className="welcome-offline">{S.offline}</p>}
      </div>
    )
  }
  if (working) {
    return (
      <>
        <div className="welcome-pad welcome-wait">
          <p className="welcome-wait-title">
            <Spinner /> {S.progress[latest.status]}
          </p>
        </div>
        <Heard S={S} m={latest} />
      </>
    )
  }
  return <Result S={S} m={latest} />
}

/** "You said": the shopkeeper's own voice note and what Hisaab heard. */
function Heard({ S, m }) {
  // An English message can come back with its "Urdu" transcript in Latin letters: show it once, left to right.
  const raw = m.transcript || ''
  const isUrdu = /[؀-ۿ]/.test(raw)
  const urdu = isUrdu ? raw : null
  const plain = s => String(s || '').trim().replace(/[?!.]+$/, '').toLowerCase()
  const roman = m.transcriptRoman || (!urdu ? raw || m.text : null) || null
  const extra = !isUrdu && raw && roman && plain(raw) !== plain(roman) ? raw : null
  if (!urdu && !roman && !m.audioUrl) return null
  return (
    <section className="welcome-cell">
      <h3 className="label">{S.youSaid}</h3>
      {m.audioUrl && <VoiceNote src={m.audioUrl} seconds={m.seconds} />}
      {urdu && <p className="welcome-heard-urdu ur" lang="ur">{urdu}</p>}
      {extra && <p className="welcome-heard-roman latin" dir="ltr">{extra}</p>}
      {roman && <p className="welcome-heard-roman latin" dir="ltr">{roman}</p>}
    </section>
  )
}

function Result({ S, m }) {
  const { lang } = useLang()
  const failed = m.status === 'error'
  const rows = (m.results || []).map(r => describe(r, S, lang)).filter(Boolean)
  return (
    <div className="welcome-result">
      <div className="welcome-pad welcome-result-head">
        <p className={`welcome-result-title ${failed ? 'is-warn' : 'is-ok'}`}>
          <Icon name={failed ? 'alert' : 'check'} />
          <span>{failed ? S.errTitle : S.heard}</span>
        </p>
        {failed && <p className="welcome-result-err">{S.errors[m.error] || S.errors.network}</p>}
      </div>

      <Heard S={S} m={m} />

      {!failed && (
        <section className="welcome-cell">
          <h3 className="label">{S.recorded}</h3>
          {rows.length ? (
            <ul className="welcome-rows">
              {rows.map((row, i) => (
                <li key={i} className={`welcome-row is-${row.tone}`}>
                  <Icon name={row.icon} size="sm" className="welcome-row-icon" />
                  <span className="welcome-row-main">
                    <span className="welcome-row-text">{row.text}</span>
                    {row.balance && <span className="welcome-row-meta">{row.balance}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="welcome-row-meta">{S.r.none}</p>
          )}
        </section>
      )}

      {(m.replyAudioUrl || m.replyText) && (
        <section className="welcome-cell is-reply">
          <h3 className="label">{S.replied}</h3>
          {m.replyAudioUrl && <VoiceNote reply src={m.replyAudioUrl} seconds={m.replySeconds} />}
          {m.replyText && <div className="wa-text welcome-reply-text" dir="ltr" dangerouslySetInnerHTML={{ __html: whatsappHtml(m.replyText) }} />}
        </section>
      )}

      <div className="welcome-pad welcome-result-foot">
        {!failed && (
          <Button variant="primary" size="lg" to="/app" iconEnd="arrow-right">
            {S.openKhata}
          </Button>
        )}
        <p className="welcome-again">{S.again}</p>
      </div>
    </div>
  )
}

/** One result from the AI turned into a plain sentence with the right ink. The customer's Urdu name in the Urdu UI. */
function describe(r, S, lang) {
  const name = (lang === 'ur' && r.customerNameUrdu) || r.customerName || ''
  const owed = v => <Money value={v} tone="owed" />
  const paid = v => <Money value={v} tone="paid" />
  // A supplier's balance is what the shop owes them: the payable colour, and worded the other way round.
  const supplier = r.listKind === 'suppliers' || r.type === 'purchase' || r.type === 'supplier_payment'
  const balance = () => {
    if (r.balance == null || !name) return null
    if (supplier) return r.balance > 0 ? S.youOweNow(name, <Money value={r.balance} tone="payable" />) : S.settledNow(name)
    if (r.balance > 0) return S.owesNow(name, owed(r.balance))
    if (r.balance < 0) return S.advanceNow(name, <Money value={r.balance} tone="neutral" />)
    return S.settledNow(name)
  }
  const listName = r.listName || S.r.general
  if (r.status === 'ok') {
    const type = supplier && r.type === 'credit' ? 'purchase' : supplier && r.type === 'payment' ? 'supplier_payment' : r.type
    switch (type) {
      case 'purchase':
        return { tone: 'neutral', icon: 'arrow-down-left', text: S.r.purchase(name, <Money value={r.amount} tone="payable" />), balance: balance() }
      case 'supplier_payment':
        return { tone: 'neutral', icon: 'arrow-up-right', text: S.r.supplier_payment(name, <Money value={r.amount} tone="neutral" />), balance: balance() }
      case 'create_list':
        return { tone: 'neutral', icon: 'list', text: S.r.create_list(listName) }
      case 'move_to_list':
        return { tone: 'neutral', icon: 'list', text: S.r.move_to_list(name, listName) }
      case 'lists_summary':
        return { tone: 'neutral', icon: 'list', text: S.r.lists_summary }
      case 'credit':
        return { tone: 'owed', icon: 'arrow-up-right', text: S.r.credit(name, owed(r.amount)), balance: balance() }
      case 'payment':
        return { tone: 'paid', icon: 'arrow-down-left', text: S.r.payment(name, paid(r.amount)), balance: balance() }
      case 'undo':
        return { tone: 'neutral', icon: 'refresh', text: S.r.undo, balance: balance() }
      case 'correct':
        return { tone: 'neutral', icon: 'edit', text: S.r.correct(name, <Money value={r.oldAmount} />, <Money value={r.amount} />), balance: balance() }
      case 'set_phone':
        return { tone: 'neutral', icon: 'phone', text: S.r.set_phone(name) }
      case 'reminder':
        return { tone: 'neutral', icon: 'send', text: S.r.reminder(name) }
      case 'help':
        return { tone: 'neutral', icon: 'help', text: S.r.help }
      case 'dashboard_link':
        return { tone: 'neutral', icon: 'link', text: S.r.dashboard_link }
      case 'balance':
      case 'dues_list':
      case 'total_due':
      case 'today_summary':
      case 'full_ledger':
        return { tone: 'neutral', icon: 'book', text: S.r.answered }
      default:
        return null
    }
  }
  switch (r.status) {
    case 'needs_amount':
      return { tone: 'warn', icon: 'alert', text: S.r.needs_amount(name) }
    case 'needs_name':
      return { tone: 'warn', icon: 'alert', text: S.r.needs_name }
    case 'ambiguous':
    case 'confirm':
      return { tone: 'warn', icon: 'alert', text: S.r.ambiguous((r.candidates || []).join(' / ')) }
    case 'not_found':
      return { tone: 'warn', icon: 'alert', text: S.r.not_found(name || '?') }
    case 'already_clear':
      return { tone: 'neutral', icon: 'check', text: S.r.already_clear(name) }
    case 'nothing_to_undo':
      return { tone: 'neutral', icon: 'info', text: S.r.nothing_to_undo }
    case 'bad_phone':
      return { tone: 'warn', icon: 'alert', text: S.r.bad_phone }
    case 'exists':
      return { tone: 'neutral', icon: 'info', text: S.r.exists(r.listName) }
    case 'not_supplier':
      return { tone: 'warn', icon: 'alert', text: S.r.not_supplier(name || '?') }
    case 'list_not_found':
      return { tone: 'warn', icon: 'alert', text: S.r.list_not_found(r.listName) }
    case 'too_many':
      return { tone: 'warn', icon: 'alert', text: S.r.too_many }
    case 'has_entries':
      return { tone: 'warn', icon: 'alert', text: S.r.has_entries(name || '?') }
    default:
      return null
  }
}

function TryTyping({ S, example, onSending }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const regionId = useId()
  const inputId = useId()
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const submit = async e => {
    e.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(false)
    // The server starts publishing progress before this request returns, so mark it pending first.
    onSending(true)
    try {
      await api('/api/messages/text', { method: 'POST', body: { text: value } })
      setText('')
    } catch {
      onSending(false)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="welcome-type">
      <button type="button" className="welcome-type-toggle" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(o => !o)}>
        <Icon name="keyboard" />
        <span>{S.tryToggle}</span>
        <Icon name="chevron-down" className="welcome-type-chev" />
      </button>
      {open && (
        <form id={regionId} className="welcome-type-form" onSubmit={submit}>
          <Field label={S.tryLabel} hint={S.tryHint} error={error ? S.sendError : ''} htmlFor={inputId}>
            <div className="welcome-type-row">
              <input
                ref={inputRef}
                id={inputId}
                className="input"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={example}
                maxLength={500}
                dir="auto"
                autoComplete="off"
              />
              <Button type="submit" variant="primary" icon="send" loading={busy} disabled={!text.trim() || busy}>
                {S.send}
              </Button>
            </div>
          </Field>
        </form>
      )}
    </section>
  )
}
