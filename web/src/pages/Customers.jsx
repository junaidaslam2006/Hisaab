import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { ListReminderSheet } from '../components/ReminderSheet.jsx'
import Sheet from '../components/Sheet.jsx'
import { useToast } from '../components/Toast.jsx'
import { FootnoteRef, Footnotes, QuoteCard, TabPanel, Tabs } from '../components/editorial.jsx'
import { Button, Field, LoadError, Money, PageHeader, Segmented, Skeleton } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { dayCount, money, when } from '../lib/format.js'
import { useCommon, useLang, useStrings } from '../lib/i18n.jsx'
import { ListChip, SampleBadge, isSupplier, listName, pickerLists, useListWords } from '../lib/lists.jsx'
import { useMe } from '../lib/me.jsx'
import { useResource } from '../lib/useResource.js'
import './Customers.css'

// Unpaid this many days or more = needs a follow-up: amber here, and the rule behind Today's Follow up list.
const FOLLOW_UP_DAYS = 7

const STRINGS = {
  en: {
    title: 'Customers',
    lead: (n, owing, owed, adv) => {
      const who = `${n} ${n === 1 ? 'person' : 'people'} in your khata.`
      if (!owing && !adv) return `${who} Nobody owes you anything right now.`
      const advance = adv ? `${adv} ${adv === 1 ? 'has' : 'have'} paid in advance` : ''
      if (!owing) return `${who} Nobody owes you anything; ${advance}.`
      return (
        <>
          {who} {owing} {owing === 1 ? 'owes' : 'owe'} you {owed}
          {advance ? `; ${advance}.` : '.'}
        </>
      )
    },
    leadSuppliers: (n, amt) => <>You owe {n === 1 ? '1 supplier' : `${n} suppliers`} {amt}.</>,
    leadList: (name, n, owing, amt) => {
      if (!n) return <><bdi>{name}</bdi> has nobody in it yet.</>
      const who = `${n} ${n === 1 ? 'person' : 'people'}`
      if (!owing) return <><bdi>{name}</bdi>: {who}, nobody owes you anything.</>
      return <><bdi>{name}</bdi>: {who}, {owing} {owing === 1 ? 'owes' : 'owe'} you {amt}.</>
    },
    leadSupList: (name, n, owing, amt) => {
      if (!n) return <><bdi>{name}</bdi> has no suppliers in it yet.</>
      const who = `${n} ${n === 1 ? 'supplier' : 'suppliers'}`
      if (!owing) return <><bdi>{name}</bdi>: {who}, you owe none of them anything.</>
      return <><bdi>{name}</bdi>: {who}, you owe {n === owing ? (n === 1 ? 'them' : `all ${n}`) : owing} {amt}.</>
    },
    leadNone: 'Nobody yet. Everyone you name in a voice note gets a khata here, by themselves.',
    add: 'Add customer',
    addSupplier: 'Add supplier',
    newList: 'New list',
    editList: 'Edit list',
    remindAll: 'Remind everyone in this list',
    listsLabel: 'Lists',
    tabAll: 'All',
    searchLabel: 'Search customers',
    searchPh: 'Search by name or phone',
    filterLabel: 'Show',
    filters: { all: 'All', owe: 'Owe you', settled: 'Settled', advance: 'Advance' },
    filtersSup: { all: 'All', owe: 'You owe', settled: 'Settled', advance: 'Paid ahead' },
    sortLabel: 'Sort',
    sorts: { balance: 'Highest balance', unpaid: 'Longest unpaid', recent: 'Recently active', name: 'Name A–Z' },
    sortedBy: { balance: 'highest balance first', unpaid: 'longest unpaid first', recent: 'most recent first', name: 'A to Z' },
    tableName: 'Everyone in your khata',
    tableList: n => `Everyone in ${n}`,
    colName: 'Name',
    colBalance: 'Balance',
    colUnpaid: 'Unpaid for',
    colSincePaid: 'Since you paid',
    colLast: 'Last entry',
    colOpen: 'Open khata',
    owesYou: 'owes you',
    advance: 'advance',
    settled: 'settled',
    underDay: 'Under a day',
    lastPaid: w => `Last paid ${w}`,
    neverPaid: 'Never paid',
    youPaid: w => `You paid ${w}`,
    youNeverPaid: 'Not paid yet',
    entries: n => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    noEntries: 'No entries yet',
    // mobile status line
    unpaidFor: d => `Unpaid for ${d}`,
    paidToday: 'Paid some today',
    tookUdhaar: w => `Took udhaar ${w}`,
    allPaid: 'All paid up',
    advanceLine: x => `${x} advance with you`,
    supLastPaid: w => `You last paid ${w}`,
    supCredit: w => `Goods on credit since ${w}`,
    supAhead: x => `You paid ${x} ahead`,
    nouns: {
      customers: n => (n === 1 ? 'customer' : 'customers'),
      suppliers: n => (n === 1 ? 'supplier' : 'suppliers'),
      people: n => (n === 1 ? 'person' : 'people'),
    },
    caption: (shown, total, noun, sort, owed, payable, after) =>
      `${shown === total ? `${total} ${noun(total)}` : `Showing ${shown} of ${total}`}, ${sort}.` +
      (after ? ' Suppliers come after customers.' : '') +
      (owed ? ` Owed to you here: ${owed}.` : '') +
      (payable ? ` You owe here: ${payable}.` : ''),
    fnUnpaid: {
      lead: 'Unpaid for.',
      text: `Days since their last payment, or since their first udhaar if they have never paid. It turns amber at ${FOLLOW_UP_DAYS} days or more, the same rule Today uses for Follow up.`,
    },
    fnUnpaidMixed: ' For a supplier it counts from your last payment to them, and never turns amber.',
    fnSincePaid: {
      lead: 'Since you paid.',
      text: 'Days since you last paid this supplier, or since the first goods you took on credit if you have not paid them yet.',
    },
    // no match
    noMatchQuery: q => `No one called “${q}” in your khata.`,
    noMatchHere: q => `No one called “${q}” in this list.`,
    teachNew: q => (
      <>
        If {q} is new, name them in a voice note to your own WhatsApp chat — <q className="cust-say">{q} ne 500 ka sauda liya</q> — and
        their khata opens by itself.
      </>
    ),
    noMatch: {
      owe: 'Nobody owes you money right now.',
      settled: 'Nobody is at exactly Rs 0 right now.',
      advance: 'Nobody has paid you in advance.',
      all: 'No customers in this list.',
    },
    noMatchSup: {
      owe: 'You owe none of these suppliers anything.',
      settled: 'No supplier is at exactly Rs 0 right now.',
      advance: 'You have not paid any supplier in advance.',
      all: 'No suppliers in this list.',
    },
    clearSearch: 'Clear search',
    showAll: 'Show everyone',
    // empty list
    emptyList: n => <>Nobody in <bdi>{n}</bdi> yet.</>,
    emptyListText: say => <>Add someone with the button below, or tell Hisaab on your own WhatsApp chat: {say}</>,
    emptyListSay: n => `Umar ko ${n} list mein daal do`,
    emptySupSay: 'Rehman Traders se 5000 ka maal udhaar liya',
    addToList: 'Add someone to this list',
    // empty
    emptyLabel: 'Say this in your own WhatsApp chat',
    example: 'Umar ne 500 ka sauda liya',
    exampleWrites: 'Hisaab writes',
    exampleWritesValue: 'Umar · +Rs 500 udhaar',
    exampleWhere: 'Your chat',
    exampleWhereValue: 'Message yourself',
    emptyBody:
      'Hisaab opens a khata for Umar, writes Rs 500 udhaar and replies to you in the same chat. Umar shows up on this page within seconds — no typing needed.',
    // add sheet
    addTitle: 'Add a customer',
    addSupTitle: 'Add a supplier',
    addDesc: 'Their khata starts at Rs 0. You can add udhaar or payments right after.',
    addSupDesc: 'Their khata starts at Rs 0. You can record goods taken on credit or payments right after.',
    name: 'Name',
    namePh: 'e.g. Umar Farooq',
    supNamePh: 'e.g. Rehman Traders',
    nameHint: 'Write it the way you say it in voice notes.',
    nameUr: 'Name in Urdu (optional)',
    nameUrPh: 'مثلاً عمر فاروق',
    phone: 'WhatsApp number (optional)',
    phonePh: '0300 1234567',
    phoneHint: 'Needed to send payment reminders to their WhatsApp.',
    supPhoneHint: 'Lets you call or WhatsApp them from their page.',
    list: 'List',
    listHint: 'A suppliers list holds people you buy from on credit: you owe them.',
    customerLists: 'Customers lists',
    supplierLists: 'Suppliers lists',
    needName: 'Write the customer’s name',
    needSupName: 'Write the supplier’s name',
    badPhone: 'Enter a number like 0300 1234567',
    exists: n => `${n} is already in your khata.`,
    openKhata: 'Open their khata',
    create: 'Add customer',
    createSup: 'Add supplier',
    created: n => `${n} added to your khata`,
    failed: 'Could not add. Please try again.',
    // new list / edit list
    newListTitle: 'New list',
    newListDesc: 'Keep groups of people apart: mohalla customers, factory workers who pay on salary day, teachers, or the suppliers you buy from.',
    listName: 'List name',
    listNamePh: 'e.g. Factory wale',
    listNameHint: 'The name you will say in voice notes: “Factory walon ka hisaab”.',
    listNameUr: 'Name in Urdu (optional)',
    listNameUrPh: 'مثلاً فیکٹری والے',
    listNameUrHint: 'Hisaab fills this in for common words if you leave it empty.',
    kind: 'Who is in it',
    kindCustomers: 'Customers',
    kindSuppliers: 'Suppliers',
    kindCustomersHint: 'People who take goods on udhaar. They owe you.',
    kindSuppliersHint: 'Wholesalers and companies you take stock from on credit. You owe them, and it never counts as udhaar.',
    createList: 'Create list',
    listCreated: n => `${n} list created`,
    listNeedName: 'Write a name for the list',
    listBadName: 'Use letters in the name, like Factory wale',
    listExists: n => `You already have a list called ${n}.`,
    listIsGeneral: 'General is always there: everyone who is not in a list is in General.',
    openList: 'Open it',
    listTooMany: 'You already have 20 lists, the most a shop can have. Delete one you no longer use first.',
    listFailed: 'Could not save the list. Please try again.',
    editListTitle: n => `Edit ${n}`,
    editListDesc: 'Rename the list, or delete it. A list’s kind (customers or suppliers) stays the same.',
    saveList: 'Save changes',
    listSaved: 'List saved',
    deleteList: 'Delete list',
    deleteListTitle: 'Delete this list',
    deleteListBody: n =>
      n ? `Its ${n === 1 ? 'one person moves' : `${n} people move`} to General. Their khatas and entries stay as they are.` : 'The list is empty. Nothing else changes.',
    deleteListBlocked: n =>
      `Move or delete its ${n === 1 ? 'supplier' : `${n} suppliers`} first. A supplier cannot go to General: what you owe them would count as udhaar.`,
    deleteListAsk: n => `Delete ${n}?`,
    deleteListYes: 'Yes, delete the list',
    keepList: 'Keep it',
    listDeleted: (n, moved) => (moved ? `${n} deleted. ${moved === 1 ? '1 person is' : `${moved} people are`} in General now.` : `${n} deleted`),
  },
  ur: {
    title: 'گاہک',
    lead: (n, owing, owed, adv) => {
      const who = n === 1 ? 'آپ کے کھاتے میں ایک شخص ہے۔' : `آپ کے کھاتے میں ${n} لوگ ہیں۔`
      if (!owing && !adv) return `${who} اس وقت کسی کے ذمے کچھ نہیں۔`
      const advance = adv ? `${adv} نے ایڈوانس دے رکھا ہے` : ''
      if (!owing) return `${who} کسی کے ذمے کچھ نہیں؛ ${advance}۔`
      return (
        <>
          {who} {owing} کے ذمے {owed} ہیں{advance ? `؛ ${advance}۔` : '۔'}
        </>
      )
    },
    leadSuppliers: (n, amt) => <>آپ نے {n === 1 ? 'ایک سپلائر' : `${n} سپلائرز`} کے {amt} دینے ہیں۔</>,
    leadList: (name, n, owing, amt) => {
      if (!n) return <><bdi>{name}</bdi> میں ابھی کوئی نہیں۔</>
      const who = n === 1 ? 'ایک شخص' : `${n} لوگ`
      if (!owing) return <><bdi>{name}</bdi>: {who}، کسی کے ذمے کچھ نہیں۔</>
      return <><bdi>{name}</bdi>: {who}، {owing} کے ذمے {amt} ہیں۔</>
    },
    leadSupList: (name, n, owing, amt) => {
      if (!n) return <><bdi>{name}</bdi> میں ابھی کوئی سپلائر نہیں۔</>
      const who = n === 1 ? 'ایک سپلائر' : `${n} سپلائرز`
      if (!owing) return <><bdi>{name}</bdi>: {who}، آپ نے کسی کا کچھ نہیں دینا۔</>
      return <><bdi>{name}</bdi>: {who}، آپ نے {n === owing ? (n === 1 ? 'ان' : `سب ${n}`) : owing} کے {amt} دینے ہیں۔</>
    },
    leadNone: 'ابھی کوئی نہیں۔ آپ وائس نوٹ میں جس کا بھی نام لیں، اس کا کھاتہ یہاں خود بن جاتا ہے۔',
    add: 'نیا گاہک',
    addSupplier: 'نیا سپلائر',
    newList: 'نئی لسٹ',
    editList: 'لسٹ بدلیں',
    remindAll: 'اس لسٹ میں سب کو یاد دہانی',
    listsLabel: 'لسٹیں',
    tabAll: 'سب',
    searchLabel: 'گاہک تلاش کریں',
    searchPh: 'نام یا فون نمبر سے تلاش کریں',
    filterLabel: 'دکھائیں',
    filters: { all: 'سب', owe: 'ادھار والے', settled: 'حساب صاف', advance: 'ایڈوانس' },
    filtersSup: { all: 'سب', owe: 'آپ نے دینے ہیں', settled: 'حساب صاف', advance: 'ایڈوانس دیا' },
    sortLabel: 'ترتیب',
    sorts: { balance: 'سب سے زیادہ بقایا', unpaid: 'سب سے پرانا بقایا', recent: 'حالیہ لین دین', name: 'نام کے حساب سے' },
    sortedBy: { balance: 'زیادہ بقایا پہلے', unpaid: 'پرانا بقایا پہلے', recent: 'حالیہ لین دین پہلے', name: 'نام کی ترتیب سے' },
    tableName: 'آپ کے کھاتے کے سب لوگ',
    tableList: n => `⁨${n}⁩ کے سب لوگ`,
    colName: 'نام',
    colBalance: 'بقایا',
    colUnpaid: 'بغیر ادائیگی',
    colSincePaid: 'آپ کی ادائیگی سے',
    colLast: 'آخری اندراج',
    colOpen: 'کھاتہ کھولیں',
    owesYou: 'آپ کو ملنا ہے',
    advance: 'ایڈوانس',
    settled: 'حساب صاف',
    underDay: 'ایک دن سے کم',
    lastPaid: w => `آخری ادائیگی ${w}`,
    neverPaid: 'کبھی ادائیگی نہیں کی',
    youPaid: w => `آپ نے ${w} ادا کیا`,
    youNeverPaid: 'ابھی ادائیگی نہیں کی',
    entries: n => `${n} اندراج`,
    noEntries: 'ابھی کوئی اندراج نہیں',
    unpaidFor: d => `${d} سے کوئی ادائیگی نہیں`,
    paidToday: 'آج کچھ رقم دی',
    tookUdhaar: w => `${w} ادھار لیا`,
    allPaid: 'سارا حساب صاف',
    advanceLine: x => `${x} ایڈوانس آپ کے پاس`,
    supLastPaid: w => `آپ نے آخری ادائیگی ${w} کی`,
    supCredit: w => `${w} سے مال ادھار`,
    supAhead: x => `آپ نے ${x} ایڈوانس دیے`,
    nouns: {
      customers: () => 'گاہک',
      suppliers: n => (n === 1 ? 'سپلائر' : 'سپلائرز'),
      people: n => (n === 1 ? 'شخص' : 'لوگ'),
    },
    caption: (shown, total, noun, sort, owed, payable, after) =>
      `${shown === total ? `${total} ${noun(total)}` : `${total} میں سے ${shown}`}، ${sort}۔` +
      (after ? ' سپلائرز گاہکوں کے بعد ہیں۔' : '') +
      (owed ? ` یہاں آپ کو ملنا ہے: ${owed}۔` : '') +
      (payable ? ` یہاں آپ نے دینے ہیں: ${payable}۔` : ''),
    fnUnpaid: {
      lead: 'بغیر ادائیگی۔',
      text: `آخری ادائیگی کے بعد سے گزرے دن، یا اگر کبھی ادائیگی نہیں کی تو پہلے ادھار سے۔ ${FOLLOW_UP_DAYS} دن یا اس سے زیادہ ہوں تو یہ پیلا ہو جاتا ہے؛ آج والے صفحے پر تقاضے کی فہرست بھی اسی اصول سے بنتی ہے۔`,
    },
    fnUnpaidMixed: ' سپلائر کے لیے یہ آپ کی آخری ادائیگی سے گنا جاتا ہے، اور کبھی پیلا نہیں ہوتا۔',
    fnSincePaid: {
      lead: 'آپ کی ادائیگی سے۔',
      text: 'اس سپلائر کو آپ کی آخری ادائیگی کے بعد سے گزرے دن، یا اگر ابھی ادائیگی نہیں کی تو پہلی بار ادھار مال لینے سے۔',
    },
    // U+2068/U+2069 isolate the query (Latin or Urdu) instead of curly quotes, which Nastaliq mirrors around Latin text.
    noMatchQuery: q => `⁨${q}⁩ نام کا کوئی گاہک آپ کے کھاتے میں نہیں۔`,
    noMatchHere: q => `⁨${q}⁩ نام کا کوئی اس لسٹ میں نہیں۔`,
    teachNew: q => (
      <>
        اگر یہ نیا گاہک ہے تو اپنی واٹس ایپ چیٹ میں وائس نوٹ بھیجیں — <q className="cust-say">{q} نے 500 کا سودا لیا</q> — اور ان کا کھاتہ خود کھل
        جائے گا۔
      </>
    ),
    noMatch: {
      owe: 'اس وقت کسی کے ذمے کوئی رقم نہیں۔',
      settled: 'اس وقت کسی کا حساب بالکل صفر نہیں۔',
      advance: 'کسی نے آپ کو ایڈوانس نہیں دیا۔',
      all: 'اس لسٹ میں کوئی گاہک نہیں۔',
    },
    noMatchSup: {
      owe: 'آپ نے ان میں سے کسی سپلائر کا کچھ نہیں دینا۔',
      settled: 'اس وقت کسی سپلائر کا حساب بالکل صفر نہیں۔',
      advance: 'آپ نے کسی سپلائر کو ایڈوانس نہیں دیا۔',
      all: 'اس لسٹ میں کوئی سپلائر نہیں۔',
    },
    clearSearch: 'تلاش ہٹائیں',
    showAll: 'سب دکھائیں',
    emptyList: n => <><bdi>{n}</bdi> میں ابھی کوئی نہیں۔</>,
    emptyListText: say => <>نیچے والے بٹن سے کسی کو شامل کریں، یا اپنی واٹس ایپ چیٹ میں حساب کو بتائیں: {say}</>,
    emptyListSay: n => `عمر کو ${n} کی لسٹ میں ڈال دو`,
    emptySupSay: 'رحمان ٹریڈرز سے 5000 کا مال ادھار لیا',
    addToList: 'اس لسٹ میں کسی کو شامل کریں',
    emptyLabel: 'اپنی واٹس ایپ چیٹ میں یہ کہیں',
    example: 'عمر نے 500 کا سودا لیا',
    exampleWrites: 'حساب لکھتا ہے',
    exampleWritesValue: 'عمر · 500 روپے ادھار',
    exampleWhere: 'آپ کی چیٹ',
    exampleWhereValue: 'Message yourself',
    emptyBody:
      'حساب عمر کا کھاتہ کھول کر 500 روپے ادھار لکھ دیتا ہے اور اسی چیٹ میں آپ کو جواب دیتا ہے۔ چند سیکنڈ میں عمر اس صفحے پر نظر آ جاتے ہیں — کچھ لکھنے کی ضرورت نہیں۔',
    addTitle: 'نیا گاہک شامل کریں',
    addSupTitle: 'نیا سپلائر شامل کریں',
    addDesc: 'ان کا کھاتہ صفر سے شروع ہو گا۔ اس کے بعد ادھار یا وصولی لکھ سکتے ہیں۔',
    addSupDesc: 'ان کا کھاتہ صفر سے شروع ہو گا۔ اس کے بعد ادھار لیا ہوا مال یا ادائیگی لکھ سکتے ہیں۔',
    name: 'نام',
    namePh: 'مثلاً Umar Farooq',
    supNamePh: 'مثلاً Rehman Traders',
    nameHint: 'ویسے لکھیں جیسے آپ وائس نوٹ میں بولتے ہیں۔',
    nameUr: 'اردو میں نام (اختیاری)',
    nameUrPh: 'مثلاً عمر فاروق',
    phone: 'واٹس ایپ نمبر (اختیاری)',
    phonePh: '0300 1234567',
    phoneHint: 'اس نمبر پر ادائیگی کی یاد دہانی بھیجی جا سکے گی۔',
    supPhoneHint: 'ان کے صفحے سے انہیں کال یا واٹس ایپ کر سکیں گے۔',
    list: 'لسٹ',
    listHint: 'سپلائرز کی لسٹ میں وہ لوگ ہیں جن سے آپ ادھار مال لیتے ہیں: آپ نے انہیں دینا ہے۔',
    customerLists: 'گاہکوں کی لسٹیں',
    supplierLists: 'سپلائرز کی لسٹیں',
    needName: 'گاہک کا نام لکھیں',
    needSupName: 'سپلائر کا نام لکھیں',
    badPhone: 'نمبر ایسے لکھیں: 0300 1234567',
    exists: n => `${n} پہلے سے آپ کے کھاتے میں ہیں۔`,
    openKhata: 'ان کا کھاتہ کھولیں',
    create: 'گاہک شامل کریں',
    createSup: 'سپلائر شامل کریں',
    created: n => `${n} آپ کے کھاتے میں شامل ہو گئے`,
    failed: 'شامل نہیں ہو سکا، دوبارہ کوشش کریں۔',
    newListTitle: 'نئی لسٹ',
    newListDesc: 'لوگوں کے گروپ الگ رکھیں: محلے کے گاہک، تنخواہ والے دن ادائیگی کرنے والے فیکٹری مزدور، استاد، یا وہ سپلائر جن سے آپ مال لیتے ہیں۔',
    listName: 'لسٹ کا نام',
    listNamePh: 'مثلاً Factory wale',
    listNameHint: 'وہ نام جو آپ وائس نوٹ میں بولیں گے، جیسے فیکٹری والوں کا حساب۔',
    listNameUr: 'اردو میں نام (اختیاری)',
    listNameUrPh: 'مثلاً فیکٹری والے',
    listNameUrHint: 'خالی چھوڑیں تو عام الفاظ کا اردو نام حساب خود لکھ دیتا ہے۔',
    kind: 'اس میں کون ہیں',
    kindCustomers: 'گاہک',
    kindSuppliers: 'سپلائرز',
    kindCustomersHint: 'جو آپ سے ادھار سودا لیتے ہیں۔ ان کے ذمے آپ کا ادھار ہے۔',
    kindSuppliersHint: 'ہول سیلر اور کمپنیاں جن سے آپ ادھار مال لیتے ہیں۔ آپ نے انہیں دینا ہے، اور یہ کبھی ادھار میں شمار نہیں ہوتا۔',
    createList: 'لسٹ بنائیں',
    listCreated: n => `⁨${n}⁩ کی لسٹ بن گئی`,
    listNeedName: 'لسٹ کا نام لکھیں',
    listBadName: 'نام میں حروف لکھیں، جیسے فیکٹری والے',
    listExists: n => `⁨${n}⁩ نام کی لسٹ پہلے سے موجود ہے۔`,
    listIsGeneral: 'عام کھاتہ ہمیشہ موجود ہے: جو کسی لسٹ میں نہیں، وہ عام کھاتے میں ہے۔',
    openList: 'اسے کھولیں',
    listTooMany: 'آپ کی 20 لسٹیں ہیں، ایک دکان کی زیادہ سے زیادہ حد۔ پہلے کوئی غیر ضروری لسٹ حذف کریں۔',
    listFailed: 'لسٹ محفوظ نہیں ہو سکی، دوبارہ کوشش کریں۔',
    editListTitle: n => `⁨${n}⁩ بدلیں`,
    editListDesc: 'لسٹ کا نام بدلیں یا اسے حذف کریں۔ لسٹ کی قسم (گاہک یا سپلائرز) وہی رہتی ہے۔',
    saveList: 'تبدیلیاں محفوظ کریں',
    listSaved: 'لسٹ محفوظ ہو گئی',
    deleteList: 'لسٹ حذف کریں',
    deleteListTitle: 'یہ لسٹ حذف کریں',
    deleteListBody: n =>
      n ? `اس کے ${n === 1 ? 'ایک شخص' : `${n} لوگ`} عام کھاتے میں چلے جائیں گے۔ ان کے کھاتے اور اندراج ویسے ہی رہیں گے۔` : 'لسٹ خالی ہے۔ اور کچھ نہیں بدلے گا۔',
    deleteListBlocked: n =>
      `پہلے اس کے ${n === 1 ? 'سپلائر' : `${n} سپلائرز`} کو کہیں اور منتقل یا حذف کریں۔ سپلائر عام کھاتے میں نہیں جا سکتا: جو آپ نے انہیں دینا ہے، وہ ادھار گنا جانے لگے گا۔`,
    deleteListAsk: n => `⁨${n}⁩ حذف کریں؟`,
    deleteListYes: 'ہاں، لسٹ حذف کریں',
    keepList: 'رہنے دیں',
    listDeleted: (n, moved) =>
      moved ? `⁨${n}⁩ حذف ہو گئی۔ ${moved === 1 ? 'ایک شخص اب' : `${moved} لوگ اب`} عام کھاتے میں ہیں۔` : `⁨${n}⁩ حذف ہو گئی`,
  },
}

