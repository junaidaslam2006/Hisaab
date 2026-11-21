import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FootnoteRef, Footnotes, FurtherReading, SectionRail, Toc } from '../components/editorial.jsx'
import { Button, Money, PageHeader, Skeleton } from '../components/ui.jsx'
import { useCommon, useStrings } from '../lib/i18n.jsx'
import { useMe } from '../lib/me.jsx'
import { useResource } from '../lib/useResource.js'
import { useHashScroll } from '../lib/useHashScroll.js'
import './Help.css'

// What the shopkeeper says on WhatsApp — the same in both interface languages.
// `n` = the example customer: { r: Roman name, u: Urdu name }. `tag` = a small label above the phrase; `ps` = the
// script line is Pashto (set in Naskh).
// Every phrase here was understood correctly by the production setup (Gemini Live first) in October 2026: most are
// cases from eval/cases.json (text and/or synthesised voice), the rest were run through brain.understand() one by one.
// Typed messages go to gemini-2.5-flash-native-audio-latest first (LIVE_TEXT_MODELS). Its 31 Oct samples, --path live,
// no retries: 20/20 texts (urdu_script, code_mixed, multi_entry, english, numbers, roman_urdu, chitchat_unclear; eval/
// README.md) and 31/32 texts behind the lists, suppliers, questions, undo, Pashto, Punjabi, phone and reminder rows
// (li01 li02 li04 li05 li08 li10 li11 li22 su01–05 su07 su09 qu02–05 qu11 qu12 uc01–03 uc08 ps01 ps06 ps09 pa01 pa06
// ph01 rm05; 0 wrong, the 32nd a "1011 Internal error" close, which goes on to the next Live model).
const SAY = {
  credit: { ur: n => `${n.u} نے 500 کا سودا لیا`, ro: n => `${n.r} ne 500 ka sauda liya` },
  words: { ur: () => 'زبیر نے ڈھائی سو کا دودھ لیا', ro: () => 'Zubair ne dhai sau ka doodh liya' },
  pashto: { tag: 'pashto', ps: true, ur: n => `${n.u} پنځه سوه روپۍ سودا په پور واخیسته`, ro: n => `${n.r} pinza sawa rupay sauda pa pur wakhista` },
  punjabi: { tag: 'punjabi', ro: n => `${n.r} ne panj sau da saman leya` },
  payment: { ur: n => `${n.u} نے 300 واپس دیے`, ro: n => `${n.r} ne 300 wapis diye` },
  full: { ur: () => 'اسد نے پورا حساب چکا دیا', ro: () => 'Asad ne poora hisaab chuka diya' },
  mixCredit: { tag: 'mixed', ur: n => `${n.u} نے پانچ سو rupees کا سامان لیا on credit`, ro: n => `${n.r} ne 500 rupees ka saman liya on credit` },
  mixReceived: { tag: 'mixed', ur: n => `${n.u} سے دو ہزار received ہو گئے`, ro: n => `${n.r} se 2k received` },
  mixK: { tag: 'mixed', ro: n => `3k likh do ${n.r} ke naam` },
  mixBalance: { tag: 'mixed', ur: n => `${n.u} کا balance کیا ہے؟`, ro: n => `${n.r} ka balance kya hai` },
  enCredit: { tag: 'english', ro: n => `${n.r} took goods worth 500 on credit` },
  enPaid: { tag: 'english', ro: n => `${n.r} paid me 300` },
  enOwe: { tag: 'english', ro: n => `How much does ${n.r} owe me?` },
  multiTwo: { ur: () => 'نوید نے سات سو کا سامان لیا اور اسد نے چار سو واپس کیے', ro: () => 'Naveed ne 700 ka saman liya aur Asad ne 400 wapas kiye' },
  multiThree: { ur: () => 'عمر پانچ سو، احمد تین سو، بلال دو سو، سب نے ادھار لیا', ro: () => 'Umar 500, Ahmed 300, Bilal 200 — sab ne udhaar liya' },
  multiEnglish: { tag: 'english', ro: () => 'Umar took 400, Ahmed paid 250, and Bilal took 1100' },
  multiSame: { ur: () => 'عمر نے پانچ سو دیے اور تین سو کا نیا سامان لے گیا', ro: () => 'Umar ne 500 diye aur 300 ka naya saman le gaya' },
  cancelOne: { ro: () => 'Bilal wali entry cancel karo' },
  undo: { ur: () => 'پچھلی انٹری غلط تھی، کینسل کر دیں', ro: () => 'undo · galti ho gayi, pichli entry cancel karo' },
  correct: { ur: () => 'نہیں، 400 تھے', ro: () => 'Nahi, 400 the' },
  lookup: { ur: n => `${n.u} کا حساب بتاؤ`, ro: n => `${n.r} ka hisaab batao` },
  over: { ur: () => '1000 سے زیادہ کس کس کا ادھار ہے؟', ro: () => 'kis kis pe 1000 se zyada udhaar hai' },
  total: { ur: () => 'کل ادھار کتنا ہے؟', ro: () => 'Kul kitna udhaar hai?' },
  today: { ur: () => 'آج کا حساب', ro: () => 'Aaj ka hisaab' },
  ledger: { ur: () => 'پورا کھاتہ بھیجو', ro: () => 'Poora khata bhejo' },
  help: { ur: () => 'مدد', ro: () => 'help · madad' },
  listCreate: { ur: () => 'ایک نئی list بناؤ رشتہ دار کے نام سے', ro: () => 'ek nayi list banao Rishtedar ke naam se' },
  listCreateEn: { tag: 'english', ro: () => 'make a new list called Drivers' },
  listNew: { ur: () => 'فیکٹری list میں نیا بندہ کاشف، آٹھ سو کا سامان لیا', ro: () => 'Factory list mein naya banda Kashif, 800 ka saman liya' },
  listMove: { ur: n => `${n.u} کو محلہ والی list میں ڈال دو`, ro: n => `${n.r} ko Mohalla list mein daal do` },
  listMoveEn: { tag: 'english', ro: () => 'put Waqas in the teachers list' },
  listDues: { ur: () => 'محلہ list میں کس کس کا ادھار ہے؟', ro: () => 'Mohalla list mein kis kis ka udhaar hai' },
  listTotal: { ur: () => 'فیکٹری والوں کا ٹوٹل کتنا ہے؟', ro: () => 'Factory walon ka total kitna hai' },
  listRemind: { ur: () => 'ٹیچرز کو reminder بھیج دو', ro: () => 'Teachers ko reminder bhej do' },
  listAll: { ro: () => 'meri saari lists dikhao · lists' },
  supBuy: { ur: () => 'رحمان ٹریڈرز سے پندرہ ہزار کا stock آیا ادھار پر', ro: () => 'Rehman Traders se 15000 ka stock aaya udhaar pe' },
  supBuyEn: { tag: 'english', ro: () => 'Got stock worth 12000 from Haji Bashir on credit' },
  supNew: { ro: () => 'naye supplier Al Madina Traders se 30 hazaar ka ghee udhaar liya' },
  supPay: { ur: () => 'حاجی بشیر کو دس ہزار دے دیے', ro: () => 'Haji Bashir ko 10 hazaar de diye' },
  supPayEn: { tag: 'english', ro: () => 'paid Rehman Traders 5000 today' },
  supOwe: { ur: () => 'مجھے suppliers کو ٹوٹل کتنا دینا ہے؟', ro: () => 'mujhe suppliers ko total kitna dena hai' },
  supOweOne: { tag: 'english', ro: () => 'how much do I owe Rehman Traders?' },
  phone: {
    ur: n => (
      <>
        {n.u} کا نمبر <bdi dir="ltr">0300 1234567</bdi> ہے
      </>
    ),
    ro: n => `${n.r} ka number 0300 1234567 hai`,
  },
  reminder: { ur: n => `${n.u} کو یاد دہانی بھیجو`, ro: n => `${n.r} ko yaad dihani bhejo` },
  dashboard: { tag: 'typed', ro: () => 'dashboard' },
}

