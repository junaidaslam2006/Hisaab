import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import PaintedSky, { SKY_LOOKS } from '../components/PaintedSky.jsx'
import { Figure, FootnoteRef, Footnotes, Frame, FurtherReading, Legend, QuoteCard, SectionRail, TabPanel, Tabs, Toc } from '../components/editorial.jsx'
import { Badge, Button, Money } from '../components/ui.jsx'
import { dayCount, mmss, whatsappHtml } from '../lib/format.js'
import { useLang, useStrings } from '../lib/i18n.jsx'
import './Landing.css'

// "Introducing Hisaab" — the public landing page, laid out like a model-launch post: painted sky hero with a dotted
// contents list, then one reading column with wide figures, a comparison table, footnotes and further reading.
// Every example comes from one sample shop (balances agree across the page) and uses Hisaab's real reply wording.

const cx = (...parts) => parts.filter(Boolean).join(' ')
const SKY_KEY = 'hisaab-sky'
// Word joiner: keeps a footnote marker on the same line as the word before it.
const NO_BREAK = '⁠'

/* ------------------------------------------------------------------ sample shop (language-neutral data) */

// What the shopkeeper said (Urdu script + Roman), and what Hisaab sent back: the WhatsApp card is always Roman Urdu,
// the spoken reply always Urdu. Wording mirrors server/replies.js.
const HOW_DATA = {
  sale: {
    time: '10:42',
    said: { voice: 4, script: 'عمر نے 500 کا سودا لیا', roman: 'Umar ne 500 ka sauda liya' },
    reply: 'Umar — udhaar *Rs 500* likh diya\nUmar ka kul baqaya: *Rs 500*\n\n_Kul udhaar Rs 9,450 · galti ho to "undo" bolein_',
    spoken: { secs: 6, text: 'عمر کے کھاتے میں 500 روپے لکھ دیے۔ اب عمر کا کل بقایا 500 روپے ہے۔' },
    rows: [{ who: 'umar', kind: 'credit', amount: 500, balance: 500 }],
  },
  payment: {
    time: '10:15',
    said: { voice: 3, script: 'اسد نے 400 واپس دیے', roman: 'Asad ne 400 wapis diye' },
    reply: 'Asad se *Rs 400* wasool\nAsad ka kul baqaya: *Rs 2,600*',
    spoken: { secs: 5, text: 'اسد سے 400 روپے وصول ہو گئے۔ اب اسد کا کل بقایا 2600 روپے ہے۔' },
    rows: [{ who: 'asad', kind: 'payment', amount: 400, balance: 2600 }],
  },
  question: {
    time: '11:20',
    said: { typed: true, roman: 'Gul Khan ka hisaab batao' },
    reply: 'Gul Khan ka kul baqaya: *Rs 2,300*\n_41 din se koi wasooli nahi_',
    spoken: { secs: 3, text: 'گل خان کے ذمے 2300 روپے ہیں۔' },
    read: [{ who: 'gul', balance: 2300, days: 41 }],
  },
  mistake: {
    time: '10:43',
    said: { voice: 2, script: 'نہیں، 450 تھے', roman: 'Nahi, 450 the' },
    reply: 'Umar: ~Rs 500~ → *Rs 450*\nUmar ka kul baqaya: *Rs 450*',
    spoken: { secs: 6, text: 'درست کر دیا، عمر کی انٹری اب 450 روپے ہے۔ اب عمر کا کل بقایا 450 روپے ہے۔' },
    rows: [
      { who: 'umar', kind: 'credit', amount: 500, void: true },
      { who: 'umar', kind: 'credit', amount: 450, balance: 450 },
    ],
  },
}
const HOW_ORDER = ['sale', 'payment', 'question', 'mistake']

// "From voice note to reply": seconds after send (footnote 1). Medians from the October 2026 tests on the pilot
// server: a voice note is understood (Gemini Live) in about 3.5 s and the entry is written straight after; the reply
// (spoken voice note + text card, sent together) arrived about 10 s after sending (15 test notes, 7–18 s).
const TL_MAX = 12
const TL_TICKS = [0, 3, 6, 9, 12]
const TIMELINE = [
  { key: 'arrive', t: 0 },
  { key: 'understood', t: 3.5 },
  { key: 'written', t: 3.7 },
  { key: 'reply', t: 10 },
]

const SAID = [
  { id: 'ur', lang: 'ur', script: 'عمر نے ڈھائی سو کا سودا لیا', roman: 'Umar ne dhai sau ka sauda liya', romanLang: 'ur-Latn', heard: 'dhai sau = 250', wrote: [{ who: 'umar', kind: 'credit', amount: 250 }] },
  // Pashto spelling: ګ (not the Urdu گ), پور = "por" (debt), روپۍ = "rupai"; the verb agrees with روپۍ (feminine plural).
  { id: 'ps', lang: 'ps', script: 'ګل خان پنځه سوه روپۍ سودا په پور واخیسته', roman: 'Gul Khan pinza sawa rupay sauda pa pur wakhista', romanLang: 'ps-Latn', heard: 'pinza sawa = 500', wrote: [{ who: 'gul', kind: 'credit', amount: 500 }] },
  { id: 'pa', lang: 'pnb', script: 'بلال نے ڈیڑھ ہزار دا سودا لیا', roman: 'Bilal ne dedh hazaar da sauda leya', romanLang: 'pnb-Latn', heard: 'dedh hazaar = 1,500', wrote: [{ who: 'bilal', kind: 'credit', amount: 1500 }] },
  { id: 'hno', lang: 'hno', script: 'نوید نے ترے سو واپس دتے', roman: 'Naveed ne trai sau wapas ditte', romanLang: 'hno-Latn', heard: 'trai sau = 300', wrote: [{ who: 'naveed', kind: 'payment', amount: 300 }] },
  { id: 'en', lang: 'en', roman: 'Asad paid back two thousand', romanLang: 'en', heard: 'two thousand = 2,000', wrote: [{ who: 'asad', kind: 'payment', amount: 2000 }] },
  // Urdu and English in one sentence, the way it is said at the counter (also the system check's test sentence).
  {
    id: 'mix',
    lang: 'ur',
    roman: 'Umar ne 500 rupees ka saman liya on credit aur Ahmed paid 300 back',
    romanLang: 'ur-Latn',
    heard: null,
    wrote: [
      { who: 'umar', kind: 'credit', amount: 500 },
      { who: 'ahmed', kind: 'payment', amount: 300 },
    ],
  },
]

// The sample shop's lists. Customers add up to DASH.total (General: Umar 500 + Asad 2,600 + Gul Khan 2,300; Mohalla:
// Naveed 1,850 + Bilal 1,200; Factory wale: Shabbir 1,000). The supplier is the one from the "stock on credit" example.
const LISTS = [
  { id: 'general', people: 3, owed: 5400 },
  { id: 'mohalla', people: 2, owed: 3050 },
  { id: 'factory', people: 1, owed: 1000 },
  { id: 'suppliers', people: 1, owe: 15000 },
]
// Each phrase was understood correctly in the October 2026 tests (eval/cases.json: li21, li11, li09, li10, su01, su05).
const LIST_SAYS = ['make', 'add', 'dues', 'remind', 'stock', 'owe']

// The sample shop's dashboard: Asad 2,600 + Gul Khan 2,300 + Naveed 1,850 + Bilal 1,200 + Shabbir 1,000 + Umar 500.
const DASH = {
  total: 9450,
  oldest: { who: 'gul', days: 41 },
  follow: [
    { who: 'gul', owes: 2300, days: 41 },
    { who: 'naveed', owes: 1850, days: 19 },
    { who: 'bilal', owes: 1200, days: 9 },
  ],
  days: [20, 21, 22, 23, 24, 25, 26],
  given: [1200, 650, 1800, 900, 0, 1400, 500],
  collected: [400, 1000, 300, 1200, 600, 0, 400],
}

const WAVE_A = [5, 8, 12, 9, 14, 11, 7, 13, 16, 10, 7, 12, 15, 9, 6, 9, 13, 10, 6, 9, 12, 7, 5, 4]
const WAVE_B = [6, 9, 7, 12, 15, 10, 13, 8, 6, 11, 14, 12, 8, 10, 13, 9, 7, 11, 8, 6, 9, 12, 8, 5]

/* ------------------------------------------------------------------ strings */