const FILTERS = ['all', 'owe', 'settled', 'advance']
const SORTS = ['balance', 'unpaid', 'recent', 'name']

/** Filters for one view. In a mixed view (All) "Owe you" and "Advance" are about customers only: a supplier's positive balance is what YOU owe. */
const testsFor = mixed => ({
  all: () => true,
  owe: c => c.balance > 0 && !(mixed && isSupplier(c)),
  settled: c => c.balance === 0,
  advance: c => c.balance < 0 && !(mixed && isSupplier(c)),
})

const sumOwed = list => list.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0)
const isOverdue = c => !isSupplier(c) && c.balance > 0 && (c.unpaidDays ?? 0) >= FOLLOW_UP_DAYS
const URDU_SCRIPT = /[؀-ۿ]/
const scriptClass = text => (URDU_SCRIPT.test(text) ? 'ur' : 'latin')

const KARACHI_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' })
const isToday = ts => KARACHI_DAY.format(new Date(ts)) === KARACHI_DAY.format(new Date())

/** The name in the UI's own script leads; the other spelling follows. */
function names(c, lang) {
  if (lang === 'ur' && c.nameUrdu) return [c.nameUrdu, c.name]
  return [c.name, c.nameUrdu || '']
}

/**
 * Comparators for the sort menu. Names sort by the spelling each row shows first, in the UI's own alphabet.
 * In a mixed view the balance and unpaid sorts keep customers first: what you owe suppliers is not a "balance" to chase.
 */