// Section order and rows. Rows without a SAY entry are actions, written in the interface language (`act`).
const SECTIONS = [
  { id: 'help-udhaar', rows: ['credit', 'words', 'pashto', 'punjabi'] },
  { id: 'help-payment', rows: ['payment', 'full'] },
  { id: 'help-mixed', rows: ['mixCredit', 'mixReceived', 'mixK', 'mixBalance', 'enCredit', 'enPaid', 'enOwe'] },
  { id: 'help-multi', rows: ['multiTwo', 'multiThree', 'multiEnglish', 'multiSame', 'cancelOne'] },
  { id: 'help-mistakes', rows: ['undo', 'correct'] },
  { id: 'help-questions', rows: ['lookup', 'over', 'total', 'today', 'ledger', 'help'] },
  { id: 'help-lists', rows: ['listCreate', 'listCreateEn', 'listNew', 'listMove', 'listMoveEn', 'listDues', 'listTotal', 'listRemind', 'listAll'] },
  { id: 'help-suppliers', rows: ['supBuy', 'supBuyEn', 'supNew', 'supPay', 'supPayEn', 'supOwe', 'supOweOne'] },
  { id: 'help-reminders', rows: ['phone', 'reminder'] },
  { id: 'help-photos', rows: ['photoPage', 'photoBill'] },
  { id: 'help-dashboard', rows: ['dashToday', 'dashCustomer', 'dashMessages', 'dashCall'] },
  { id: 'help-login', rows: ['dashboard', 'loginCode', 'signOut'] },
]

// Used when the shop has no customer with both a Roman and an Urdu name yet.
const DEFAULT_NAME = { r: 'Umar', u: 'عمر' }