const STRINGS = {
  en: {
    docTitle: 'Introducing Hisaab — the khata that listens',

    eyebrow: 'October 2026',
    titleA: 'Hisaab, the khata',
    titleB: 'that listens',
    toc: {
      introduction: 'Introduction',
      how: 'How it works',
      languages: 'What it understands',
      lists: 'Lists and suppliers',
      dashboard: 'Your dashboard',
      pricing: 'Privacy and pricing',
    },
    skyLabel: 'Sky',
    made: 'Made in Peshawar',

    names: { umar: 'Umar', asad: 'Asad', gul: 'Gul Khan', naveed: 'Naveed', bilal: 'Bilal', shabbir: 'Shabbir', ahmed: 'Ahmed' },
    kinds: { credit: 'Udhaar', payment: 'Payment' },
    sample: 'Sample shop',
    you: 'You',
    hisaab: 'Hisaab',

    introTitle: 'Introduction',
    lead: 'We’re introducing Hisaab, a khata you keep by talking. Send a voice note to your own WhatsApp — “Umar ne 500 ka sauda liya” — and Hisaab writes it in your khata, works out the balance, and tells you back.',
    intro: [
      'A paper register works until a page is smudged, the register goes missing, or nobody can remember when a customer last paid. Hisaab keeps the same khata without the writing: you say it the way you would tell a munshi.',
      { lead: 'Your own WhatsApp.', text: 'There is no new app to install and no new number. Hisaab links to the WhatsApp you already use, the way WhatsApp Web does — with a QR code or a pairing code — and it only reads your “Message yourself” chat.' },
      { lead: 'Your language.', text: 'Speak Urdu, Pashto, Punjabi, Hindko or English — or Urdu and English in the same sentence, the way people talk at the counter: “Umar ne 500 rupees ka saman liya on credit”. Amounts said out loud — “dhai sau”, “dedh hazaar”, “5k”, Pashto “pinza sawa” — are written as Rs 250, Rs 1,500, Rs 5,000 and Rs 500.' },
      { lead: 'Your lists.', text: 'Keep mohalla customers, factory workers and relatives in separate lists, and what the shop owes its suppliers in a khata of its own.' },
      { lead: 'Free while we pilot.', text: 'Hisaab is free during the pilot, for up to 300 messages a day per shop. Your khata stays yours: download it as a CSV file, or delete it, whenever you like.' },
    ],
    connect: 'Connect WhatsApp',
    seeHow: 'See how it works',

    howTitle: 'How it works',
    howLead: 'You talk to yourself on WhatsApp, and Hisaab listens. It works out who the message is about, how much, and whether it was udhaar or a payment — then writes it in your khata and replies in the same chat.',
    steps: [
      'Link your WhatsApp once, by scanning a QR code or with a pairing code.',
      'Send a voice note or a text to your “Message yourself” chat.',
      'Hisaab writes it in your khata and replies with the new balance: a short text card and a spoken voice note in Urdu.',
    ],
    howTabs: 'Examples',
    how: {
      sale: { tab: 'A sale on udhaar', title: 'Umar takes goods on udhaar', note: 'One new row, and Umar’s balance worked out for you.' },
      payment: { tab: 'A payment', title: 'Asad pays back Rs 400', note: 'A payment comes off the balance the same way.' },
      question: { tab: 'A question', title: 'You ask what Gul Khan owes', note: 'Nothing new is written. Hisaab only reads your khata to answer.' },
      mistake: { tab: 'A mistake', title: 'You correct the amount', note: 'The wrong entry stays in the history, crossed out.' },
    },
    onPhone: 'On your phone',
    inKhata: 'In your khata',
    voiceNote: s => `Voice note, ${s} seconds`,
    voiceReply: s => `Spoken reply, ${s} seconds`,
    cols: { customer: 'Customer', entry: 'Entry', balance: 'Balance', unpaid: 'Unpaid for', owes: 'Owes' },
    corrected: 'Corrected',
    noBalance: 'none',
    howCaption: 'Examples from a sample shop. Your own khata shows only your own customers.',

    tl: {
      title: 'From voice note to reply',
      meta: 'Seconds after you press send',
      events: {
        arrive: ['Voice note arrives', '0 s'],
        understood: ['Understood', 'about 3½ s'],
        written: ['Written in your khata', 'right after'],
        reply: ['Spoken reply and text card arrive', 'about 10 s'],
      },
      last: '12 s',
      caption: 'Median timings for short test voice notes on our pilot server, October 2026.',
    },

    compareLead: 'Here is how it compares with the ways shops keep a khata today:',
    compare: {
      cols: ['Paper register', 'Typing apps', 'Hisaab'],
      rows: [
        { label: 'Writing an entry', sub: 'at the counter', cells: ['Pen and paper', 'Find the customer, type the amount', 'Say it in a voice note'] },
        { label: 'Language', sub: 'what you can use', cells: ['Whatever you write in', 'The app’s menus and your keyboard', 'Urdu, English, or both in one sentence; Pashto, Punjabi and Hindko too'] },
        { label: 'Separate lists', sub: 'mohalla, factory, teachers…', cells: ['A page or a register for each', 'Differs from app to app', 'Up to 20 lists, made by voice or on the dashboard'] },
        { label: 'What the shop owes', sub: 'stock taken on credit', cells: ['Another page, added up by hand', 'Differs from app to app', 'A suppliers khata, never mixed into udhaar'] },
        { label: 'Running balance', sub: 'after each entry', cells: ['Added up by hand', 'Worked out for you', 'Worked out, and told back to you'] },
        { label: 'Reminders', sub: 'for customers who owe', cells: ['You ask in person', 'Offered by many apps', 'A polite WhatsApp message, ready for you to send'] },
        { label: 'If the book is lost', sub: 'or the phone', cells: ['The record is gone', 'Depends on the app’s backup', 'Your khata stays online; download it any time'] },
        { label: 'Something new to learn', sub: 'for you or your staff', cells: ['No', 'A new app', 'No — it is your own WhatsApp'] },
      ],
      caption: '“Typing apps” means khata apps where you type each entry yourself. What they offer differs from app to app.',
    },

    langTitle: 'What it understands',
    langLead: 'Speak the way you speak at the counter. Hisaab understands voice notes and texts in Urdu, Pashto, Punjabi, Hindko and English — and Urdu and English mixed in one sentence — including amounts said out loud.',
    langTabs: 'Languages',
    langs: { ur: 'Urdu', ps: 'Pashto', pa: 'Punjabi', hno: 'Hindko', en: 'English', mix: 'Mixed' },
    langNames: { ur: 'Urdu', ps: 'Pashto', pa: 'Punjabi', hno: 'Hindko', en: 'English', mix: 'Urdu and English' },
    said: 'Said',
    language: 'Language',
    heardAs: 'Heard as',
    wrote: 'Hisaab wrote',
    twoEntries: 'Two entries in one message',
    moreTitle: 'Other things you can say',
    more: [
      { say: 'undo', does: 'Cancels the last entry.' },
      { say: 'Nahi, 450 the', does: 'Corrects the amount you just said.' },
      { say: 'Umar ka hisaab batao', does: 'Tells you what Umar owes, and for how many days nothing has been paid.' },
      { say: '1000 se zyada kis ka baqaya hai?', does: 'Lists everyone who owes more than Rs 1,000.' },
      { say: 'Aaj ka hisaab', does: 'Today’s udhaar and payments, in one line.' },
      { say: 'A photo of a page from your paper khata', plain: true, does: 'Writes each row as an entry.' },
      { say: 'Umar ko reminder bhejo', does: 'Prepares a polite message with Umar’s balance. You send it.' },
    ],

    listsTitle: 'Lists, and what you owe',
    listsLead:
      'A shop’s register is rarely one list. Hisaab keeps up to 20 separate lists — mohalla customers, factory workers who pay on salary day, teachers, relatives — and a khata for suppliers, the people the shop itself owes. Make a list by saying so, put a new customer straight into it, and ask about one list at a time.',
    listNames: { general: 'General', mohalla: 'Mohalla', factory: 'Factory wale', suppliers: 'Suppliers' },
    listSub: { general: 'everyone not in a list', mohalla: 'customers', factory: 'customers, pay on salary day', suppliers: 'people the shop owes' },
    listCols: { list: 'List', people: 'People', owed: 'Owed to you', owe: 'You owe' },
    listsCaption: 'The same sample shop: Rs 9,450 of udhaar across three lists, and Rs 15,000 the shop owes its supplier — kept apart, never added to udhaar.',
    listsSayTitle: 'Say it',
    listSays: {
      make: { say: 'Factory workers ki list banao', does: 'Makes a new list.' },
      add: { say: 'Factory list mein naya banda Kashif, 800 ka saman liya', does: 'Opens a khata for Kashif in that list, with Rs 800 udhaar.' },
      dues: { say: 'Mohalla list mein kis kis ka udhaar hai', does: 'Who owes in Mohalla, and how much.' },
      remind: { say: 'Teachers ko reminder bhej do', does: 'A reminder for everyone in Teachers who owes you. You send them.' },
      stock: { say: 'Rehman Traders se 15000 ka stock aaya udhaar pe', does: 'Rs 15,000 you owe Rehman Traders, in the suppliers’ khata.' },
      owe: { say: 'mujhe suppliers ko total kitna dena hai', does: 'What you owe all your suppliers together.' },
    },
    none: '—',

    dashTitle: 'Your dashboard',
    dashLead: 'Every shop gets its own private page, built from its own messages. It shows who owes what and since when, who to follow up with — anyone unpaid for seven days or more — and each customer’s running balance. Every message is kept with its original voice note, next to what Hisaab wrote, and you can talk to Hisaab live from the same page.',
    dash: {
      aria: 'Preview of a sample shop’s dashboard',
      when: 'Today',
      headline: m => <>{m} is out on udhaar.</>,
      lead: (name, days) => `${name} has owed the longest — ${days} days.`,
      follow: 'Follow up',
      followMeta: 'Unpaid 7 days or more',
      chart: 'Last 7 days',
      range: '20–26 Oct',
      given: 'Udhaar given',
      collected: 'Payments received',
      chartSr: 'Udhaar given and payments received in the sample shop, by day in October',
      day: 'Day',
      caption: 'A sample shop. Yours is built only from your own messages.',
    },

    pricingTitle: 'Privacy and pricing',
    pricing: [
      { lead: 'Only one chat is read.', text: 'Hisaab reads your “Message yourself” chat and nothing else — not your chats with customers, family or groups.', ref: 2, after: ' It never messages your customers on its own: when you ask for a reminder, it prepares the message and you decide whether to send it.' },
      { lead: 'Your data is yours.', text: 'Download your whole khata as a CSV file whenever you like. Delete your account from Settings and everything in it goes with it.' },
      { lead: 'No passwords.', text: 'You log in with a six-digit code sent to your own WhatsApp, or with a one-time link.' },
      { lead: 'Free during the pilot.', text: 'Up to 300 messages a day per shop, at no cost.' },
      { lead: 'Who does the listening.', text: 'Voice notes and texts are understood by Google Gemini Live, with Google’s other Gemini models as a backup when Live is busy.', ref: 3, after: ' Hisaab itself is made in Peshawar by TensorMind.' },
    ],

    faqTitle: 'Questions',
    faq: [
      { q: 'Is this the official WhatsApp app?', a: 'No. Hisaab is made by TensorMind in Peshawar, not by WhatsApp or Meta. It joins your WhatsApp as a linked device, the same way WhatsApp Web does, and your phone keeps working normally.' },
      { q: 'Do my customers see anything?', a: 'No. Hisaab only reads and writes in your own “Message yourself” chat. When you ask for a reminder, it prepares the message; whether to send it is up to you.' },
      { q: 'What if Hisaab mishears?', a: 'Every entry is confirmed back to you in the chat. Say “undo” to cancel the last entry, or just say the right amount — “nahi, 450 the”. You can also cancel any entry from the customer’s page in your dashboard.' },
      { q: 'Does it work in Pashto?', a: 'Yes. Speak Pashto, Urdu, Punjabi, Hindko or English, or mix them. Pashto amounts like “pinza sawa” (500) are understood. The spoken reply comes in Urdu.' },
      { q: 'Can I speak English, or mix it with Urdu?', a: 'Yes. “Umar ne 500 rupees ka saman liya on credit aur Ahmed paid 300 back” is written as two entries: Rs 500 udhaar for Umar and Rs 300 received from Ahmed. Plain English works too — “Asad paid back two thousand”.' },
      { q: 'Can I keep separate lists?', a: 'Yes — up to 20, such as mohalla, factory workers, teachers or relatives. Say “Factory workers ki list banao”, or make one in Settings. Everyone not in a list stays in General. Suppliers — the people your shop owes — get a list of their own, and what you owe them is never mixed into your udhaar.' },
      { q: 'What does it cost?', a: 'Nothing during the pilot, for up to 300 messages a day per shop.' },
      { q: 'Can I delete my data?', a: 'Yes. From Settings you can download your khata as a CSV file, and delete your account and everything in it at any time.' },
      { q: 'Do I need a new number or a new phone?', a: 'No. Hisaab uses the WhatsApp you already have. Linking takes a QR scan or a pairing code.' },
    ],

    startTitle: 'Get started',
    login: 'Log in',

    footnotes: [
      { lead: 'Timings.', text: 'Medians from our October 2026 tests on the pilot server with short test voice notes: about 3½ seconds to understand a voice note (about 2 for a typed message), and about 10 seconds from sending to the reply arriving (15 notes, 7 to 18 seconds). Real timings depend on your network, on WhatsApp and on how busy Google is.' },
      { lead: 'Linked devices.', text: 'Hisaab connects through WhatsApp’s linked-devices feature — the one WhatsApp Web uses — not Meta’s business API. You can unlink it at any time from Linked devices in WhatsApp, or from Settings in your dashboard.' },
      { lead: 'Speech understanding.', text: 'Voice notes and texts are sent to Google Gemini to be understood — to Gemini Live first, and also to Google’s standard Gemini models when Live is busy or a voice note is long. Hisaab runs on Google’s free Gemini tier, and Google’s terms for it let Google use what is sent to improve its products. The Privacy page explains what is sent and what is kept.' },
    ],
    further: [
      { text: 'Every sentence Hisaab understands, with examples. Opens in your dashboard after you log in.', label: 'Help guide', to: '/app/help' },
      { text: 'What Hisaab reads, what it keeps, and how to delete it.', label: 'Privacy', to: '/privacy' },
      { text: 'The terms for using Hisaab during the pilot.', label: 'Terms', to: '/terms' },
      { text: 'Already linked your WhatsApp? Your khata is waiting.', label: 'Log in', to: '/login' },
    ],
  },

  // A quoted Latin phrase in an Urdu sentence sits in a U+2066…U+2069 isolate, so digits or brackets after it keep their order.
  ur: {
    docTitle: 'حساب — وہ کھاتہ جو سنتا ہے',

    eyebrow: 'اکتوبر 2026',
    titleA: 'حساب، وہ کھاتہ',
    titleB: 'جو سنتا ہے',
    toc: {
      introduction: 'تعارف',
      how: 'یہ کیسے کام کرتا ہے',
      languages: 'یہ کیا سمجھتا ہے',
      lists: 'لسٹیں اور سپلائرز',
      dashboard: 'آپ کا ڈیش بورڈ',
      pricing: 'رازداری اور قیمت',
    },
    skyLabel: 'آسمان',
    made: 'پشاور میں بنا',

    names: { umar: 'عمر', asad: 'اسد', gul: 'گل خان', naveed: 'نوید', bilal: 'بلال', shabbir: 'شبیر', ahmed: 'احمد' },
    kinds: { credit: 'ادھار', payment: 'وصولی' },
    sample: 'نمونے کی دکان',
    you: 'آپ',
    hisaab: 'حساب',

    introTitle: 'تعارف',
    lead: 'پیش ہے حساب — ایسا کھاتہ جو آپ بول کر رکھتے ہیں۔ اپنے واٹس ایپ پر خود کو وائس نوٹ بھیجیں — "عمر نے 500 کا سودا لیا" — حساب اسے آپ کے کھاتے میں لکھتا ہے، بقایا نکالتا ہے اور آپ کو واپس بتا دیتا ہے۔',
    intro: [
      'کاغذ کا رجسٹر تب تک ٹھیک چلتا ہے جب تک کوئی صفحہ خراب نہ ہو، رجسٹر گم نہ ہو، یا یہ یاد رہے کہ کس گاہک نے آخری بار کب پیسے دیے تھے۔ حساب وہی کھاتہ رکھتا ہے، بس لکھنا نہیں پڑتا: آپ ویسے ہی بولیں جیسے منشی کو بتاتے ہیں۔',
      { lead: 'آپ کا اپنا واٹس ایپ۔', text: 'نہ کوئی نئی ایپ، نہ نیا نمبر۔ حساب آپ کے موجودہ واٹس ایپ سے ویسے ہی جڑتا ہے جیسے واٹس ایپ ویب — QR کوڈ یا پیئرنگ کوڈ سے — اور صرف آپ کی ⁦"Message yourself"⁩ چیٹ پڑھتا ہے۔' },
      { lead: 'آپ کی زبان۔', text: 'اردو، پشتو، پنجابی، ہندکو یا انگریزی میں بولیں — یا ایک ہی جملے میں اردو اور انگریزی، جیسے کاؤنٹر پر بولتے ہیں: ⁦"Umar ne 500 rupees ka saman liya on credit"⁩۔ بول کر بتائی گئی رقمیں — "ڈھائی سو"، "ڈیڑھ ہزار"، ⁦"5k"⁩، پشتو میں ⁦"pinza sawa"⁩ — 250، 1,500، 5,000 اور 500 روپے لکھی جاتی ہیں۔' },
      { lead: 'آپ کی لسٹیں۔', text: 'محلے کے گاہک، فیکٹری کے لوگ اور رشتہ دار الگ الگ لسٹوں میں رکھیں، اور دکان نے سپلائرز کو جو دینا ہے وہ اپنے الگ کھاتے میں۔' },
      { lead: 'پائلٹ کے دوران مفت۔', text: 'پائلٹ کے دوران حساب مفت ہے، ہر دکان کے لیے روزانہ 300 میسج تک۔ کھاتہ آپ کا ہی رہتا ہے: جب چاہیں CSV فائل میں ڈاؤن لوڈ کریں یا حذف کر دیں۔' },
    ],
    connect: 'واٹس ایپ جوڑیں',
    seeHow: 'دیکھیں یہ کیسے کام کرتا ہے',

    howTitle: 'یہ کیسے کام کرتا ہے',
    howLead: 'آپ واٹس ایپ پر خود سے بات کرتے ہیں، حساب سنتا ہے۔ وہ سمجھتا ہے کہ بات کس گاہک کی ہے، کتنے پیسوں کی، اور ادھار ہے یا وصولی — پھر اسے کھاتے میں لکھ کر اسی چیٹ میں جواب دیتا ہے۔',
    steps: [
      'ایک بار اپنا واٹس ایپ جوڑیں — QR کوڈ اسکین کر کے یا پیئرنگ کوڈ سے۔',
      'اپنی ⁦"Message yourself"⁩ چیٹ میں وائس نوٹ یا میسج بھیجیں۔',
      'حساب اسے کھاتے میں لکھ کر نئے بقایا کے ساتھ جواب دیتا ہے: ایک مختصر میسج اور اردو میں بولا ہوا وائس نوٹ۔',
    ],
    howTabs: 'مثالیں',
    how: {
      sale: { tab: 'ادھار سودا', title: 'عمر نے ادھار پر سودا لیا', note: 'ایک نئی لائن، اور عمر کا بقایا خود حساب ہو گیا۔' },
      payment: { tab: 'وصولی', title: 'اسد نے 400 روپے واپس دیے', note: 'وصولی بھی اسی طرح بقایا سے کم ہو جاتی ہے۔' },
      question: { tab: 'سوال', title: 'آپ پوچھتے ہیں کہ گل خان کے ذمے کتنے ہیں', note: 'کچھ نیا نہیں لکھا جاتا۔ حساب جواب دینے کے لیے صرف آپ کا کھاتہ پڑھتا ہے۔' },
      mistake: { tab: 'غلطی', title: 'آپ رقم درست کرواتے ہیں', note: 'غلط اندراج تاریخ میں کٹا ہوا محفوظ رہتا ہے۔' },
    },
    onPhone: 'آپ کے فون پر',
    inKhata: 'آپ کے کھاتے میں',
    voiceNote: s => `وائس نوٹ، ${s} سیکنڈ`,
    voiceReply: s => `بولا ہوا جواب، ${s} سیکنڈ`,
    cols: { customer: 'گاہک', entry: 'اندراج', balance: 'بقایا', unpaid: 'کب سے باقی', owes: 'ذمے' },
    corrected: 'درست کیا گیا',
    noBalance: 'کوئی نہیں',
    howCaption: 'نمونے کی دکان سے مثالیں۔ آپ کے کھاتے میں صرف آپ کے اپنے گاہک ہوں گے۔',

    tl: {
      title: 'وائس نوٹ سے جواب تک',
      meta: 'بھیجنے کے بعد کتنے سیکنڈ',
      events: {
        arrive: ['وائس نوٹ پہنچا', '0 سیکنڈ'],
        understood: ['بات سمجھ لی', 'تقریباً ساڑھے تین سیکنڈ'],
        written: ['کھاتے میں لکھ دیا', 'فوراً بعد'],
        reply: ['بولا ہوا جواب اور جوابی میسج پہنچے', 'تقریباً 10 سیکنڈ'],
      },
      last: '12 سیکنڈ',
      caption: 'ہمارے پائلٹ سرور پر مختصر ٹیسٹ وائس نوٹس کے درمیانی اوقات، اکتوبر 2026۔',
    },

    compareLead: 'دکانیں آج جس طرح کھاتہ رکھتی ہیں، ان کے مقابلے میں حساب:',
    compare: {
      cols: ['کاغذ کا رجسٹر', 'ٹائپ والی ایپس', 'حساب'],
      rows: [
        { label: 'اندراج کرنا', sub: 'کاؤنٹر پر', cells: ['قلم اور کاغذ', 'گاہک ڈھونڈیں، رقم ٹائپ کریں', 'وائس نوٹ میں بول دیں'] },
        { label: 'زبان', sub: 'کیا استعمال کر سکتے ہیں', cells: ['جس میں بھی لکھیں', 'ایپ کے مینو اور آپ کا کی بورڈ', 'اردو، انگریزی، یا ایک جملے میں دونوں؛ پشتو، پنجابی اور ہندکو بھی'] },
        { label: 'الگ الگ لسٹیں', sub: 'محلہ، فیکٹری، ٹیچرز…', cells: ['ہر ایک کا الگ صفحہ یا رجسٹر', 'ہر ایپ میں الگ', 'زیادہ سے زیادہ 20 لسٹیں، بول کر یا ڈیش بورڈ سے'] },
        { label: 'دکان نے جو دینا ہے', sub: 'ادھار پر لیا گیا مال', cells: ['ایک اور صفحہ، ہاتھ سے جمع', 'ہر ایپ میں الگ', 'سپلائرز کا الگ کھاتہ، ادھار میں کبھی شامل نہیں'] },
        { label: 'بقایا', sub: 'ہر اندراج کے بعد', cells: ['ہاتھ سے جمع کریں', 'خود حساب ہو جاتا ہے', 'خود حساب ہو کر آپ کو بتا دیا جاتا ہے'] },
        { label: 'یاد دہانی', sub: 'جن کے ذمے پیسے ہیں', cells: ['خود جا کر مانگیں', 'کئی ایپس میں ہوتی ہے', 'واٹس ایپ کا شائستہ پیغام، بھیجنے کے لیے تیار'] },
        { label: 'اگر رجسٹر گم ہو جائے', sub: 'یا فون', cells: ['ریکارڈ ختم', 'ایپ کے بیک اپ پر منحصر', 'کھاتہ آن لائن رہتا ہے؛ جب چاہیں ڈاؤن لوڈ کریں'] },
        { label: 'کچھ نیا سیکھنا', sub: 'آپ کو یا عملے کو', cells: ['نہیں', 'ایک نئی ایپ', 'نہیں — یہ آپ کا اپنا واٹس ایپ ہے'] },
      ],
      caption: '"ٹائپ والی ایپس" سے مراد وہ کھاتہ ایپس ہیں جن میں ہر اندراج خود ٹائپ کرنا پڑتا ہے۔ ہر ایپ کی سہولتیں الگ ہوتی ہیں۔',
    },

    langTitle: 'یہ کیا سمجھتا ہے',
    langLead: 'ویسے ہی بولیں جیسے کاؤنٹر پر بولتے ہیں۔ حساب اردو، پشتو، پنجابی، ہندکو اور انگریزی میں وائس نوٹ اور میسج سمجھتا ہے — ایک ہی جملے میں ملی اردو اور انگریزی بھی — اور بول کر بتائی گئی رقمیں بھی۔',
    langTabs: 'زبانیں',
    langs: { ur: 'اردو', ps: 'پشتو', pa: 'پنجابی', hno: 'ہندکو', en: 'انگریزی', mix: 'ملی جلی' },
    langNames: { ur: 'اردو', ps: 'پشتو', pa: 'پنجابی', hno: 'ہندکو', en: 'انگریزی', mix: 'اردو اور انگریزی' },
    said: 'کہا گیا',
    language: 'زبان',
    heardAs: 'سمجھا گیا',
    wrote: 'حساب نے لکھا',
    twoEntries: 'ایک میسج میں دو اندراج',
    moreTitle: 'اور کیا کہہ سکتے ہیں',
    more: [
      { say: 'undo', does: 'آخری اندراج منسوخ کر دیتا ہے۔' },
      { say: 'Nahi, 450 the', does: 'ابھی بتائی گئی رقم درست کر دیتا ہے۔' },
      { say: 'Umar ka hisaab batao', does: 'بتاتا ہے کہ عمر کے ذمے کتنے ہیں، اور کتنے دن سے کوئی وصولی نہیں ہوئی۔' },
      { say: '1000 se zyada kis ka baqaya hai?', does: 'ان سب کی فہرست جن کے ذمے 1,000 روپے سے زیادہ ہیں۔' },
      { say: 'Aaj ka hisaab', does: 'آج کا ادھار اور وصولی، ایک ہی لائن میں۔' },
      { say: 'کاغذی کھاتے کے صفحے کی تصویر', plain: true, does: 'ہر لائن کو الگ اندراج کے طور پر لکھ دیتا ہے۔' },
      { say: 'Umar ko reminder bhejo', does: 'عمر کے بقایا کے ساتھ ایک شائستہ پیغام تیار کرتا ہے۔ بھیجتے آپ خود ہیں۔' },
    ],

    listsTitle: 'لسٹیں، اور جو آپ نے دینا ہے',
    listsLead:
      'دکان کا رجسٹر کم ہی ایک فہرست ہوتا ہے۔ حساب 20 تک الگ الگ لسٹیں رکھتا ہے — محلے کے گاہک، تنخواہ والے دن پیسے دینے والے فیکٹری کے لوگ، ٹیچرز، رشتہ دار — اور سپلائرز کا کھاتہ، یعنی وہ لوگ جن کے پیسے دکان نے دینے ہیں۔ بول کر لسٹ بنائیں، نئے گاہک کو سیدھا اس میں ڈالیں، اور ایک ایک لسٹ کے بارے میں پوچھیں۔',
    listNames: { general: 'عام کھاتہ', mohalla: 'محلہ', factory: 'فیکٹری والے', suppliers: 'سپلائرز' },
    listSub: { general: 'جو کسی لسٹ میں نہیں', mohalla: 'گاہک', factory: 'گاہک، تنخواہ پر دیتے ہیں', suppliers: 'جن کے پیسے دکان نے دینے ہیں' },
    listCols: { list: 'لسٹ', people: 'لوگ', owed: 'آپ کے لینے ہیں', owe: 'آپ نے دینے ہیں' },
    listsCaption: 'وہی نمونے کی دکان: تین لسٹوں میں 9,450 روپے ادھار، اور 15,000 روپے جو دکان نے اپنے سپلائر کو دینے ہیں — الگ رکھے، ادھار میں کبھی شامل نہیں۔',
    listsSayTitle: 'بول کر',
    listSays: {
      make: { say: 'Factory workers ki list banao', does: 'نئی لسٹ بناتا ہے۔' },
      add: { say: 'Factory list mein naya banda Kashif, 800 ka saman liya', does: 'اس لسٹ میں کاشف کا کھاتہ کھول کر 800 روپے ادھار لکھتا ہے۔' },
      dues: { say: 'Mohalla list mein kis kis ka udhaar hai', does: 'محلہ والی لسٹ میں کس کے ذمے کتنے ہیں۔' },
      remind: { say: 'Teachers ko reminder bhej do', does: 'ٹیچرز والی لسٹ میں جس جس کے ذمے پیسے ہیں، سب کے لیے یاد دہانی۔ بھیجتے آپ خود ہیں۔' },
      stock: { say: 'Rehman Traders se 15000 ka stock aaya udhaar pe', does: 'سپلائرز کے کھاتے میں لکھتا ہے کہ آپ نے رحمان ٹریڈرز کو 15,000 روپے دینے ہیں۔' },
      owe: { say: 'mujhe suppliers ko total kitna dena hai', does: 'سب سپلائرز کو ملا کر آپ نے کتنا دینا ہے۔' },
    },
    none: '—',

    dashTitle: 'آپ کا ڈیش بورڈ',
    dashLead: 'ہر دکان کو اپنا الگ صفحہ ملتا ہے، جو صرف اس کے اپنے میسجز سے بنتا ہے۔ اس میں دکھتا ہے کہ کس کے ذمے کتنے ہیں اور کب سے، کس سے پیسے مانگنے ہیں — جن کی سات دن یا زیادہ سے کوئی وصولی نہیں — اور ہر گاہک کا چلتا بقایا۔ ہر میسج اپنے اصل وائس نوٹ کے ساتھ محفوظ رہتا ہے، ساتھ لکھا ہوتا ہے کہ حساب نے کیا لکھا، اور اسی صفحے سے آپ حساب سے براہِ راست بات بھی کر سکتے ہیں۔',
    dash: {
      aria: 'نمونے کی دکان کے ڈیش بورڈ کی جھلک',
      when: 'آج',
      headline: m => <>{m} کا ادھار باقی ہے۔</>,
      lead: (name, days) => `سب سے پرانا بقایا ${name} کا ہے — ${days} دن۔`,
      follow: 'پیسے مانگنے ہیں',
      followMeta: 'سات دن یا زیادہ سے وصولی نہیں',
      chart: 'پچھلے 7 دن',
      range: '20–26 اکتوبر',
      given: 'دیا گیا ادھار',
      collected: 'وصولی',
      chartSr: 'نمونے کی دکان میں اکتوبر کے ہر دن دیا گیا ادھار اور وصولی',
      day: 'دن',
      caption: 'یہ نمونے کی دکان ہے۔ آپ کا ڈیش بورڈ صرف آپ کے اپنے میسجز سے بنتا ہے۔',
    },

    pricingTitle: 'رازداری اور قیمت',
    pricing: [
      { lead: 'صرف ایک چیٹ پڑھی جاتی ہے۔', text: 'حساب آپ کی ⁦"Message yourself"⁩ چیٹ کے سوا کچھ نہیں پڑھتا — نہ گاہکوں کی چیٹ، نہ گھر والوں کی، نہ گروپس۔', ref: 2, after: ' یہ آپ کے گاہکوں کو خود سے کبھی میسج نہیں کرتا: یاد دہانی مانگیں تو پیغام تیار کر دیتا ہے، بھیجنا ہے یا نہیں، یہ آپ طے کرتے ہیں۔' },
      { lead: 'آپ کا ڈیٹا آپ کا ہے۔', text: 'پورا کھاتہ جب چاہیں CSV فائل میں ڈاؤن لوڈ کریں۔ سیٹنگز سے اکاؤنٹ حذف کریں تو اس کا سارا ڈیٹا بھی ساتھ حذف ہو جاتا ہے۔' },
      { lead: 'کوئی پاس ورڈ نہیں۔', text: 'لاگ ان کے لیے چھ ہندسوں کا کوڈ آپ کے اپنے واٹس ایپ پر آتا ہے، یا ایک بار چلنے والا لنک۔' },
      { lead: 'پائلٹ کے دوران مفت۔', text: 'ہر دکان کے لیے روزانہ 300 میسج تک، بغیر کسی خرچ کے۔' },
      { lead: 'سننے کا کام کون کرتا ہے۔', text: 'وائس نوٹ اور میسج گوگل جیمنائی لائیو (⁦Google Gemini Live⁩) سمجھتا ہے، اور جب لائیو مصروف ہو تو گوگل کے دوسرے جیمنائی ماڈل۔', ref: 3, after: ' حساب خود پشاور میں TensorMind نے بنایا ہے۔' },
    ],

    faqTitle: 'سوالات',
    faq: [
      { q: 'کیا یہ واٹس ایپ کی اپنی سروس ہے؟', a: 'نہیں۔ حساب پشاور میں TensorMind نے بنایا ہے، واٹس ایپ یا میٹا نے نہیں۔ یہ آپ کے واٹس ایپ سے linked device کے طور پر جڑتا ہے، بالکل واٹس ایپ ویب کی طرح، اور آپ کا فون معمول کے مطابق چلتا رہتا ہے۔' },
      { q: 'کیا میرے گاہکوں کو کچھ نظر آتا ہے؟', a: 'نہیں۔ حساب صرف آپ کی اپنی ⁦"Message yourself"⁩ چیٹ میں پڑھتا اور لکھتا ہے۔ یاد دہانی مانگیں تو پیغام تیار کر دیتا ہے؛ بھیجنا ہے یا نہیں، یہ آپ طے کرتے ہیں۔' },
      { q: 'اگر حساب غلط سن لے تو؟', a: 'ہر اندراج کی تصدیق اسی چیٹ میں آپ کو واپس آتی ہے۔ ⁦"undo"⁩ کہیں تو آخری اندراج منسوخ ہو جاتا ہے، یا صحیح رقم بول دیں — ⁦"nahi, 450 the"⁩۔ ڈیش بورڈ میں گاہک کے صفحے سے بھی کوئی بھی اندراج منسوخ کر سکتے ہیں۔' },
      { q: 'کیا یہ پشتو میں چلتا ہے؟', a: 'جی ہاں۔ پشتو، اردو، پنجابی، ہندکو یا انگریزی میں بولیں، یا ملا جلا کر۔ پشتو رقمیں جیسے ⁦"pinza sawa"⁩ (500) بھی سمجھ آتی ہیں۔ بولا ہوا جواب اردو میں آتا ہے۔' },
      { q: 'کیا انگریزی میں، یا اردو کے ساتھ ملا کر بول سکتے ہیں؟', a: 'جی ہاں۔ ⁦"Umar ne 500 rupees ka saman liya on credit aur Ahmed paid 300 back"⁩ دو اندراج بن کر لکھا جاتا ہے: عمر کے 500 روپے ادھار اور احمد سے 300 روپے وصول۔ صرف انگریزی بھی چلتی ہے — ⁦"Asad paid back two thousand"⁩۔' },
      { q: 'کیا میں الگ الگ لسٹیں رکھ سکتا ہوں؟', a: 'جی ہاں — 20 تک، جیسے محلہ، فیکٹری کے لوگ، ٹیچرز یا رشتہ دار۔ بولیں ⁦"Factory workers ki list banao"⁩، یا سیٹنگز میں بنائیں۔ جو کسی لسٹ میں نہیں وہ عام کھاتے میں رہتے ہیں۔ سپلائرز — جن کے پیسے آپ کی دکان نے دینے ہیں — کی اپنی لسٹ ہوتی ہے، اور جو آپ نے انہیں دینا ہے وہ کبھی آپ کے ادھار میں شامل نہیں ہوتا۔' },
      { q: 'اس کے کتنے پیسے لگتے ہیں؟', a: 'پائلٹ کے دوران کچھ نہیں — ہر دکان کے لیے روزانہ 300 میسج تک۔' },
      { q: 'کیا میں اپنا ڈیٹا حذف کر سکتا ہوں؟', a: 'جی ہاں۔ سیٹنگز سے کھاتہ CSV فائل میں ڈاؤن لوڈ کریں، اور جب چاہیں اکاؤنٹ اور اس کا سارا ڈیٹا حذف کر دیں۔' },
      { q: 'کیا نیا نمبر یا نیا فون چاہیے؟', a: 'نہیں۔ حساب آپ کا موجودہ واٹس ایپ استعمال کرتا ہے۔ جوڑنے کے لیے QR کوڈ اسکین کریں یا پیئرنگ کوڈ ڈالیں۔' },
    ],

    startTitle: 'شروع کریں',
    login: 'لاگ ان',

    footnotes: [
      { lead: 'اوقات۔', text: 'اکتوبر 2026 میں ہمارے پائلٹ سرور پر مختصر ٹیسٹ وائس نوٹس کی درمیانی پیمائش: وائس نوٹ سمجھنے میں تقریباً ساڑھے تین سیکنڈ (لکھے پیغام میں تقریباً 2)، اور بھیجنے سے جواب پہنچنے تک تقریباً 10 سیکنڈ (15 نوٹ، 7 سے 18 سیکنڈ)۔ اصل وقت آپ کے انٹرنیٹ، واٹس ایپ اور گوگل کی مصروفیت پر منحصر ہے۔' },
      { lead: 'Linked devices۔', text: 'حساب واٹس ایپ کے linked devices فیچر سے جڑتا ہے — وہی جو واٹس ایپ ویب استعمال کرتا ہے — میٹا کی بزنس API سے نہیں۔ آپ اسے کسی بھی وقت واٹس ایپ میں Linked devices سے، یا ڈیش بورڈ کی سیٹنگز سے الگ کر سکتے ہیں۔' },
      { lead: 'آواز کی سمجھ۔', text: 'وائس نوٹ اور میسج سمجھنے کے لیے گوگل جیمنائی کو بھیجے جاتے ہیں — پہلے جیمنائی لائیو کو، اور اس کے مصروف ہونے پر یا لمبے وائس نوٹ کے لیے ساتھ ہی گوگل کے عام جیمنائی ماڈلز کو بھی۔ حساب گوگل جیمنائی کی مفت سطح (free tier) پر چلتا ہے، اور اس کی شرائط کے تحت گوگل بھیجا گیا مواد اپنی سروسز بہتر بنانے کے لیے استعمال کر سکتا ہے۔ رازداری کے صفحے پر لکھا ہے کہ کیا بھیجا جاتا ہے اور کیا محفوظ رہتا ہے۔' },
    ],
    further: [
      { text: 'ہر وہ جملہ جو حساب سمجھتا ہے، مثالوں کے ساتھ۔ لاگ ان کے بعد ڈیش بورڈ میں کھلتا ہے۔', label: 'مدد کی گائیڈ', to: '/app/help' },
      { text: 'حساب کیا پڑھتا ہے، کیا رکھتا ہے، اور اسے کیسے حذف کریں۔', label: 'رازداری', to: '/privacy' },
      { text: 'پائلٹ کے دوران حساب استعمال کرنے کی شرائط۔', label: 'شرائط', to: '/terms' },
      { text: 'واٹس ایپ پہلے سے جڑا ہے؟ آپ کا کھاتہ انتظار کر رہا ہے۔', label: 'لاگ ان', to: '/login' },
    ],
  },
}

