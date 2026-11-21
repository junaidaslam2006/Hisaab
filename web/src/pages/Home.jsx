import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Button, Money, Badge, Skeleton, PageHeader, LoadError } from '../components/ui.jsx'
import { Tabs, TabPanel, Frame, Figure, LabeledCells, QuoteCard, Toc, Footnotes, FootnoteRef, SectionRail } from '../components/editorial.jsx'
import EntrySheet from '../components/EntrySheet.jsx'
import ReminderSheet from '../components/ReminderSheet.jsx'
import MicRecorder from '../components/MicRecorder.jsx'
import LiveCall from '../components/LiveCall.jsx'
import { useMe } from '../lib/me.jsx'
import { useResource } from '../lib/useResource.js'
import { api } from '../lib/api.js'
import { useStrings, useCommon, useLang } from '../lib/i18n.jsx'
import { money, when } from '../lib/format.js'
import { SampleBadge, listHref, listName, useListWords } from '../lib/lists.jsx'
import './Home.css'

// Home (/app): "today's edition" of the shop's khata. Every headline, lead and meta below is written from
// /api/overview and /api/me; nothing on this page is a placeholder number.

const STRINGS = {
  en: {
    // header
    titleDue: amt => [<>{amt} is out</>, 'on udhaar.'],
    titleClear: ['Everyone has paid.', 'Nothing is out.'],
    titleNew: name => (name ? ['Your khata is ready,', <>{name}.</>] : ['Your khata', 'is ready.']),
    leadOwe: n => (n === 1 ? '1 customer owes you.' : `${n} customers owe you.`),
    leadLongest: (name, d) => <>{name} has gone longest without paying — {d === 1 ? '1 day' : `${d} days`}.</>,
    leadNoWeek: 'Nobody has gone a full week without paying.',
    leadNoneOwe: n => (n === 0 ? 'You have no customers yet.' : n === 1 ? 'Your one customer owes you nothing.' : `None of your ${n} customers owes you anything.`),
    leadSuppliers: (n, amt) => `You owe ${n === 1 ? '1 supplier' : `${n} suppliers`} ${amt}.`,
    leadAdvance: amt => `${amt} is held as advance.`,
    leadTodayBoth: (g, c) => `Today you gave ${g} on udhaar and collected ${c}.`,
    leadTodayGave: g => `Today you gave ${g} on udhaar.`,
    leadTodayGot: c => `Today you collected ${c}.`,
    leadNew: phone => `Hisaab is linked to your WhatsApp${phone ? ` (${phone})` : ''}. Whatever you tell yourself there is written into this khata.`,
    leadNewOff: 'Whatever you tell yourself on WhatsApp is written into this khata, as soon as WhatsApp is connected.',
    leadHeard: 'Hisaab has your first message. Tell it a customer’s name and an amount, and the first entry appears here.',
    add: 'Add entry',
    call: 'Talk to Hisaab',

    // contents meta
    people: n => (n === 1 ? '1 customer' : `${n} customers`),
    top: n => `top ${n}`,
    nobody: 'Nobody',
    // No-break spaces: a long meta wraps only at the dot, never between an amount and its word.
    flowMeta: (g, c) => `${g} given · ${c} in`,
    nothingYet: 'Nothing yet',
    noEntries: 'No entries',
    biggest: amt => `biggest ${amt}`,

    // follow up
    followTitle: 'Follow up',
    followLead: 'These customers owe you and have not paid anything for 7 days or more, longest first.',
    followSum: amt => `Together they owe ${amt}.`,
    followNone: 'No one who owes you has gone 7 days without paying.',
    followClear: 'Nobody owes you anything right now.',
    colCustomer: 'Customer',
    colOwes: 'Owes',
    colUnpaid: 'Unpaid for',
    colLastPaid: 'Last payment',
    colAction: 'Reminder',
    days: d => (d === 1 ? '1 day' : `${d} days`),
    never: 'Never paid',
    lastUdhaar: t => `Last udhaar ${t}`,
    remind: 'Remind',
    remindLabel: n => `Remind ${n}`,
    allCustomers: 'All customers',

    // today
    todayTitle: 'Today',
    todayUp: amt => `Udhaar went up by ${amt} today.`,
    todayDown: amt => `Udhaar came down by ${amt} today.`,
    todayEven: 'You collected exactly as much as you gave on udhaar today.',
    todayNone: 'No udhaar given or collected today yet.',
    todayAllCancelled: 'All of today’s udhaar and payments were cancelled.',
    cellGiven: 'Given on udhaar',
    cellCollected: 'Collected',
    cellEntries: 'Entries',
    countEntries: n => (n === 1 ? '1 entry' : `${n} entries`),
    countPayments: n => (n === 1 ? '1 payment' : `${n} payments`),
    forPeople: n => (n === 1 ? 'for 1 customer' : `for ${n} customers`),
    cancelledN: n => `${n} cancelled, not counted`,
    todayEmpty: 'Send yourself a voice note whenever you give udhaar or get paid, and it shows up here.',
    todayMore: n => (n === 1 ? '1 more entry from today is on its customer’s page' : `${n} more entries from today are on your customers’ pages`),
    // Supplier khatas never count in Today's udhaar; one line says what happened on them.
    supToday: (n, who, what) => (
      <>
        {n === 1 ? 'Supplier khata' : 'Supplier khatas'} today: {who}
        {what ? <> — {what}</> : null}. Kept apart from udhaar
      </>
    ),
    supN: n => `${n} suppliers`,
    supBought: amt => `${amt} of goods on credit`,
    supPaid: amt => `${amt} paid to them`,
    supJoin: ', ',

    // last 14 days
    trendTitle: 'Last 14 days',
    trendLead: (g, c) => `In the last 14 days you gave ${g} on udhaar and collected ${c}.`,
    trend30: (g, c) => `Over 30 days: ${g} given, ${c} collected.`,
    trendQuiet: 'Nothing was written in the last 14 days.',
    tabsLabel: 'Chart views',
    tabFlow: 'Given and collected',
    tabOut: 'Udhaar outstanding',
    tabNet: 'Udhaar after advances',
    flowTitle: 'Per day, in rupees',
    outTitle: 'At the end of each day, in rupees',
    given: 'Udhaar given',
    collected: 'Collected',
    flowCaption: 'Each dot is one day’s total. Days with nothing written sit on the zero line.',
    outCaption: amt => `Worked out backwards from today’s balance of ${amt} and each day’s entries.`,
    netCaption: (amt, adv) => `Udhaar minus the ${adv} held as advance, worked out backwards from today’s ${amt} and each day’s entries.`,
    colDay: 'Day',
    chartToday: 'Today',
    tipFlow: (d, g, c) => `${d}: udhaar ${g}, collected ${c}`,
    tipOut: (d, o) => `${d}: ${o} outstanding`,

    // largest
    largestTitle: 'Largest balances',
    largestAll: 'Everyone who owes you, biggest balance first.',
    largestTop: (n, total) => `The ${n} biggest of ${total} balances.`,

    // recent
    recentTitle: 'Recent entries',
    recentLead: 'From before today, newest first.',
    recentNone: 'Nothing from before today yet.',
    recentFull: 'Today’s entries fill this list. Older entries are on each customer’s page.',
    recentEmpty: name => `No entries yet. Send yourself a voice note on WhatsApp, like “${name} ne 500 ka sauda liya”.`,
    allMessages: 'All messages',
    colTime: 'Time',
    colSource: 'Source',
    colAmount: 'Amount',
    cancelled: 'Cancelled',
    sources: {
      whatsapp_voice: 'WhatsApp voice',
      whatsapp_text: 'WhatsApp text',
      whatsapp_photo: 'Khata photo',
      web_voice: 'Dashboard voice',
      web_text: 'Dashboard',
      web: 'Dashboard',
      call: 'Call',
      sample: 'Sample',
    },

    // your lists
    listsTitle: 'Your lists',
    listsMeta: n => (n === 1 ? '1 list' : `${n} lists`),
    listsLeadTop: (name, amt, n) => <>{name} has the most udhaar out: {amt} from {n === 1 ? '1 person' : `${n} people`}.</>,
    listsLeadNone: 'Nobody in any of your lists owes you anything right now.',
    listsLeadSup: amt => `You owe your suppliers ${amt}, kept apart from udhaar.`,
    colList: 'List',
    colPeople: 'People',
    colOwing: 'Owing',
    colTotal: 'Total',
    colOpen: 'Open',
    owingN: n => (n === 1 ? '1 owes you' : `${n} owe you`),
    youOweN: n => `you owe ${n}`,
    nobodyOwes: 'Nobody',
    kindCustomers: 'Customers',
    kindSuppliers: 'Suppliers · you owe them',
    openList: n => `Open ${n}`,
    listsCaption: 'Total adds up what the people in each list owe you; for a suppliers list, what you owe them.',
    // sample data
    sampleBanner: link => <>This includes sample data, marked Sample — remove it in {link}.</>,
    settingsLink: 'Settings',

    // footnotes
    fnUnpaidLead: 'Unpaid for.',
    fnUnpaid: 'Days since the customer last paid anything, or since their first udhaar if they have never paid. Follow up lists up to six people; everyone is on the Customers page.',
    fnDaysLead: 'Days and totals.',
    fnDays: 'Days run from midnight to midnight, Pakistan time. Cancelled entries are left out of every total on this page.',

    // first note
    firstTitle: 'Send your first voice note',
    firstLead: 'Tell yourself on WhatsApp what happened, the way you would say it in the shop. One sentence is enough.',
    sayLabel: 'Say this in “Message yourself”',
    sayUr: 'عمر نے 500 روپے کا سودا لیا',
    sayRoman: 'Umar ne 500 rupaye ka sauda liya',
    step1: 'Step 1',
    step1Body: 'Open “Message yourself” in WhatsApp — the chat with your own number.',
    step2: 'Step 2',
    step2Body: 'Hold the mic and say who took what, and for how much.',
    step3: 'Step 3',
    step3Body: 'Hisaab replies with a short text and an Urdu voice note, and the entry appears here.',
    sayNote: 'Use your real customer’s name and amount. Urdu, Pashto, Punjabi, Hindko and English all work.',
    waiting: 'Connected. Waiting for your first message…',
    heard: 'First message received.',
    altLead: 'Not holding your phone? Do it from here.',
    altSpeak: 'Speak here',
    altAdd: 'Type an entry',
  },
  ur: {
    titleDue: amt => [<>{amt} کا ادھار</>, 'باقی ہے۔'],
    titleClear: ['سب نے ادائیگی کر دی۔', 'کوئی ادھار باقی نہیں۔'],
    titleNew: name => (name ? [<>{name}،</>, 'آپ کا کھاتہ تیار ہے۔'] : ['آپ کا کھاتہ', 'تیار ہے۔']),
    leadOwe: n => (n === 1 ? 'ایک گاہک کے ذمے آپ کا ادھار ہے۔' : `${n} گاہکوں کے ذمے آپ کا ادھار ہے۔`),
    leadLongest: (name, d) => <>{name} نے سب سے زیادہ عرصے سے کچھ ادا نہیں کیا — {d} دن سے۔</>,
    leadNoWeek: 'کسی کو بغیر ادائیگی کے پورا ہفتہ نہیں ہوا۔',
    leadNoneOwe: n => (n === 0 ? 'ابھی آپ کا کوئی گاہک نہیں۔' : n === 1 ? 'آپ کے واحد گاہک کے ذمے کچھ باقی نہیں۔' : `آپ کے ${n} گاہکوں میں سے کسی کے ذمے کچھ باقی نہیں۔`),
    leadSuppliers: (n, amt) => `آپ نے ${n === 1 ? 'ایک سپلائر' : `${n} سپلائرز`} کے ${amt} دینے ہیں۔`,
    leadAdvance: amt => `${amt} ایڈوانس آپ کے پاس جمع ہیں۔`,
    leadTodayBoth: (g, c) => `آج آپ نے ${g} ادھار دیا اور ${c} وصول کیے۔`,
    leadTodayGave: g => `آج آپ نے ${g} ادھار دیا۔`,
    leadTodayGot: c => `آج آپ نے ${c} وصول کیے۔`,
    // U+2066/U+2069 keep the phone number left-to-right inside the Urdu sentence.
    leadNew: phone => `حساب آپ کے واٹس ایپ${phone ? ` (⁦${phone}⁩)` : ''} سے جڑ چکا ہے۔ وہاں آپ خود کو جو بھی بتائیں گے، وہ اس کھاتے میں لکھا جائے گا۔`,
    leadNewOff: 'واٹس ایپ جڑتے ہی، وہاں آپ خود کو جو بھی بتائیں گے، وہ اس کھاتے میں لکھا جائے گا۔',
    leadHeard: 'حساب کو آپ کا پہلا پیغام مل گیا ہے۔ کسی گاہک کا نام اور رقم بتائیں، پہلا اندراج یہاں نظر آئے گا۔',
    add: 'نیا اندراج',
    call: 'حساب سے بات کریں',

    people: n => `${n} گاہک`,
    top: n => `سرفہرست ${n}`,
    nobody: 'کوئی نہیں',
    flowMeta: (g, c) => `${g} دیا · ${c} وصول`,
    nothingYet: 'ابھی کچھ نہیں',
    noEntries: 'کوئی اندراج نہیں',
    biggest: amt => `سب سے بڑا ${amt}`,

    followTitle: 'تقاضا کریں',
    followLead: 'ان گاہکوں کے ذمے ادھار ہے اور انہوں نے 7 دن یا اس سے زیادہ عرصے سے کچھ ادا نہیں کیا۔ سب سے پرانا پہلے۔',
    followSum: amt => `ان کے ذمے کل ${amt} ہیں۔`,
    followNone: 'جن کے ذمے ادھار ہے، ان میں سے کسی کو بغیر ادائیگی کے 7 دن نہیں ہوئے۔',
    followClear: 'اس وقت کسی کے ذمے آپ کا کچھ باقی نہیں۔',
    colCustomer: 'گاہک',
    colOwes: 'بقایا',
    colUnpaid: 'بغیر ادائیگی',
    colLastPaid: 'آخری ادائیگی',
    colAction: 'یاد دہانی',
    days: d => `${d} دن`,
    never: 'کبھی نہیں',
    lastUdhaar: t => `آخری ادھار ${t}`,
    remind: 'یاد دلائیں',
    remindLabel: n => `${n} کو یاد دلائیں`,
    allCustomers: 'تمام گاہک',

    todayTitle: 'آج',
    todayUp: amt => `آج ادھار ${amt} بڑھا۔`,
    todayDown: amt => `آج ادھار ${amt} کم ہوا۔`,
    todayEven: 'آج جتنا ادھار دیا، اتنا ہی وصول ہوا۔',
    todayNone: 'آج ابھی نہ کوئی ادھار دیا گیا، نہ کچھ وصول ہوا۔',
    todayAllCancelled: 'آج کا سارا ادھار اور وصولی منسوخ ہو گئی۔',
    cellGiven: 'ادھار دیا',
    cellCollected: 'وصول ہوا',
    cellEntries: 'اندراجات',
    countEntries: n => (n === 1 ? '1 اندراج' : `${n} اندراجات`),
    countPayments: n => (n === 1 ? '1 ادائیگی' : `${n} ادائیگیاں`),
    forPeople: n => (n === 1 ? '1 گاہک کے لیے' : `${n} گاہکوں کے لیے`),
    cancelledN: n => `${n} منسوخ، شمار نہیں`,
    todayEmpty: 'جب بھی ادھار دیں یا پیسے ملیں، خود کو وائس نوٹ بھیج دیں، وہ یہاں نظر آئے گا۔',
    todayMore: n => (n === 1 ? 'آج کا ایک اور اندراج اپنے گاہک کے صفحے پر ہے' : `آج کے مزید ${n} اندراجات آپ کے گاہکوں کے صفحات پر ہیں`),
    supToday: (n, who, what) => (
      <>
        {n === 1 ? 'آج سپلائر کا کھاتہ' : 'آج سپلائرز کے کھاتے'}: {who}
        {what ? <> — {what}</> : null}۔ یہ ادھار سے الگ ہے
      </>
    ),
    supN: n => `${n} سپلائرز`,
    supBought: amt => `${amt} کا مال ادھار لیا`,
    supPaid: amt => `${amt} انہیں ادا کیے`,
    supJoin: '، ',

    trendTitle: 'پچھلے 14 دن',
    trendLead: (g, c) => `پچھلے 14 دنوں میں آپ نے ${g} ادھار دیا اور ${c} وصول کیے۔`,
    trend30: (g, c) => `30 دنوں میں ${g} دیا اور ${c} وصول ہوا۔`,
    trendQuiet: 'پچھلے 14 دنوں میں کچھ نہیں لکھا گیا۔',
    tabsLabel: 'چارٹ',
    tabFlow: 'دیا اور وصول',
    tabOut: 'باقی ادھار',
    tabNet: 'ایڈوانس کے بعد ادھار',
    flowTitle: 'روزانہ، روپوں میں',
    outTitle: 'ہر دن کے آخر میں، روپوں میں',
    given: 'ادھار دیا',
    collected: 'وصول ہوا',
    flowCaption: 'ہر نقطہ ایک دن کا کل ہے۔ جس دن کچھ نہیں لکھا گیا، وہ صفر کی لکیر پر ہے۔',
    outCaption: amt => `آج کے بقایا ${amt} اور ہر دن کے اندراجات سے پیچھے کی طرف حساب لگایا گیا۔`,
    netCaption: (amt, adv) => `ادھار میں سے ${adv} ایڈوانس منہا کر کے، آج کے ${amt} اور ہر دن کے اندراجات سے پیچھے کی طرف حساب لگایا گیا۔`,
    colDay: 'دن',
    chartToday: 'آج',
    tipFlow: (d, g, c) => `${d}: ادھار ${g}، وصول ${c}`,
    tipOut: (d, o) => `${d}: ${o} باقی`,

    largestTitle: 'سب سے بڑے بقایا جات',
    largestAll: 'جن کے ذمے ادھار ہے، سب سے بڑا بقایا پہلے۔',
    largestTop: (n, total) => `${total} بقایا جات میں سے سب سے بڑے ${n}۔`,

    recentTitle: 'حالیہ اندراجات',
    recentLead: 'آج سے پہلے کے، تازہ ترین پہلے۔',
    recentNone: 'آج سے پہلے کا ابھی کچھ نہیں۔',
    recentFull: 'یہ فہرست آج کے اندراجات سے بھر گئی ہے۔ پرانے اندراجات ہر گاہک کے صفحے پر ہیں۔',
    // U+2068/U+2069 isolate a name of either script; no curly quotes (Nastaliq draws them mirrored).
    recentEmpty: name => `ابھی کوئی اندراج نہیں۔ واٹس ایپ پر خود کو وائس نوٹ بھیجیں، جیسے ⁨${name}⁩ نے 500 کا سودا لیا۔`,
    allMessages: 'تمام پیغامات',
    colTime: 'وقت',
    colSource: 'ذریعہ',
    colAmount: 'رقم',
    cancelled: 'منسوخ',
    sources: {
      whatsapp_voice: 'واٹس ایپ وائس',
      whatsapp_text: 'واٹس ایپ میسج',
      whatsapp_photo: 'کھاتے کی تصویر',
      web_voice: 'ڈیش بورڈ وائس',
      web_text: 'ڈیش بورڈ',
      web: 'ڈیش بورڈ',
      call: 'کال',
      sample: 'نمونہ',
    },

    listsTitle: 'آپ کی لسٹیں',
    listsMeta: n => (n === 1 ? 'ایک لسٹ' : `${n} لسٹیں`),
    listsLeadTop: (name, amt, n) => <>سب سے زیادہ ادھار {name} میں ہے: {n === 1 ? 'ایک شخص' : `${n} لوگوں`} کے ذمے {amt}۔</>,
    listsLeadNone: 'اس وقت آپ کی کسی لسٹ میں کسی کے ذمے کچھ نہیں۔',
    listsLeadSup: amt => `آپ نے سپلائرز کے ${amt} دینے ہیں، جو ادھار سے الگ رکھے جاتے ہیں۔`,
    colList: 'لسٹ',
    colPeople: 'لوگ',
    colOwing: 'بقایا والے',
    colTotal: 'کل',
    colOpen: 'کھولیں',
    owingN: n => `${n} کے ذمے`,
    youOweN: n => `آپ نے ${n} کو دینا ہے`,
    nobodyOwes: 'کوئی نہیں',
    kindCustomers: 'گاہک',
    kindSuppliers: 'سپلائرز · آپ نے انہیں دینا ہے',
    openList: n => `\u2068${n}\u2069 کھولیں`,
    listsCaption: 'کل میں ہر لسٹ کے لوگوں کے ذمے کا بقایا جمع ہے؛ سپلائرز کی لسٹ میں وہ جو آپ نے انہیں دینا ہے۔',
    sampleBanner: link => <>اس میں نمونے کا ڈیٹا شامل ہے، جس پر نمونہ لکھا ہے — اسے {link} سے ہٹائیں۔</>,
    settingsLink: 'سیٹنگز',

    fnUnpaidLead: 'بغیر ادائیگی۔',
    fnUnpaid: 'گاہک کی آخری ادائیگی سے، یا اگر کبھی ادائیگی نہیں کی تو پہلے ادھار سے، اب تک کے دن۔ اس فہرست میں زیادہ سے زیادہ چھ لوگ ہوتے ہیں؛ سب گاہک، گاہکوں والے صفحے پر ہیں۔',
    fnDaysLead: 'دن اور میزان۔',
    fnDays: 'دن پاکستانی وقت کے مطابق آدھی رات سے آدھی رات تک گنے جاتے ہیں۔ اس صفحے کے ہر میزان میں منسوخ اندراجات شامل نہیں۔',

    firstTitle: 'اپنا پہلا وائس نوٹ بھیجیں',
    firstLead: 'واٹس ایپ پر خود کو بتائیں کہ کیا ہوا، بالکل ویسے جیسے دکان پر بولتے ہیں۔ ایک جملہ کافی ہے۔',
    // U+2066/U+2069 keep the English chat name left-to-right inside Urdu (Nastaliq would mirror curly quotes).
    sayLabel: '⁦Message yourself⁩ میں یہ بولیں',
    sayUr: 'عمر نے 500 روپے کا سودا لیا',
    sayRoman: 'Umar ne 500 rupaye ka sauda liya',
    step1: 'پہلا قدم',
    step1Body: 'واٹس ایپ میں ⁦Message yourself⁩ کھولیں — یعنی اپنے نمبر والی چیٹ۔',
    step2: 'دوسرا قدم',
    step2Body: 'مائیک دبا کر بتائیں کس نے کیا لیا، اور کتنے کا۔',
    step3: 'تیسرا قدم',
    step3Body: 'حساب مختصر تحریر اور اردو وائس نوٹ سے جواب دے گا، اور اندراج یہاں آ جائے گا۔',
    sayNote: 'اپنے اصل گاہک کا نام اور رقم بولیں۔ اردو، پشتو، پنجابی، ہندکو اور انگریزی سب چلتی ہیں۔',
    waiting: 'منسلک ہے۔ آپ کے پہلے پیغام کا انتظار ہے…',
    heard: 'پہلا پیغام موصول ہو گیا۔',
    altLead: 'فون پاس نہیں؟ یہیں سے کر لیں۔',
    altSpeak: 'یہاں بولیں',
    altAdd: 'لکھ کر اندراج کریں',
  },
}