const STRINGS = {
  en: {
    eyebrow: 'Help',
    title: 'How to talk to Hisaab',
    // The shop name may be in either script: FSI…PDI (U+2068…U+2069) keeps its punctuation on its own side.
    lead: shop => `Send a voice note or a text to your own WhatsApp chat, and Hisaab keeps ${shop ? `⁨${shop}⁩’s` : 'your'} khata. Here is everything it understands.`,
    contents: 'Contents',
    intro: [
      {
        lead: 'Open your own chat.',
        text: ({ phone }) => (
          <>
            The chat with your own number{phone ? <> (<bdi className="num">{phone}</bdi>)</> : null} — near the top, marked “You”, or tap New chat and choose
            “Message yourself”.
            <FootnoteRef n={1} />
          </>
        ),
      },
      {
        lead: 'Say it like the register.',
        text: ({ name }) => (
          <>
            Hold the mic and say who took what, or who paid: “<bdi>{name.r} ne 500 ka sauda liya</bdi>”. Typing works too.
          </>
        ),
      },
      {
        lead: 'Hisaab writes it and replies.',
        text: ({ voice }) => (
          <>
            In a few seconds
            <FootnoteRef n={2} />{' '}
            {voice ? (
              'you get a short text and an Urdu voice note with the new balance.'
            ) : (
              <>
                you get a short text with the new balance (voice replies are off in <Link to="/app/settings">Settings</Link>).
              </>
            )}{' '}
            The entry shows up on this dashboard too.
          </>
        ),
      },
    ],
    examplesNote: c => (
      <>
        Many of the examples below use <bdi className="help-name">{c.r}</bdi>, a customer from your own khata. Any customer’s name works the same way.
      </>
    ),
    cols: ['You say', 'Hisaab does'],
    tags: { pashto: 'Pashto', punjabi: 'Punjabi', typed: 'Type it', mixed: 'Urdu + English', english: 'English' },
    sec: {
      'help-udhaar': {
        title: 'Recording an udhaar',
        intro: 'Say who took what, and for how much — the way you would write it in the register. A new name gets a new khata.',
        after: [
          () => (
            <>
              <strong>Your language.</strong> Urdu, Pashto, Punjabi, Hindko, English, or a mix — speak the way you normally do (more in{' '}
              <a href="#help-mixed">Speak your way</a>). Amounts can be in words
              <FootnoteRef n={3} />, and you can send as many voice notes as you need through the day
              <FootnoteRef n={4} />.
            </>
          ),
        ],
      },
      'help-payment': {
        title: 'A payment',
        intro: 'When someone pays, say who paid and how much. What they owe goes down by that much, and the reply tells you what is left.',
      },
      'help-mixed': {
        title: 'Speak your way',
        intro: 'Nobody at a counter speaks one language. Say it in Urdu, in English, or in both in the same sentence — “on credit”, “received”, “balance”, “5k” all work.',
        after: [
          () => (
            <>
              <strong>Every phrase on this page was tested.</strong> Each one was understood correctly by Hisaab in our October 2026 tests — as typed text, and many
              of them as voice notes too
              <FootnoteRef n={5} />. The reply always repeats what was written, so a mishearing is easy to catch.
            </>
          ),
        ],
      },
      'help-multi': {
        title: 'Many entries in one voice note',
        intro: 'At the end of a busy hour, say everything in one go. Hisaab writes each entry separately, in its own customer’s khata.',
        after: [
          () => (
            <>
              <strong>The reply.</strong> With three or more entries, the reply comes as a numbered list with each person’s new balance, and one total
              at the end. To cancel just one of them, say that person’s name with it.
            </>
          ),
        ],
      },
      'help-lists': {
        title: 'Lists',
        intro: 'Keep people apart the way your register does — mohalla customers, factory workers who pay on salary day, teachers, relatives. Everyone not in a list is in General.',
        after: [
          () => (
            <>
              <strong>On the dashboard.</strong> Create, rename and delete lists in <Link to="/app/settings#set-lists">Settings</Link>, and see each
              list’s people in <Link to="/app/customers">Customers</Link>. A shop can have up to 20 lists.
            </>
          ),
          () => (
            <>
              <strong>Reminders for a whole list.</strong> Hisaab prepares one message per person who owes, with a WhatsApp link for those whose number
              is saved. Nothing is sent until you tap it.
            </>
          ),
        ],
      },
      'help-suppliers': {
        title: 'Suppliers',
        intro: 'Hisaab also keeps what your shop owes — to the wholesaler, the distributor, the haji sahib who sends the sugar. Say who you took stock from, or who you paid.',
        after: [
          () => (
            <>
              <strong>Kept apart from udhaar.</strong> What you owe suppliers is never added to your udhaar total, follow-ups or reminders. A new
              supplier goes into your suppliers list — Hisaab makes one called Suppliers if you have none.
            </>
          ),
          () => (
            <>
              <strong>A customer’s name by mistake?</strong> If you say you took stock from someone who is a customer, Hisaab writes nothing and asks
              you first.
            </>
          ),
        ],
      },
      'help-mistakes': {
        title: 'Fixing a mistake',
        intro: 'Every entry is repeated back to you in the reply. If something is wrong, say so straight away.',
        after: [
          () => (
            <>
              <strong>Two khatas for one person?</strong> If Hisaab heard a name differently and made a second khata (say “Umer” next to “Umar”), open that
              customer from <Link to="/app/customers">Customers</Link> and merge the two khatas.
            </>
          ),
        ],
      },
      'help-questions': {
        title: 'Asking questions',
        intro: 'Ask about your khata the way you would ask a munshi. Hisaab answers in the same chat.',
      },
      'help-reminders': {
        title: 'Reminders',
        intro: 'Hisaab never messages your customers by itself. It prepares a polite message with the balance, and you decide whether to send it.',
        after: [
          () => 'You can prepare the same reminder from a customer’s page on this dashboard.',
          () => (
            <>
              <strong>Your payment details.</strong> Add your own JazzCash, Easypaisa, Raast or bank details in{' '}
              <Link to="/app/settings#set-pay">Settings</Link>, and every reminder tells the customer where to pay. Hisaab only prints them; it never
              moves money.
            </>
          ),
        ],
      },
      'help-photos': {
        title: 'Photos of your paper khata',
        intro: 'Already keep a paper register? Take a clear photo of a page and send it to yourself.',
        cols: ['You send', 'Hisaab does'],
        after: [() => 'Check the reply: it lists what Hisaab wrote, so you can fix anything it misread.'],
      },
      'help-dashboard': {
        title: 'The dashboard',
        intro: 'Everything you send is written here too, as it happens — no refresh needed.',
        cols: ['You open', 'You find'],
        after: [
          () => (
            <>
              <strong>If WhatsApp disconnects,</strong> a bar appears at the top of this dashboard. Reconnect from <Link to="/app/settings">Settings</Link>.
              Voice notes sent while it was disconnected may be missed — check <Link to="/app/activity">Messages</Link> and send them again.
            </>
          ),
          () => (
            <>
              <strong>Your data.</strong> In <Link to="/app/settings">Settings</Link>, download your whole khata as a file that opens in Excel, or delete
              everything for good.
            </>
          ),
        ],
      },
      'help-login': {
        title: 'Logging in',
        intro: 'There are no passwords. Your own WhatsApp is the key.',
        cols: ['You do', 'Hisaab does'],
        after: [
          () => (
            <>
              <strong>Who else can see my khata?</strong> Only someone signed in with your WhatsApp number. Every shop on Hisaab sees only its own customers
              and entries — so never share a login code or link.
            </>
          ),
        ],
      },
    },
    act: {
      photoPage: () => 'A photo of a handwritten khata page',
      photoBill: () => 'A photo of a bill, with the customer’s name in the caption',
      dashToday: () => <Link to="/app">Today</Link>,
      dashCustomer: () => (
        <>
          A customer, from <Link to="/app/customers">Customers</Link>
        </>
      ),
      dashMessages: () => <Link to="/app/activity">Messages</Link>,
      dashCall: () => 'A call with Hisaab',
      loginCode: () => 'Your number, on the login page',
      signOut: () => (
        <>
          Sign out, in <Link to="/app/settings">Settings</Link>
        </>
      ),
    },
    what: {
      credit: { t: 'Udhaar', b: ({ r, m }) => <>Writes {m(500)} udhaar in {r}’s khata.</> },
      words: {
        t: 'Amounts in words',
        b: ({ m }) => (
          <>
            “dhai sau” is written as {m(250)} and “saadhe teen hazaar” as {m(3500)}. Sawa, dedh, paune and lakh work too.
          </>
        ),
      },
      pashto: { t: 'In Pashto', b: ({ r, m }) => <>“pinza sawa” is 500: writes {m(500)} udhaar for {r}.</> },
      punjabi: { t: 'In Punjabi', b: ({ r, m }) => <>“panj sau” is 500: writes {m(500)} udhaar for {r}.</> },
      payment: { t: 'Payment received', b: ({ r, m }) => <>Writes {m(300)} received from {r}.</> },
      full: { t: 'Paid everything', b: () => 'Records a payment for Asad’s whole balance, so the khata is clear.' },
      mixCredit: { t: 'Udhaar, said both ways', b: ({ r, m }) => <>“on credit” means udhaar: writes {m(500)} in {r}’s khata.</> },
      mixReceived: { t: 'A payment', b: ({ r, m }) => <>“received” means a payment, and “2k” is 2,000: writes {m(2000)} received from {r}.</> },
      mixK: { t: 'Amounts like 3k', b: ({ r, m }) => <>Writes {m(3000)} udhaar for {r}. “1.5k” is 1,500.</> },
      mixBalance: { t: 'A balance question', b: ({ r }) => <>Tells you what {r} owes. Nothing is written.</> },
      enCredit: { t: 'Udhaar in English', b: ({ r, m }) => <>Writes {m(500)} udhaar for {r}.</> },
      enPaid: { t: 'A payment in English', b: ({ r, m }) => <>Writes {m(300)} received from {r}.</> },
      enOwe: { t: 'A question in English', b: ({ r }) => <>Tells you what {r} owes.</> },
      multiTwo: { t: 'Two people, two entries', b: ({ m }) => <>{m(700)} udhaar for Naveed, and {m(400)} received from Asad.</> },
      multiThree: { t: 'A quick list', b: ({ m }) => <>Three udhaar entries: Umar {m(500)}, Ahmed {m(300)}, Bilal {m(200)}.</> },
      multiEnglish: { t: 'The same in English', b: ({ m }) => <>Udhaar {m(400)} for Umar, {m(250)} received from Ahmed, udhaar {m(1100)} for Bilal.</> },
      multiSame: { t: 'One person, both ways', b: ({ m }) => <>Umar paid {m(500)} and took {m(300)} more: two entries in his khata.</> },
      cancelOne: { t: 'Cancel just one', b: () => 'Cancels Bilal’s last entry and leaves the others.' },
      undo: { t: 'Undo', b: () => 'Cancels the last entry. Say it right after the mistake.' },
      correct: { t: 'Fix the amount', b: ({ m }) => <>Changes the last entry to {m(400)}.</> },
      lookup: { t: 'One customer’s hisaab', b: ({ r }) => <>How much {r} owes, and how many days since the last payment.</> },
      over: { t: 'Who owes more than…', b: ({ m }) => <>Everyone who owes more than {m(1000)}. Say “kis kis ka udhaar hai” for everyone.</> },
      total: { t: 'Total udhaar', b: () => 'The total udhaar you have given out, and how many people owe it.' },
      today: { t: 'Today’s summary', b: () => 'Udhaar given today and payments received today.' },
      ledger: { t: 'Full khata', b: () => 'Every customer’s balance in one message, with the total.' },
      help: { t: 'Examples', b: () => 'A short list of examples, right in your chat.' },
      listCreate: { t: 'Make a list', b: () => 'Makes a new list called Rishtedar. Nobody is moved into it.' },
      listCreateEn: { t: 'In English', b: () => 'Makes a list called Drivers.' },
      listNew: { t: 'A new person, straight into a list', b: ({ m }) => <>Opens a khata for Kashif in the Factory list and writes {m(800)} udhaar.</> },
      listMove: { t: 'Move someone', b: ({ r }) => <>Moves {r} into Mohalla. Their khata and balance stay the same.</> },
      listMoveEn: { t: 'In English', b: () => 'Moves Waqas into Teachers.' },
      listDues: { t: 'Who owes, in one list', b: () => 'Everyone in Mohalla who owes you, with how much.' },
      listTotal: { t: 'One list’s total', b: () => 'The total udhaar of the Factory list.' },
      listRemind: { t: 'Remind a whole list', b: () => 'Prepares a reminder for everyone in Teachers who owes you.' },
      listAll: { t: 'All your lists', b: () => 'Each list, how many people are in it, and its total. Typing just “lists” works too.' },
      supBuy: { t: 'Stock taken on credit', b: ({ m }) => <>Writes {m(15000)} that you owe Rehman Traders.</> },
      supBuyEn: { t: 'In English', b: ({ m }) => <>Writes {m(12000)} that you owe Haji Bashir.</> },
      supNew: { t: 'A new supplier', b: ({ m }) => <>Opens a supplier khata for Al Madina Traders, with {m(30000)} owed.</> },
      supPay: { t: 'You paid a supplier', b: ({ m }) => <>Writes {m(10000)} paid to Haji Bashir; what you owe him goes down.</> },
      supPayEn: { t: 'In English', b: ({ m }) => <>Writes {m(5000)} paid to Rehman Traders.</> },
      supOwe: { t: 'What you owe in total', b: () => 'The total you owe all your suppliers together.' },
      supOweOne: { t: 'What you owe one supplier', b: () => 'What you owe Rehman Traders right now.' },
      phone: { t: 'Save a number', b: ({ r }) => <>Saves {r}’s WhatsApp number, so reminders open their chat directly.</> },
      reminder: {
        t: 'Payment reminder',
        b: ({ r }) => <>Prepares a polite message with {r}’s balance and a link to send it. Nothing goes to the customer until you tap Send.</>,
      },
      photoPage: {
        t: 'One entry per line',
        b: () => 'Reads each line — name and amount — and writes it as udhaar. A line marked paid, wapis or jama is written as a payment.',
      },
      photoBill: { t: 'One udhaar', b: () => 'Writes the bill as one udhaar for the customer named in the caption.' },
      dashToday: { t: 'Who owes what', b: () => 'What is out on udhaar, who to follow up — no payment for 7 days or more — and today’s entries.' },
      dashCustomer: { t: 'Their whole khata', b: () => 'Every entry with the running balance after it, and a reminder ready to send.' },
      dashMessages: { t: 'What Hisaab heard', b: () => 'Every voice note you sent, with what Hisaab heard and what it wrote.' },
      dashCall: { t: 'Talk instead of typing', b: () => 'Start a live call from Today: speak, and Hisaab writes the entries while you talk.' },
      dashboard: {
        t: 'Login link',
        b: () => 'Type this word — not a voice note. Hisaab sends a link that opens this dashboard on any phone or computer. It works once, for 15 minutes.',
      },
      loginCode: { t: 'A 6-digit code', b: () => 'The code arrives in your “Message yourself” chat. Type it in to sign in.' },
      signOut: { t: 'Signs this device out', b: () => 'Your khata stays safe. Sign back in any time.' },
    },
    tryTitle: 'Try it now',
    tryBody: 'Send yourself a voice note about your next sale, then watch it appear on Today.',
    tryToday: 'Go to Today',
    tryMessages: 'Open Messages',
    footnotes: [
      {
        lead: 'Only this chat.',
        text: 'Hisaab is linked to your WhatsApp the way WhatsApp Web is — as a linked device — and reads only the “Message yourself” chat. Chats with customers, family and groups are never read or saved.',
      },
      {
        lead: 'Speed.',
        text: 'On our pilot server a typed message is understood in about 2 seconds and a voice note in about 3½ (medians, October 2026); the reply with its voice note arrives about 10 seconds after you send. It depends on the network, and when Google is busy Hisaab keeps trying and tells you it is still writing. Hisaab runs on Google’s free Gemini tier: its per-minute and daily limits are shared by every shop on Hisaab, so at busy moments a reply can take longer, and Google’s terms for it let Google use what is sent to improve its products and let its reviewers read it. The privacy policy explains this.',
      },
      {
        lead: 'Amounts in words.',
        text: '“dhai sau” is 250, “dedh hazaar” is 1,500 and the Pashto “pinza sawa” is 500. Sawa, paune, saadhe and lakh work too.',
      },
      { lead: 'Fair use.', text: 'Free during the pilot, up to 300 messages a day per shop.' },
      {
        lead: 'How the examples were tested.',
        text: 'Each phrase on this page is from our test set or was checked on its own against Hisaab’s setup on Google Gemini Live in October 2026, with test voices rather than real shop recordings. Typed messages now go first to a different Live model, Gemini 2.5 Flash Native Audio; on 31 October typed examples from each section were checked on it again. A voice note in a noisy shop can still be misheard, and a typed message misread, which is why every reply repeats what was written.',
      },
    ],
    further: [
      { text: 'Your shop, WhatsApp link, lists, voice replies, a system check and your data.', link: { label: 'Open Settings', to: '/app/settings' } },
      { text: 'Every voice note you sent, with what Hisaab heard and wrote.', link: { label: 'Open Messages', to: '/app/activity' } },
      { text: 'What Hisaab keeps, who processes it, and how to delete it.', link: { label: 'Read the privacy policy', to: '/privacy' } },
      { text: 'The terms of use during the pilot.', link: { label: 'Read the terms', to: '/terms' } },
    ],
  },

  ur: {
    eyebrow: 'مدد',
    title: 'حساب سے بات کیسے کریں',
    lead: shop => `واٹس ایپ پر اپنی ہی چیٹ میں وائس نوٹ یا میسج بھیجیں، اور حساب ${shop ? `⁨${shop}⁩ کا` : 'آپ کا'} کھاتہ رکھتا ہے۔ یہاں وہ سب کچھ ہے جو وہ سمجھتا ہے۔`,
    contents: 'فہرست',
    intro: [
      {
        lead: 'اپنی چیٹ کھولیں۔',
        text: ({ phone }) => (
          <>
            اپنے ہی نمبر{phone ? <> (<bdi className="num">{phone}</bdi>)</> : null} والی چیٹ — یہ اوپر ⁦You⁩ کے نام سے ہوتی ہے، یا ⁦New chat⁩ دبا کر
            ⁦Message yourself⁩ چنیں۔
            <FootnoteRef n={1} />
          </>
        ),
      },
      {
        lead: 'ویسے ہی بولیں جیسے رجسٹر میں لکھتے ہیں۔',
        text: ({ name }) => (
          <>
            مائیک دبا کر بولیں کس نے کیا لیا یا کس نے پیسے دیے: &quot;<bdi>{name.u} نے 500 کا سودا لیا</bdi>&quot;۔ لکھ کر بھیجنا بھی چلتا ہے۔
          </>
        ),
      },
      {
        lead: 'حساب لکھ کر جواب دیتا ہے۔',
        text: ({ voice }) => (
          <>
            چند سیکنڈ میں
            <FootnoteRef n={2} />{' '}
            {voice ? (
              'آپ کو ایک مختصر میسج اور نئے بقایا کے ساتھ اردو وائس نوٹ ملتا ہے۔'
            ) : (
              <>
                آپ کو نئے بقایا کے ساتھ ایک مختصر میسج ملتا ہے (وائس نوٹ جواب <Link to="/app/settings">سیٹنگز</Link> میں بند ہیں)۔
              </>
            )}{' '}
            اندراج اس ڈیش بورڈ پر بھی آ جاتا ہے۔
          </>
        ),
      },
    ],
    examplesNote: c => (
      <>
        نیچے کی کئی مثالوں میں <bdi className="help-name">{c.u}</bdi> کا نام ہے، جو آپ کے اپنے کھاتے کے گاہک ہیں۔ کسی بھی گاہک کا نام اسی طرح چلتا ہے۔
      </>
    ),
    cols: ['آپ بولیں', 'حساب کرتا ہے'],
    tags: { pashto: 'پشتو', punjabi: 'پنجابی', typed: 'لکھ کر بھیجیں', mixed: 'اردو + انگریزی', english: 'انگریزی' },
    sec: {
      'help-udhaar': {
        title: 'ادھار لکھوانا',
        intro: 'بتائیں کس نے کیا لیا اور کتنے کا — بالکل ویسے جیسے رجسٹر میں لکھتے ہیں۔ نیا نام ہو تو نیا کھاتہ بن جاتا ہے۔',
        after: [
          () => (
            <>
              <strong>آپ کی زبان۔</strong> اردو، پشتو، پنجابی، ہندکو، انگریزی یا سب ملا کر — جیسے عام طور پر بولتے ہیں ویسے بولیں (مزید{' '}
              <a href="#help-mixed">اپنے انداز میں بولیں</a> میں)۔ رقم الفاظ میں بھی بتا سکتے ہیں
              <FootnoteRef n={3} />، اور دن بھر جتنے وائس نوٹ چاہیں بھیجیں
              <FootnoteRef n={4} />۔
            </>
          ),
        ],
      },
      'help-payment': {
        title: 'وصولی',
        intro: 'جب کوئی پیسے دے تو بتائیں کس نے دیے اور کتنے۔ ان کا بقایا اتنا کم ہو جاتا ہے، اور جواب میں بتایا جاتا ہے کہ کتنا باقی ہے۔',
      },
      'help-mixed': {
        title: 'اپنے انداز میں بولیں',
        intro: 'کاؤنٹر پر کوئی ایک ہی زبان نہیں بولتا۔ اردو میں بولیں، انگریزی میں، یا ایک ہی جملے میں دونوں — ⁦on credit⁩، ⁦received⁩، ⁦balance⁩ اور ⁦5k⁩ سب چلتے ہیں۔',
        after: [
          () => (
            <>
              <strong>اس صفحے کا ہر جملہ آزمایا گیا ہے۔</strong> اکتوبر 2026 کے ہمارے ٹیسٹ میں حساب نے ہر جملہ لکھے ہوئے پیغام کے طور پر ٹھیک سمجھا، اور ان میں سے
              کئی وائس نوٹ کے طور پر بھی
              <FootnoteRef n={5} />۔ جواب میں ہمیشہ دہرایا جاتا ہے کہ کیا لکھا گیا، اس لیے غلط سنی بات فوراً پکڑی جاتی ہے۔
            </>
          ),
        ],
      },
      'help-multi': {
        title: 'ایک وائس نوٹ میں کئی اندراج',
        intro: 'مصروف گھنٹے کے بعد سب کچھ ایک ساتھ بول دیں۔ حساب ہر اندراج الگ الگ، ہر گاہک کے اپنے کھاتے میں لکھتا ہے۔',
        after: [
          () => (
            <>
              <strong>جواب۔</strong> تین یا زیادہ اندراج ہوں تو جواب ایک نمبر وار فہرست میں آتا ہے، ہر بندے کے نئے بقایا کے ساتھ، اور آخر میں کل رقم۔
              ان میں سے صرف ایک کینسل کرنا ہو تو اس بندے کا نام ساتھ بولیں۔
            </>
          ),
        ],
      },
      'help-lists': {
        title: 'لسٹیں',
        intro: 'لوگوں کو ویسے ہی الگ رکھیں جیسے رجسٹر میں رکھتے ہیں — محلے کے گاہک، تنخواہ والے دن پیسے دینے والے فیکٹری کے لوگ، ٹیچرز، رشتہ دار۔ جو کسی لسٹ میں نہیں، وہ عام کھاتے میں ہیں۔',
        after: [
          () => (
            <>
              <strong>ڈیش بورڈ پر۔</strong> لسٹیں <Link to="/app/settings#set-lists">سیٹنگز</Link> میں بنائیں، ان کا نام بدلیں یا حذف کریں، اور ہر لسٹ کے
              لوگ <Link to="/app/customers">گاہک</Link> میں دیکھیں۔ ایک دکان کی زیادہ سے زیادہ 20 لسٹیں ہو سکتی ہیں۔
            </>
          ),
          () => (
            <>
              <strong>پوری لسٹ کو یاد دہانی۔</strong> حساب ہر اس بندے کے لیے پیغام تیار کرتا ہے جس کے ذمے پیسے ہیں، اور جن کا نمبر محفوظ ہے ان کے لیے واٹس
              ایپ لنک بھی۔ جب تک آپ خود نہ دبائیں، کچھ نہیں جاتا۔
            </>
          ),
        ],
      },
      'help-suppliers': {
        title: 'سپلائرز',
        intro: 'حساب یہ بھی رکھتا ہے کہ آپ کی دکان نے کس کو کتنا دینا ہے — ہول سیلر، ڈسٹری بیوٹر، چینی بھیجنے والے حاجی صاحب۔ بتائیں کس سے مال ادھار لیا، یا کس کو پیسے دیے۔',
        after: [
          () => (
            <>
              <strong>ادھار سے الگ۔</strong> سپلائرز کو جو دینا ہے وہ کبھی آپ کے کل ادھار، تقاضوں یا یاد دہانیوں میں شامل نہیں ہوتا۔ نیا سپلائر آپ کی سپلائرز
              والی لسٹ میں جاتا ہے — اگر کوئی نہ ہو تو حساب ⁦Suppliers⁩ نام کی لسٹ خود بنا دیتا ہے۔
            </>
          ),
          () => (
            <>
              <strong>غلطی سے گاہک کا نام؟</strong> اگر آپ کہیں کہ کسی ایسے بندے سے مال لیا جو گاہک ہے، تو حساب کچھ نہیں لکھتا اور پہلے آپ سے پوچھتا ہے۔
            </>
          ),
        ],
      },
      'help-mistakes': {
        title: 'غلطی درست کرنا',
        intro: 'جواب میں ہر اندراج دہرایا جاتا ہے۔ کچھ غلط ہو تو فوراً بتا دیں۔',
        after: [
          () => (
            <>
              <strong>ایک بندے کے دو کھاتے؟</strong> اگر حساب نے کوئی نام مختلف سن کر دوسرا کھاتہ بنا دیا (جیسے ⁦Umar⁩ کے ساتھ ⁦Umer⁩)، تو{' '}
              <Link to="/app/customers">گاہک</Link> میں اس کا صفحہ کھول کر دونوں کھاتے ملا دیں۔
            </>
          ),
        ],
      },
      'help-questions': {
        title: 'سوال پوچھنا',
        intro: 'اپنے کھاتے کے بارے میں ویسے ہی پوچھیں جیسے منشی سے پوچھتے ہیں۔ حساب اسی چیٹ میں جواب دیتا ہے۔',
      },
      'help-reminders': {
        title: 'یاد دہانی',
        intro: 'حساب آپ کے گاہکوں کو خود سے کبھی میسج نہیں کرتا۔ وہ بقایا کے ساتھ ایک شائستہ پیغام تیار کرتا ہے، اور بھیجنا یا نہ بھیجنا آپ کی مرضی ہے۔',
        after: [
          () => 'یہی یاد دہانی اس ڈیش بورڈ پر گاہک کے صفحے سے بھی تیار کی جا سکتی ہے۔',
          () => (
            <>
              <strong>ادائیگی کی تفصیل۔</strong> اپنا جاز کیش، ایزی پیسہ، راست یا بینک اکاؤنٹ <Link to="/app/settings#set-pay">سیٹنگز</Link> میں لکھ دیں،
              پھر ہر یاد دہانی میں گاہک کو لکھا ملے گا کہ پیسے کہاں بھیجیں۔ حساب یہ تفصیل صرف لکھتا ہے، پیسوں کا لین دین کبھی نہیں کرتا۔
            </>
          ),
        ],
      },
      'help-photos': {
        title: 'کاغذی کھاتے کی تصویر',
        intro: 'پہلے سے کاغذ کا رجسٹر رکھتے ہیں؟ کسی صفحے کی صاف تصویر لے کر خود کو بھیج دیں۔',
        cols: ['آپ بھیجیں', 'حساب کرتا ہے'],
        after: [() => 'جواب ضرور دیکھیں: اس میں لکھا ہوتا ہے کہ حساب نے کیا درج کیا، تاکہ کچھ غلط پڑھا گیا ہو تو آپ درست کر سکیں۔'],
      },
      'help-dashboard': {
        title: 'ڈیش بورڈ',
        intro: 'جو کچھ آپ بھیجتے ہیں وہ ساتھ ساتھ یہاں بھی لکھا جاتا ہے — ریفریش کی ضرورت نہیں۔',
        cols: ['آپ کھولیں', 'آپ کو ملتا ہے'],
        after: [
          () => (
            <>
              <strong>اگر واٹس ایپ منقطع ہو جائے</strong> تو اس ڈیش بورڈ کے اوپر ایک پٹی نظر آئے گی۔ <Link to="/app/settings">سیٹنگز</Link> سے دوبارہ جوڑیں۔
              منقطع ہونے کے دوران بھیجے گئے وائس نوٹ رہ سکتے ہیں — <Link to="/app/activity">پیغامات</Link> میں دیکھ کر دوبارہ بھیج دیں۔
            </>
          ),
          () => (
            <>
              <strong>آپ کا ڈیٹا۔</strong> <Link to="/app/settings">سیٹنگز</Link> میں پورا کھاتہ ایک فائل میں ڈاؤن لوڈ کریں جو Excel میں کھلتی ہے، یا سب کچھ
              ہمیشہ کے لیے حذف کر دیں۔
            </>
          ),
        ],
      },
      'help-login': {
        title: 'لاگ ان',
        intro: 'کوئی پاس ورڈ نہیں۔ آپ کا اپنا واٹس ایپ ہی چابی ہے۔',
        cols: ['آپ کریں', 'حساب کرتا ہے'],
        after: [
          () => (
            <>
              <strong>میرا کھاتہ اور کون دیکھ سکتا ہے؟</strong> صرف وہی جو آپ کے واٹس ایپ نمبر سے سائن اِن ہو۔ حساب پر ہر دکان صرف اپنے گاہک اور اندراجات
              دیکھتی ہے — اس لیے لاگ ان کوڈ یا لنک کبھی کسی کو نہ دیں۔
            </>
          ),
        ],
      },
    },
    act: {
      photoPage: () => 'ہاتھ سے لکھے کھاتے کے صفحے کی تصویر',
      photoBill: () => 'کسی بل کی تصویر، کیپشن میں گاہک کے نام کے ساتھ',
      dashToday: () => <Link to="/app">آج</Link>,
      dashCustomer: () => (
        <>
          <Link to="/app/customers">گاہک</Link> میں کسی کا صفحہ
        </>
      ),
      dashMessages: () => <Link to="/app/activity">پیغامات</Link>,
      dashCall: () => 'حساب سے کال',
      loginCode: () => 'لاگ ان صفحے پر اپنا نمبر',
      signOut: () => (
        <>
          <Link to="/app/settings">سیٹنگز</Link> میں سائن آؤٹ
        </>
      ),
    },
    what: {
      credit: { t: 'ادھار', b: ({ u, m }) => <>{u} کے کھاتے میں {m(500)} ادھار لکھ دیتا ہے۔</> },
      words: {
        t: 'رقم الفاظ میں',
        b: ({ m }) => (
          <>
            &quot;ڈھائی سو&quot; کو {m(250)} اور &quot;ساڑھے تین ہزار&quot; کو {m(3500)} لکھتا ہے۔ سوا، ڈیڑھ، پونے اور لاکھ بھی سمجھتا ہے۔
          </>
        ),
      },
      pashto: {
        t: 'پشتو میں',
        b: ({ u, m }) => (
          <>
            ⁦<span className="latin">pinza sawa</span>⁩ یعنی 500: {u} کے کھاتے میں {m(500)} ادھار۔
          </>
        ),
      },
      punjabi: {
        t: 'پنجابی میں',
        b: ({ u, m }) => (
          <>
            ⁦<span className="latin">panj sau</span>⁩ یعنی 500: {u} کے کھاتے میں {m(500)} ادھار۔
          </>
        ),
      },
      payment: { t: 'وصولی', b: ({ u, m }) => <>{u} سے {m(300)} کی وصولی لکھ دیتا ہے۔</> },
      full: { t: 'پورا حساب چکتا', b: () => 'اسد کے پورے بقایا کی وصولی لکھ دیتا ہے، یوں کھاتہ صاف ہو جاتا ہے۔' },
      mixCredit: { t: 'ادھار، دونوں زبانوں میں', b: ({ u, m }) => <>⁦on credit⁩ یعنی ادھار: {u} کے کھاتے میں {m(500)} لکھ دیتا ہے۔</> },
      mixReceived: { t: 'وصولی', b: ({ u, m }) => <>⁦received⁩ یعنی وصولی، اور ⁦2k⁩ یعنی 2,000: {u} سے {m(2000)} کی وصولی لکھ دیتا ہے۔</> },
      mixK: { t: '⁦3k⁩ جیسی رقمیں', b: ({ u, m }) => <>{u} کے کھاتے میں {m(3000)} ادھار۔ ⁦1.5k⁩ یعنی 1,500۔</> },
      mixBalance: { t: 'بقایا پوچھنا', b: ({ u }) => <>بتاتا ہے کہ {u} کے ذمے کتنے ہیں۔ کچھ نیا نہیں لکھا جاتا۔</> },
      enCredit: { t: 'انگریزی میں ادھار', b: ({ u, m }) => <>{u} کے کھاتے میں {m(500)} ادھار لکھ دیتا ہے۔</> },
      enPaid: { t: 'انگریزی میں وصولی', b: ({ u, m }) => <>{u} سے {m(300)} کی وصولی لکھ دیتا ہے۔</> },
      enOwe: { t: 'انگریزی میں سوال', b: ({ u }) => <>بتاتا ہے کہ {u} کے ذمے کتنے ہیں۔</> },
      multiTwo: { t: 'دو لوگ، دو اندراج', b: ({ m }) => <>نوید کے {m(700)} ادھار، اور اسد سے {m(400)} وصول۔</> },
      multiThree: { t: 'جلدی سے فہرست', b: ({ m }) => <>تین ادھار: عمر {m(500)}، احمد {m(300)}، بلال {m(200)}۔</> },
      multiEnglish: { t: 'یہی انگریزی میں', b: ({ m }) => <>عمر کے {m(400)} ادھار، احمد سے {m(250)} وصول، بلال کے {m(1100)} ادھار۔</> },
      multiSame: { t: 'ایک بندہ، دونوں طرح', b: ({ m }) => <>عمر نے {m(500)} دیے اور {m(300)} کا مزید سامان لیا: ان کے کھاتے میں دو اندراج۔</> },
      cancelOne: { t: 'صرف ایک کینسل', b: () => 'بلال کا آخری اندراج کینسل کرتا ہے، باقی سب رہتے ہیں۔' },
      listCreate: { t: 'لسٹ بنائیں', b: () => 'رشتہ دار نام کی نئی لسٹ بناتا ہے۔ اس میں کسی کو منتقل نہیں کیا جاتا۔' },
      listCreateEn: { t: 'انگریزی میں', b: () => '⁦Drivers⁩ نام کی لسٹ بناتا ہے۔' },
      listNew: { t: 'نیا بندہ، سیدھا لسٹ میں', b: ({ m }) => <>فیکٹری والی لسٹ میں کاشف کا کھاتہ کھول کر {m(800)} ادھار لکھتا ہے۔</> },
      listMove: { t: 'کسی کو منتقل کریں', b: ({ u }) => <>{u} کو محلہ والی لسٹ میں ڈال دیتا ہے۔ ان کا کھاتہ اور بقایا ویسا ہی رہتا ہے۔</> },
      listMoveEn: { t: 'انگریزی میں', b: () => 'وقاص کو ٹیچرز والی لسٹ میں ڈال دیتا ہے۔' },
      listDues: { t: 'ایک لسٹ میں کس کے ذمے کیا', b: () => 'محلہ والی لسٹ میں جس جس کے ذمے آپ کے پیسے ہیں، رقم کے ساتھ۔' },
      listTotal: { t: 'ایک لسٹ کا کل', b: () => 'فیکٹری والی لسٹ کا کل ادھار۔' },
      listRemind: { t: 'پوری لسٹ کو یاد دہانی', b: () => 'ٹیچرز والی لسٹ میں جس جس کے ذمے پیسے ہیں، سب کے لیے یاد دہانی تیار کرتا ہے۔' },
      listAll: { t: 'آپ کی سب لسٹیں', b: () => 'ہر لسٹ، اس میں کتنے لوگ ہیں اور اس کا کل۔ صرف ⁦lists⁩ لکھ کر بھیجنا بھی چلتا ہے۔' },
      supBuy: { t: 'مال ادھار لیا', b: ({ m }) => <>لکھ دیتا ہے کہ آپ نے رحمان ٹریڈرز کو {m(15000)} دینے ہیں۔</> },
      supBuyEn: { t: 'انگریزی میں', b: ({ m }) => <>لکھ دیتا ہے کہ آپ نے حاجی بشیر کو {m(12000)} دینے ہیں۔</> },
      supNew: { t: 'نیا سپلائر', b: ({ m }) => <>المدینہ ٹریڈرز کا سپلائر کھاتہ کھولتا ہے، {m(30000)} دینے ہیں۔</> },
      supPay: { t: 'سپلائر کو پیسے دیے', b: ({ m }) => <>حاجی بشیر کو {m(10000)} کی ادائیگی لکھتا ہے؛ جو دینا ہے وہ اتنا کم ہو جاتا ہے۔</> },
      supPayEn: { t: 'انگریزی میں', b: ({ m }) => <>رحمان ٹریڈرز کو {m(5000)} کی ادائیگی لکھتا ہے۔</> },
      supOwe: { t: 'کل کتنا دینا ہے', b: () => 'سب سپلائرز کو ملا کر آپ نے کتنا دینا ہے۔' },
      supOweOne: { t: 'ایک سپلائر کو کتنا دینا ہے', b: () => 'ابھی رحمان ٹریڈرز کو کتنا دینا ہے۔' },
      undo: { t: 'واپس لیں', b: () => 'آخری اندراج کینسل کر دیتا ہے۔ غلطی کے فوراً بعد بولیں۔' },
      correct: { t: 'رقم درست کریں', b: ({ m }) => <>آخری اندراج کی رقم بدل کر {m(400)} کر دیتا ہے۔</> },
      lookup: { t: 'ایک گاہک کا حساب', b: ({ u }) => <>{u} کے ذمے کتنے ہیں، اور آخری وصولی کو کتنے دن ہو گئے۔</> },
      over: { t: 'کس کا ادھار زیادہ ہے', b: ({ m }) => <>ان سب کی فہرست جن کے ذمے {m(1000)} سے زیادہ ہیں۔ سب کے لیے بولیں &quot;کس کس کا ادھار ہے&quot;۔</> },
      total: { t: 'کل ادھار', b: () => 'آپ کا کل کتنا ادھار باہر ہے، اور کتنے لوگوں کے ذمے ہے۔' },
      today: { t: 'آج کا خلاصہ', b: () => 'آج کتنا ادھار دیا اور کتنی وصولی ہوئی۔' },
      ledger: { t: 'پورا کھاتہ', b: () => 'ہر گاہک کا بقایا ایک پیغام میں، کل رقم کے ساتھ۔' },
      help: { t: 'مثالیں', b: () => 'مثالوں کی ایک مختصر فہرست، سیدھی آپ کی چیٹ میں۔' },
      phone: { t: 'نمبر محفوظ کریں', b: ({ u }) => <>{u} کا واٹس ایپ نمبر محفوظ کر لیتا ہے تاکہ یاد دہانی سیدھی ان کی چیٹ میں کھلے۔</> },
      reminder: {
        t: 'یاد دہانی',
        b: ({ u }) => <>{u} کے بقایا کے ساتھ ایک شائستہ پیغام اور بھیجنے کا لنک تیار کرتا ہے۔ جب تک آپ خود Send نہ دبائیں، گاہک کو کچھ نہیں جاتا۔</>,
      },
      photoPage: {
        t: 'ہر سطر کا ایک اندراج',
        b: () => 'ہر سطر سے نام اور رقم پڑھ کر ادھار لکھتا ہے۔ جس سطر پر ادا، واپس یا جمع لکھا ہو، وہ وصولی کے طور پر لکھی جاتی ہے۔',
      },
      photoBill: { t: 'ایک ادھار', b: () => 'کیپشن میں جس گاہک کا نام ہو، بل کو اس کے کھاتے میں ایک ادھار کے طور پر لکھتا ہے۔' },
      dashToday: { t: 'کس کے ذمے کیا ہے', b: () => 'کتنا ادھار باہر ہے، کس سے تقاضا کرنا ہے — جس نے 7 دن یا زیادہ سے کچھ نہیں دیا — اور آج کے اندراج۔' },
      dashCustomer: { t: 'پورا کھاتہ', b: () => 'ہر اندراج کے بعد کا بقایا، اور بھیجنے کے لیے تیار یاد دہانی۔' },
      dashMessages: { t: 'حساب نے کیا سنا', b: () => 'آپ کا بھیجا ہر وائس نوٹ، اور حساب نے کیا سنا اور کیا لکھا۔' },
      dashCall: { t: 'لکھنے کے بجائے بات', b: () => '"آج" کے صفحے سے لائیو کال شروع کریں: آپ بولیں، اور حساب ساتھ ساتھ اندراج لکھتا جائے۔' },
      dashboard: {
        t: 'لاگ ان لنک',
        b: () => 'یہ لفظ لکھ کر بھیجیں، وائس نوٹ نہیں۔ حساب ایک لنک بھیجتا ہے جو کسی بھی فون یا کمپیوٹر پر یہ ڈیش بورڈ کھول دیتا ہے۔ یہ ایک بار، 15 منٹ تک چلتا ہے۔',
      },
      loginCode: { t: '6 ہندسوں کا کوڈ', b: () => 'کوڈ آپ کی ⁦Message yourself⁩ چیٹ میں آتا ہے۔ اسے لکھ کر سائن اِن کریں۔' },
      signOut: { t: 'یہ ڈیوائس سائن آؤٹ', b: () => 'آپ کا کھاتہ محفوظ رہتا ہے۔ جب چاہیں دوبارہ سائن اِن کریں۔' },
    },
    tryTitle: 'ابھی آزمائیں',
    tryBody: 'اگلی بکری کے بارے میں خود کو وائس نوٹ بھیجیں، پھر اسے "آج" کے صفحے پر آتا دیکھیں۔',
    tryToday: 'آج کے صفحے پر جائیں',
    tryMessages: 'پیغامات کھولیں',
    footnotes: [
      {
        lead: 'صرف یہی چیٹ۔',
        text: 'حساب آپ کے واٹس ایپ سے ویسے ہی جڑتا ہے جیسے واٹس ایپ ویب — یعنی linked device کے طور پر — اور صرف ⁦Message yourself⁩ چیٹ پڑھتا ہے۔ گاہکوں، گھر والوں اور گروپس کی چیٹس نہ پڑھی جاتی ہیں نہ محفوظ ہوتی ہیں۔',
      },
      {
        lead: 'رفتار۔',
        text: 'ہمارے پائلٹ سرور پر لکھا ہوا پیغام تقریباً 2 سیکنڈ میں اور وائس نوٹ تقریباً ساڑھے تین سیکنڈ میں سمجھا جاتا ہے (اکتوبر 2026 کی درمیانی پیمائش)؛ وائس نوٹ والا جواب بھیجنے کے تقریباً 10 سیکنڈ بعد آتا ہے۔ یہ انٹرنیٹ پر منحصر ہے، اور جب گوگل مصروف ہو تو حساب کوشش جاری رکھتا ہے اور بتا دیتا ہے کہ ابھی لکھ رہا ہے۔ حساب گوگل جیمنائی کی مفت سطح (free tier) پر چلتا ہے: اس کی فی منٹ اور روزانہ حدیں حساب کی سب دکانوں میں بٹی ہوئی ہیں، اس لیے مصروف وقت میں جواب زیادہ دیر سے آ سکتا ہے، اور اس کی شرائط کے تحت گوگل بھیجا گیا مواد اپنی سروسز بہتر بنانے کے لیے استعمال کر سکتا ہے اور اس کے جائزہ کار اسے پڑھ سکتے ہیں۔ رازداری کی پالیسی میں اس کی تفصیل ہے۔',
      },
      {
        lead: 'رقم الفاظ میں۔',
        text: '"ڈھائی سو" یعنی 250، "ڈیڑھ ہزار" یعنی 1,500، اور پشتو میں ⁦pinza sawa⁩ یعنی 500۔ سوا، پونے، ساڑھے اور لاکھ بھی چلتے ہیں۔',
      },
      { lead: 'مناسب استعمال۔', text: 'پائلٹ کے دوران مفت، ہر دکان کے لیے روزانہ 300 میسج تک۔' },
      {
        lead: 'مثالیں کیسے آزمائی گئیں۔',
        text: 'اس صفحے کا ہر جملہ یا تو ہمارے ٹیسٹ سیٹ کا ہے یا اکتوبر 2026 میں ⁦Google Gemini Live⁩ پر حساب کے سیٹ اپ میں الگ سے آزمایا گیا — اصل دکان کی ریکارڈنگ کے بجائے ٹیسٹ آوازوں کے ساتھ۔ لکھے ہوئے پیغام اب پہلے ایک دوسرے لائیو ماڈل، ⁦Gemini 2.5 Flash Native Audio⁩، کو جاتے ہیں؛ 31 اکتوبر کو ہر حصے کی لکھی ہوئی مثالیں اس پر دوبارہ آزمائی گئیں۔ شور والی دکان میں وائس نوٹ پھر بھی غلط سنا جا سکتا ہے، اور لکھا ہوا پیغام بھی غلط سمجھا جا سکتا ہے، اسی لیے ہر جواب میں دہرایا جاتا ہے کہ کیا لکھا گیا۔',
      },
    ],
    further: [
      { text: 'دکان کی تفصیل، واٹس ایپ کا رابطہ، لسٹیں، وائس نوٹ جواب، سسٹم چیک اور آپ کا ڈیٹا۔', link: { label: 'سیٹنگز کھولیں', to: '/app/settings' } },
      { text: 'آپ کا بھیجا ہر وائس نوٹ، اور حساب نے کیا سنا اور کیا لکھا۔', link: { label: 'پیغامات کھولیں', to: '/app/activity' } },
      { text: 'حساب کیا محفوظ کرتا ہے، اسے کون پراسیس کرتا ہے اور اسے کیسے حذف کریں۔', link: { label: 'رازداری کی پالیسی پڑھیں', to: '/privacy' } },
      { text: 'پائلٹ کے دوران استعمال کی شرائط۔', link: { label: 'شرائط پڑھیں', to: '/terms' } },
    ],
  },
}