function sorters(lang, mixed) {
  const collator = new Intl.Collator(lang === 'ur' ? 'ur' : 'en')
  const byName = (a, b) => collator.compare(names(a, lang)[0], names(b, lang)[0])
  const group = (a, b) => (mixed ? Number(isSupplier(a)) - Number(isSupplier(b)) : 0)
  return {
    balance: (a, b) => group(a, b) || b.balance - a.balance || byName(a, b),
    unpaid: (a, b) => group(a, b) || (b.unpaidDays ?? -1) - (a.unpaidDays ?? -1) || b.balance - a.balance || byName(a, b),
    recent: (a, b) => (b.lastEntryAt || b.createdAt || 0) - (a.lastEntryAt || a.createdAt || 0),
    name: byName,
  }
}

/** Name, Urdu name, aliases, or (for digit-only queries) phone. */
function matchesQuery(c, raw) {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  if (c.name.toLowerCase().includes(q)) return true
  if (c.nameUrdu && c.nameUrdu.includes(raw.trim())) return true
  if ((c.aliases || []).some(a => a.toLowerCase().includes(q))) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 3 && /^[\d\s+()-]+$/.test(q)) {
    const local = (c.phoneLocal || '').replace(/\D/g, '')
    return (c.phone || '').includes(digits) || local.includes(digits)
  }
  return false
}

