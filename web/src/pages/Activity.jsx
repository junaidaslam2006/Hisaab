import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import MicRecorder from '../components/MicRecorder.jsx'
import VoiceNote from '../components/VoiceNote.jsx'
import { useToast } from '../components/Toast.jsx'
import { Button, EmptyState, LoadError, Money, PageHeader, Skeleton } from '../components/ui.jsx'
import { FootnoteRef, Footnotes, LabeledCells, QuoteCard, SectionRail, TabPanel, Tabs } from '../components/editorial.jsx'
import { api } from '../lib/api.js'
import { when, whatsappHtml } from '../lib/format.js'
import { useCommon, useLang, useStrings } from '../lib/i18n.jsx'
import { useMe } from '../lib/me.jsx'
import { useRealtime } from '../lib/realtime.jsx'
import '../lib/lists.css'
import './Activity.css'

const STRINGS = {
  en: {
    title: 'Messages',
    leadPlain: 'Everything you sent Hisaab, what it wrote in your khata and how it replied.',
    lead: ({ n, more, flagged, working, replyRef, lookRef }) => (
      <>
        Everything you sent Hisaab, what it wrote in your khata and how it replied.{replyRef}{' '}
        {more ? (
          <>
            These are your latest <span className="num msg-n">{n}</span> messages
          </>
        ) : (
          <>
            <span className="num msg-n">{n}</span> message{n === 1 ? '' : 's'} so far
          </>
        )}
        ;{' '}
        {flagged ? (
          <>
            <span className="num msg-n">{flagged}</span> need{flagged === 1 ? 's' : ''} a look
          </>
        ) : (
          'nothing needs a look'
        )}
        {lookRef}.
        {working ? (
          <>
            {' '}
            Hisaab is working on <span className="num msg-n">{working}</span> right now.
          </>
        ) : null}
      </>
    ),
    tabsLabel: 'Show messages',
    tabs: { all: 'All', attention: 'Needs a look', voice: 'Voice notes', text: 'Texts', photo: 'Photos' },
    contents: 'Days on this page',
    earlier: 'Earlier',
    dayMeta: (n, look) => (
      <>
        <span className="num msg-n">{n}</span> message{n === 1 ? '' : 's'}
        {look ? (
          <>
            {' · '}
            <span className="num msg-n">{look}</span> to check
          </>
        ) : null}
      </>
    ),
    channel: { whatsapp: 'WhatsApp', web: 'Dashboard' },
    kind: { voice: 'Voice note', text: 'Text', photo: 'Photo' },
    status: { working: 'Working', written: 'Written in khata', answered: 'Answered', look: 'Needs a look', failed: 'Not written' },
    youSaid: 'You said',
    youSent: 'You sent',
    wrote: 'Hisaab wrote',
    reply: 'Reply',
    replyText: 'Reply text',
    heardAs: (kind, language) => `${kind === 'voice' ? 'As Hisaab heard it' : 'As Hisaab read it'}${language ? ` · ${language}` : ''}`,
    noAudio: 'Voice note (audio not kept)',
    photoAlt: 'Photo you sent to Hisaab',
    openPhoto: 'Open the full photo',
    language: { urdu: 'Urdu', pashto: 'Pashto', punjabi: 'Punjabi', hindko: 'Hindko', english: 'English', mixed: 'Mixed' },
    steps: { listen: 'Listening', read: 'Reading', think: 'Understanding', speak: 'Replying' },
    stepsLabel: 'Progress',
    stepDone: 'done',
    progress: { received: 'Listening…', reading: 'Reading…', thinking: 'Understanding…', speaking: 'Replying…' },
    errors: {
      busy: 'Hisaab was busy — send it again in a minute',
      ai_config: 'AI service problem — we are looking into it',
      network: 'Connection problem — send it again',
      not_understood: 'Could not understand — try again, say the name and amount',
      limit: n => `Daily limit reached (${n} messages)`,
      interrupted: 'Server restarted before this was written — please send it again',
      other: 'Something went wrong — send it again',
    },
    nothingWritten: 'Nothing to write in the khata',
    bal: v => <> · balance {v}</>,
    clear: ' · nothing owed now',
    adv: v => <> · advance {v}</>,
    nothingOwed: 'nothing owed',
    advance: 'advance',
    // A supplier's balance is what the shop owes them.
    owe: v => <> · you owe {v}</>,
    oweClear: ' · nothing owed to them now',
    oweAdvance: v => <> · paid {v} in advance</>,
    inList: (list, created) => (
      <>
        {' '}
        · in {list}
        {created ? ' (new list)' : ''}
      </>
    ),
    general: 'General',
    allSuppliers: 'your suppliers',
    did: {
      credit: ({ name, amount, bal }) => <>Udhaar {amount} written for {name}{bal}</>,
      payment: ({ name, amount, bal }) => <>Payment {amount} from {name}{bal}</>,
      undo: ({ name, amount, bal }) => <>Cancelled {amount} for {name}{bal}</>,
      correct: ({ name, old, amount, bal }) => <>Changed {name}’s entry from {old} to {amount}{bal}</>,
      setPhone: ({ name }) => <>Saved {name}’s number</>,
      badPhone: ({ name }) => <>Could not catch {name}’s number — asked you to say it again</>,
      balance: ({ name, money }) => <>Told you {name}’s balance ({money})</>,
      reminder: ({ name }) => <>Prepared a reminder for {name}</>,
      dues_list: 'Sent you the udhaar list',
      total_due: 'Told you the total udhaar',
      today_summary: 'Sent you today’s summary',
      full_ledger: 'Sent you the full khata',
      help: 'Sent the help guide',
      dashboard_link: 'Sent a login link',
      needsAmount: ({ name }) => <>Asked how much ({name})</>,
      needsName: 'Asked for the customer’s name',
      which: ({ list }) => <>Asked which customer: {list}</>,
      notFound: ({ name }) => <>No customer named {name}</>,
      alreadyClear: ({ name }) => <>{name} had nothing to pay</>,
      nothingToUndo: 'Nothing to cancel',
      nothingToCorrect: 'No entry to correct',
      chitchat: 'Replied',
      unclear: 'Could not tell what to write — asked you again',
      purchase: ({ name, amount, bal, list }) => (
        <>
          Goods worth {amount} taken on credit from {name}
          {list}
          {bal}
        </>
      ),
      supplierPayment: ({ name, amount, bal, list }) => (
        <>
          Paid {amount} to {name}
          {list}
          {bal}
        </>
      ),
      createList: ({ list, suppliers }) => (
        <>
          Made a new {suppliers ? 'suppliers ' : ''}list: {list}
        </>
      ),
      listExists: ({ list }) => (list ? <>A list called {list} already exists — nothing new made</> : 'That name means General — nothing new made'),
      listNeedsName: 'Asked what to call the new list',
      moved: ({ name, list, from, created }) => (
        <>
          Moved {name} to {list}
          {from ? <> (from {from})</> : null}
          {created ? ' — a new list' : ''}
        </>
      ),
      alreadyIn: ({ name, list }) => (
        <>
          {name} was already in {list}
        </>
      ),
      hasEntries: ({ name }) => <>{name} already has entries, so they cannot move between customers and suppliers — nothing changed</>,
      whichList: ({ name }) => <>Asked which list to put {name} in</>,
      listNotFound: ({ list, options }) => (
        <>
          No list called {list}
          {options ? <> — asked you which one: {options}</> : null}
        </>
      ),
      notSupplier: ({ name }) => <>{name} is a customer, not a supplier — nothing written; asked if you meant a supplier khata</>,
      tooMany: ({ list }) => <>Could not make the list {list}: you already have 20 — nothing written</>,
      listsSummary: n => (n ? <>Sent you your lists (<span className="num">{n}</span>)</> : 'Told you there are no separate lists yet'),
      duesIn: ({ scope, count, total }) => (
        <>
          Sent you who owes in {scope}
          {count != null ? (
            <>
              {' '}
              — <span className="num">{count}</span> {count === 1 ? 'person' : 'people'}, {total}
            </>
          ) : null}
        </>
      ),
      suppliersOwed: ({ scope, count, total }) => (
        <>
          Sent you what you owe {scope}
          {count != null ? (
            <>
              {' '}
              — <span className="num">{count}</span> {count === 1 ? 'supplier' : 'suppliers'}, {total}
            </>
          ) : null}
        </>
      ),
      totalIn: ({ scope, total }) => (
        <>
          Told you the total udhaar in {scope}
          {total ? <> ({total})</> : null}
        </>
      ),
      totalAll: ({ total }) => <>Told you the total udhaar{total ? <> ({total})</> : null}</>,
      payable: ({ scope, total }) => (
        <>
          Told you what you owe {scope}
          {total ? <> ({total})</> : null}
        </>
      ),
      ledgerIn: ({ scope }) => <>Sent you the khata of {scope}</>,
      remindList: ({ scope, count }) => (
        <>
          Prepared reminders for <span className="num">{count}</span> {count === 1 ? 'person' : 'people'} in {scope}
        </>
      ),
      remindNobody: ({ scope }) => <>Nobody in {scope} owes anything — no reminders</>,
      remindSuppliers: 'Suppliers do not get payment reminders — nothing prepared',
      remindSupplier: ({ name }) => <>{name} is a supplier — reminders are only for customers</>,
      remindWho: 'Asked who to remind — a name or a list',
      owesThem: ({ name, money }) => <>Told you what you owe {name} ({money})</>,
    },
    composeTitle: 'Send a note from here',
    composeMeta: 'Hisaab writes it like a note on WhatsApp',
    composeLabel: 'Type a note for Hisaab',
    composeExample: 'Umar ne 500 ka sauda liya',
    send: 'Send',
    speak: 'Speak it',
    sendFailed: 'Your note did not reach Hisaab. Check your internet and send it again.',
    loadOlder: 'Show older messages',
    olderFailed: 'Could not load older messages.',
    theEnd: 'That was your first message.',
    allClear: 'Nothing needs your attention',
    allClearBody: n => (n === 1 ? 'Hisaab understood your message and wrote it down.' : `Hisaab understood all of your last ${n} messages and wrote them down.`),
    noneKind: { voice: 'No voice notes here', text: 'No texts here', photo: 'No photos here' },
    noneKindBody: n => (n === 1 ? 'There is only 1 message on this page.' : `None of the ${n} messages on this page.`),
    showAll: 'Show all messages',
    fnReply: {
      lead: 'Replies.',
      text: (
        <>
          Hisaab answers every message with a short text. With voice replies on in <Link to="/app/settings">Settings</Link>, it also sends a
          spoken Urdu voice note with the new balance.
        </>
      ),
    },
    fnLook: {
      lead: 'Needs a look.',
      text: 'Hisaab could not write the message, or it asked you something back — which customer, which list, or how much. Answer it on WhatsApp, or send the note again.',
    },
    firstTitle: 'Send your first voice note',
    firstBody: shop => `Nothing here yet. Every voice note or text you send yourself on WhatsApp will appear on this page, with exactly what Hisaab wrote in ${shop ? `${shop}’s` : 'your'} khata.`,
    step1t: 'Open your own chat on WhatsApp',
    step1: phone => (
      <>
        The chat with your own number{phone ? <> (<bdi className="num">{phone}</bdi>)</> : null}. It is marked “You” or “Message yourself”.
      </>
    ),
    step2t: 'Hold the mic and say who took what',
    forExample: 'For example',
    meaning: 'Meaning',
    step3t: 'Hisaab writes it and replies',
    step3: 'In a few seconds a short voice note comes back in the same chat, and the message shows up here.',
    sayUr: 'عمر نے 500 کا سودا لیا',
    sayRoman: '“Umar ne 500 ka sauda liya”',
    sayMeaning: 'Umar took Rs 500 of goods on udhaar.',
    getStarted: 'Get started',
    connectFirst: 'Connect WhatsApp first',
    moreExamples: 'See what else you can say',
  },
  ur: {
    title: 'پیغامات',
    leadPlain: 'آپ نے حساب کو جو کچھ بھیجا، اس نے آپ کے کھاتے میں کیا لکھا اور کیا جواب دیا۔',
    lead: ({ n, more, flagged, working, replyRef, lookRef }) => (
      <>
        آپ نے حساب کو جو کچھ بھیجا، اس نے آپ کے کھاتے میں کیا لکھا اور کیا جواب دیا۔{replyRef}{' '}
        {more ? (
          <>
            یہ آپ کے تازہ ترین <span className="num msg-n">{n}</span> پیغامات ہیں
          </>
        ) : (
          <>
            اب تک <span className="num msg-n">{n}</span> {n === 1 ? 'پیغام' : 'پیغامات'}
          </>
        )}
        ؛{' '}
        {flagged ? (
          <>
            <span className="num msg-n">{flagged}</span> پر توجہ کی ضرورت ہے
          </>
        ) : (
          'کسی پر توجہ کی ضرورت نہیں'
        )}
        {lookRef}۔
        {working ? (
          <>
            {' '}
            حساب ابھی <span className="num msg-n">{working}</span> پر کام کر رہا ہے۔
          </>
        ) : null}
      </>
    ),
    tabsLabel: 'پیغامات دکھائیں',
    tabs: { all: 'سب', attention: 'توجہ طلب', voice: 'وائس نوٹ', text: 'تحریری', photo: 'تصاویر' },
    contents: 'اس صفحے کے دن',
    earlier: 'اس سے پہلے',
    dayMeta: (n, look) => (
      <>
        <span className="num msg-n">{n}</span> پیغام
        {look ? (
          <>
            {' · '}
            <span className="num msg-n">{look}</span> توجہ طلب
          </>
        ) : null}
      </>
    ),
    channel: { whatsapp: 'واٹس ایپ', web: 'ڈیش بورڈ' },
    kind: { voice: 'وائس نوٹ', text: 'تحریری پیغام', photo: 'تصویر' },
    status: { working: 'کام جاری ہے', written: 'کھاتے میں لکھ دیا', answered: 'جواب دے دیا', look: 'توجہ طلب', failed: 'نہیں لکھا گیا' },
    youSaid: 'آپ نے کہا',
    youSent: 'آپ نے بھیجا',
    wrote: 'حساب نے لکھا',
    reply: 'جواب',
    replyText: 'جواب کا متن',
    heardAs: (kind, language) => `${kind === 'voice' ? 'جیسا حساب نے سنا' : 'جیسا حساب نے پڑھا'}${language ? ` · ${language}` : ''}`,
    noAudio: 'وائس نوٹ (آڈیو محفوظ نہیں)',
    photoAlt: 'آپ کی بھیجی ہوئی تصویر',
    openPhoto: 'پوری تصویر کھولیں',
    language: { urdu: 'اردو', pashto: 'پشتو', punjabi: 'پنجابی', hindko: 'ہندکو', english: 'انگریزی', mixed: 'ملی جلی' },
    steps: { listen: 'سننا', read: 'پڑھنا', think: 'سمجھنا', speak: 'جواب دینا' },
    stepsLabel: 'پیش رفت',
    stepDone: 'مکمل',
    progress: { received: 'سن رہا ہے…', reading: 'پڑھ رہا ہے…', thinking: 'سمجھ رہا ہے…', speaking: 'جواب دے رہا ہے…' },
    errors: {
      busy: 'حساب مصروف تھا — ایک منٹ بعد دوبارہ بھیجیں',
      ai_config: 'AI سروس میں مسئلہ ہے — ہم اسے دیکھ رہے ہیں',
      network: 'کنکشن کا مسئلہ — دوبارہ بھیجیں',
      not_understood: 'سمجھ نہیں آیا — دوبارہ بھیجیں، نام اور رقم صاف بولیں',
      limit: n => `آج کی حد پوری ہو گئی (${n} پیغامات)`,
      interrupted: 'لکھے جانے سے پہلے سرور دوبارہ شروع ہو گیا — براہ کرم دوبارہ بھیجیں',
      other: 'کچھ گڑبڑ ہو گئی — دوبارہ بھیجیں',
    },
    nothingWritten: 'کھاتے میں لکھنے کو کچھ نہیں تھا',
    bal: v => <> · بقایا {v}</>,
    clear: ' · اب کچھ باقی نہیں',
    adv: v => <> · ایڈوانس {v}</>,
    nothingOwed: 'کچھ باقی نہیں',
    advance: 'ایڈوانس',
    owe: v => <> · آپ نے {v} دینے ہیں</>,
    oweClear: ' · اب ان کا کچھ نہیں دینا',
    oweAdvance: v => <> · {v} پیشگی دیے ہوئے</>,
    inList: (list, created) => (
      <>
        {' '}
        · {list} میں
        {created ? ' (نئی لسٹ)' : ''}
      </>
    ),
    general: 'عام کھاتہ',
    allSuppliers: 'سپلائرز',
    did: {
      credit: ({ name, amount, bal }) => <>{name} کے کھاتے میں {amount} ادھار لکھا{bal}</>,
      payment: ({ name, amount, bal }) => <>{name} سے {amount} وصول ہوئے{bal}</>,
      undo: ({ name, amount, bal }) => <>{name} کی {amount} والی انٹری کینسل کی{bal}</>,
      correct: ({ name, old, amount, bal }) => <>{name} کی انٹری {old} سے بدل کر {amount} کی{bal}</>,
      setPhone: ({ name }) => <>{name} کا نمبر محفوظ کیا</>,
      badPhone: ({ name }) => <>{name} کا نمبر سمجھ نہیں آیا — دوبارہ بتانے کو کہا</>,
      balance: ({ name, money }) => <>آپ کو {name} کا بقایا بتایا ({money})</>,
      reminder: ({ name }) => <>{name} کے لیے یاد دہانی کا پیغام تیار کیا</>,
      dues_list: 'آپ کو ادھار کی فہرست بھیجی',
      total_due: 'آپ کو کل ادھار بتایا',
      today_summary: 'آپ کو آج کا خلاصہ بھیجا',
      full_ledger: 'آپ کو پورا کھاتہ بھیجا',
      help: 'مدد کا پیغام بھیجا',
      dashboard_link: 'لاگ ان لنک بھیجا',
      needsAmount: ({ name }) => <>پوچھا کتنے روپے لکھوں ({name})</>,
      needsName: 'گاہک کا نام پوچھا',
      which: ({ list }) => <>پوچھا کون سا گاہک: {list}</>,
      notFound: ({ name }) => <>{name} نام کا کوئی گاہک نہیں ملا</>,
      alreadyClear: ({ name }) => <>{name} کے ذمے کچھ باقی نہیں تھا</>,
      nothingToUndo: 'کینسل کرنے کے لیے کوئی انٹری نہیں ملی',
      nothingToCorrect: 'درست کرنے کے لیے کوئی انٹری نہیں ملی',
      chitchat: 'جواب دیا',
      unclear: 'سمجھ نہیں آیا کیا لکھنا ہے — دوبارہ پوچھا',
      purchase: ({ name, amount, bal, list }) => (
        <>
          {name} سے {amount} کا مال ادھار لیا
          {list}
          {bal}
        </>
      ),
      supplierPayment: ({ name, amount, bal, list }) => (
        <>
          {name} کو {amount} ادا کیے
          {list}
          {bal}
        </>
      ),
      createList: ({ list, suppliers }) => (
        <>
          {suppliers ? 'سپلائرز کی ' : ''}نئی لسٹ بنائی: {list}
        </>
      ),
      listExists: ({ list }) => (list ? <>{list} نام کی لسٹ پہلے سے موجود ہے — کچھ نیا نہیں بنا</> : 'اس نام کا مطلب عام کھاتہ ہے — کچھ نیا نہیں بنا'),
      listNeedsName: 'نئی لسٹ کا نام پوچھا',
      moved: ({ name, list, from, created }) => (
        <>
          {name} کو {list} میں ڈال دیا
          {from ? <> ({from} سے)</> : null}
          {created ? ' — نئی لسٹ' : ''}
        </>
      ),
      alreadyIn: ({ name, list }) => (
        <>
          {name} پہلے سے {list} میں تھے
        </>
      ),
      hasEntries: ({ name }) => <>{name} کے اندراجات موجود ہیں، اس لیے گاہکوں اور سپلائرز کے درمیان منتقل نہیں ہو سکتے — کچھ نہیں بدلا</>,
      whichList: ({ name }) => <>پوچھا کہ {name} کو کس لسٹ میں ڈالیں</>,
      listNotFound: ({ list, options }) => (
        <>
          {list} نام کی کوئی لسٹ نہیں
          {options ? <> — پوچھا کون سی: {options}</> : null}
        </>
      ),
      notSupplier: ({ name }) => <>{name} گاہک ہیں، سپلائر نہیں — کچھ نہیں لکھا؛ پوچھا کہ کیا سپلائر کا کھاتہ کھولنا ہے</>,
      tooMany: ({ list }) => <>{list} کی لسٹ نہیں بن سکی: پہلے ہی 20 لسٹیں ہیں — کچھ نہیں لکھا</>,
      listsSummary: n => (n ? <>آپ کی لسٹیں بھیجیں (<span className="num">{n}</span>)</> : 'بتایا کہ ابھی کوئی الگ لسٹ نہیں'),
      duesIn: ({ scope, count, total }) => (
        <>
          {scope} میں کس کس کے ذمے ہے، یہ بھیجا
          {count != null ? (
            <>
              {' '}
              — {count === 1 ? 'ایک شخص' : <><span className="num">{count}</span> لوگ</>}، {total}
            </>
          ) : null}
        </>
      ),
      suppliersOwed: ({ scope, count, total }) => (
        <>
          {scope} کو جو دینا ہے، یہ بھیجا
          {count != null ? (
            <>
              {' '}
              — {count === 1 ? 'ایک سپلائر' : <><span className="num">{count}</span> سپلائرز</>}، {total}
            </>
          ) : null}
        </>
      ),
      totalIn: ({ scope, total }) => (
        <>
          {scope} کا کل ادھار بتایا
          {total ? <> ({total})</> : null}
        </>
      ),
      totalAll: ({ total }) => <>آپ کو کل ادھار بتایا{total ? <> ({total})</> : null}</>,
      payable: ({ scope, total }) => (
        <>
          بتایا کہ {scope} کو کتنا دینا ہے
          {total ? <> ({total})</> : null}
        </>
      ),
      ledgerIn: ({ scope }) => <>{scope} کا کھاتہ بھیجا</>,
      remindList: ({ scope, count }) => (
        <>
          {scope} کے {count === 1 ? 'ایک شخص' : <><span className="num">{count}</span> لوگوں</>} کے لیے یاد دہانی تیار کی
        </>
      ),
      remindNobody: ({ scope }) => <>{scope} میں کسی کے ذمے کچھ نہیں — کوئی یاد دہانی نہیں</>,
      remindSuppliers: 'سپلائرز کو یاد دہانی نہیں بھیجی جاتی — کچھ تیار نہیں کیا',
      remindSupplier: ({ name }) => <>{name} سپلائر ہیں — یاد دہانی صرف گاہکوں کے لیے ہے</>,
      remindWho: 'پوچھا کہ کس کو یاد دہانی بھیجیں — نام یا لسٹ',
      owesThem: ({ name, money }) => <>بتایا کہ آپ نے {name} کو کتنا دینا ہے ({money})</>,
    },
    composeTitle: 'یہاں سے نوٹ بھیجیں',
    composeMeta: 'حساب اسے واٹس ایپ والے نوٹ کی طرح لکھے گا',
    composeLabel: 'حساب کے لیے نوٹ لکھیں',
    composeExample: 'Umar ne 500 ka sauda liya',
    send: 'بھیجیں',
    speak: 'بول کر بھیجیں',
    sendFailed: 'آپ کا نوٹ حساب تک نہیں پہنچا۔ انٹرنیٹ چیک کر کے دوبارہ بھیجیں۔',
    loadOlder: 'پرانے پیغامات دیکھیں',
    olderFailed: 'پرانے پیغامات لوڈ نہیں ہو سکے۔',
    theEnd: 'یہ آپ کا پہلا پیغام تھا۔',
    allClear: 'کسی پیغام پر توجہ کی ضرورت نہیں',
    allClearBody: n =>
      n === 1 ? 'آپ کا پیغام حساب نے پوری طرح سمجھ کر لکھ دیا۔' : `آپ کے آخری ${n} پیغامات حساب نے پوری طرح سمجھ کر لکھ دیے۔`,
    noneKind: { voice: 'یہاں کوئی وائس نوٹ نہیں', text: 'یہاں کوئی تحریری پیغام نہیں', photo: 'یہاں کوئی تصویر نہیں' },
    noneKindBody: n => (n === 1 ? 'اس صفحے پر صرف 1 پیغام ہے۔' : `اس صفحے پر موجود ${n} پیغامات میں سے کوئی نہیں۔`),
    showAll: 'سب پیغامات دکھائیں',
    fnReply: {
      lead: 'جواب۔',
      text: (
        <>
          حساب ہر پیغام کا مختصر تحریری جواب دیتا ہے۔ <Link to="/app/settings">سیٹنگز</Link> میں وائس نوٹ جواب آن ہوں تو ساتھ میں نئے بقایا کے
          ساتھ اردو میں ایک بولا ہوا وائس نوٹ بھی آتا ہے۔
        </>
      ),
    },
    fnLook: {
      lead: 'توجہ طلب۔',
      text: 'حساب یہ پیغام نہیں لکھ سکا، یا اس نے آپ سے کچھ پوچھا — کون سا گاہک، کون سی لسٹ، یا کتنے روپے۔ واٹس ایپ پر جواب دیں، یا نوٹ دوبارہ بھیجیں۔',
    },
    firstTitle: 'اپنا پہلا وائس نوٹ بھیجیں',
    firstBody: shop => `ابھی یہاں کچھ نہیں۔ واٹس ایپ پر خود کو بھیجا گیا ہر وائس نوٹ یا میسج اس صفحے پر نظر آئے گا، ساتھ یہ بھی کہ حساب نے ${shop ? `${shop} کے` : 'آپ کے'} کھاتے میں کیا لکھا۔`,
    step1t: 'واٹس ایپ پر اپنی چیٹ کھولیں',
    step1: phone => (
      <>
        اپنے ہی نمبر{phone ? <> (<bdi className="num">{phone}</bdi>)</> : null} والی چیٹ۔ اس پر ⁦You⁩ یا ⁦Message yourself⁩ لکھا ہوتا ہے۔
      </>
    ),
    step2t: 'مائیک دبا کر بولیں کس نے کیا لیا',
    forExample: 'مثال',
    meaning: 'مطلب',
    step3t: 'حساب لکھ کر جواب دیتا ہے',
    step3: 'چند سیکنڈ میں اسی چیٹ میں ایک مختصر وائس نوٹ آ جاتا ہے، اور پیغام یہاں نظر آنے لگتا ہے۔',
    sayUr: 'عمر نے 500 کا سودا لیا',
    sayRoman: '“Umar ne 500 ka sauda liya”',
    sayMeaning: 'عمر نے 500 روپے کا سامان ادھار لیا۔',
    getStarted: 'شروع کریں',
    connectFirst: 'پہلے واٹس ایپ جوڑیں',
    moreExamples: 'اور کیا کیا بول سکتے ہیں',
  },
}