/** The shop's most recently active customer that has both a Roman and an Urdu name, for personal examples. */
function pickExampleCustomer(list) {
  if (!Array.isArray(list)) return null
  // A supplier would turn every udhaar example into a purchase, so only customers are used.
  const usable = list.filter(c => c.name && c.nameUrdu && c.name.length <= 20 && c.listKind !== 'suppliers')
  usable.sort((a, b) => (b.lastEntryAt || 0) - (a.lastEntryAt || 0))
  const c = usable[0]
  return c ? { r: c.name, u: c.nameUrdu } : null
}

/** "You say" cell: Urdu script over Roman Urdu, or an action in the interface language. */
function SayCell({ rowKey, name, S }) {
  const say = SAY[rowKey]
  if (!say) return <span className="help-act">{S.act[rowKey]()}</span>
  return (
    <>
      {say.tag && <span className="label help-tag">{S.tags[say.tag]}</span>}
      {say.ur && (
        <span className={say.ps ? 'ps help-ur help-ps' : 'ur help-ur'} lang={say.ps ? 'ps' : 'ur'}>
          {say.ur(name)}
        </span>
      )}
      <span className={say.ur ? 'help-roman' : 'help-roman solo'} dir="ltr">
        {say.ro(name)}
      </span>
    </>
  )
}