/* ------------------------------------------------------------------ pieces */

function readLook() {
  try {
    const saved = localStorage.getItem(SKY_KEY)
    if (SKY_LOOKS.some(l => l.id === saved)) return saved
  } catch {}
  return 'day'
}

function Wave({ bars }) {
  return (
    <svg className="launch-vn-wave" viewBox={`0 0 ${bars.length * 4} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((h, i) => (
        <rect key={i} x={i * 4} y={(20 - h) / 2} width="2" height={h} rx="1" />
      ))}
    </svg>
  )
}

/** A still picture of a voice note (the real player needs a recording): sunk pill for you, sage pill for Hisaab. */
function VoiceChip({ secs, reply, label }) {
  return (
    <span className={cx('launch-vn', reply && 'reply on-sage')}>
      <span className="launch-vn-play" aria-hidden="true">
        <Icon name="play" />
      </span>
      <Wave bars={reply ? WAVE_B : WAVE_A} />
      <span className="launch-vn-time num" aria-hidden="true">
        {mmss(secs)}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function KhataTable({ d, S, lang }) {
  if (d.read) {
    return (
      <table className="grid-table launch-mini">
        <thead>
          <tr>
            <th scope="col">{S.cols.customer}</th>
            <th scope="col" className="hl end">{S.cols.balance}</th>
            <th scope="col" className="end">{S.cols.unpaid}</th>
          </tr>
        </thead>
        <tbody>
          {d.read.map(r => (
            <tr key={r.who}>
              <th scope="row">{S.names[r.who]}</th>
              <td className="hl end">
                <Money value={r.balance} tone="owed" />
              </td>
              <td className="end num">{dayCount(r.days, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <table className="grid-table launch-mini">
      <thead>
        <tr>
          <th scope="col">{S.cols.customer}</th>
          <th scope="col" className="end">{S.cols.entry}</th>
          <th scope="col" className="hl end">{S.cols.balance}</th>
        </tr>
      </thead>
      <tbody>
        {d.rows.map((r, i) => {
          const amount = <Money value={r.amount} tone={r.kind === 'credit' ? 'owed' : 'paid'} sign={r.kind} />
          return (
            <tr key={i} className={r.void ? 'is-void' : undefined}>
              <th scope="row">{S.names[r.who]}</th>
              <td className="end">
                {r.void ? <s>{amount}</s> : amount}
                <span className="sub">{r.void ? S.corrected : S.kinds[r.kind]}</span>
              </td>
              <td className="hl end">{r.void ? <span className="launch-none">{S.noBalance}</span> : <Money value={r.balance} tone="owed" />}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** One worked example: the self-chat on the left, the khata row it produced on the right. */
function HowExample({ id, S, lang }) {
  const d = HOW_DATA[id]
  const t = S.how[id]
  return (
    <Frame title={t.title} meta={S.sample} flush>
      <div className="launch-how-cols">
        <div className="launch-col">
          <p className="label launch-col-label">{S.onPhone}</p>
          <div className="launch-msg">
            <p className="label launch-msg-meta">
              {S.you} · <span className="num">{d.time}</span>
            </p>
            {d.said.typed ? (
              <p className="launch-typed latin" lang="ur-Latn" dir="ltr">
                {d.said.roman}
              </p>
            ) : (
              <>
                <VoiceChip secs={d.said.voice} label={S.voiceNote(d.said.voice)} />
                <p className="launch-said">
                  <span className="launch-said-script ur" lang="ur">
                    {d.said.script}
                  </span>
                  <span className="launch-said-roman latin" lang="ur-Latn" dir="ltr">
                    “{d.said.roman}”
                  </span>
                </p>
              </>
            )}
          </div>
          <div className="launch-msg">
            <p className="label launch-msg-meta">
              {S.hisaab} · <span className="num">{d.time}</span>
            </p>
            {/* WhatsApp order: the voice note arrives first, then the text card. */}
            <VoiceChip reply secs={d.spoken.secs} label={S.voiceReply(d.spoken.secs)} />
            <p className="launch-spoken ur" lang="ur">
              {d.spoken.text}
            </p>
            <div className="launch-reply">
              <p className="wa-text latin" lang="ur-Latn" dir="ltr" dangerouslySetInnerHTML={{ __html: whatsappHtml(d.reply) }} />
            </div>
          </div>
        </div>
        <div className="launch-col">
          <p className="label launch-col-label">{S.inKhata}</p>
          <KhataTable d={d} S={S} lang={lang} />
          <p className="launch-col-note">{t.note}</p>
        </div>
      </div>
    </Frame>
  )
}

/** "From voice note to reply": one row per step, a dot at the moment it happens on a 0–8 s axis. */
function Timeline({ S }) {
  return (
    <Frame title={S.tl.title} meta={S.tl.meta} legend={[{ label: S.you, tone: 'neutral' }, { label: S.hisaab, tone: 'sage' }]}>
      <ol className="launch-tl-rows">
        {TIMELINE.map((e, i) => {
          const [label, when] = S.tl.events[e.key]
          const prev = i ? TIMELINE[i - 1].t : 0
          return (
            <li key={e.key} style={{ '--t': e.t / TL_MAX, '--p': prev / TL_MAX }}>
              <span className="launch-tl-label">
                {label}
                <span className="launch-tl-when"> {when}</span>
              </span>
              <span className="launch-tl-track" aria-hidden="true">
                {i > 0 && <span className="launch-tl-seg" />}
                <span className="launch-tl-dot" />
              </span>
            </li>
          )
        })}
      </ol>
      <div className="launch-tl-axis" aria-hidden="true">
        <span />
        <span className="launch-tl-ticks">
          {TL_TICKS.map(n => (
            <span key={n} className="launch-tl-tick num" style={{ '--t': n / TL_MAX }}>
              <span>{n === TL_MAX ? S.tl.last : n}</span>
            </span>
          ))}
        </span>
      </div>
    </Frame>
  )
}

/** Language quote cards: the active card, with the next one peeking at the inline-end edge on wide screens. */
function Quotes({ S, value, onChange }) {
  const idx = Math.max(0, SAID.findIndex(x => x.id === value))
  return (
    <div className="launch-quotes">
      <Tabs id="said" controls="said-panel" label={S.langTabs} value={value} onChange={onChange} tabs={SAID.map(x => ({ value: x.id, label: S.langs[x.id] }))} />
      <TabPanel tabsId="said" value={value} className="launch-quote-track">
        {SAID.map((x, i) => {
          const active = i === idx
          return (
            <div key={x.id} className={cx('launch-quote-slide', active && 'is-active')} style={{ '--i': idx }} aria-hidden={active ? undefined : true} inert={!active}>
              <QuoteCard
                label={S.said}
                cells={[
                  { label: S.language, value: S.langNames[x.id] },
                  {
                    label: S.heardAs,
                    value: x.heard ? (
                      <span className="latin" dir="ltr">
                        {x.heard}
                      </span>
                    ) : (
                      S.twoEntries
                    ),
                  },
                  {
                    label: S.wrote,
                    value: x.wrote.map((w, j) => (
                      <span key={j} className="launch-wrote">
                        {S.names[w.who]} · {S.kinds[w.kind]} <Money value={w.amount} tone={w.kind === 'credit' ? 'owed' : 'paid'} />
                      </span>
                    )),
                  },
                ]}
              >
                {/* Pashto letters (ځ ۍ ې) are outside the Urdu Nastaliq font: the shared .ps class sets Pashto in Naskh. */}
                {x.script && (
                  <span className={cx('launch-quote-script', x.lang === 'ps' ? 'ps' : 'ur')} lang={x.lang}>
                    {x.script}
                  </span>
                )}
                <span className={cx('launch-quote-roman latin', x.script && 'is-second')} lang={x.romanLang} dir="ltr">
                  “{x.roman}”
                </span>
              </QuoteCard>
            </div>
          )
        })}
      </TabPanel>
    </div>
  )
}

/** The sample shop's lists: what each holds, with udhaar and what the shop owes in separate columns. */
function ListsFigure({ S }) {
  return (
    <Figure wide wash="sage" caption={S.listsCaption} className="launch-lists-fig">
      <div className="grid-table-wrap">
        <table className="grid-table stack-sm launch-lists">
          <thead>
            <tr>
              <th scope="col">{S.listCols.list}</th>
              <th scope="col" className="end">
                {S.listCols.people}
              </th>
              <th scope="col" className="end">
                {S.listCols.owed}
              </th>
              <th scope="col" className="end">
                {S.listCols.owe}
              </th>
            </tr>
          </thead>
          <tbody>
            {LISTS.map(l => (
              <tr key={l.id} className={l.owe ? 'is-suppliers' : undefined}>
                <th scope="row">
                  {S.listNames[l.id]}
                  <span className="sub">{S.listSub[l.id]}</span>
                </th>
                <td className="end num" data-label={S.listCols.people}>
                  {l.people}
                </td>
                <td className="end" data-label={S.listCols.owed}>
                  {l.owed ? <Money value={l.owed} tone="owed" /> : <span className="launch-none">{S.none}</span>}
                </td>
                <td className="end" data-label={S.listCols.owe}>
                  {l.owe ? <Money value={l.owe} tone="neutral" /> : <span className="launch-none">{S.none}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

function MiniChart() {
  const W = 320
  const H = 156
  const L = 30
  const R = 10
  const T = 12
  const B = 26
  const max = 2000
  const x = i => L + (i * (W - L - R)) / (DASH.days.length - 1)
  const y = v => T + (1 - v / max) * (H - T - B)
  const path = vals => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <g className="grid">
        {[0, 1000, 2000].map(v => (
          <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      {[0, 1000, 2000].map(v => (
        <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end">
          {v ? `${v / 1000}k` : '0'}
        </text>
      ))}
      <path className="line owed" d={path(DASH.given)} />
      <path className="line paid" d={path(DASH.collected)} />
      {DASH.given.map((v, i) => (
        <circle key={`g${i}`} className="marker owed" cx={x(i)} cy={y(v)} r="4" />
      ))}
      {DASH.collected.map((v, i) => (
        <circle key={`c${i}`} className="marker paid" cx={x(i)} cy={y(v)} r="4" />
      ))}
      {DASH.days.map((d, i) => (
        <text key={d} x={x(i)} y={H - 7} textAnchor="middle">
          {d}
        </text>
      ))}
    </svg>
  )
}

function DashPreview({ S, lang }) {
  const D = S.dash
  return (
    <Figure wide wash="heather" caption={D.caption} className="launch-dash-fig">
      <div className="launch-dash" role="group" aria-label={D.aria}>
        <div className="launch-dash-top">
          <Badge className="outline">{S.sample}</Badge>
          <span className="meta">{D.when}</span>
        </div>
        <p className="launch-dash-title">{D.headline(<Money value={DASH.total} tone="owed" />)}</p>
        <p className="launch-dash-lead">{D.lead(S.names[DASH.oldest.who], DASH.oldest.days)}</p>
        <div className="launch-dash-grid">
          <div className="launch-dash-block">
            <div className="launch-dash-head">
              <h3 className="launch-dash-h">{D.follow}</h3>
              <span className="meta">{D.followMeta}</span>
            </div>
            <table className="grid-table launch-dash-table">
              <thead>
                <tr>
                  <th scope="col">{S.cols.customer}</th>
                  <th scope="col" className="hl end">{S.cols.owes}</th>
                  <th scope="col" className="end">{S.cols.unpaid}</th>
                </tr>
              </thead>
              <tbody>
                {DASH.follow.map(r => (
                  <tr key={r.who}>
                    <th scope="row">{S.names[r.who]}</th>
                    <td className="hl end">
                      <Money value={r.owes} tone="owed" />
                    </td>
                    <td className="end num">{dayCount(r.days, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="launch-dash-block">
            <div className="launch-dash-head">
              <h3 className="launch-dash-h">{D.chart}</h3>
              <span className="meta">{D.range}</span>
            </div>
            <Legend
              items={[
                { label: D.given, tone: 'owed' },
                { label: D.collected, tone: 'paid' },
              ]}
            />
            <MiniChart />
            {/* A table ignores width: 1px, so the visually-hidden box is a wrapper around it. */}
            <div className="sr-only">
              <table>
                <caption>{D.chartSr}</caption>
                <thead>
                  <tr>
                    <th scope="col">{D.day}</th>
                    <th scope="col">{D.given}</th>
                    <th scope="col">{D.collected}</th>
                  </tr>
                </thead>
                <tbody>
                  {DASH.days.map((d, i) => (
                    <tr key={d}>
                      <th scope="row">{d}</th>
                      <td>
                        <Money value={DASH.given[i]} />
                      </td>
                      <td>
                        <Money value={DASH.collected[i]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Figure>
  )
}

/* ------------------------------------------------------------------ page */

export default function Landing() {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const { hash, key } = useLocation()
  const heroRef = useRef(null)
  const [look, setLook] = useState(readLook)
  const [how, setHow] = useState('sale')
  const [said, setSaid] = useState('ur')
  const [railOn, setRailOn] = useState(false)

  useEffect(() => {
    const previous = document.title
    document.title = S.docTitle
    return () => {
      document.title = previous
    }
  }, [S.docTitle])

  // PublicLayout scrolls to "/#section" targets and to the top when the path changes. The one case it leaves out:
  // plain "/" again while already on this page (the logo from "/#pricing"): start at the top, not mid-page.
  useEffect(() => {
    if (!hash && key !== 'default') window.scrollTo(0, 0)
  }, [hash, key])

  // The section rail stays out of the painted hero; it appears once the hero is half gone.
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setRailOn(true)
      return
    }
    const io = new IntersectionObserver(([entry]) => setRailOn(!entry.isIntersecting), { rootMargin: '-50% 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const chooseLook = id => {
    setLook(id)
    try {
      localStorage.setItem(SKY_KEY, id)
    } catch {}
  }

  const sky = SKY_LOOKS.find(l => l.id === look) || SKY_LOOKS[0]
  const toc = [
    { label: S.toc.introduction, href: '#introduction' },
    { label: S.toc.how, href: '#how-it-works' },
    { label: S.toc.languages, href: '#languages' },
    { label: S.toc.lists, href: '#lists' },
    { label: S.toc.dashboard, href: '#dashboard' },
    { label: S.toc.pricing, href: '#pricing' },
  ]
  const sections = [
    { id: 'introduction', label: S.toc.introduction },
    { id: 'how-it-works', label: S.toc.how },
    { id: 'languages', label: S.toc.languages },
    { id: 'lists', label: S.toc.lists },
    { id: 'dashboard', label: S.toc.dashboard },
    { id: 'pricing', label: S.toc.pricing },
    { id: 'faq', label: S.faqTitle },
  ]

  return (
    <div className="launch">
      {/* Hero: the painted sky, a date, the staggered title and the contents. */}
      <header ref={heroRef} className={cx('launch-hero', sky.text === 'light' && 'on-dark')} data-look={sky.id} data-text={sky.text}>
        <PaintedSky look={sky.id} />
        <div className="launch-hero-body">
          <p className="eyebrow launch-eyebrow">{S.eyebrow}</p>
          <h1 className="hero-title launch-title">
            <span>{S.titleA}</span>
            <span>{S.titleB}</span>
          </h1>
          <Toc variant="hero" items={toc} className="launch-toc" />
        </div>
        <div className="launch-hero-foot">
          <div className="launch-looks" role="group" aria-label={S.skyLabel}>
            {SKY_LOOKS.map(l => {
              const name = l.label[lang] || l.label.en
              return (
                <button key={l.id} type="button" className="launch-look" aria-pressed={sky.id === l.id} aria-label={name} title={name} onClick={() => chooseLook(l.id)} style={{ '--swatch': l.swatch }}>
                  <span className="launch-look-dot" />
                </button>
              )
            })}
          </div>
          <p className="launch-made">{S.made}</p>
        </div>
      </header>

      <article className="article prose launch-article">
        {/* 1. Introduction */}
        <section className="launch-section launch-intro" id="introduction" aria-labelledby="introduction-h">
          <h2 id="introduction-h" className="sr-only">
            {S.introTitle}
          </h2>
          <p className="lead">{S.lead}</p>
          {S.intro.map((p, i) =>
            typeof p === 'string' ? (
              <p key={i}>{p}</p>
            ) : (
              <p key={i}>
                <strong>{p.lead}</strong> {p.text}
              </p>
            ),
          )}
          <div className="cluster launch-cta">
            <Button variant="primary" icon="whatsapp" to="/connect">
              {S.connect}
            </Button>
            <Button variant="secondary" href="#how-it-works">
              {S.seeHow}
            </Button>
          </div>
        </section>

        {/* 2. How it works */}
        <section className="launch-section" id="how-it-works" aria-labelledby="how-h">
          <h2 id="how-h">{S.howTitle}</h2>
          <p>{S.howLead}</p>
          <ol className="launch-steps">
            {S.steps.map((step, i) => (
              <li key={i}>
                <span className="launch-step-n num" aria-hidden="true">
                  [{i + 1}]
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <Figure wide caption={S.howCaption}>
            <div className="tabs-block">
              <Tabs id="how" controls="how-panel" label={S.howTabs} value={how} onChange={setHow} tabs={HOW_ORDER.map(id => ({ value: id, label: S.how[id].tab }))} />
              <TabPanel tabsId="how" value={how}>
                <HowExample id={how} S={S} lang={lang} />
              </TabPanel>
            </div>
          </Figure>

          <Figure
            wide
            caption={
              <>
                {S.tl.caption}
                {NO_BREAK}
                <FootnoteRef n={1} />
              </>
            }
          >
            <Timeline S={S} />
          </Figure>

          <p>{S.compareLead}</p>
          <div className="grid-table-wrap wide launch-compare">
            <table className="grid-table stack-sm">
              <caption>{S.compare.caption}</caption>
              <thead>
                <tr>
                  <td />
                  {S.compare.cols.map((c, i) => (
                    <th key={c} scope="col" className={i === 2 ? 'hl' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {S.compare.rows.map(r => (
                  <tr key={r.label}>
                    <th scope="row">
                      {r.label}
                      <span className="sub">{r.sub}</span>
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={i === 2 ? 'hl' : undefined} data-label={S.compare.cols[i]}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. What it understands */}
        <section className="launch-section" id="languages" aria-labelledby="languages-h">
          <h2 id="languages-h">{S.langTitle}</h2>
          <p>{S.langLead}</p>
          <Quotes S={S} value={said} onChange={setSaid} />
          <h3>{S.moreTitle}</h3>
          <dl className="launch-says">
            {S.more.map(m => (
              <div key={m.say} className="launch-say">
                <dt className={m.plain ? 'is-plain' : 'latin'} lang={m.plain ? undefined : 'ur-Latn'} dir={m.plain ? undefined : 'ltr'}>
                  {m.plain ? m.say : `“${m.say}”`}
                </dt>
                <dd>{m.does}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 4. Lists and suppliers */}
        <section className="launch-section" id="lists" aria-labelledby="lists-h">
          <h2 id="lists-h">{S.listsTitle}</h2>
          <p>{S.listsLead}</p>
          <ListsFigure S={S} />
          <h3>{S.listsSayTitle}</h3>
          <dl className="launch-says">
            {LIST_SAYS.map(k => (
              <div key={k} className="launch-say">
                <dt className="latin" lang="ur-Latn" dir="ltr">
                  “{S.listSays[k].say}”
                </dt>
                <dd>{S.listSays[k].does}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 5. Your dashboard */}
        <section className="launch-section" id="dashboard" aria-labelledby="dashboard-h">
          <h2 id="dashboard-h">{S.dashTitle}</h2>
          <p>{S.dashLead}</p>
          <DashPreview S={S} lang={lang} />
        </section>

        {/* 6. Privacy and pricing */}
        <section className="launch-section" id="pricing" aria-labelledby="pricing-h">
          <h2 id="pricing-h">{S.pricingTitle}</h2>
          {S.pricing.map(p => (
            <p key={p.lead}>
              <strong>{p.lead}</strong> {p.text}
              {p.ref && (
                <>
                  {NO_BREAK}
                  <FootnoteRef n={p.ref} />
                </>
              )}
              {p.after}
            </p>
          ))}
        </section>

        {/* 7. Questions */}
        <section className="launch-section" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">{S.faqTitle}</h2>
          <div className="launch-faq">
            {S.faq.map(f => (
              <details key={f.q} className="launch-qa">
                <summary>
                  <span className="launch-q">{f.q}</span>
                  <Icon name="plus" className="launch-qa-icon" />
                </summary>
                <p className="launch-a">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 8. Get started, then the end matter */}
        <section className="launch-section launch-start" aria-labelledby="start-h">
          <h2 id="start-h">{S.startTitle}</h2>
          <div className="cluster">
            <Button variant="primary" icon="whatsapp" to="/connect">
              {S.connect}
            </Button>
            <Button variant="secondary" to="/login">
              {S.login}
            </Button>
          </div>
        </section>

        <Footnotes items={S.footnotes} />
        <FurtherReading items={S.further.map(f => ({ text: f.text, link: { label: f.label, to: f.to } }))} />
      </article>

      <div className={cx('launch-rail', railOn && 'is-on')}>
        <SectionRail sections={sections} />
      </div>
    </div>
  )
}