const PAGE = 25
const TZ = 'Asia/Karachi'
const TOC_DAYS = 5
const IN_PROGRESS = new Set(['received', 'thinking', 'speaking'])
const SUMMARY_TYPES = new Set(['dues_list', 'total_due', 'today_summary', 'full_ledger', 'help', 'dashboard_link'])
const ENTRY_TYPES = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'undo', 'correct', 'set_phone', 'create_list', 'move_to_list'])
const KINDS = ['voice', 'text', 'photo']
const FILTERS = ['all', 'attention', ...KINDS]

const cx = (...parts) => parts.filter(Boolean).join(' ')
const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))
const clock = (ts, lang) =>
  new Date(ts).toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

const kindOf = m => (m.kind === 'voice' || m.kind === 'photo' ? m.kind : 'text')
const resultNeedsAttention = r => r.status !== 'ok' || r.type === 'unclear'
const needsAttention = m => m.status === 'error' || (Array.isArray(m.results) && m.results.some(resultNeedsAttention))
const matchesFilter = (m, filter) => (filter === 'all' ? true : filter === 'attention' ? needsAttention(m) : kindOf(m) === filter)

/** "Today" + "Monday, 26 October" for the last two days; otherwise the full date (with the year when it is not this year). */
function dayTitle(ts, lang) {
  const now = Date.now()
  const key = dayKey(ts)
  const date = new Date(ts).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(key.slice(0, 4) === dayKey(now).slice(0, 4) ? {} : { year: 'numeric' }),
  })
  if (key === dayKey(now) || key === dayKey(now - 864e5)) return { title: when(ts, lang, { withTime: false }), sub: date }
  return { title: date, sub: null }
}