/** Mirrors the server's normalizePhone: local numbers are 03xx + 7 digits, international 10–15 digits. */
function validPhone(value) {
  if (!value.trim()) return true
  let d = value.replace(/\D/g, '')
  if (d.startsWith('0092')) d = d.slice(2)
  if (d.startsWith('0')) return d.length === 11
  return d.length >= 10 && d.length <= 15
}

/** True while the media query matches (re-renders on change). */
function useMedia(query) {
  const subscribe = useCallback(
    onChange => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true)
}

/** "Today" → "today" mid-sentence (English only). */
const midSentence = (text, lang) => (lang === 'en' ? text.replace(/^(Today|Yesterday)/, w => w.toLowerCase()) : text)

/** One plain-language line about where this customer or supplier stands (phone rows). */
function statusLine(c, S, lang) {
  const day = ts => midSentence(when(ts, lang, { withTime: false }), lang)
  if (isSupplier(c)) {
    if (c.balance > 0) return c.lastPaymentAt ? S.supLastPaid(day(c.lastPaymentAt)) : S.supCredit(day(c.lastCreditAt))
    if (c.balance < 0) return S.supAhead(money(c.balance))
    return c.entriesCount ? S.allPaid : S.noEntries
  }
  if (c.balance > 0) {
    const d = c.unpaidDays ?? 0
    if (d >= FOLLOW_UP_DAYS) return S.unpaidFor(dayCount(d, lang))
    // unpaidDays counts whole 24-hour spans, so 0 can still be yesterday: name the calendar day instead.
    if (c.lastPaymentAt) return isToday(c.lastPaymentAt) ? S.paidToday : S.lastPaid(day(c.lastPaymentAt))
    return d === 0 ? S.tookUdhaar(day(c.lastCreditAt)) : S.unpaidFor(dayCount(d, lang))
  }
  if (c.balance < 0) return c.lastPaymentAt ? S.lastPaid(day(c.lastPaymentAt)) : S.advanceLine(money(c.balance))
  return c.entriesCount ? S.allPaid : S.noEntries
}