function TableSkeleton({ rows }) {
  return (
    <div className="help-table-loading" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="help-table-loading-row">
          <Skeleton width="70%" height={20} />
          <Skeleton width="85%" height={16} />
        </div>
      ))}
    </div>
  )
}

function HelpSection({ id, rows, name, loading, S }) {
  const text = S.sec[id]
  const [colSay, colDoes] = text.cols || S.cols
  const ctx = {
    r: <bdi className="help-name">{name.r}</bdi>,
    u: <bdi className="help-name">{name.u}</bdi>,
    // Amounts sit on the sage column, where rust/olive text falls under 4.5:1; the words beside them carry the meaning.
    m: value => <Money value={value} tone="neutral" />,
  }
  return (
    <section id={id} className="help-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{text.title}</h2>
      <p>{text.intro}</p>
      {loading ? (
        <TableSkeleton rows={rows.length} />
      ) : (
        <table className="grid-table stack-sm help-table" aria-labelledby={`${id}-h`}>
          <thead>
            <tr>
              <th scope="col">{colSay}</th>
              <th scope="col" className="hl">
                {colDoes}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(key => {
              const what = S.what[key]
              return (
                <tr key={key}>
                  <th scope="row">
                    <SayCell rowKey={key} name={name} S={S} />
                  </th>
                  <td className="hl" data-label={colDoes}>
                    <span className="help-does-title">{what.t}</span>
                    <span className="help-does-body">{what.b(ctx)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {text.after?.map((line, i) => (
        <p key={i}>{line(ctx)}</p>
      ))}
    </section>
  )
}

export default function Help() {
  const S = useStrings(STRINGS)
  useHashScroll()
  const C = useCommon()
  const { me } = useMe()
  const customers = useResource('/api/customers')
  const example = useMemo(() => pickExampleCustomer(customers.data), [customers.data])
  const name = example || DEFAULT_NAME
  const phone = me?.phoneLocal
  // Hisaab only speaks its reply when the shop has voice replies on (Settings).
  const voice = me ? Boolean(me.voiceReplies) : true
  const contents = SECTIONS.map(s => ({ id: s.id, label: S.sec[s.id].title }))

  return (
    <article className="help-page" aria-labelledby="help-title">
      <PageHeader
        eyebrow={S.eyebrow}
        title={S.title}
        titleId="help-title"
        lead={S.lead(me?.shopName)}
        toc={<Toc variant="hero" className="help-toc" label={S.contents} items={contents.map(c => ({ label: c.label, href: `#${c.id}` }))} />}
      />

      <div className="help-intro">
        {S.intro.map(p => (
          <p key={p.lead}>
            <strong>{p.lead}</strong> {p.text({ phone, name, voice })}
          </p>
        ))}
        {example && <p>{S.examplesNote(example)}</p>}
      </div>

      {customers.loading && (
        <span className="sr-only" role="status">
          {C.loading}
        </span>
      )}
      {SECTIONS.map(s => (
        <HelpSection key={s.id} id={s.id} rows={s.rows} name={name} loading={customers.loading} S={S} />
      ))}

      <section className="help-try" aria-labelledby="help-try-h">
        <h3 id="help-try-h">{S.tryTitle}</h3>
        <p>{S.tryBody}</p>
        <div className="cluster">
          <Button variant="primary" to="/app">
            {S.tryToday}
          </Button>
          <Button to="/app/activity">{S.tryMessages}</Button>
        </div>
      </section>

      <Footnotes items={S.footnotes} />
      <FurtherReading items={S.further} />
      <SectionRail sections={contents} />
    </article>
  )
}