/* ---------------------------------------------------------------- helpers */

const TZ = 'Asia/Karachi'
// ov.recent holds this many of the newest entries (server: recentEntries(tenantId, 12)).
const RECENT_LIMIT = 12
const URDU = /[؀-ۿ]/
const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
// Latin runs (amounts, times) inside an Urdu sentence sit in a left-to-right isolate.
const isolate = (s, lang) => (lang === 'ur' ? `⁦${s}⁩` : s)
// "Rs 1,000" never breaks between "Rs" and the number.
const rs = (n, lang) => isolate(`${n < 0 ? '−' : ''}${money(n).replace(' ', ' ')}`, lang)
// U+2060 (word joiner) keeps a footnote marker on the line of the word before it.
const WJ = '⁠'
const nameOf = (c, lang) => (lang === 'ur' && c?.nameUrdu) || c?.name || ''
const sum = (list, key) => list.reduce((s, d) => s + (d[key] || 0), 0)

function editionDate(lang) {
  return new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function clock(ts, lang) {
  return isolate(new Date(ts).toLocaleTimeString('en-PK', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }), lang)
}

function dayLabel(day, lang, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${day}T12:00:00+05:00`).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: TZ, ...opts })
}

/** A name, phone or item list in the right script: Urdu islands get Nastaliq, Latin islands stay Latin. */
function Island({ text, lang }) {
  const urdu = URDU.test(text)
  if (urdu && lang !== 'ur') return <span className="ur" lang="ur">{text}</span>
  if (!urdu && lang === 'ur') return <bdi className="latin" lang="en">{text}</bdi>
  return <bdi>{text}</bdi>
}

/**
 * Supplier khatas with entries today. The overview leaves suppliers out of Today (they are not udhaar), so a
 * supplier-only day would otherwise read as empty: find them from the people list, and add up today's live entries.
 */
function useSuppliersToday(ov) {
  const has = (ov?.totals?.suppliers || 0) > 0
  const { data: people } = useResource(has ? '/api/customers' : null, { refreshOn: ['ledger'] })
  const todayKey = dayKey(Date.now())
  const active = useMemo(
    () => (has && people ? people.filter(p => p.listKind === 'suppliers' && p.lastEntryAt && dayKey(p.lastEntryAt) === todayKey) : []),
    [has, people, todayKey],
  )
  const [sums, setSums] = useState(null)
  useEffect(() => {
    if (!active.length) {
      setSums(null)
      return undefined
    }
    let stale = false
    Promise.all(active.map(p => api(`/api/customers/${encodeURIComponent(p.id)}`)))
      .then(details => {
        if (stale) return
        let bought = 0
        let paid = 0
        for (const d of details) {
          for (const e of d.entries || []) {
            if (e.voidedAt || dayKey(e.createdAt) !== todayKey) continue
            if (e.kind === 'credit') bought += e.amount
            else paid += e.amount
          }
        }
        setSums({ ids: active.map(p => p.id).join(), bought, paid })
      })
      .catch(() => {
        if (!stale) setSums(null)
      })
    return () => {
      stale = true
    }
  }, [active, todayKey])
  if (!active.length) return null
  // Amounts only when they were added up for exactly these suppliers (never a stale or partial sum).
  const fresh = sums && sums.ids === active.map(p => p.id).join() ? sums : null
  return { people: active, bought: fresh?.bought ?? null, paid: fresh?.paid ?? null }
}

function MoreLink({ to, children }) {
  return (
    <Link className="link-arrow" to={to}>
      {children}
      <Icon name="arrow-right" className="flip-rtl" />
    </Link>
  )
}

function TitleLines({ lines }) {
  return lines.map((line, i) => (
    <span key={i} className="home-title-line">
      {line}
      {i < lines.length - 1 && ' '}
    </span>
  ))
}

/* ---------------------------------------------------------------- page */

export default function Home() {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const { me } = useMe()
  const W = useListWords()
  const { data: ov, error, reload } = useResource('/api/overview', { refreshOn: ['ledger'] })
  // Is clearly-labelled sample data in this shop? (ops route; the lists' own flags are the fallback.)
  const { data: sampleState, error: sampleError } = useResource('/api/sample-data', { refreshOn: ['ledger'] })
  const [entryOpen, setEntryOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [remindFor, setRemindFor] = useState(null)
  // True while the guide's own recorder is recording or showing its result. That first voice note creates the
  // first customer, which would otherwise swap the guide (and the recorder's result sheet) out mid-wait.
  const [firstMicBusy, setFirstMicBusy] = useState(false)

  // Stable handlers: Sheet re-runs its focus effect whenever onClose changes.
  const openEntry = useCallback(() => setEntryOpen(true), [])
  const closeEntry = useCallback(() => setEntryOpen(false), [])
  const openCall = useCallback(() => setCallOpen(true), [])
  const closeCall = useCallback(() => setCallOpen(false), [])
  const closeRemind = useCallback(() => setRemindFor(null), [])
  const quietReload = useCallback(() => reload(true), [reload])
  const supToday = useSuppliersToday(ov)

  // A shop with only suppliers is not new: the guide is for a khata with nobody in it.
  const guide = Boolean(ov) && (firstMicBusy || ov.totals.customers + (ov.totals.suppliers || 0) === 0)
  const realLists = (ov?.lists || []).filter(l => l.id)
  const samplePresent = sampleState ? Boolean(sampleState.present) : Boolean(sampleError) && (ov?.lists || []).some(l => l.sample)
  // Example sentences use one of this shop's own customers once there are any, in the current language's script.
  const sample = ov?.largest?.[0] || ov?.recent?.[0]?.customer
  const exampleName = lang === 'ur' ? sample?.nameUrdu || sample?.name || 'عمر' : sample?.name || 'Umar'
  const shop = me.shopName || me.phoneLocal
  const connected = me.whatsapp?.status === 'connected'

  const todayKey = dayKey(Date.now())
  const recent = ov?.recent || []
  const todayRows = recent.filter(e => dayKey(e.createdAt) === todayKey)
  const earlierRows = recent.filter(e => dayKey(e.createdAt) !== todayKey)
  // A busy day can fill the whole recent list, so older entries may exist without being in it.
  const recentFull = recent.length >= RECENT_LIMIT && earlierRows.length === 0

  const eyebrow = (
    <>
      <span className="home-eyebrow-shop">
        <Island text={shop} lang={lang} />
      </span>
      <span className="home-eyebrow-sep" aria-hidden="true">·</span>
      <span>{editionDate(lang)}</span>
    </>
  )

  let title
  let lead
  let toc
  if (!ov) {
    title = error ? (
      <Island text={shop} lang={lang} />
    ) : (
      <span className="home-skel-title" aria-hidden="true">
        <Skeleton width="min(9em, 80vw)" height="0.86em" />
        <Skeleton width="min(6em, 56vw)" height="0.86em" />
      </span>
    )
  } else if (guide) {
    const owner = me.ownerName ? <Island text={me.ownerName} lang={lang} /> : null
    title = <TitleLines lines={S.titleNew(owner)} />
    lead = me.firstMessageAt ? S.leadHeard : connected ? S.leadNew(me.phoneLocal) : S.leadNewOff
  } else {
    const { totals, today } = ov
    title =
      totals.due > 0 ? (
        <TitleLines lines={S.titleDue(<span className="home-amt">{money(totals.due)}</span>)} />
      ) : (
        <TitleLines lines={S.titleClear} />
      )
    lead = <HeaderLead ov={ov} S={S} lang={lang} />
    const follow = ov.followUp || []
    const followN = follow.length
    // The server sends at most 6 follow-ups and no overdue total; say "top 6" only when a 7+ day balance is
    // known to be left out (one of the largest balances that is not in the list).
    const moreOverdue = followN === 6 && (ov.largest || []).some(c => (c.unpaidDays ?? 0) >= 7 && !follow.some(f => f.id === c.id))
    const days = ov.daily || []
    const given14 = sum(days, 'given')
    const collected14 = sum(days, 'collected')
    toc = [
      {
        label: S.followTitle,
        href: '#follow-up',
        meta: followN === 0 ? S.nobody : moreOverdue ? S.top(followN) : S.people(followN),
      },
      {
        label: S.todayTitle,
        href: '#today',
        meta: today.givenCount + today.collectedCount === 0 ? S.nothingYet : S.flowMeta(rs(today.given, lang), rs(today.collected, lang)),
      },
      realLists.length > 0 && { label: S.listsTitle, href: '#lists', meta: S.listsMeta(realLists.length) },
      {
        label: S.trendTitle,
        href: '#trend',
        meta: given14 + collected14 === 0 ? S.noEntries : S.flowMeta(rs(given14, lang), rs(collected14, lang)),
      },
      ov.largest?.length > 0 && { label: S.largestTitle, href: '#largest', meta: S.biggest(rs(ov.largest[0].balance, lang)) },
      { label: S.recentTitle, href: '#recent', meta: earlierRows.length ? S.countEntries(earlierRows.length) : recentFull ? null : S.noEntries },
    ].filter(Boolean)
  }

  const actions = guide ? null : (
    <>
      <Button variant="primary" icon="plus" onClick={openEntry}>{S.add}</Button>
      <Button variant="secondary" icon="phone" onClick={openCall}>{S.call}</Button>
      <MicRecorder variant="secondary" />
    </>
  )

  let body
  if (!ov && error) body = <LoadError onRetry={() => reload()} />
  else if (!ov) body = <HomeSkeleton />
  else if (guide) body = <FirstNote me={me} S={S} connected={connected} onAdd={openEntry} onCall={openCall} onMicActive={setFirstMicBusy} />
  else
    body = (
      <Edition ov={ov} S={S} W={W} lang={lang} supToday={supToday} todayRows={todayRows} earlierRows={earlierRows} recentFull={recentFull} exampleName={exampleName} onRemind={setRemindFor} />
    )

  return (
    <div className="home-page">
      {samplePresent && (
        <p className="banner info home-sample" role="note">
          <Icon name="info" />
          <span className="banner-text">
            {S.sampleBanner(
              <Link to="/app/settings#set-sample" className="home-sample-link">
                {S.settingsLink}
              </Link>,
            )}
          </span>
        </p>
      )}
      <PageHeader className="home-header" eyebrow={eyebrow} title={title} lead={lead} actions={actions} toc={toc} />

      {body}

      <EntrySheet open={entryOpen} onClose={closeEntry} onSaved={quietReload} />
      <ReminderSheet open={Boolean(remindFor)} onClose={closeRemind} customer={remindFor} onChanged={quietReload} />
      <LiveCall open={callOpen} onClose={closeCall} hintName={exampleName} />
    </div>
  )
}

/** "6 customers owe you. Gul Khan has gone longest without paying — 41 days. Today you gave Rs 500…" */
function HeaderLead({ ov, S, lang }) {
  const { totals, today } = ov
  const longest = ov.followUp?.[0]
  const parts = []
  if (totals.due > 0) {
    parts.push(S.leadOwe(totals.customersWithDue))
    parts.push(longest ? S.leadLongest(<Island text={nameOf(longest, lang)} lang={lang} />, longest.unpaidDays) : S.leadNoWeek)
  } else {
    parts.push(S.leadNoneOwe(totals.customers))
  }
  if (totals.advance > 0) parts.push(S.leadAdvance(rs(totals.advance, lang)))
  if (totals.payable > 0) parts.push(S.leadSuppliers(totals.suppliersWithDue, rs(totals.payable, lang)))
  if (today.given > 0 && today.collected > 0) parts.push(S.leadTodayBoth(rs(today.given, lang), rs(today.collected, lang)))
  else if (today.given > 0) parts.push(S.leadTodayGave(rs(today.given, lang)))
  else if (today.collected > 0) parts.push(S.leadTodayGot(rs(today.collected, lang)))
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && ' '}
      {p}
    </span>
  ))
}

/* ---------------------------------------------------------------- the edition */

function Edition({ ov, S, W, lang, supToday, todayRows, earlierRows, recentFull, exampleName, onRemind }) {
  const hasLists = (ov.lists || []).some(l => l.id)
  const days = ov.daily || []
  const active = days.some(d => d.given > 0 || d.collected > 0)
  const hasFollow = (ov.followUp?.length || 0) > 0
  const hasLargest = (ov.largest?.length || 0) > 0

  // Footnotes are numbered in the order they are referenced on the page.
  const notes = []
  if (hasFollow) notes.push({ id: 'unpaid', lead: S.fnUnpaidLead, text: S.fnUnpaid })
  notes.push({ id: 'days', lead: S.fnDaysLead, text: S.fnDays })
  const noteN = id => notes.findIndex(n => n.id === id) + 1

  const rail = [
    { id: 'follow-up', label: S.followTitle },
    { id: 'today', label: S.todayTitle },
    hasLists && { id: 'lists', label: S.listsTitle },
    { id: 'trend', label: S.trendTitle },
    hasLargest && { id: 'largest', label: S.largestTitle },
    { id: 'recent', label: S.recentTitle },
  ].filter(Boolean)

  return (
    <>
      <FollowUp ov={ov} S={S} lang={lang} onRemind={onRemind} note={hasFollow ? noteN('unpaid') : 0} />
      <Today ov={ov} rows={todayRows} sup={supToday} S={S} lang={lang} />
      {hasLists && <Lists ov={ov} S={S} W={W} lang={lang} />}
      <Trend ov={ov} days={days} active={active} S={S} lang={lang} note={noteN('days')} />
      {hasLargest && <Largest ov={ov} S={S} lang={lang} />}
      <Recent rows={earlierRows} any={(ov.recent?.length || 0) > 0} full={recentFull} S={S} lang={lang} exampleName={exampleName} />
      <Footnotes className="home-notes" items={notes} />
      <SectionRail sections={rail} />
    </>
  )
}

function SectionHead({ id, title, children }) {
  return (
    <div className="section-head home-wide">
      <h2 id={id}>{title}</h2>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- [1] follow up */

function FollowUp({ ov, S, lang, onRemind, note }) {
  const list = ov.followUp || []
  const total = sum(list, 'balance')
  return (
    <section className="section" id="follow-up" aria-labelledby="follow-up-h">
      <SectionHead id="follow-up-h" title={S.followTitle}>
        <MoreLink to="/app/customers">{S.allCustomers}</MoreLink>
      </SectionHead>
      {list.length === 0 ? (
        <p className="section-lead home-quiet">{ov.totals.customersWithDue > 0 ? S.followNone : S.followClear}</p>
      ) : (
        <>
          <p className="section-lead">
            {S.followLead} {S.followSum(rs(total, lang))}
            {note > 0 && (
              <>
                {WJ}
                <FootnoteRef n={note} id="unpaid" />
              </>
            )}
          </p>
          <div className="grid-table-wrap home-wide">
            <table className="grid-table stack-sm home-follow" aria-labelledby="follow-up-h">
              <thead>
                <tr>
                  <th scope="col">{S.colCustomer}</th>
                  <th scope="col" className="hl end">{S.colOwes}</th>
                  <th scope="col" className="end">{S.colUnpaid}</th>
                  <th scope="col">{S.colLastPaid}</th>
                  <th scope="col">
                    <span className="sr-only">{S.colAction}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => {
                  const name = nameOf(c, lang)
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        <Link to={`/app/customers/${c.id}`} className="home-follow-name">
                          <Island text={name} lang={lang} />
                        </Link>
                        {c.lastCreditAt && <span className="sub">{S.lastUdhaar(when(c.lastCreditAt, lang, { withTime: false }))}</span>}
                      </th>
                      <td className="hl end" data-label={S.colOwes}>
                        <Money value={c.balance} tone="owed" />
                      </td>
                      <td className="end" data-label={S.colUnpaid}>
                        <span className={c.unpaidDays >= 30 ? 'home-days is-long' : 'home-days'}>{S.days(c.unpaidDays)}</span>
                      </td>
                      <td data-label={S.colLastPaid}>
                        {c.lastPaymentAt ? when(c.lastPaymentAt, lang, { withTime: false }) : <span className="muted">{S.never}</span>}
                      </td>
                      <td className="home-act">
                        <Button size="sm" icon="whatsapp" aria-label={S.remindLabel(name)} onClick={() => onRemind(c)}>
                          {S.remind}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- [2] today */

function Today({ ov, rows, sup, S, lang }) {
  const { today } = ov
  const count = today.givenCount + today.collectedCount
  const live = rows.filter(e => !e.voidedAt)
  const voided = rows.length - live.length
  // ov.recent holds the RECENT_LIMIT newest entries; a busy day can have more than that.
  const more = Math.max(0, count - live.length)
  const people = new Set(live.map(e => e.customer.id)).size
  const net = today.given - today.collected
  const lead = count === 0 ? (rows.length > 0 ? S.todayAllCancelled : S.todayNone) : net > 0 ? S.todayUp(rs(net, lang)) : net < 0 ? S.todayDown(rs(-net, lang)) : S.todayEven
  const entriesSub = voided > 0 ? S.cancelledN(voided) : count === 0 ? S.nothingYet : more === 0 ? S.forPeople(people) : null

  const cells = [
    {
      label: S.cellGiven,
      value: (
        <>
          <Money value={today.given} tone={today.given > 0 ? 'owed' : 'neutral'} />
          <span className="home-cell-sub">{S.countEntries(today.givenCount)}</span>
        </>
      ),
    },
    {
      label: S.cellCollected,
      value: (
        <>
          <Money value={today.collected} tone={today.collected > 0 ? 'paid' : 'neutral'} />
          <span className="home-cell-sub">{S.countPayments(today.collectedCount)}</span>
        </>
      ),
    },
    {
      label: S.cellEntries,
      value: (
        <>
          <span className="home-cell-big num">{count}</span>
          {entriesSub && <span className="home-cell-sub">{entriesSub}</span>}
        </>
      ),
    },
  ]

  return (
    <section className="section" id="today" aria-labelledby="today-h">
      <SectionHead id="today-h" title={S.todayTitle} />
      <p className="section-lead">{lead}</p>
      <Frame flush className="home-wide home-today">
        <LabeledCells cells={cells} framed={false} min={180} className="home-today-cells" />
        {rows.length > 0 ? <EntryTable rows={rows} S={S} lang={lang} timeOnly labelledBy="today-h" /> : !sup && <p className="home-frame-note">{S.todayEmpty}</p>}
        {more > 0 && (
          <p className="home-frame-note home-frame-more">
            {/* Dashboard and call entries have no message, so point at the customers, most recently active first. */}
            <MoreLink to="/app/customers?sort=recent">{S.todayMore(more)}</MoreLink>
          </p>
        )}
        {sup && <SuppliersToday sup={sup} S={S} lang={lang} />}
      </Frame>
    </section>
  )
}

/** "Supplier khata today: Rehman Traders — Rs 15,000 of goods on credit. Kept apart from udhaar →" */
function SuppliersToday({ sup, S, lang }) {
  const n = sup.people.length
  const one = n === 1 ? sup.people[0] : null
  const sameList = sup.people.every(p => p.listId === sup.people[0].listId)
  const to = one ? `/app/customers/${one.id}` : sameList ? listHref(sup.people[0].listId) : '/app/customers'
  const who = one ? <Island text={nameOf(one, lang)} lang={lang} /> : S.supN(n)
  const parts = [sup.bought > 0 && S.supBought(rs(sup.bought, lang)), sup.paid > 0 && S.supPaid(rs(sup.paid, lang))].filter(Boolean)
  return (
    <p className="home-frame-note home-frame-more">
      {/* One span: .link-arrow is a flex row, so loose text and the name would become separate items. */}
      <MoreLink to={to}>
        <span>{S.supToday(n, who, parts.length ? parts.join(S.supJoin) : null)}</span>
      </MoreLink>
    </p>
  )
}

/* ---------------------------------------------------------------- your lists */

/** General and every list: people, who owes, and the total — a suppliers list's total is what the shop owes them. */
function Lists({ ov, S, W, lang }) {
  const rows = ov.lists || []
  const top = rows
    .filter(l => l.kind !== 'suppliers' && l.total > 0)
    .sort((a, b) => b.total - a.total)[0]
  const payable = rows.filter(l => l.kind === 'suppliers').reduce((s, l) => s + l.total, 0)
  return (
    <section className="section" id="lists" aria-labelledby="lists-h">
      <SectionHead id="lists-h" title={S.listsTitle}>
        <MoreLink to="/app/customers">{S.allCustomers}</MoreLink>
      </SectionHead>
      <p className="section-lead">
        {top ? S.listsLeadTop(<Island text={listName(top, lang, W)} lang={lang} />, rs(top.total, lang), top.owing) : S.listsLeadNone}
        {payable > 0 && <> {S.listsLeadSup(rs(payable, lang))}</>}
      </p>
      <div className="grid-table-wrap home-wide">
        <table className="grid-table stack-sm home-lists" aria-labelledby="lists-h">
          <caption>{S.listsCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{S.colList}</th>
              <th scope="col" className="end">{S.colPeople}</th>
              <th scope="col">{S.colOwing}</th>
              <th scope="col" className="hl end">{S.colTotal}</th>
              <th scope="col">
                <span className="sr-only">{S.colOpen}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(l => {
              const sup = l.kind === 'suppliers'
              const name = listName(l, lang, W)
              return (
                <tr key={l.id || 'general'} className={sup ? 'is-suppliers' : undefined}>
                  <th scope="row">
                    <Link to={listHref(l.id)} className="home-list-name">
                      <Island text={name} lang={lang} />
                    </Link>
                    <span className="sub home-list-sub">
                      <span className={sup ? 'lst-payable' : undefined}>{sup ? S.kindSuppliers : S.kindCustomers}</span>
                      {l.sample && <SampleBadge W={W} />}
                    </span>
                  </th>
                  <td className="end num" data-label={S.colPeople}>
                    {l.people}
                  </td>
                  <td data-label={S.colOwing}>
                    {l.owing ? <span className={sup ? 'lst-payable' : 'home-list-owing'}>{sup ? S.youOweN(l.owing) : S.owingN(l.owing)}</span> : <span className="muted">{S.nobodyOwes}</span>}
                  </td>
                  <td className="hl end" data-label={S.colTotal}>
                    <Money value={l.total} tone={l.total > 0 ? (sup ? 'payable' : 'owed') : 'neutral'} />
                  </td>
                  <td className="home-act">
                    <Button size="sm" variant="ghost" iconEnd="arrow-right" to={listHref(l.id)} aria-label={S.openList(name)}>
                      {S.colOpen}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- [3] last 14 days */

function Trend({ ov, days, active, S, lang, note }) {
  const [view, setView] = useState('flow')
  const { due, advance } = ov.totals
  const net = due - advance
  // Balance at the end of each day, walked back from today's balance through each day's net entries.
  const outstanding = useMemo(() => {
    const out = new Array(days.length)
    let b = net
    for (let i = days.length - 1; i >= 0; i--) {
      out[i] = b
      b -= days[i].given - days[i].collected
    }
    return out
  }, [days, net])

  const given = sum(days, 'given')
  const collected = sum(days, 'collected')
  const last30 = ov.last30 || { given: 0, collected: 0 }
  const outLabel = advance > 0 ? S.tabNet : S.tabOut
  const range = days.length ? `${dayLabel(days[0].day, lang, { day: 'numeric', month: 'short' })} – ${dayLabel(days[days.length - 1].day, lang, { day: 'numeric', month: 'short' })}` : ''

  const flow = view === 'flow'
  const lines = flow
    ? [
        { key: 'given', tone: 'owed', values: days.map(d => d.given) },
        { key: 'collected', tone: 'paid', values: days.map(d => d.collected) },
      ]
    : [{ key: 'out', tone: 'owed', values: outstanding }]
  const tip = i =>
    flow
      ? S.tipFlow(dayLabel(days[i].day, lang), rs(days[i].given, lang), rs(days[i].collected, lang))
      : S.tipOut(dayLabel(days[i].day, lang), rs(outstanding[i], lang))
  const caption = flow ? S.flowCaption : advance > 0 ? S.netCaption(rs(net, lang), rs(advance, lang)) : S.outCaption(rs(net, lang))

  return (
    <section className="section" id="trend" aria-labelledby="trend-h">
      <SectionHead id="trend-h" title={S.trendTitle} />
      <p className={active ? 'section-lead' : 'section-lead home-quiet'}>
        {active ? (
          <>
            {S.trendLead(rs(given, lang), rs(collected, lang))} {S.trend30(rs(last30.given, lang), rs(last30.collected, lang))}
          </>
        ) : (
          S.trendQuiet
        )}
        {WJ}
        <FootnoteRef n={note} id="days" />
      </p>

      {active && (
        <div className="tabs-block home-wide">
          <Tabs
            id="home-trend"
            controls="home-trend-panel"
            label={S.tabsLabel}
            value={view}
            onChange={setView}
            tabs={[
              { value: 'flow', label: S.tabFlow },
              { value: 'out', label: outLabel },
            ]}
          />
          <TabPanel tabsId="home-trend" value={view} className="home-trend-panel">
            <Figure caption={caption}>
              <Frame
                title={flow ? S.flowTitle : S.outTitle}
                meta={range}
                legend={flow ? [{ label: S.given, tone: 'owed' }, { label: S.collected, tone: 'paid' }] : [{ label: outLabel, tone: 'owed' }]}
              >
                <LineChart days={days} lines={lines} zero={flow} tip={tip} todayLabel={S.chartToday} />
                {/* Tables ignore the 1px clip trick, so the screen-reader copy lives in a clipped wrapper. */}
                <div className="sr-only">
                  <table>
                    <caption>{`${S.trendTitle}: ${flow ? S.tabFlow : outLabel}`}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{S.colDay}</th>
                        {flow ? (
                          <>
                            <th scope="col">{S.given}</th>
                            <th scope="col">{S.collected}</th>
                          </>
                        ) : (
                          <th scope="col">{outLabel}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d, i) => (
                        <tr key={d.day}>
                          <th scope="row">{dayLabel(d.day, lang)}</th>
                          {flow ? (
                            <>
                              <td>{money(d.given)}</td>
                              <td>{money(d.collected)}</td>
                            </>
                          ) : (
                            <td>{rs(outstanding[i], lang)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Frame>
            </Figure>
          </TabPanel>
        </div>
      )}
    </section>
  )
}

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Nice round ticks (steps of 1, 2, 2.5 or 5 × 10^n) covering lo…hi. */
function niceTicks(lo, hi, count = 4) {
  if (hi === lo) {
    const pad = Math.abs(hi) * 0.1 || 1
    lo -= pad
    hi += pad
  }
  const raw = (hi - lo) / count
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

// Axis and point labels stay short so they fit at 360px: 2,500 · 12.5K · 1.25L (lakh) · 2.5Cr (crore).
const compact = n => {
  const a = Math.abs(n)
  const s =
    a >= 1e7
      ? `${+(a / 1e7).toFixed(2)}Cr`
      : a >= 1e5
        ? `${+(a / 1e5).toFixed(2)}L`
        : a >= 1e4
          ? `${+(a / 1e3).toFixed(1)}K`
          : a.toLocaleString('en-PK', { maximumFractionDigits: 1 })
  return n < 0 ? `−${s}` : s
}

/** Dot-and-line chart, drawn at the measured pixel width so text stays 11px at every size. Always LTR (time runs left to right). */
function LineChart({ days, lines, zero, tip, todayLabel }) {
  const box = useRef(null)
  const width = useWidth(box)
  const height = width && width < 480 ? 220 : 260
  const n = days.length

  let svg = null
  if (width > 0 && n > 0) {
    const P = { top: 30, bottom: 30, start: 48, end: 14 }
    const values = lines.flatMap(l => l.values)
    const ticks = niceTicks(zero ? 0 : Math.min(...values), Math.max(...values))
    const lo = ticks[0]
    const hi = ticks[ticks.length - 1]
    const base = height - P.bottom
    const plotH = base - P.top
    const slot = (width - P.start - P.end) / n
    const X = i => P.start + slot * (i + 0.5)
    const Y = v => P.top + (1 - (v - lo) / (hi - lo)) * plotH
    const last = n - 1
    const every = slot >= 34 ? 1 : slot >= 17 ? 2 : 3
    const r = slot < 24 ? 3.5 : 5

    // Value labels on each series' peak (and on today when there is room): above the dot, else below, else left
    // out. Boxes are centred; a label must clear the dots and the labels already placed.
    const dots = lines.flatMap(l => l.values.map((v, i) => ({ x: X(i), y: Y(v), w: 2 * r + 4, h: 2 * r + 4 })))
    const placed = []
    const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
    const free = box => !dots.some(d => hits(box, d)) && !placed.some(p => hits(box, p))
    for (const l of lines) {
      let peak = 0
      l.values.forEach((v, i) => {
        if (v >= l.values[peak]) peak = i
      })
      for (const i of new Set(slot >= 34 ? [peak, last] : [peak])) {
        const v = l.values[i]
        if (zero && v <= 0) continue
        const text = `Rs ${compact(v)}`
        const w = text.length * 6.2
        const x = Math.min(Math.max(X(i), P.start + w / 2), width - P.end - w / 2)
        const spots = [Y(v) - 11, Y(v) + 19].filter(y => y > 10 && y < base - 4)
        const y = spots.find(y => free({ x, y: y - 4, w, h: 13 }))
        if (y != null) placed.push({ key: `${l.key}-${i}`, x, y: y - 4, w, h: 13, base: y, text })
      }
    }

    svg = (
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        <g className="grid">
          {ticks.slice(1).map(t => (
            <line key={t} x1={P.start} x2={width - P.end} y1={Math.round(Y(t)) + 0.5} y2={Math.round(Y(t)) + 0.5} />
          ))}
        </g>
        <path className="axis" d={`M${P.start + 0.5},${P.top - 8}V${base + 0.5}H${width - P.end}`} />
        {ticks.map(t => (
          <text key={t} x={P.start - 8} y={Y(t)} dy="0.32em" textAnchor="end">
            {compact(t)}
          </text>
        ))}
        {days.map((d, i) =>
          (last - i) % every === 0 ? (
            <text
              key={d.day}
              className={i === last ? (slot >= 34 ? 'home-chart-today is-word' : 'home-chart-today') : undefined}
              x={X(i)}
              y={height - 9}
              textAnchor="middle"
            >
              {i === last && slot >= 34 ? todayLabel : Number(d.day.slice(8))}
            </text>
          ) : null,
        )}
        {lines.map(l => (
          <g key={l.key}>
            <path className={`line ${l.tone}`} d={l.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')} />
            {l.values.map((v, i) => (
              <circle key={i} className={`marker ${l.tone}`} cx={X(i)} cy={Y(v)} r={zero && v === 0 ? 2.5 : r} />
            ))}
          </g>
        ))}
        {placed.map(p => (
          <text key={p.key} className="value" x={p.x} y={p.base} textAnchor="middle">
            {p.text}
          </text>
        ))}
        {days.map((d, i) => (
          <g key={d.day} className="home-chart-day">
            <title>{tip(i)}</title>
            <line className="home-chart-guide" x1={Math.round(X(i)) + 0.5} x2={Math.round(X(i)) + 0.5} y1={P.top - 8} y2={base} />
            <rect className="home-chart-hit" x={P.start + slot * i} y={P.top - 8} width={slot} height={base - P.top + 8} />
          </g>
        ))}
      </svg>
    )
  }

  return (
    <div ref={box} className="home-chart" style={{ height }}>
      {svg}
    </div>
  )
}

/* ---------------------------------------------------------------- [4] largest balances */

function Largest({ ov, S, lang }) {
  const list = ov.largest || []
  const all = ov.totals.customersWithDue <= list.length
  return (
    <section className="section" id="largest" aria-labelledby="largest-h">
      <SectionHead id="largest-h" title={S.largestTitle}>
        <MoreLink to="/app/customers">{S.allCustomers}</MoreLink>
      </SectionHead>
      <p className="section-lead">{all ? S.largestAll : S.largestTop(list.length, ov.totals.customersWithDue)}</p>
      <Toc
        className="home-largest"
        label={S.largestTitle}
        items={list.map(c => ({
          to: `/app/customers/${c.id}`,
          label: <Island text={nameOf(c, lang)} lang={lang} />,
          meta: <Money value={c.balance} tone="owed" />,
        }))}
      />
    </section>
  )
}

/* ---------------------------------------------------------------- [5] recent entries */

function Recent({ rows, any, full, S, lang, exampleName }) {
  return (
    <section className="section" id="recent" aria-labelledby="recent-h">
      <SectionHead id="recent-h" title={S.recentTitle}>
        <MoreLink to="/app/activity">{S.allMessages}</MoreLink>
      </SectionHead>
      {rows.length > 0 ? (
        <>
          <p className="section-lead">{S.recentLead}</p>
          <Frame flush className="home-wide">
            <EntryTable rows={rows} S={S} lang={lang} labelledBy="recent-h" />
          </Frame>
        </>
      ) : (
        <p className="section-lead home-quiet">{full ? S.recentFull : any ? S.recentNone : S.recentEmpty(exampleName)}</p>
      )}
    </section>
  )
}

function EntryTable({ rows, S, lang, timeOnly, labelledBy }) {
  const C = useCommon()
  return (
    <table className="ledger-table home-entries" aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col">{S.colTime}</th>
          <th scope="col">{S.colCustomer}</th>
          <th scope="col">{S.colSource}</th>
          <th scope="col" className="end">{S.colAmount}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(e => {
          const credit = e.kind === 'credit'
          const voided = Boolean(e.voidedAt)
          const items = (e.items || []).join(', ')
          return (
            <tr key={e.id} className={voided ? 'is-void' : undefined}>
              <td className={timeOnly ? 'home-e-time num' : 'home-e-time'}>{timeOnly ? clock(e.createdAt, lang) : when(e.createdAt, lang)}</td>
              <th scope="row" className="home-e-who">
                <Link to={`/app/customers/${e.customer.id}`}>
                  <Island text={nameOf(e.customer, lang)} lang={lang} />
                </Link>
                <span className="sub">
                  {credit ? C.credit : C.payment}
                  {items && (
                    <>
                      {' · '}
                      <Island text={items} lang={lang} />
                    </>
                  )}
                  {voided && ` · ${S.cancelled}`}
                </span>
              </th>
              <td className="home-e-src">
                <Badge className="outline">{S.sources[e.source] || S.sources.web}</Badge>
              </td>
              <td className="home-e-amt end">
                <Money value={e.amount} tone={voided ? 'neutral' : credit ? 'owed' : 'paid'} sign={e.kind} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- new shop: the first note */

function FirstNote({ me, S, connected, onAdd, onCall, onMicActive }) {
  const heard = Boolean(me.firstMessageAt)
  return (
    <section className="section" id="first-note" aria-labelledby="first-note-h">
      <SectionHead id="first-note-h" title={S.firstTitle} />
      <p className="section-lead">{S.firstLead}</p>

      <Figure className="home-wide" caption={S.sayNote}>
        <QuoteCard
          className="home-say"
          label={S.sayLabel}
          cells={[
            { label: S.step1, value: S.step1Body },
            { label: S.step2, value: S.step2Body },
            { label: S.step3, value: S.step3Body },
          ]}
        >
          <span className="home-say-ur ur" lang="ur">{S.sayUr}</span>
          <span className="home-say-roman latin" lang="ur-Latn" dir="ltr">“{S.sayRoman}”</span>
        </QuoteCard>
      </Figure>

      {(connected || heard) && (
        <p className={heard ? 'home-wait is-heard' : 'home-wait'} role="status">
          {heard ? <Icon name="check" size="sm" /> : <span className="home-wait-dot" aria-hidden="true" />}
          {heard ? S.heard : S.waiting}
        </p>
      )}

      <div className="home-alt home-wide">
        <p className="home-alt-lead">{S.altLead}</p>
        <div className="cluster">
          <MicRecorder label={S.altSpeak} variant="primary" onActiveChange={onMicActive} />
          <Button icon="keyboard" onClick={onAdd}>{S.altAdd}</Button>
          <Button icon="phone" onClick={onCall}>{S.call}</Button>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- loading */

function HomeSkeleton() {
  const C = useCommon()
  return (
    <div className="home-skel" aria-busy="true">
      <span className="sr-only" role="status">{C.loading}</span>
      <div className="home-skel-toc">
        {[64, 58, 52, 46].map(w => (
          <Skeleton key={w} width={`${w}%`} height={14} />
        ))}
      </div>
      <div className="home-skel-section">
        <Skeleton width={180} height={30} />
        <Skeleton width="62%" height={16} />
        <div className="home-skel-frame home-wide">
          {[0, 1, 2].map(i => (
            <div key={i} className="home-skel-row">
              <Skeleton width="34%" height={14} />
              <Skeleton width={84} height={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