export default function Customers() {
  const S = useStrings(STRINGS)
  const W = useListWords()
  const { lang } = useLang()
  const { me } = useMe()
  const wide = useMedia('(min-width: 720px)')
  const { data, error, reload } = useResource('/api/customers', { refreshOn: ['ledger'] })
  const { data: listData, error: listError } = useResource('/api/lists', { refreshOn: ['ledger'] })
  const [params, setParams] = useSearchParams()
  // Handed to the customer page so its back link comes back to this same list/search/filter/sort.
  const back = params.toString() ? `?${params.toString()}` : ''
  // The box holds the raw typing; the URL holds the search. When the URL changes from outside (the Customers
  // nav link, Back), the box follows it.
  const urlQ = params.get('q') || ''
  const [query, setQuery] = useState(urlQ)
  const [seenQ, setSeenQ] = useState(urlQ)
  if (urlQ !== seenQ) {
    setSeenQ(urlQ)
    if (urlQ !== query.trim()) setQuery(urlQ)
  }
  // null | { listId } (add sheet) — 'new-list' | 'edit-list' | 'remind' for the other sheets.
  const [adding, setAdding] = useState(null)
  const [sheet, setSheet] = useState(null)
  const closeAdd = useCallback(() => setAdding(null), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  const show = FILTERS.includes(params.get('show')) ? params.get('show') : 'all'
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'balance'

  const lists = useMemo(() => listData || [], [listData])
  // ?list= : 'general', a list id, or nothing (= everyone). An id that is not (or no longer) one of the shop's lists shows everyone.
  const listQ = params.get('list') || 'all'
  const scopeList = listQ !== 'all' && listQ !== 'general' ? lists.find(l => l.id === listQ) || null : null
  const listsPending = !listData && !listError && listQ !== 'all' && listQ !== 'general'
  const scope = listQ === 'general' ? 'general' : scopeList ? scopeList.id : 'all'
  const supplierScope = scopeList?.kind === 'suppliers'
  const mixed = scope === 'all'

  const setParam = useCallback(
    (key, value, fallback) =>
      setParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (!value || value === fallback) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const onSearch = e => {
    setQuery(e.target.value)
    setParam('q', e.target.value.trim(), '')
  }

  const clearSearch = () => {
    setQuery('')
    setParam('q', '', '')
  }
  const showEveryone = () => setParam('show', 'all', 'all')
  // Choosing a list is a real navigation (Back returns to the previous list).
  const openScope = useCallback(
    value =>
      setParams(prev => {
        const next = new URLSearchParams(prev)
        if (value === 'all') next.delete('list')
        else next.set('list', value)
        return next
      }),
    [setParams],
  )

  useEffect(() => {
    const before = document.title
    document.title = `${S.title} · ${me?.shopName || 'Hisaab'}`
    return () => {
      document.title = before
    }
  }, [S.title, me?.shopName])

  const customers = useMemo(() => data || [], [data])
  const people = useMemo(
    () => (scope === 'all' ? customers : scope === 'general' ? customers.filter(c => !c.listId) : customers.filter(c => c.listId === scope)),
    [customers, scope],
  )
  const tests = useMemo(() => testsFor(mixed), [mixed])
  const summary = useMemo(() => {
    const buyers = people.filter(c => !isSupplier(c))
    const sellers = people.filter(isSupplier)
    return {
      owing: buyers.filter(c => c.balance > 0).length,
      owed: sumOwed(buyers),
      advance: buyers.filter(c => c.balance < 0).length,
      supOwing: sellers.filter(c => c.balance > 0).length,
      payable: sumOwed(sellers),
      suppliers: sellers.length,
    }
  }, [people])
  const matched = useMemo(() => people.filter(c => matchesQuery(c, query)), [people, query])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f, matched.filter(tests[f]).length])), [matched, tests])
  const rows = useMemo(() => matched.filter(tests[show]).sort(sorters(lang, mixed)[sort]), [matched, tests, show, sort, lang, mixed])
  const rowsOwed = useMemo(() => sumOwed(rows.filter(c => !isSupplier(c))), [rows])
  const rowsPayable = useMemo(() => sumOwed(rows.filter(isSupplier)), [rows])

  const scopeName = scope === 'general' ? W.general : scopeList ? listName(scopeList, lang, W) : ''
  const amount = (value, tone) => <bdi className={`cust-lead-amt ${tone}`}>{money(value)}</bdi>

  let lead = null
  if (data && !listsPending) {
    if (scope === 'all') {
      lead = customers.length ? (
        <>
          {S.lead(customers.length, summary.owing, amount(summary.owed, 'owed'), summary.advance)}
          {summary.supOwing > 0 && <> {S.leadSuppliers(summary.supOwing, amount(summary.payable, 'payable'))}</>}
        </>
      ) : (
        S.leadNone
      )
    } else if (supplierScope) lead = S.leadSupList(scopeName, people.length, summary.supOwing, amount(summary.payable, 'payable'))
    else lead = S.leadList(scopeName, people.length, summary.owing, amount(summary.owed, 'owed'))
  }

  // Remind everyone owing in this customers list (General counts as one).
  const owingHere = useMemo(() => people.filter(c => !isSupplier(c) && c.balance > 0), [people])
  const canRemind = scope !== 'all' && !supplierScope && owingHere.length > 0
  // "Add customer" while a list is open puts the new person in that list.
  const addListId = scopeList ? scopeList.id : ''

  const actions = (
    <>
      <Button variant="primary" icon="plus" onClick={() => setAdding({ listId: addListId })}>
        {supplierScope ? S.addSupplier : S.add}
      </Button>
      <Button icon="list" onClick={() => setSheet('new-list')}>{S.newList}</Button>
      {canRemind && (
        <Button icon="bell" onClick={() => setSheet('remind')}>{S.remindAll}</Button>
      )}
      {scopeList && (
        <Button variant="ghost" icon="edit" onClick={() => setSheet('edit-list')}>{S.editList}</Button>
      )}
    </>
  )

  // A list opened from a link (?list=) can sit past the edge of the scrolling tab strip on a phone: bring it into
  // view sideways only, never scrolling the page.
  const tabsRef = useRef(null)
  const tabCount = lists.length
  useEffect(() => {
    const strip = tabsRef.current?.querySelector('[role="tablist"]')
    const tab = strip?.querySelector('[aria-selected="true"]')
    if (!strip || !tab) return
    const s = strip.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < s.left) strip.scrollLeft -= s.left - t.left + 16
    else if (t.right > s.right) strip.scrollLeft += t.right - s.right + 16
  }, [scope, tabCount, Boolean(data)])

  const counted = useMemo(() => {
    const byList = {}
    for (const c of customers) byList[c.listId || ''] = (byList[c.listId || ''] || 0) + 1
    return byList
  }, [customers])
  const tabs = lists.length
    ? [
        { value: 'all', label: <TabLabel name={S.tabAll} n={customers.length} /> },
        { value: 'general', label: <TabLabel name={W.general} n={counted[''] || 0} /> },
        ...lists.map(l => ({
          value: l.id,
          label: <TabLabel name={listName(l, lang, W)} n={counted[l.id] || 0} marker={l.kind === 'suppliers' ? W.supplier : null} />,
        })),
      ]
    : null

  let body
  if ((!data && error) || (listsPending && listError)) body = <LoadError onRetry={reload} />
  else if (!data || listsPending) body = <ListSkeleton />
  else if (!customers.length && !lists.length) body = <NoCustomers S={S} />
  else {
    const q = query.trim()
    // Nobody by that name at all, versus a name the chosen filter hides.
    const nameMiss = Boolean(q) && matched.length === 0
    const filters = supplierScope ? S.filtersSup : S.filters
    const noMatch = supplierScope ? S.noMatchSup : S.noMatch
    const noun = supplierScope ? S.nouns.suppliers : mixed && summary.suppliers ? S.nouns.people : S.nouns.customers
    const showsSuppliers = rows.some(isSupplier)
    const groupedNote = mixed && showsSuppliers && rows.some(c => !isSupplier(c)) && (sort === 'balance' || sort === 'unpaid')
    const notes = [supplierScope ? { id: 'unpaid', ...S.fnSincePaid } : { id: 'unpaid', lead: S.fnUnpaid.lead, text: S.fnUnpaid.text + (showsSuppliers ? S.fnUnpaidMixed : '') }]
    const emptyList = scope !== 'all' && people.length === 0

    let inner
    if (emptyList) {
      inner = <EmptyList S={S} name={scopeName} suppliers={supplierScope} onAdd={() => setAdding({ listId: addListId })} />
    } else {
      inner = (
        <>
          <div className="cust-tools">
            <label className="search-field cust-search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                value={query}
                onChange={onSearch}
                placeholder={S.searchPh}
                aria-label={S.searchLabel}
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            <Segmented
              className="cust-filter"
              label={S.filterLabel}
              value={show}
              onChange={v => setParam('show', v, 'all')}
              options={FILTERS.map(f => ({
                value: f,
                label: (
                  <>
                    {filters[f]}{' '}
                    <span className="cust-count num">{counts[f]}</span>
                  </>
                ),
              }))}
            />
            <label className="cust-sort">
              <span className="cust-sort-label">{S.sortLabel}</span>
              <select className="select" value={sort} onChange={e => setParam('sort', e.target.value, 'balance')}>
                {SORTS.map(s => (
                  <option key={s} value={s}>
                    {S.sorts[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="cust-nomatch">
              <p className="cust-nomatch-title">{nameMiss && mixed ? S.noMatchQuery(q) : q ? S.noMatchHere(q) : noMatch[show]}</p>
              {nameMiss && !/^[\d\s+()-]+$/.test(q) && !supplierScope && <p className="cust-nomatch-text">{S.teachNew(q)}</p>}
              <Button icon="x" onClick={nameMiss ? clearSearch : showEveryone}>{nameMiss ? S.clearSearch : S.showAll}</Button>
            </div>
          ) : (
            <>
              {wide ? (
                <CustomerTable rows={rows} S={S} W={W} lang={lang} back={back} showList={mixed} supplierScope={supplierScope} />
              ) : (
                <ul className="cust-rows" aria-label={scope === 'all' ? S.tableName : S.tableList(scopeName)}>
                  {rows.map(c => (
                    <CustomerRow key={c.id} c={c} S={S} W={W} lang={lang} back={back} showList={mixed} />
                  ))}
                </ul>
              )}
              <p className="caption cust-caption" aria-live="polite">
                {S.caption(
                  rows.length,
                  people.length,
                  noun,
                  S.sortedBy[sort],
                  rowsOwed > 0 ? money(rowsOwed) : '',
                  rowsPayable > 0 ? money(rowsPayable) : '',
                  groupedNote,
                )}
              </p>
              {/* Its [1] lives in the table's "Unpaid for" header, which phones do not show. */}
              {wide && <Footnotes className="cust-notes" items={notes} />}
            </>
          )}
        </>
      )
    }

    body = (
      <section className="cust-list" aria-label={scope === 'all' ? S.tableName : S.tableList(scopeName)}>
        {tabs ? (
          <div className="tabs-block cust-tabs-block" ref={tabsRef}>
            <Tabs id="cust-lists" controls="cust-lists-panel" label={S.listsLabel} value={scope} onChange={openScope} tabs={tabs} className="cust-tabs" />
            <TabPanel tabsId="cust-lists" value={scope} className="cust-panel">
              {inner}
            </TabPanel>
          </div>
        ) : (
          inner
        )}
      </section>
    )
  }

  return (
    <div className="cust-page">
      <PageHeader eyebrow={me?.shopName || undefined} title={S.title} lead={lead} actions={actions} />
      {body}
      <AddCustomerSheet open={Boolean(adding)} onClose={closeAdd} customers={customers} lists={lists} initialListId={adding?.listId || ''} />
      <NewListSheet open={sheet === 'new-list'} onClose={closeSheet} onCreated={l => openScope(l.id)} onOpenList={openScope} />
      {scopeList && (
        <EditListSheet
          open={sheet === 'edit-list'}
          onClose={closeSheet}
          list={scopeList}
          people={people.length}
          onDeleted={() => openScope('all')}
          onOpenList={openScope}
        />
      )}
      <ListReminderSheet open={sheet === 'remind' && canRemind} onClose={closeSheet} listLabel={scopeName} people={owingHere} />
    </div>
  )
}

/** A list tab: name, people count, and a "Supplier" marker for suppliers lists. */
function TabLabel({ name, n, marker }) {
  return (
    <>
      <bdi className={scriptClass(name)}>{name}</bdi>
      <span className="tab-count">{n}</span>
      {marker && <span className="cust-tab-kind">{marker}</span>}
    </>
  )
}

/** The highlighted balance cell: amount plus the word that says what it means (a supplier's positive balance is what you owe). */
function Balance({ c, S, W }) {
  if (isSupplier(c)) {
    if (c.balance > 0) {
      return (
        <>
          <Money value={c.balance} tone="payable" />
          <span className="cust-word payable">{W.youOwe}</span>
        </>
      )
    }
    if (c.balance < 0) {
      return (
        <>
          <Money value={c.balance} tone="neutral" />
          <span className="cust-word">{W.paidAhead}</span>
        </>
      )
    }
  } else if (c.balance > 0) {
    return (
      <>
        <Money value={c.balance} tone="owed" />
        <span className="cust-word owed">{S.owesYou}</span>
      </>
    )
  } else if (c.balance < 0) {
    return (
      <>
        <Money value={c.balance} tone="paid" />
        <span className="cust-word paid">{S.advance}</span>
      </>
    )
  }
  return (
    <>
      <Money value={0} tone="neutral" />
      <span className="cust-word">{S.settled}</span>
    </>
  )
}

function NameCell({ c, W, lang, to, state, showList }) {
  const [primary, secondary] = names(c, lang)
  return (
    <>
      <span className="cust-who">
        <Link to={to} state={state} className={`cust-name ${scriptClass(primary)}`}>
          <bdi>{primary}</bdi>
        </Link>
        {secondary && (
          <span className={`cust-alt ${scriptClass(secondary)}`} lang={URDU_SCRIPT.test(secondary) ? 'ur' : 'en'}>
            {secondary}
          </span>
        )}
        {c.sample && <SampleBadge W={W} />}
      </span>
      {(c.phoneLocal || (showList && c.listId)) && (
        <span className="sub cust-sub">
          {showList && <ListChip person={c} lang={lang} W={W} />}
          {c.phoneLocal && <bdi className="num" dir="ltr">{c.phoneLocal}</bdi>}
        </span>
      )}
    </>
  )
}

function UnpaidCell({ c, S, lang }) {
  if (c.balance <= 0 || c.unpaidDays == null) return <span className="cust-none">—</span>
  const date = ts => midSentence(when(ts, lang, { withTime: false }), lang)
  if (isSupplier(c)) {
    return (
      <>
        {c.unpaidDays === 0 ? S.underDay : dayCount(c.unpaidDays, lang)}
        <span className="sub">{c.lastPaymentAt ? S.youPaid(date(c.lastPaymentAt)) : S.youNeverPaid}</span>
      </>
    )
  }
  const sub = c.lastPaymentAt ? S.lastPaid(date(c.lastPaymentAt)) : S.neverPaid
  let main
  if (c.unpaidDays === 0) main = S.underDay
  else if (isOverdue(c)) {
    main = (
      <span className="cust-late">
        <Icon name="clock" size="sm" />
        {dayCount(c.unpaidDays, lang)}
      </span>
    )
  } else main = dayCount(c.unpaidDays, lang)
  return (
    <>
      {main}
      <span className="sub">{sub}</span>
    </>
  )
}

function LastCell({ c, S, lang }) {
  if (!c.lastEntryAt) return <span className="cust-none">{S.noEntries}</span>
  return (
    <>
      {when(c.lastEntryAt, lang, { withTime: false })}
      <span className="sub">{S.entries(c.entriesCount)}</span>
    </>
  )
}

function CustomerTable({ rows, S, W, lang, back, showList, supplierScope }) {
  const navigate = useNavigate()
  const state = back ? { back } : undefined
  return (
    <div className="grid-table-wrap">
      <table className="grid-table cust-table">
        <caption className="sr-only">{S.tableName}</caption>
        <thead>
          <tr>
            <th scope="col">{S.colName}</th>
            <th scope="col" className="hl end cust-col-bal">{S.colBalance}</th>
            <th scope="col" className="cust-col">
              {supplierScope ? S.colSincePaid : S.colUnpaid}
              <FootnoteRef n={1} id="unpaid" />
            </th>
            <th scope="col" className="cust-col">{S.colLast}</th>
            <th scope="col" className="cust-go">
              <span className="sr-only">{S.colOpen}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const to = `/app/customers/${c.id}`
            return (
              <tr
                key={c.id}
                className={isSupplier(c) ? 'clickable is-supplier' : 'clickable'}
                onClick={e => {
                  if (e.target.closest('a, button')) return
                  if (window.getSelection?.().toString()) return
                  navigate(to, { state })
                }}
              >
                <th scope="row">
                  <NameCell c={c} W={W} lang={lang} to={to} state={state} showList={showList} />
                </th>
                <td className="hl end">
                  <Balance c={c} S={S} W={W} />
                </td>
                <td>
                  <UnpaidCell c={c} S={S} lang={lang} />
                </td>
                <td>
                  <LastCell c={c} S={S} lang={lang} />
                </td>
                <td className="cust-go">
                  <Icon name="chevron-right" className="flip-rtl" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CustomerRow({ c, S, W, lang, back, showList }) {
  const [primary, secondary] = names(c, lang)
  const late = isOverdue(c)
  const chip = showList && c.listId
  return (
    <li>
      <Link to={`/app/customers/${c.id}`} state={back ? { back } : undefined} className="cust-row">
        <span className="cust-row-main">
          {/* Each name truncates at its own end (dir=auto), so a long Latin name in Urdu mode keeps its first words. */}
          <span className="cust-row-name">
            <bdi className={scriptClass(primary)} dir="auto">{primary}</bdi>
            {secondary && (
              <span className={`cust-row-alt ${scriptClass(secondary)}`} lang={URDU_SCRIPT.test(secondary) ? 'ur' : 'en'} dir="auto">
                {secondary}
              </span>
            )}
          </span>
          {/* List and Sample sit on their own line on phones, so the name keeps its width. */}
          {(chip || c.sample) && (
            <span className="cust-row-list">
              {chip && <ListChip person={c} lang={lang} W={W} />}
              {c.sample && <SampleBadge W={W} />}
            </span>
          )}
          <span className={['cust-row-meta', late && 'is-late'].filter(Boolean).join(' ')}>
            {late && <Icon name="clock" size="sm" />}
            <span>
              {statusLine(c, S, lang)}
              {c.phoneLocal && (
                <>
                  {' · '}
                  <bdi className="num" dir="ltr">{c.phoneLocal}</bdi>
                </>
              )}
            </span>
          </span>
        </span>
        <span className="cust-row-amt">
          <Balance c={c} S={S} W={W} />
        </span>
      </Link>
    </li>
  )
}

function ListSkeleton() {
  return (
    <div className="cust-skel" aria-busy="true">
      <div className="cust-skel-tools">
        <Skeleton width={280} height={44} style={{ borderRadius: 999 }} />
        <Skeleton width={360} height={40} style={{ borderRadius: 999 }} />
      </div>
      <div className="cust-skel-frame">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="cust-skel-row">
            <span className="cust-skel-main">
              <Skeleton width={`${62 - i * 7}%`} height={16} />
              <Skeleton width="34%" height={12} style={{ marginTop: 8 }} />
            </span>
            <span className="cust-skel-amt">
              <Skeleton width={72} height={16} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** First visit: teach the exact sentence that fills this page. */
function NoCustomers({ S }) {
  return (
    <section className="cust-empty" aria-label={S.emptyLabel}>
      <QuoteCard
        label={S.emptyLabel}
        cells={[
          { label: S.exampleWrites, value: S.exampleWritesValue },
          { label: S.exampleWhere, value: <bdi className="latin">{S.exampleWhereValue}</bdi> },
        ]}
      >
        “{S.example}”
      </QuoteCard>
      <p className="body-serif cust-empty-text">{S.emptyBody}</p>
    </section>
  )
}

/** A list with nobody in it yet: the sentence that fills it, and a button. */
function EmptyList({ S, name, suppliers, onAdd }) {
  const sayText = suppliers ? S.emptySupSay : S.emptyListSay(name)
  const say = (
    <q className={`cust-say ${scriptClass(sayText)}`} dir="auto">
      {sayText}
    </q>
  )
  return (
    <div className="cust-nomatch">
      <p className="cust-nomatch-title">{S.emptyList(name)}</p>
      <p className="cust-nomatch-text">{S.emptyListText(say)}</p>
      <Button variant="primary" icon="plus" onClick={onAdd}>{S.addToList}</Button>
    </div>
  )
}

/** <select> of General + the shop's lists (customers lists, then suppliers lists). Value '' = General. */
function ListSelect({ id, value, onChange, lists, S, W, lang }) {
  const sorted = pickerLists(lists)
  const buyers = sorted.filter(l => l.kind !== 'suppliers')
  const sellers = sorted.filter(l => l.kind === 'suppliers')
  return (
    <select id={id} className="select" value={value} onChange={onChange}>
      <optgroup label={S.customerLists}>
        <option value="">{W.general}</option>
        {buyers.map(l => (
          <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
        ))}
      </optgroup>
      {sellers.length > 0 && (
        <optgroup label={S.supplierLists}>
          {sellers.map(l => (
            <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

const EMPTY_FORM = { name: '', nameUrdu: '', phone: '', listId: '' }

function AddCustomerSheet({ open, onClose, customers, lists, initialListId }) {
  const S = useStrings(STRINGS)
  const W = useListWords()
  const C = useCommon()
  const { lang } = useLang()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY_FORM, listId: initialListId || '' })
    setErrors({})
  }, [open, initialListId])

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const supplier = lists.find(l => l.id === form.listId)?.kind === 'suppliers'

  const typed = form.name.trim().toLowerCase()
  const existing = typed
    ? customers.find(c => c.name.toLowerCase() === typed || (c.aliases || []).some(a => a.toLowerCase() === typed))
    : null

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    const name = form.name.trim()
    const next = {}
    if (!name) next.name = supplier ? S.needSupName : S.needName
    if (!validPhone(form.phone)) next.phone = S.badPhone
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const created = await api('/api/customers', {
        method: 'POST',
        body: { name, nameUrdu: form.nameUrdu.trim() || undefined, phone: form.phone.trim() || undefined, listId: form.listId || null },
      })
      toast.success(S.created(created.name))
      onClose()
      navigate(`/app/customers/${created.id}`)
    } catch {
      toast.error(S.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={supplier ? S.addSupTitle : S.addTitle}
      description={supplier ? S.addSupDesc : S.addDesc}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="primary" type="submit" form="cust-add-form" loading={busy}>{supplier ? S.createSup : S.create}</Button>
        </>
      }
    >
      <form id="cust-add-form" className="cust-form" onSubmit={submit} noValidate>
        <Field
          label={S.name}
          htmlFor="cust-add-name"
          error={errors.name}
          hint={
            existing ? (
              <span className="cust-exists">
                {S.exists(existing.name)}{' '}
                <Link to={`/app/customers/${existing.id}`} onClick={onClose}>{S.openKhata}</Link>
              </span>
            ) : (
              S.nameHint
            )
          }
        >
          <input
            id="cust-add-name"
            className="input"
            value={form.name}
            onChange={set('name')}
            placeholder={supplier ? S.supNamePh : S.namePh}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={60}
            aria-invalid={Boolean(errors.name)}
            data-autofocus
          />
        </Field>
        <Field label={S.nameUr} htmlFor="cust-add-ur">
          <input
            id="cust-add-ur"
            className="input cust-ur-input"
            dir="rtl"
            lang="ur"
            value={form.nameUrdu}
            onChange={set('nameUrdu')}
            placeholder={S.nameUrPh}
            autoComplete="off"
            maxLength={60}
          />
        </Field>
        {lists.length > 0 && (
          <Field label={S.list} htmlFor="cust-add-list" hint={S.listHint}>
            <ListSelect id="cust-add-list" value={form.listId} onChange={set('listId')} lists={lists} S={S} W={W} lang={lang} />
          </Field>
        )}
        <Field label={S.phone} htmlFor="cust-add-phone" error={errors.phone} hint={supplier ? S.supPhoneHint : S.phoneHint}>
          <input
            id="cust-add-phone"
            className="input num"
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={form.phone}
            onChange={set('phone')}
            placeholder={S.phonePh}
            autoComplete="off"
            aria-invalid={Boolean(errors.phone)}
          />
        </Field>
      </form>
    </Sheet>
  )
}

/** The message for a POST/PATCH /api/lists failure; `exists` comes with the clashing list (null = it means General). */
function listError(err, S, W, lang, onOpenList) {
  if (err?.code === 'bad_name') return S.listBadName
  if (err?.code === 'too_many') return S.listTooMany
  if (err?.code === 'exists') {
    const other = err.data?.list
    if (!other) return S.listIsGeneral
    return (
      <span>
        {S.listExists(listName(other, lang, W))}{' '}
        <button type="button" className="cust-inline-link" onClick={() => onOpenList(other.id)}>{S.openList}</button>
      </span>
    )
  }
  return null
}

const EMPTY_LIST = { name: '', nameUrdu: '', kind: 'customers' }

function NewListSheet({ open, onClose, onCreated, onOpenList }) {
  const S = useStrings(STRINGS)
  const W = useListWords()
  const C = useCommon()
  const { lang } = useLang()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_LIST)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_LIST)
    setError(null)
  }, [open])

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const openOther = id => {
    onClose()
    onOpenList(id)
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!form.name.trim() && !form.nameUrdu.trim()) return setError(S.listNeedName)
    setError(null)
    setBusy(true)
    try {
      const list = await api('/api/lists', {
        method: 'POST',
        body: { name: form.name.trim() || form.nameUrdu.trim(), nameUrdu: form.nameUrdu.trim() || undefined, kind: form.kind },
      })
      toast.success(S.listCreated(listName(list, lang, W)))
      onClose()
      onCreated(list)
    } catch (err) {
      const message = listError(err, S, W, lang, openOther)
      if (message) setError(message)
      else toast.error(S.listFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={S.newListTitle}
      description={S.newListDesc}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="primary" type="submit" form="cust-list-form" loading={busy}>{S.createList}</Button>
        </>
      }
    >
      <form id="cust-list-form" className="cust-form" onSubmit={submit} noValidate>
        <Field label={S.listName} htmlFor="cust-list-name" error={error} hint={S.listNameHint}>
          <input
            id="cust-list-name"
            className="input"
            value={form.name}
            onChange={set('name')}
            placeholder={S.listNamePh}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
            aria-invalid={Boolean(error)}
            data-autofocus
          />
        </Field>
        <Field label={S.listNameUr} htmlFor="cust-list-ur" hint={S.listNameUrHint}>
          <input
            id="cust-list-ur"
            className="input cust-ur-input"
            dir="rtl"
            lang="ur"
            value={form.nameUrdu}
            onChange={set('nameUrdu')}
            placeholder={S.listNameUrPh}
            autoComplete="off"
            maxLength={40}
          />
        </Field>
        <Field label={S.kind} hint={form.kind === 'suppliers' ? S.kindSuppliersHint : S.kindCustomersHint}>
          <Segmented
            block
            label={S.kind}
            value={form.kind}
            onChange={kind => setForm(f => ({ ...f, kind }))}
            options={[
              { value: 'customers', label: S.kindCustomers },
              { value: 'suppliers', label: S.kindSuppliers },
            ]}
          />
        </Field>
      </form>
    </Sheet>
  )
}

function EditListSheet({ open, onClose, list, people, onDeleted, onOpenList }) {
  const S = useStrings(STRINGS)
  const W = useListWords()
  const C = useCommon()
  const { lang } = useLang()
  const toast = useToast()
  // urduEdited: the Urdu name goes to the server only when it was edited here. Left alone, a renamed list gets a new
  // Urdu name from the server instead of keeping the old one ("Mohalla" → "Bazaar wale" must not stay "محلہ").
  const [form, setForm] = useState({ name: '', nameUrdu: '', urduEdited: false })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const confirmRef = useRef(null)
  // The Delete button is replaced by the question: move focus to its answer instead of dropping it.
  useEffect(() => {
    if (confirming) confirmRef.current?.querySelector('button')?.focus()
  }, [confirming])

  useEffect(() => {
    if (!open) return
    setForm({ name: list.name, nameUrdu: list.nameUrdu || '', urduEdited: false })
    setError(null)
    setConfirming(false)
    // Only when the sheet opens: a realtime refresh of the list must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setName = e => {
    const name = e.target.value
    // The old Urdu name belongs to the old name: clear it (the server makes a new one) unless it was edited.
    setForm(f => (f.urduEdited ? { ...f, name } : { ...f, name, nameUrdu: name.trim() === list.name ? list.nameUrdu || '' : '' }))
  }
  const setUrdu = e => {
    const nameUrdu = e.target.value
    setForm(f => ({ ...f, nameUrdu, urduEdited: true }))
  }
  const label = listName(list, lang, W)
  const blocked = list.kind === 'suppliers' && people > 0
  const renamed = form.name.trim() !== list.name
  const dirty = renamed || (form.urduEdited && form.nameUrdu.trim() !== (list.nameUrdu || ''))
  // An emptied Urdu field with a new name also means "make it from the name".
  const sendUrdu = form.urduEdited && (form.nameUrdu.trim() || !renamed)
  const openOther = id => {
    onClose()
    onOpenList(id)
  }

  async function save(e) {
    e.preventDefault()
    if (busy || !dirty) return
    if (!form.name.trim()) return setError(S.listNeedName)
    setError(null)
    setBusy(true)
    try {
      await api(`/api/lists/${encodeURIComponent(list.id)}`, { method: 'PATCH', body: { name: form.name.trim(), ...(sendUrdu ? { nameUrdu: form.nameUrdu.trim() } : {}) } })
      toast.success(S.listSaved)
      onClose()
    } catch (err) {
      const message = listError(err, S, W, lang, openOther)
      if (message) setError(message)
      else toast.error(S.listFailed)
    } finally {
      setBusy(false)
    }
  }

  async function remove(e) {
    if (deleting) return
    // The confirm button goes away with the sheet; keep focus inside the dialog until then.
    e.currentTarget.closest('[role="dialog"]')?.focus()
    setDeleting(true)
    try {
      const out = await api(`/api/lists/${encodeURIComponent(list.id)}`, { method: 'DELETE' })
      toast.success(S.listDeleted(label, out?.moved || 0))
      onClose()
      onDeleted()
    } catch (err) {
      if (err?.code === 'not_empty') setError(S.deleteListBlocked(err.data?.people || people))
      else toast.error(S.listFailed)
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={S.editListTitle(label)}
      description={S.editListDesc}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="primary" type="submit" form="cust-edit-list-form" loading={busy} disabled={!dirty}>{S.saveList}</Button>
        </>
      }
    >
      <form id="cust-edit-list-form" className="cust-form" onSubmit={save} noValidate>
        <Field label={S.listName} htmlFor="cust-edit-list-name" error={error} hint={S.listNameHint}>
          <input
            id="cust-edit-list-name"
            className="input"
            value={form.name}
            onChange={setName}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
            aria-invalid={Boolean(error)}
            data-autofocus
          />
        </Field>
        <Field label={S.listNameUr} htmlFor="cust-edit-list-ur">
          <input
            id="cust-edit-list-ur"
            className="input cust-ur-input"
            dir="rtl"
            lang="ur"
            value={form.nameUrdu}
            onChange={setUrdu}
            placeholder={S.listNameUrPh}
            autoComplete="off"
            maxLength={40}
          />
        </Field>
      </form>
      <div className="cust-danger">
        <h3 className="cust-danger-title">{S.deleteListTitle}</h3>
        <p className="cust-danger-text">{blocked ? S.deleteListBlocked(people) : S.deleteListBody(people)}</p>
        {confirming ? (
          <div ref={confirmRef} className="cust-danger-confirm" role="group" aria-label={S.deleteListAsk(label)}>
            <p className="cust-danger-ask">{S.deleteListAsk(label)}</p>
            <div className="cluster">
              <Button variant="danger" className="solid" icon="trash" loading={deleting} onClick={remove}>{S.deleteListYes}</Button>
              <Button
                variant="ghost"
                onClick={e => {
                  e.currentTarget.closest('[role="dialog"]')?.focus()
                  setConfirming(false)
                }}
              >
                {S.keepList}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" icon="trash" disabled={blocked} onClick={() => setConfirming(true)}>{S.deleteList}</Button>
        )}
      </div>
    </Sheet>
  )
}