function groupByDay(list) {
  const groups = []
  for (const m of list) {
    const key = dayKey(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(m)
    else groups.push({ key, ts: m.createdAt, items: [m] })
  }
  return groups
}

const flaggedIn = list => list.filter(needsAttention).length

/** Marker at the start of a result line: an amber warning sign when it needs a look, else a legend dot (rust = udhaar, olive = payment). */
function LineMark({ tone }) {
  if (tone === 'warn') return <Icon name="alert" size="sm" className="msg-mark" />
  return <span className={cx('legend-dot', tone)} aria-hidden="true" />
}

function resultTone(r) {
  if (resultNeedsAttention(r)) return 'warn'
  // Supplier entries are what the shop owes: a neutral dot, never the udhaar / received colours.
  if (r.listKind === 'suppliers') return undefined
  if (r.type === 'credit') return 'owed'
  if (r.type === 'payment') return 'paid'
  return undefined
}

/** A name can be stored in either script: Urdu script gets Nastaliq in the English UI, a Roman name stays Latin in the Urdu UI. */
function nameProps(text, lang) {
  const urdu = /[؀-ۿ]/.test(text)
  if (urdu && lang !== 'ur') return { className: 'msg-name ur', lang: 'ur' }
  if (!urdu && lang === 'ur') return { className: 'msg-name latin', lang: 'en' }
  return { className: 'msg-name' }
}

/** Names joined with " / ", each in its own script. */
function nameList(names, lang) {
  if (!names?.length) return null
  return names.map((c, i) => (
    <span key={c + i}>
      {i > 0 && ' / '}
      <bdi {...nameProps(c, lang)}>
        <b>{c}</b>
      </bdi>
    </span>
  ))
}

/** One plain sentence for one thing Hisaab did. */
function describe(r, S, lang) {
  const D = S.did
  const label = (lang === 'ur' && r.customerNameUrdu) || r.customerName || '?'
  const name = (
    <bdi {...nameProps(label, lang)}>
      {r.customerId && r.customerName ? <Link to={`/app/customers/${r.customerId}`}>{label}</Link> : <b>{label}</b>}
    </bdi>
  )
  const amount = tone => <Money value={r.amount} tone={tone} />
  // A supplier's khata runs the other way: their balance is what the shop owes them, in the payable colour, never rust.
  const supplier = r.listKind === 'suppliers' || r.type === 'purchase' || r.type === 'supplier_payment'
  const bal =
    r.balance == null
      ? null
      : supplier
        ? r.balance > 0
          ? S.owe(<Money value={r.balance} tone="payable" />)
          : r.balance < 0
            ? S.oweAdvance(<Money value={r.balance} />)
            : S.oweClear
        : r.balance > 0
          ? S.bal(<Money value={r.balance} tone="owed" />)
          : r.balance < 0
            ? S.adv(<Money value={r.balance} />)
            : S.clear
  const listName = r.listName ? (
    <bdi {...nameProps(r.listName, lang)}>
      <b>{r.listName}</b>
    </bdi>
  ) : null
  // The list a query was about: a named list, General, or all suppliers.
  const scope = listName || (r.listKind === 'suppliers' ? S.allSuppliers : r.listKind === 'customers' ? <b>{S.general}</b> : null)
  // Where a brand-new person was put (and whether the list was made for them).
  const placed = r.isNew && listName ? S.inList(listName, r.listCreated) : null
  const total = r.total != null ? <Money value={r.total} tone={supplier ? 'payable' : 'owed'} /> : null
  const count = r.count ?? null

  switch (r.status) {
    case 'ambiguous':
    case 'confirm':
      return D.which({ list: nameList(r.candidates, lang) || <b>?</b> })
    case 'not_found':
      return D.notFound({ name })
    case 'needs_amount':
      return D.needsAmount({ name })
    case 'needs_name':
      return r.type === 'create_list' ? D.listNeedsName : r.type === 'reminder' ? D.remindWho : D.needsName
    case 'already_clear':
      return D.alreadyClear({ name })
    case 'nothing_to_undo':
      return r.type === 'correct' ? D.nothingToCorrect : D.nothingToUndo
    case 'bad_phone':
      return D.badPhone({ name })
    case 'exists':
      return D.listExists({ list: listName })
    case 'has_entries':
      return D.hasEntries({ name })
    case 'not_supplier':
      return D.notSupplier({ name })
    case 'list_not_found':
      if (!r.listName && r.customerName) return D.whichList({ name })
      return D.listNotFound({ list: listName || <b>?</b>, options: nameList(r.candidates, lang) })
    case 'too_many':
      return D.tooMany({ list: listName || <b>?</b> })
    default:
      break
  }

  // A credit / payment that landed on a supplier is a purchase / supplier payment (same maths, other words).
  const type = supplier && r.type === 'credit' ? 'purchase' : supplier && r.type === 'payment' ? 'supplier_payment' : r.type
  switch (type) {
    case 'credit':
      return D.credit({ name, amount: amount('owed'), bal: <>{placed}{bal}</> })
    case 'payment':
      return D.payment({ name, amount: amount('paid'), bal: <>{placed}{bal}</> })
    case 'purchase':
      return D.purchase({ name, amount: amount('payable'), bal, list: placed })
    case 'supplier_payment':
      return D.supplierPayment({ name, amount: amount('neutral'), bal, list: placed })
    case 'undo':
      return D.undo({ name, amount: amount('neutral'), bal })
    case 'correct':
      return D.correct({ name, old: <Money value={r.oldAmount} />, amount: amount('neutral'), bal })
    case 'set_phone':
      return D.setPhone({ name })
    case 'balance': {
      if (supplier) {
        const money = r.balance > 0 ? <Money value={r.balance} tone="payable" /> : S.nothingOwed
        return D.owesThem({ name, money })
      }
      const money =
        r.balance > 0 ? <Money value={r.balance} tone="owed" /> : r.balance < 0 ? <>{S.advance} <Money value={r.balance} /></> : S.nothingOwed
      return D.balance({ name, money })
    }
    case 'reminder':
      if (!r.customerName) {
        if (r.listKind === 'suppliers') return D.remindSuppliers
        return r.count ? D.remindList({ scope: scope || <b>{S.general}</b>, count }) : D.remindNobody({ scope: scope || <b>{S.general}</b> })
      }
      if (supplier) return D.remindSupplier({ name })
      return r.balance != null && r.balance <= 0 ? D.alreadyClear({ name }) : D.reminder({ name })
    case 'create_list':
      return D.createList({ list: listName || <b>?</b>, suppliers: r.listKind === 'suppliers' })
    case 'move_to_list': {
      const target = listName || <b>{S.general}</b>
      // The ledger leaves out fromListName when the person was already there.
      if (r.fromListName === undefined) return D.alreadyIn({ name, list: target })
      const from = r.fromListName ? (
        <bdi {...nameProps(r.fromListName, lang)}>{r.fromListName}</bdi>
      ) : (
        S.general
      )
      return D.moved({ name, list: target, from, created: r.listCreated })
    }
    case 'lists_summary':
      return D.listsSummary(r.count || 0)
    case 'dues_list':
      if (r.listKind === 'suppliers') return D.suppliersOwed({ scope: listName || S.allSuppliers, count, total })
      return scope ? D.duesIn({ scope, count, total }) : D.dues_list
    case 'total_due':
      if (r.listKind === 'suppliers') return D.payable({ scope: listName || S.allSuppliers, total })
      return scope ? D.totalIn({ scope, total }) : D.totalAll({ total })
    case 'full_ledger':
      return scope ? D.ledgerIn({ scope }) : D.full_ledger
    case 'unclear':
      return D.unclear
    default:
      return SUMMARY_TYPES.has(type) ? D[type] : D.chitchat
  }
}

/** While Hisaab works: "[1] Listening ✓  [2] Understanding ●  [3] Replying". */
function Progress({ m, S }) {
  const keys = [kindOf(m) === 'voice' ? 'listen' : 'read', 'think', 'speak']
  const now = m.status === 'received' ? 0 : m.status === 'thinking' ? 1 : 2
  const announce = m.status === 'received' && kindOf(m) !== 'voice' ? 'reading' : m.status
  return (
    <>
      <ol className="msg-steps" aria-label={S.stepsLabel}>
        {keys.map((k, i) => {
          const state = i < now ? 'done' : i === now ? 'now' : 'next'
          return (
            <li key={k} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="msg-step-n num" aria-hidden="true">
                [{i + 1}]
              </span>
              <span>{S.steps[k]}</span>
              {state === 'done' && <Icon name="check" size="sm" label={S.stepDone} />}
              {state === 'now' && <span className="msg-step-dot" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
      <p className="sr-only" role="status">
        {S.progress[announce]}
      </p>
    </>
  )
}

function MessageCard({ m, tone }) {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const { me } = useMe()
  const results = Array.isArray(m.results) ? m.results : []
  const errorText = m.error === 'limit' ? S.errors.limit(me?.limits?.dailyMessages ?? 300) : S.errors[m.error] || S.errors.other
  const busy = IN_PROGRESS.has(m.status)
  const kind = kindOf(m)
  const showRoman = Boolean(m.transcriptRoman) && !(m.text && sameText(m.text, m.transcriptRoman))
  // An English message can come back with its 'Urdu' transcript in Latin letters: show it left to right, and not
  // at all when it only repeats what was typed.
  const urduTranscript = /[؀-ۿ]/.test(m.transcript || '')
  const showTranscript = Boolean(m.transcript) && (urduTranscript || !(m.text && sameText(m.text.replace(/[?!.]+$/, ''), m.transcript.replace(/[?!.]+$/, ''))))
  const languageName = m.language ? S.language[m.language] || m.language : null
  const headId = `msg-${m.id}-h`
  const status = busy
    ? 'working'
    : m.status === 'error'
      ? 'failed'
      : needsAttention(m)
        ? 'look'
        : results.some(r => r.status === 'ok' && ENTRY_TYPES.has(r.type))
          ? 'written'
          : 'answered'

  const wrote = (
    <div className="msg-wrote">
      {busy && <Progress m={m} S={S} />}
      {m.status === 'error' && (
        <p className="msg-line">
          <LineMark tone="warn" />
          <span>{errorText}</span>
        </p>
      )}
      {results.length > 0 && (
        <ul className="msg-lines">
          {results.map((r, i) => (
            <li key={i} className="msg-line">
              <LineMark tone={resultTone(r)} />
              <span>{describe(r, S, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      {!busy && m.status !== 'error' && results.length === 0 && <p className="msg-line is-quiet">{S.nothingWritten}</p>}
    </div>
  )

  const cells = [{ key: 'wrote', label: S.wrote, value: wrote }]
  if (m.replyAudioUrl || m.replyText) {
    cells.push({
      key: 'reply',
      label: S.reply,
      value: (
        <div className="msg-reply">
          {m.replyAudioUrl && <VoiceNote src={m.replyAudioUrl} seconds={m.replySeconds} reply />}
          {m.replyText && (
            <details className="msg-reply-text" open={!m.replyAudioUrl}>
              <summary>
                <Icon name="chevron-down" size="sm" />
                {S.replyText}
              </summary>
              <div className="wa-text" dir="auto" dangerouslySetInnerHTML={{ __html: whatsappHtml(m.replyText) }} />
            </details>
          )}
        </div>
      ),
    })
  }

  return (
    <article className={cx('quote-card msg', `tone-${tone}`)} id={`msg-${m.id}`} aria-labelledby={headId}>
      <header className="msg-head">
        <h3 className="label msg-kicker" id={headId}>
          {S.kind[kind]}
          <span aria-hidden="true"> · </span>
          {m.channel === 'web' ? S.channel.web : S.channel.whatsapp}
          <span aria-hidden="true"> · </span>
          <time className="num" dir="ltr" dateTime={m.createdAt ? new Date(m.createdAt).toISOString() : undefined} title={when(m.createdAt, lang)}>
            {clock(m.createdAt, lang)}
          </time>
        </h3>
        <p className={cx('label msg-status', (status === 'look' || status === 'failed') && 'is-warn')}>
          {status === 'working' ? (
            <span className="msg-step-dot" aria-hidden="true" />
          ) : (
            <Icon name={status === 'look' || status === 'failed' ? 'alert' : 'check'} size="sm" />
          )}
          {S.status[status]}
        </p>
      </header>

      <div className="msg-said">
        <span className="label">{kind === 'voice' ? S.youSaid : S.youSent}</span>
        {kind === 'voice' && (m.audioUrl ? <VoiceNote src={m.audioUrl} seconds={m.seconds} /> : <p className="meta">{S.noAudio}</p>)}
        {kind === 'photo' && m.imageUrl && (
          <a className="msg-photo" href={m.imageUrl} target="_blank" rel="noopener" aria-label={S.openPhoto}>
            <img src={m.imageUrl} alt={S.photoAlt} loading="lazy" />
          </a>
        )}
        {m.text && (
          <p className="msg-typed" dir="auto">
            {m.text}
          </p>
        )}
        {(showTranscript || showRoman) && (
          <figure className="msg-heard">
            <blockquote className="msg-quote">
              {showTranscript &&
                (urduTranscript ? (
                  <p className="ur msg-urdu" lang="ur">
                    {m.transcript}
                  </p>
                ) : (
                  <p className="msg-roman" dir="auto">
                    {m.transcript}
                  </p>
                ))}
              {showRoman && (
                <p className="msg-roman" dir="ltr">
                  {m.transcriptRoman}
                </p>
              )}
            </blockquote>
            <figcaption className="meta">{S.heardAs(kind, languageName)}</figcaption>
          </figure>
        )}
      </div>

      <LabeledCells className="msg-cells" framed={false} min={300} cells={cells} />
    </article>
  )
}

function DayGroup({ id, head, group, newestId, targetId }) {
  const S = useStrings(STRINGS)
  return (
    <section className="msg-day" id={id} aria-labelledby={`${id}-h`}>
      <header className="msg-day-head">
        <h2 className="msg-day-title" id={`${id}-h`}>
          {head.title}
          {head.sub && <span className="msg-day-date">{head.sub}</span>}
        </h2>
        <p className="meta">{S.dayMeta(group.items.length, flaggedIn(group.items))}</p>
      </header>
      <ol className="msg-list">
        {group.items.map(m => (
          <li key={m.id}>
            <MessageCard m={m} tone={needsAttention(m) ? 'warn' : m.id === newestId || m.id === targetId ? 'sage' : 'plain'} />
          </li>
        ))}
      </ol>
    </section>
  )
}

/** "Send a note from here": a typed note goes to the same pipeline as a WhatsApp text; the mic records a voice note. */
function Composer({ onStart }) {
  const S = useStrings(STRINGS)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()
  const errorId = useId()

  async function submit(e) {
    e.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError('')
    onStart()
    try {
      await api('/api/messages/text', { method: 'POST', body: { text: value } })
      setText('')
    } catch {
      setError(S.sendFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="frame msg-compose" aria-labelledby={titleId}>
      <div className="frame-head">
        <h2 className="frame-title" id={titleId}>
          {S.composeTitle}
        </h2>
        <span className="frame-meta">{S.composeMeta}</span>
      </div>
      <div className="frame-body">
        <form className="msg-compose-form" onSubmit={submit}>
          <input
            className="input pill"
            value={text}
            onChange={e => setText(e.target.value)}
            aria-label={S.composeLabel}
            placeholder={S.composeExample}
            maxLength={500}
            dir="auto"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <Button type="submit" variant="primary" size="lg" icon="send" loading={busy} disabled={!text.trim()}>
            {S.send}
          </Button>
        </form>
        <MicRecorder label={S.speak} variant="secondary" size="lg" onActiveChange={active => active && onStart()} />
        {error && (
          <p className="field-error msg-compose-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

function FirstMessage({ me }) {
  const S = useStrings(STRINGS)
  const waStatus = me?.whatsapp?.status
  // While WhatsApp is reconnecting by itself there is nothing to scan, so only offer the QR when it is really off.
  const needsLink = waStatus !== 'connected' && waStatus !== 'reconnecting'
  return (
    <section className="msg-first" aria-labelledby="msg-first-title">
      <h2 id="msg-first-title">{S.firstTitle}</h2>
      <ol className="msg-first-steps">
        <li>
          <span className="msg-first-n num" aria-hidden="true">
            [1]
          </span>
          <div>
            <h3>{S.step1t}</h3>
            <p>{S.step1(me?.phoneLocal)}</p>
          </div>
        </li>
        <li>
          <span className="msg-first-n num" aria-hidden="true">
            [2]
          </span>
          <div>
            <h3>{S.step2t}</h3>
            <QuoteCard label={S.forExample} cells={[{ label: S.meaning, value: S.sayMeaning }]}>
              <span className="ur msg-say-ur" lang="ur">
                {S.sayUr}
              </span>
              <span className="msg-say-roman" dir="ltr">
                {S.sayRoman}
              </span>
            </QuoteCard>
          </div>
        </li>
        <li>
          <span className="msg-first-n num" aria-hidden="true">
            [3]
          </span>
          <div>
            <h3>{S.step3t}</h3>
            <p>{S.step3}</p>
          </div>
        </li>
      </ol>
      <div className="msg-first-start">
        <h3>{S.getStarted}</h3>
        <div className="cluster">
          {needsLink && (
            <Button variant="primary" icon="qr" to="/connect?reconnect=1">
              {S.connectFirst}
            </Button>
          )}
          <Button variant={needsLink ? 'secondary' : 'primary'} icon="help" to="/app/help">
            {S.moreExamples}
          </Button>
        </div>
      </div>
    </section>
  )
}

function FeedSkeleton() {
  const C = useCommon()
  return (
    <div className="msg-feed" aria-busy="true">
      <span className="sr-only">{C.loading}</span>
      <div className="msg-day-head">
        <Skeleton width={220} height={30} />
      </div>
      <div className="msg-list">
        {[0, 1].map(i => (
          <div key={i} className="quote-card tone-plain msg">
            <div className="msg-head">
              <Skeleton width="38%" height={12} />
            </div>
            <div className="msg-said">
              <Skeleton width={72} height={10} />
              <Skeleton width={220} height={44} />
              <Skeleton width="62%" height={22} />
            </div>
            <div className="msg-skel-cells">
              <Skeleton width="70%" height={16} />
              <Skeleton width="45%" height={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Activity() {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const { me } = useMe()
  const toast = useToast()
  const { hash } = useLocation()
  const [params, setParams] = useSearchParams()
  const show = params.get('show')
  const filter = FILTERS.includes(show) ? show : 'all'
  const targetId = hash.startsWith('#msg-') ? decodeURIComponent(hash.slice(5)) : null

  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const seq = useRef(0)
  const itemsRef = useRef(null)
  itemsRef.current = items
  const scrolledTo = useRef(null)

  const setFilter = useCallback(value => setParams(value === 'all' ? {} : { show: value }, { replace: true }), [setParams])

  const loadFirst = useCallback(async quiet => {
    const mine = ++seq.current
    if (!quiet) {
      setError(null)
      setItems(null)
    }
    try {
      const page = await api(`/api/messages?limit=${PAGE}`)
      if (mine !== seq.current) return
      const full = page.length === PAGE
      const prev = itemsRef.current
      if (quiet && prev && full) {
        // Keep older pages the user already loaded; replace everything the fresh page covers. WhatsApp times are
        // whole seconds, so a loaded message can share the fresh page's oldest time without being on it.
        const oldest = page[page.length - 1].createdAt
        const ids = new Set(page.map(m => m.id))
        setItems([...page, ...prev.filter(m => m.createdAt <= oldest && !ids.has(m.id))])
      } else {
        setItems(page)
        setHasMore(full)
      }
    } catch (err) {
      if (mine === seq.current && (!quiet || !itemsRef.current)) setError(err)
    }
  }, [])

  useEffect(() => {
    loadFirst(false)
  }, [loadFirst])

  useRealtime(['message'], event => {
    if (event.type === 'resync') {
      loadFirst(true)
      return
    }
    const msg = event.data
    if (event.type !== 'message' || !msg?.id) return
    setItems(list => {
      if (!list) return list
      const i = list.findIndex(x => x.id === msg.id)
      if (i >= 0) {
        const next = list.slice()
        next[i] = msg
        return next
      }
      return [msg, ...list].sort((a, b) => b.createdAt - a.createdAt)
    })
  })

  // A link to /app/activity#msg-<id> lands on that message (it is shown in sage).
  useEffect(() => {
    if (!targetId || !items || scrolledTo.current === targetId) return
    const el = document.getElementById(`msg-${targetId}`)
    if (!el) return
    scrolledTo.current = targetId
    el.scrollIntoView({ block: 'start' })
  }, [targetId, items])

  async function loadOlder() {
    const oldest = items?.[items.length - 1]?.createdAt
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      // The server returns created_at < before. Messages sent in the same second share a time, so ask from just
      // after the oldest one and drop the ones already shown.
      const page = await api(`/api/messages?limit=${PAGE}&before=${oldest + 1}`)
      setItems(list => {
        const ids = new Set(list.map(m => m.id))
        return [...list, ...page.filter(m => !ids.has(m.id))]
      })
      setHasMore(page.length === PAGE)
    } catch {
      toast.error(S.olderFailed)
    } finally {
      setLoadingOlder(false)
    }
  }

  const counts = useMemo(() => {
    const c = { all: 0, attention: 0, working: 0, voice: 0, text: 0, photo: 0 }
    for (const m of items || []) {
      c.all++
      c[kindOf(m)]++
      if (needsAttention(m)) c.attention++
      if (IN_PROGRESS.has(m.status)) c.working++
    }
    return c
  }, [items])

  const groups = useMemo(() => (items ? groupByDay(items.filter(m => matchesFilter(m, filter))) : []), [items, filter])

  const tabs = useMemo(() => {
    const list = [
      { value: 'all', label: S.tabs.all, count: counts.all },
      { value: 'attention', label: S.tabs.attention, count: counts.attention || null },
    ]
    // Kind tabs only help when there is more than one kind to tell apart (or one is already chosen).
    const present = KINDS.filter(k => counts[k] > 0)
    for (const k of KINDS) {
      if ((present.length > 1 && counts[k] > 0) || k === filter) list.push({ value: k, label: S.tabs[k], count: counts[k] || null })
    }
    return list
  }, [S, counts, filter])

  const days = useMemo(() => groups.map(g => ({ id: `day-${g.key}`, head: dayTitle(g.ts, lang), group: g })), [groups, lang])

  const toc = useMemo(() => {
    if (days.length < 2) return undefined
    const cap = days.length > TOC_DAYS + 1 ? TOC_DAYS : days.length
    const list = days.slice(0, cap).map(d => ({
      label: d.head.title,
      href: `#${d.id}`,
      meta: S.dayMeta(d.group.items.length, flaggedIn(d.group.items)),
    }))
    if (days.length > cap) {
      const rest = days.slice(cap).flatMap(d => d.group.items)
      list.push({ label: S.earlier, href: `#${days[cap].id}`, meta: S.dayMeta(rest.length, flaggedIn(rest)) })
    }
    return list
  }, [days, S])

  const hasItems = Boolean(items && items.length > 0)
  const newestId = items?.[0]?.id
  // "That was your first message" only when the very first message is the last card in the current view.
  const firstShown = hasItems && matchesFilter(items[items.length - 1], filter)
  const startNote = () => {
    if (filter !== 'all') setFilter('all')
  }

  let lead = S.leadPlain
  if (items && items.length === 0) lead = S.firstBody(me?.shopName)
  else if (hasItems)
    lead = S.lead({
      n: items.length,
      more: hasMore,
      flagged: counts.attention,
      working: counts.working,
      replyRef: <FootnoteRef n={1} />,
      lookRef: <FootnoteRef n={2} />,
    })

  let feed
  if (error && !items) feed = <LoadError onRetry={() => loadFirst(false)} />
  else if (!items) feed = <FeedSkeleton />
  else if (items.length === 0) feed = <FirstMessage me={me} />
  else
    feed = (
      <div className="msg-feed tabs-block">
        <Tabs id="msg-filter" controls="msg-filter-panel" label={S.tabsLabel} value={filter} onChange={setFilter} tabs={tabs} />
        <TabPanel tabsId="msg-filter" value={filter} className="msg-panel">
          {groups.length === 0 ? (
            <div className="frame msg-empty">
              {filter === 'attention' ? (
                <EmptyState icon="check" title={S.allClear} action={<Button onClick={() => setFilter('all')}>{S.showAll}</Button>}>
                  {S.allClearBody(items.length)}
                </EmptyState>
              ) : (
                <EmptyState icon="message" title={S.noneKind[filter]} action={<Button onClick={() => setFilter('all')}>{S.showAll}</Button>}>
                  {S.noneKindBody(items.length)}
                </EmptyState>
              )}
            </div>
          ) : (
            days.map(d => <DayGroup key={d.id} id={d.id} head={d.head} group={d.group} newestId={newestId} targetId={targetId} />)
          )}
        </TabPanel>
      </div>
    )

  return (
    <div className="msg-page">
      <PageHeader eyebrow={me?.shopName} title={S.title} lead={lead} toc={hasItems ? toc : undefined} />
      <Composer onStart={startNote} />
      {feed}
      {hasItems && (hasMore || firstShown) && (
        <div className="msg-more">
          {hasMore ? (
            <Button icon="chevron-down" loading={loadingOlder} onClick={loadOlder}>
              {S.loadOlder}
            </Button>
          ) : (
            <p className="caption">{S.theEnd}</p>
          )}
        </div>
      )}
      {hasItems && <Footnotes items={[S.fnReply, S.fnLook]} />}
      {hasItems && days.length > 1 && <SectionRail sections={days.map(d => ({ id: d.id, label: d.head.title }))} label={S.contents} />}
    </div>
  )
}
