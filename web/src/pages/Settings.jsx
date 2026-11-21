import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import VoiceNote from '../components/VoiceNote.jsx'
import { Frame, LabeledCells, QuoteCard, Toc } from '../components/editorial.jsx'
import Sheet, { ConfirmSheet } from '../components/Sheet.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Field, IconButton, Money, PageHeader, Skeleton } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { when } from '../lib/format.js'
import { useCommon, useLang, useStrings } from '../lib/i18n.jsx'
import { useMe } from '../lib/me.jsx'
import { useResource } from '../lib/useResource.js'
import { useHashScroll } from '../lib/useHashScroll.js'
import { listHref } from '../lib/lists.jsx'
// Pure modules shared with the server, so the form checks and the preview are exactly what the server saves and sends.
import { LABEL_MAX, MAX_PAY_METHODS, NAME_MAX, PAY_KINDS, checkPayDetails, cleanAccountName, formatIban, formatMobile, payLine } from '../../../server/paydetails.js'
import { reminderMessage } from '../../../server/replies.js'
import './Settings.css'

const BUSINESS_TYPES = ['kiryana', 'pharmacy', 'wholesale', 'clothing', 'hardware', 'mobile', 'other']
const MAX_LISTS = 20
const CHECK_IDS = ['ai', 'voice', 'whatsapp', 'database']

const people = n => `${n} ${n === 1 ? 'person' : 'people'}`
const enSecs = ms => `${(ms / 1000).toFixed(1)} s`
const urSecs = ms => `${(ms / 1000).toFixed(1)} سیکنڈ`

// The example number inside Urdu copy: a Latin island, so it keeps its digits' font and reads left to right.
const URDU_EXAMPLE_NUMBER = (
  <bdi className="num" dir="ltr">
    0300 1234567
  </bdi>
)

const STRINGS = {
  en: {
    title: 'Settings',
    lead: 'Your shop, your WhatsApp link, your lists and your data — and the tools to check everything works before you show it to anyone.',
    onThisPage: 'On this page',
    nav: {
      shop: 'Shop',
      whatsapp: 'WhatsApp',
      lists: 'Lists',
      voice: 'Voice replies',
      language: 'Language',
      check: 'System check',
      sample: 'Sample data',
      data: 'Your data',
    },
    tocData: 'CSV',
    tocLists: n => (
      <>
        <span className="num">{n}</span> {n === 1 ? 'list' : 'lists'}
      </>
    ),
    tocCheck: { none: 'Not run yet', ok: 'All working', bad: n => (n === 1 ? '1 problem' : `${n} problems`), running: 'Checking…' },
    tocSample: { on: 'Added', off: 'None' },

    // ---- lists
    listsIntro:
      'Keep people apart the way your register does: mohalla customers, factory workers who pay on salary day, teachers, relatives — and a suppliers list for the people your shop owes. Everyone who is not in a list is in General.',
    listsFrame: 'Your lists',
    listsCount: n => (
      <>
        <span className="num">{n}</span> of <span className="num">{MAX_LISTS}</span>
      </>
    ),
    general: 'General',
    generalSub: 'Everyone not in a list',
    kind: { customers: 'Customers', suppliers: 'Suppliers' },
    kindHint: { customers: 'People who owe you', suppliers: 'People your shop owes' },
    sampleBadge: 'Sample',
    listPeople: n => (
      <>
        <span className="num">{n}</span> {n === 1 ? 'person' : 'people'}
      </>
    ),
    listOwing: (n, total) => (
      <>
        <span className="num">{n}</span> owe{n === 1 ? 's' : ''} {total}
      </>
    ),
    listYouOwe: (n, total) => (
      <>
        you owe {total} to <span className="num">{n}</span> {n === 1 ? 'supplier' : 'suppliers'}
      </>
    ),
    listNobodyOwes: 'nothing owed',
    listNothingToPay: 'nothing to pay',
    listEmpty: 'empty',
    listsLoading: 'Loading your lists…',
    listsFailed: 'Could not load your lists.',
    listsVoiceTip: (
      <>
        You can also say it on WhatsApp: <q className="latin">Factory workers ki list banao</q>, <q className="latin">Umar ko Mohalla list mein daal do</q>,{' '}
        <q className="latin">meri saari lists dikhao</q>. More in <Link to="/app/help#help-lists">Help</Link>.
      </>
    ),
    newList: 'New list',
    full: `You have ${MAX_LISTS} lists, the most a shop can have. Delete one to make another.`,
    rename: name => `Rename ${name}`,
    remove: name => `Delete ${name}`,
    createTitle: 'New list',
    createDesc: 'Give it the name you say out loud. People join it when you add them from Customers or say it on WhatsApp.',
    renameTitle: 'Rename list',
    renameDesc: kind => `This is a ${kind === 'suppliers' ? 'suppliers' : 'customers'} list. A list's kind can't change.`,
    listName: 'Name',
    listNameHint: 'For example Factory wale, Mohalla, Teachers.',
    listNameUrdu: 'Name in Urdu (optional)',
    listNameUrduHint: 'Hisaab says this name in its spoken replies. Leave it empty for common words — Hisaab knows most of them.',
    listKind: 'What kind of list?',
    create: 'Create list',
    saveName: 'Save name',
    created: name => `List ${name} created`,
    renamed: name => `Renamed to ${name}`,
    listDeleted: n => (n ? `List deleted — ${people(n)} moved to General` : 'List deleted'),
    listDeleteTitle: name => `Delete ${name}?`,
    deleteBody: (kind, n) =>
      n
        ? `Its ${people(n)} move to General. Their khatas and entries stay exactly as they are.`
        : kind === 'suppliers'
          ? 'The list is empty, so nothing else changes.'
          : 'Nobody is in it, so nothing else changes.',
    deleteConfirm: 'Delete list',
    notEmptyTitle: name => `${name} still has people`,
    notEmptyBody: n =>
      `This suppliers list still has ${people(n)}. A suppliers list can only be deleted once it is empty, so that what you owe never turns into udhaar. Open the list, move them to another suppliers list or delete them — then delete the list.`,
    openList: name => `Open ${name}`,
    listErrors: {
      bad_name: 'Write a name with letters in it.',
      exists: name => (name ? `You already have a list called ${name}.` : 'That name means General — everyone not in a list is already there.'),
      too_many: `You already have ${MAX_LISTS} lists, the most a shop can have.`,
      bad_kind: 'Choose customers or suppliers.',
      gone: 'This list was already deleted.',
      other: 'Could not save. Check your internet and try again.',
    },

    // ---- system check
    checkIntro:
      'One tap tests everything a demo needs: Google understanding a mixed Urdu and English message and an Urdu voice note, the live call, the spoken reply, your WhatsApp link and the database. Nothing is written to your khata. Hisaab runs on Google’s free Gemini tier: one check normally uses three Gemini Live sessions (a few more when Google refuses a model) and none of the free tier’s daily-capped requests.',
    checkLabel: 'Status',
    checkNone: 'Not checked yet',
    checkNoneText: 'Run it before you show Hisaab to anyone. It takes up to 30 seconds.',
    checkRunning: 'Checking…',
    checkRunningText: 'Talking to Google and WhatsApp. This takes up to 30 seconds.',
    checkOk: 'Everything is working',
    checkBad: n => (n === 1 ? '1 of 4 checks needs attention' : `${n} of 4 checks need attention`),
    checkAt: (t, ms) => (
      <>
        Checked {t} · took <span className="num">{enSecs(ms)}</span>
      </>
    ),
    checkName: { ai: 'AI understanding', voice: 'Voice reply', whatsapp: 'WhatsApp', database: 'Database' },
    checkWhat: {
      ai: 'A mixed Urdu + English text and an Urdu voice note, understood by Google Gemini Live, and a live-call connection',
      voice: 'A short spoken Urdu reply',
      whatsapp: 'Your link to WhatsApp',
      database: 'Reading and writing your khata, and free disk space',
    },
    checkWord: { ok: 'Working', bad: 'Problem', wait: 'Checking', none: 'Not checked' },
    checkText: 'Text',
    checkVoiceNote: 'Voice note',
    checkCall: 'Live call',
    checkLive: 'Gemini Live',
    checkSkipped: 'skipped',
    checkHear: 'Hear the reply',
    checkFix: 'What to do.',
    sendTest: 'Also send me a WhatsApp test message',
    sendTestHint: 'Sends “✅ Hisaab system check” to your own chat, when WhatsApp is connected.',
    run: 'Run check',
    runAgain: 'Run check again',
    tooSoon: s => `The check just ran. You can run it again in ${s} s.`,
    checkFailed: 'The check could not run. Try again.',
    checkOffline: 'Could not reach the Hisaab server. Check this computer’s internet.',
    reconnectWa: 'Reconnect WhatsApp',
    fix: {
      ai: {
        key: 'Put a working GEMINI_API_KEY in the server’s .env file and restart the server.',
        busy: 'Google is overloaded right now. Hisaab keeps retrying each message for up to 90 seconds and sends a short “likh raha hoon” note while it waits, so nothing is lost — but replies will be slow. Run the check again in a minute.',
        quota: c =>
          c?.freeTier?.resetPkt
            ? `This is a free Gemini tier limit, not a fault. A per-minute limit frees up within a minute, and Hisaab moves each message to its next Gemini model by itself, with a short “likh raha hoon” note if it takes long. Daily caps reset at ${c.freeTier.resetPkt} Pakistan time. Wait a minute, run the check again, and keep heavy testing away from demo day.`
            : 'This is a free Gemini tier limit, not a fault. A per-minute limit frees up within a minute, and Hisaab moves each message to its next Gemini model by itself. Daily caps reset at midnight US Pacific time. Wait a minute, run the check again, and keep heavy testing away from demo day.',
        call_quota: 'Every live-call model is at the free Gemini tier’s per-minute limit. It frees up within a minute: run the check again then. WhatsApp voice notes and typed entries do not need the call.',
        call_busy: 'Google’s live voice service is busy. Try again in a minute. WhatsApp voice notes and typed entries do not need the call.',
        call_failed: 'The live call could not connect. Run the check again; until it passes, show WhatsApp voice notes instead of the call.',
        slow: 'Check the internet, or switch to a phone hotspot. If the internet is fine, Google is slow right now and replies will be late.',
        network: 'This computer cannot reach Google. Check the Wi-Fi or switch to a phone hotspot, then run the check again.',
        wrong: 'Run the check again. If it keeps misreading, type entries until it passes.',
        voice: 'Until it passes, type entries in WhatsApp or on the dashboard instead of sending voice notes.',
        other: 'Run the check again. If it fails twice, restart the server.',
      },
      voice: {
        no_provider: 'No voice service is set up (TTS_ORDER in .env). Replies still arrive as text.',
        other: 'Replies go as text only until voice works again. Check the internet — voice comes back by itself.',
      },
      whatsapp: {
        not_connected: 'Link WhatsApp again by scanning the QR code.',
        reconnecting: 'WhatsApp is reconnecting by itself. Wait a minute and run the check again. If it stays like this, scan the QR again.',
        send_failed: 'WhatsApp is linked, but the test message did not go out. Make sure the phone has internet, then run the check again.',
        other: 'Reconnect WhatsApp from the section above.',
      },
      database: {
        low_disk: 'Free some disk space on the server computer — voice notes are saved there.',
        other: 'Restart the server. If it still fails, do not demo until it passes.',
      },
    },

    // ---- sample data
    sampleIntro: 'Fill your dashboard with a sample shop to try things out — every sample row is marked and can be removed in one tap.',
    sampleOffLabel: 'Not added',
    sampleOnLabel: 'In your khata',
    sampleOffTitle: 'Try Hisaab with a sample shop',
    sampleOnTitle: 'A sample shop is in your khata',
    sampleOffBody:
      'A made-up Peshawar kiryana: about 12 customers in General and two lists, 2 suppliers in a Suppliers list, and six weeks of entries. Your own customers and entries are never touched.',
    sampleOnBody: (p, l, e) =>
      `${people(p)}${e != null ? `, ${l === 1 ? '1 list' : `${l} lists`} and ${e} entries` : ` and ${l === 1 ? '1 list' : `${l} lists`}`} are sample data. Your own customers and entries are separate.`,
    sampleNotReady: 'The server needs an update before sample data can be added.',
    sampleAdd: 'Add sample shop',
    sampleRemove: 'Remove sample data',
    sampleAddTitle: 'Add the sample shop?',
    sampleAddBody:
      'Adds about 12 sample customers across General and two lists, 2 suppliers and six weeks of entries. They are marked as sample in the data, so you can remove all of them from here in one tap.',
    sampleAddConfirm: 'Add sample shop',
    sampleRemoveTitle: 'Remove the sample shop?',
    sampleRemoveBody: n =>
      `Removes the ${people(n)} of the sample shop with all their entries, and the sample lists. Anything you wrote for a sample person — during a demo, say — goes with them. Your own customers and entries stay. A sample list you put your own people in stays, as an ordinary list.`,
    sampleRemoveConfirm: 'Remove sample data',
    sampleAdded: n => `Sample shop added: ${people(n)}`,
    sampleRemoved: n => `Sample data removed: ${people(n)}`,
    sampleExists: 'The sample shop is already in your khata.',
    sampleFailed: 'Could not change the sample data. Try again.',

    profileHint: 'Your shop name appears on the payment reminders your customers receive. On a call, Hisaab greets you by your name.',
    shopName: 'Shop name',
    shopNameHint: 'The name your customers know.',
    shopNameRequired: 'Enter your shop name',
    ownerName: 'Your name',
    city: 'City or area',
    type: 'Type of shop',
    choose: 'Choose…',
    types: {
      kiryana: 'Kiryana / general store',
      pharmacy: 'Pharmacy / medical store',
      wholesale: 'Wholesale',
      clothing: 'Clothing / cloth shop',
      hardware: 'Hardware',
      mobile: 'Mobile shop',
      other: 'Other',
    },
    save: 'Save changes',
    discard: 'Discard',
    unsaved: 'You have unsaved changes',
    saved: 'Shop profile saved',
    saveFailed: 'Could not save. Check your internet and try again.',

    // ---- payment details on reminders
    pay: {
      nav: 'Payment details',
      title: 'Payment details on reminders',
      intro:
        'Put your own JazzCash, Easypaisa, Raast or bank details at the end of every payment reminder, so a customer can pay the moment they read it.',
      tocNone: 'Not added',
      tocKinds: { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', raast: 'Raast', bank: 'Bank', other_wallet: 'Wallet' },
      name: 'Account holder name',
      nameHint: 'As it shows on the account, so the customer knows the money is going to the right person.',
      way: n => `Way to pay ${n}`,
      kind: 'Pay by',
      kinds: { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', raast: 'Raast ID', bank: 'Bank account (IBAN)', other_wallet: 'Another wallet' },
      value: { jazzcash: 'JazzCash number', easypaisa: 'Easypaisa number', raast: 'Raast ID', bank: 'IBAN', other_wallet: 'Wallet number' },
      valueHint: {
        jazzcash: 'Like 0300 1234567',
        easypaisa: 'Like 0300 1234567',
        raast: 'The mobile number or IBAN your Raast ID is linked to',
        bank: '24 letters and digits starting with PK, from your cheque book or bank app',
        other_wallet: 'Like 0300 1234567',
      },
      bankName: 'Bank name (optional)',
      walletName: 'Wallet name',
      walletNameHint: 'The name your customers know it by',
      add: 'Add another way to pay',
      removeWay: n => `Remove way to pay ${n}`,
      preview: 'What your customer reads',
      previewTo: 'To',
      previewOwes: 'Balance',
      previewEmpty: 'Write a number above and the line your customers will read shows here.',
      note: 'Hisaab only prints these details on the reminders you send. It never moves money, never connects to your wallet or bank, takes no fee, and never sends these numbers to Google.',
      save: 'Save payment details',
      remove: 'Remove payment details',
      removeTitle: 'Remove payment details?',
      removeBody: 'Reminders will go out without them, as before. You can add them again any time.',
      removeConfirm: 'Remove',
      saved: 'Payment details saved. Every reminder now ends with them.',
      removed: 'Payment details removed',
      errors: {
        bad_account_name: 'Write the name in letters, up to 40, as it shows on the account. Leave out digits, brackets and commas.',
        no_methods: 'Write at least one number or IBAN.',
        too_many_methods: 'You can add up to 3 ways to pay.',
        bad_method_kind: 'Choose how they can pay.',
        bad_mobile: 'Write a mobile number like 0300 1234567.',
        bad_raast: 'Write the mobile number (like 0300 1234567) or the IBAN your Raast ID is linked to.',
        bad_iban: 'An IBAN is PK, 2 digits, 4 letters for the bank, then 16 digits: 24 in all.',
        bad_iban_checksum: 'This IBAN has a typing mistake. Check it against your cheque book or bank app.',
        bad_label: 'Write the name in letters, up to 30.',
        duplicate_method: 'This one is already above.',
        other: 'Could not save. Check your internet and try again.',
      },
    },

    waHint: 'Hisaab reads only your “Message yourself” chat — the chat with your own number. Chats with customers, family and groups are never read.',
    statusLabel: 'Status',
    status: { connected: 'Connected', reconnecting: 'Reconnecting…', off: 'Not connected' },
    statusText: {
      connected: 'Voice notes and texts you send yourself are being written into your khata.',
      reconnecting: 'WhatsApp dropped for a moment and Hisaab is reconnecting by itself. If this stays for more than a few minutes, scan the QR again.',
      off: 'Messages you send yourself are not being recorded right now. Scan the QR again to reconnect.',
    },
    linkedNumber: 'Linked number',
    waName: 'Name on WhatsApp',
    reconnect: 'Reconnect / scan QR again',
    disconnect: 'Disconnect WhatsApp',
    waTip: (
      <>
        To open this dashboard on another phone or computer, type the word <b className="latin">dashboard</b> and send it to yourself on WhatsApp.
      </>
    ),
    disconnectTitle: 'Disconnect WhatsApp?',
    disconnectBody:
      'Hisaab will stop reading your “Message yourself” chat and will be removed from WhatsApp’s Linked devices. Your customers, entries and voice notes stay saved here, and you can scan the QR again any time.',
    disconnectConfirm: 'Disconnect',
    disconnected: 'WhatsApp disconnected',
    disconnectFailed: 'Could not disconnect. Try again.',

    voiceIntro: 'Hisaab answers every message with a short text. With voice replies on, it also sends a spoken Urdu voice note with the new balance — handy when your hands are full.',
    voiceTitle: 'Voice note replies',
    voiceStateOn: 'On — a text and an Urdu voice note.',
    voiceStateOff: 'Off — text only.',
    on: 'On',
    off: 'Off',
    voiceOn: 'Voice note replies are on',
    voiceOff: 'Voice note replies are off — Hisaab will reply with text only',

    langNote: 'This changes the dashboard only. Hisaab’s WhatsApp replies are always in Urdu.',
    dashLang: 'Dashboard language',
    langEn: 'English',
    langEnHint: 'Dashboard in English',
    langUr: 'اردو',
    langUrHint: 'ڈیش بورڈ اردو میں',

    dataHint: 'Your khata belongs to you. Download a copy any time, or delete everything for good.',
    exportLabel: 'Export',
    exportTitle: 'Your whole khata in one file',
    download: 'Download khata (Excel/CSV)',
    downloadNote: 'One file with every entry: date, customer, udhaar or payment, amount and items. It opens in Excel or Google Sheets.',

    dangerLabel: 'Cannot be undone',
    dangerTitle: 'Delete account',
    yourShop: 'your shop',
    // FSI…PDI (U+2068…U+2069): the shop name may be in either script, so its punctuation stays on its own side.
    dangerBody: shop => `Permanently deletes ⁨${shop}⁩: every customer, entry and voice note, and unlinks WhatsApp. This cannot be undone.`,
    dangerTip: 'If you might need your records later, download your khata first.',
    deleteBtn: 'Delete account',
    deleteTitle: 'Delete your account for good?',
    typeToConfirm: word => <>Type {word} to confirm</>,
    deleteMismatch: 'That does not match. Type it exactly as shown.',
    deleteForever: 'Delete everything',
    deleteFailed: 'Could not delete the account. Try again.',
    deleted: 'Your account and khata have been deleted',

    sessionTitle: 'This device',
    sessionBody: phone => (
      <>
        Signed in as <bdi className="num">{phone}</bdi>.
      </>
    ),
    sessionHint: 'Signing out keeps your khata safe. Sign back in with your number, or type “dashboard” and send it to yourself on WhatsApp.',
    signOut: 'Sign out',
  },
  ur: {
    title: 'سیٹنگز',
    lead: 'آپ کی دکان، آپ کا واٹس ایپ رابطہ، آپ کی لسٹیں اور آپ کا ڈیٹا — اور کسی کو دکھانے سے پہلے یہ جانچنے کا طریقہ کہ سب کچھ ٹھیک چل رہا ہے۔',
    onThisPage: 'اس صفحے پر',
    nav: {
      shop: 'دکان',
      whatsapp: 'واٹس ایپ',
      lists: 'لسٹیں',
      voice: 'وائس نوٹ جواب',
      language: 'زبان',
      check: 'سسٹم چیک',
      sample: 'نمونے کا ڈیٹا',
      data: 'آپ کا ڈیٹا',
    },
    tocData: 'CSV',
    tocLists: n => (
      <>
        <span className="num">{n}</span> {n === 1 ? 'لسٹ' : 'لسٹیں'}
      </>
    ),
    tocCheck: { none: 'ابھی نہیں چلا', ok: 'سب ٹھیک', bad: n => `${n} مسئلے`, running: 'جانچ جاری…' },
    tocSample: { on: 'موجود', off: 'نہیں' },

    // ---- lists
    listsIntro:
      'لوگوں کو ویسے ہی الگ رکھیں جیسے رجسٹر میں رکھتے ہیں: محلے کے گاہک، تنخواہ والے دن پیسے دینے والے فیکٹری کے لوگ، ٹیچرز، رشتہ دار — اور سپلائرز کی لسٹ ان کے لیے جن کے پیسے آپ کی دکان نے دینے ہیں۔ جو کسی لسٹ میں نہیں، وہ عام کھاتے میں ہیں۔',
    listsFrame: 'آپ کی لسٹیں',
    listsCount: n => (
      <>
        <span className="num">{MAX_LISTS}</span> میں سے <span className="num">{n}</span>
      </>
    ),
    general: 'عام کھاتہ',
    generalSub: 'جو کسی لسٹ میں نہیں',
    kind: { customers: 'گاہک', suppliers: 'سپلائرز' },
    kindHint: { customers: 'جن کے ذمے آپ کے پیسے ہیں', suppliers: 'جن کے پیسے آپ کی دکان نے دینے ہیں' },
    sampleBadge: 'نمونہ',
    listPeople: n => (
      <>
        <span className="num">{n}</span> {n === 1 ? 'بندہ' : 'لوگ'}
      </>
    ),
    listOwing: (n, total) => (
      <>
        {n === 1 ? 'ایک شخص' : <><span className="num">{n}</span> لوگوں</>} کے ذمے {total}
      </>
    ),
    listYouOwe: (n, total) => (
      <>
        آپ نے {n === 1 ? 'ایک سپلائر' : <><span className="num">{n}</span> سپلائرز</>} کو {total} دینے ہیں
      </>
    ),
    listNobodyOwes: 'کسی کے ذمے کچھ نہیں',
    listNothingToPay: 'کچھ دینا باقی نہیں',
    listEmpty: 'خالی',
    listsLoading: 'آپ کی لسٹیں لوڈ ہو رہی ہیں…',
    listsFailed: 'آپ کی لسٹیں لوڈ نہیں ہو سکیں۔',
    listsVoiceTip: (
      <>
        یہ واٹس ایپ پر بول کر بھی ہو سکتا ہے: <bdi className="latin" dir="ltr">Factory workers ki list banao</bdi>،{' '}
        <bdi className="latin" dir="ltr">Umar ko Mohalla list mein daal do</bdi>، <bdi className="latin" dir="ltr">meri saari lists dikhao</bdi>۔ مزید{' '}
        <Link to="/app/help#help-lists">مدد</Link> میں۔
      </>
    ),
    newList: 'نئی لسٹ',
    full: `آپ کی ${MAX_LISTS} لسٹیں ہیں، ایک دکان کی زیادہ سے زیادہ۔ نئی بنانے کے لیے کوئی ایک حذف کریں۔`,
    rename: name => `⁨${name}⁩ کا نام بدلیں`,
    remove: name => `⁨${name}⁩ حذف کریں`,
    createTitle: 'نئی لسٹ',
    createDesc: 'وہی نام رکھیں جو آپ بولتے ہیں۔ لوگ اس میں تب آتے ہیں جب آپ انہیں گاہکوں کے صفحے سے ڈالیں یا واٹس ایپ پر بولیں۔',
    renameTitle: 'لسٹ کا نام بدلیں',
    renameDesc: kind => `یہ ${kind === 'suppliers' ? 'سپلائرز' : 'گاہکوں'} کی لسٹ ہے۔ لسٹ کی قسم نہیں بدلی جا سکتی۔`,
    listName: 'نام',
    listNameHint: 'مثلاً ⁦Factory wale⁩، ⁦Mohalla⁩، ⁦Teachers⁩۔',
    listNameUrdu: 'اردو میں نام (اختیاری)',
    listNameUrduHint: 'حساب بولے ہوئے جواب میں یہی نام لیتا ہے۔ عام الفاظ کے لیے خالی چھوڑ دیں — حساب زیادہ تر خود جانتا ہے۔',
    listKind: 'کس قسم کی لسٹ؟',
    create: 'لسٹ بنائیں',
    saveName: 'نام محفوظ کریں',
    created: name => `لسٹ ⁨${name}⁩ بن گئی`,
    renamed: name => `نام بدل کر ⁨${name}⁩ کر دیا`,
    listDeleted: n => (n ? `لسٹ حذف ہو گئی — ${n === 1 ? 'ایک شخص عام کھاتے میں چلا گیا' : `${n} لوگ عام کھاتے میں چلے گئے`}` : 'لسٹ حذف ہو گئی'),
    listDeleteTitle: name => `⁨${name}⁩ حذف کریں؟`,
    deleteBody: (kind, n) =>
      n === 1
        ? 'اس میں موجود ایک شخص عام کھاتے میں چلا جائے گا۔ اس کا کھاتہ اور اندراجات جیسے ہیں ویسے ہی رہیں گے۔'
        : n
          ? `اس کے ${n} لوگ عام کھاتے میں چلے جائیں گے۔ ان کے کھاتے اور اندراجات جیسے ہیں ویسے ہی رہیں گے۔`
          : 'اس میں کوئی نہیں، اس لیے اور کچھ نہیں بدلے گا۔',
    deleteConfirm: 'لسٹ حذف کریں',
    notEmptyTitle: name => `⁨${name}⁩ میں ابھی لوگ ہیں`,
    notEmptyBody: n =>
      `سپلائرز کی اس لسٹ میں ابھی ${n === 1 ? 'ایک شخص ہے' : `${n} لوگ ہیں`}۔ سپلائرز کی لسٹ صرف خالی ہونے پر حذف ہو سکتی ہے، تاکہ جو آپ نے دینا ہے وہ کبھی ادھار نہ بن جائے۔ لسٹ کھولیں، انہیں سپلائرز کی کسی اور لسٹ میں ڈالیں یا حذف کریں — پھر لسٹ حذف کریں۔`,
    openList: name => `⁨${name}⁩ کھولیں`,
    listErrors: {
      bad_name: 'ایسا نام لکھیں جس میں حروف ہوں۔',
      exists: name => (name ? `⁨${name}⁩ نام کی لسٹ پہلے سے موجود ہے۔` : 'اس نام کا مطلب عام کھاتہ ہے — جو کسی لسٹ میں نہیں وہ پہلے ہی وہاں ہیں۔'),
      too_many: `آپ کی پہلے ہی ${MAX_LISTS} لسٹیں ہیں، ایک دکان کی زیادہ سے زیادہ۔`,
      bad_kind: 'گاہک یا سپلائرز میں سے ایک چنیں۔',
      gone: 'یہ لسٹ پہلے ہی حذف ہو چکی ہے۔',
      other: 'محفوظ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    },

    // ---- system check
    checkIntro:
      'ایک بٹن سے وہ سب کچھ جانچیں جو ڈیمو کے لیے ضروری ہے: گوگل اردو اور انگریزی ملا پیغام اور اردو وائس نوٹ سمجھ رہا ہے یا نہیں، لائیو کال، بولا ہوا جواب، آپ کا واٹس ایپ رابطہ اور ڈیٹا بیس۔ آپ کے کھاتے میں کچھ نہیں لکھا جاتا۔ حساب گوگل جیمنائی کی مفت سطح (free tier) پر چلتا ہے: عام طور پر ایک جانچ میں جیمنائی لائیو کے تین سیشن لگتے ہیں (گوگل کسی ماڈل کو انکار کرے تو کچھ زیادہ)، اور روزانہ حد والی کوئی درخواست نہیں۔',
    checkLabel: 'حالت',
    checkNone: 'ابھی جانچ نہیں ہوئی',
    checkNoneText: 'حساب کسی کو دکھانے سے پہلے یہ ضرور چلائیں۔ اس میں 30 سیکنڈ تک لگتے ہیں۔',
    checkRunning: 'جانچ جاری ہے…',
    checkRunningText: 'گوگل اور واٹس ایپ سے رابطہ ہو رہا ہے۔ اس میں 30 سیکنڈ تک لگتے ہیں۔',
    checkOk: 'سب کچھ ٹھیک چل رہا ہے',
    checkBad: n => `4 میں سے ${n} پر توجہ کی ضرورت ہے`,
    checkAt: (t, ms) => (
      <>
        جانچ: {t} · وقت <span className="num">{urSecs(ms)}</span>
      </>
    ),
    checkName: { ai: 'AI کی سمجھ', voice: 'آواز والا جواب', whatsapp: 'واٹس ایپ', database: 'ڈیٹا بیس' },
    checkWhat: {
      ai: 'اردو اور انگریزی ملا تحریری پیغام اور ایک اردو وائس نوٹ، جو گوگل جیمنائی لائیو سمجھتا ہے، اور لائیو کال کا رابطہ',
      voice: 'اردو میں ایک مختصر بولا ہوا جواب',
      whatsapp: 'آپ کا واٹس ایپ رابطہ',
      database: 'کھاتہ پڑھنا اور لکھنا، اور ڈسک پر خالی جگہ',
    },
    checkWord: { ok: 'ٹھیک', bad: 'مسئلہ', wait: 'جانچ جاری', none: 'ابھی نہیں' },
    checkText: 'تحریری پیغام',
    checkVoiceNote: 'وائس نوٹ',
    checkCall: 'لائیو کال',
    checkLive: 'Gemini Live',
    checkSkipped: 'نہیں ہوا',
    checkHear: 'جواب سنیں',
    checkFix: 'کیا کریں؟',
    sendTest: 'واٹس ایپ پر مجھے ٹیسٹ پیغام بھی بھیجیں',
    sendTestHint: 'واٹس ایپ جڑا ہو تو آپ کی اپنی چیٹ میں ⁦✅ Hisaab system check⁩ بھیجتا ہے۔',
    run: 'جانچ شروع کریں',
    runAgain: 'دوبارہ جانچیں',
    tooSoon: s => `جانچ ابھی ہوئی ہے۔ ${s} سیکنڈ بعد دوبارہ چلا سکتے ہیں۔`,
    checkFailed: 'جانچ نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
    checkOffline: 'حساب کے سرور تک رسائی نہیں ہو سکی۔ اس کمپیوٹر کا انٹرنیٹ چیک کریں۔',
    reconnectWa: 'واٹس ایپ دوبارہ جوڑیں',
    fix: {
      ai: {
        key: 'سرور کی ‎.env فائل میں درست GEMINI_API_KEY لکھیں اور سرور دوبارہ چلائیں۔',
        busy: 'گوگل ابھی بہت مصروف ہے۔ حساب ہر پیغام کو 90 سیکنڈ تک دوبارہ آزماتا ہے اور انتظار میں ایک مختصر ⁦likh raha hoon⁩ پیغام بھیج دیتا ہے، اس لیے کچھ ضائع نہیں ہوتا — بس جواب دیر سے آئیں گے۔ ایک منٹ بعد دوبارہ جانچیں۔',
        quota: c =>
          `یہ مفت جیمنائی کی حد ہے، کوئی خرابی نہیں۔ فی منٹ کی حد ایک منٹ میں کھل جاتی ہے، اور حساب ہر پیغام خود اگلے جیمنائی ماڈل کو بھیج دیتا ہے؛ دیر ہو تو ⁦likh raha hoon⁩ کا مختصر پیغام بھیج دیتا ہے۔ روزانہ کی حد ${c?.freeTier?.resetPktUr ? `پاکستانی وقت کے مطابق ${c.freeTier.resetPktUr}` : 'امریکی پیسفک وقت کی آدھی رات کو'} نئی ہوتی ہے۔ ایک منٹ رک کر دوبارہ جانچیں، اور ڈیمو کے دن زیادہ ٹیسٹ نہ کریں۔`,
        call_quota: 'لائیو کال کے سب ماڈل اس وقت مفت جیمنائی کی فی منٹ حد پر ہیں۔ یہ ایک منٹ میں کھل جاتی ہے، پھر دوبارہ جانچیں۔ واٹس ایپ وائس نوٹ اور لکھے پیغام کو کال کی ضرورت نہیں۔',
        call_busy: 'گوگل کی لائیو وائس سروس مصروف ہے۔ ایک منٹ بعد دوبارہ کوشش کریں۔ واٹس ایپ وائس نوٹ اور لکھے پیغام کو کال کی ضرورت نہیں۔',
        call_failed: 'لائیو کال نہیں جڑ سکی۔ دوبارہ جانچیں؛ جب تک ٹھیک نہ ہو، ڈیمو میں کال کے بجائے واٹس ایپ وائس نوٹ دکھائیں۔',
        slow: 'انٹرنیٹ چیک کریں، یا فون کا ہاٹ اسپاٹ استعمال کریں۔ اگر انٹرنیٹ ٹھیک ہے تو گوگل ابھی سست ہے اور جواب دیر سے آئیں گے۔',
        network: 'یہ کمپیوٹر گوگل تک نہیں پہنچ پا رہا۔ وائی فائی چیک کریں یا فون کا ہاٹ اسپاٹ لگائیں، پھر دوبارہ جانچیں۔',
        wrong: 'دوبارہ جانچیں۔ اگر بار بار غلط سمجھے تو ٹھیک ہونے تک اندراج لکھ کر بھیجیں۔',
        voice: 'جب تک یہ ٹھیک نہ ہو، وائس نوٹ کے بجائے واٹس ایپ یا ڈیش بورڈ پر لکھ کر اندراج کریں۔',
        other: 'دوبارہ جانچیں۔ اگر دو بار ناکام ہو تو سرور دوبارہ چلائیں۔',
      },
      voice: {
        no_provider: 'کوئی آواز سروس سیٹ نہیں (‎.env میں TTS_ORDER)۔ جواب پھر بھی لکھ کر آتے ہیں۔',
        other: 'آواز ٹھیک ہونے تک جواب صرف لکھ کر جائیں گے۔ انٹرنیٹ چیک کریں — آواز خود واپس آ جاتی ہے۔',
      },
      whatsapp: {
        not_connected: 'QR کوڈ اسکین کر کے واٹس ایپ دوبارہ جوڑیں۔',
        reconnecting: 'واٹس ایپ خود دوبارہ جڑ رہا ہے۔ ایک منٹ رک کر دوبارہ جانچیں۔ اگر یہی حال رہے تو QR دوبارہ اسکین کریں۔',
        send_failed: 'واٹس ایپ جڑا ہے مگر ٹیسٹ پیغام نہیں گیا۔ دیکھیں کہ فون پر انٹرنیٹ چل رہا ہے، پھر دوبارہ جانچیں۔',
        other: 'اوپر والے حصے سے واٹس ایپ دوبارہ جوڑیں۔',
      },
      database: {
        low_disk: 'سرور والے کمپیوٹر پر کچھ جگہ خالی کریں — وائس نوٹ وہیں محفوظ ہوتے ہیں۔',
        other: 'سرور دوبارہ چلائیں۔ اگر پھر بھی ناکام ہو تو ٹھیک ہونے تک ڈیمو نہ کریں۔',
      },
    },

    // ---- sample data
    sampleIntro: 'آزمانے کے لیے اپنے ڈیش بورڈ کو ایک نمونے کی دکان سے بھر دیں — نمونے کی ہر لائن پر نشان ہوتا ہے اور ایک ہی بٹن سے سب ہٹایا جا سکتا ہے۔',
    sampleOffLabel: 'شامل نہیں',
    sampleOnLabel: 'آپ کے کھاتے میں',
    sampleOffTitle: 'نمونے کی دکان کے ساتھ حساب آزمائیں',
    sampleOnTitle: 'نمونے کی دکان آپ کے کھاتے میں ہے',
    sampleOffBody:
      'پشاور کی ایک فرضی کریانہ دکان: عام کھاتے اور دو لسٹوں میں تقریباً 12 گاہک، سپلائرز کی لسٹ میں 2 سپلائر، اور چھ ہفتوں کے اندراجات۔ آپ کے اپنے گاہکوں اور اندراجات کو ہاتھ نہیں لگایا جاتا۔',
    sampleOnBody: (p, l, e) =>
      `${p} لوگ، ${l === 1 ? '1 لسٹ' : `${l} لسٹیں`}${e != null ? ` اور ${e} اندراجات` : ''} نمونے کا ڈیٹا ہیں۔ آپ کے اپنے گاہک اور اندراجات الگ ہیں۔`,
    sampleNotReady: 'نمونے کا ڈیٹا شامل کرنے سے پہلے سرور اپ ڈیٹ ہونا ضروری ہے۔',
    sampleAdd: 'نمونے کی دکان شامل کریں',
    sampleRemove: 'نمونے کا ڈیٹا ہٹائیں',
    sampleAddTitle: 'نمونے کی دکان شامل کریں؟',
    sampleAddBody:
      'عام کھاتے اور دو لسٹوں میں تقریباً 12 نمونے کے گاہک، 2 سپلائر اور چھ ہفتوں کے اندراجات شامل ہوں گے۔ ڈیٹا میں ان پر نمونے کا نشان ہوتا ہے، اس لیے یہیں سے ایک بٹن میں سب ہٹا سکتے ہیں۔',
    sampleAddConfirm: 'نمونے کی دکان شامل کریں',
    sampleRemoveTitle: 'نمونے کی دکان ہٹائیں؟',
    sampleRemoveBody: n =>
      `نمونے کی دکان کے ${n} لوگ اپنے تمام اندراجات سمیت، اور نمونے کی لسٹیں ہٹ جائیں گی۔ آپ نے کسی نمونے کے بندے کے لیے جو لکھا — مثلاً ڈیمو کے دوران — وہ بھی ساتھ ہٹ جائے گا۔ آپ کے اپنے گاہک اور اندراجات رہیں گے۔ نمونے کی جس لسٹ میں آپ نے اپنے لوگ ڈالے، وہ عام لسٹ بن کر رہے گی۔`,
    sampleRemoveConfirm: 'نمونے کا ڈیٹا ہٹائیں',
    sampleAdded: n => `نمونے کی دکان شامل ہو گئی: ${n} لوگ`,
    sampleRemoved: n => `نمونے کا ڈیٹا ہٹ گیا: ${n} لوگ`,
    sampleExists: 'نمونے کی دکان پہلے سے آپ کے کھاتے میں ہے۔',
    sampleFailed: 'نمونے کا ڈیٹا نہیں بدلا جا سکا۔ دوبارہ کوشش کریں۔',

    profileHint: 'دکان کا نام ان یاد دہانیوں میں آتا ہے جو آپ کے گاہکوں کو جاتی ہیں۔ کال پر حساب آپ کو آپ کے نام سے سلام کرتا ہے۔',
    shopName: 'دکان کا نام',
    shopNameHint: 'وہ نام جس سے گاہک آپ کی دکان جانتے ہیں۔',
    shopNameRequired: 'دکان کا نام لکھیں',
    ownerName: 'آپ کا نام',
    city: 'شہر یا علاقہ',
    type: 'دکان کی قسم',
    choose: 'منتخب کریں…',
    types: {
      kiryana: 'کریانہ / جنرل اسٹور',
      pharmacy: 'میڈیکل اسٹور / فارمیسی',
      wholesale: 'ہول سیل',
      clothing: 'کپڑے کی دکان',
      hardware: 'ہارڈ ویئر',
      mobile: 'موبائل شاپ',
      other: 'کوئی اور',
    },
    save: 'تبدیلیاں محفوظ کریں',
    discard: 'رہنے دیں',
    unsaved: 'تبدیلیاں ابھی محفوظ نہیں ہوئیں',
    saved: 'دکان کی تفصیل محفوظ ہو گئی',
    saveFailed: 'محفوظ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',

    // ---- payment details on reminders
    pay: {
      nav: 'ادائیگی کی تفصیل',
      title: 'یاد دہانی پر ادائیگی کی تفصیل',
      intro: 'اپنا جاز کیش، ایزی پیسہ، راست یا بینک اکاؤنٹ ہر یاد دہانی کے آخر میں لکھوائیں، تاکہ گاہک پیغام پڑھتے ہی پیسے بھیج سکے۔',
      tocNone: 'شامل نہیں',
      tocKinds: { jazzcash: 'جاز کیش', easypaisa: 'ایزی پیسہ', raast: 'راست', bank: 'بینک', other_wallet: 'والیٹ' },
      name: 'اکاؤنٹ ٹائٹل',
      nameHint: 'وہی نام جو اکاؤنٹ پر لکھا ہے، تاکہ گاہک کو تسلی رہے کہ پیسے صحیح بندے کو جا رہے ہیں۔',
      way: n => `ادائیگی کا طریقہ ${n}`,
      kind: 'کس ذریعے سے',
      kinds: { jazzcash: 'جاز کیش', easypaisa: 'ایزی پیسہ', raast: 'راست آئی ڈی', bank: 'بینک اکاؤنٹ (IBAN)', other_wallet: 'کوئی اور والیٹ' },
      value: { jazzcash: 'جاز کیش نمبر', easypaisa: 'ایزی پیسہ نمبر', raast: 'راست آئی ڈی', bank: 'IBAN نمبر', other_wallet: 'والیٹ نمبر' },
      valueHint: {
        jazzcash: <>مثلاً {URDU_EXAMPLE_NUMBER}</>,
        easypaisa: <>مثلاً {URDU_EXAMPLE_NUMBER}</>,
        raast: 'وہ موبائل نمبر یا IBAN جس سے آپ کی راست آئی ڈی جڑی ہے',
        bank: 'PK سے شروع ہونے والے 24 حروف اور ہندسے، جو چیک بک یا بینک ایپ پر لکھے ہوتے ہیں',
        other_wallet: <>مثلاً {URDU_EXAMPLE_NUMBER}</>,
      },
      bankName: 'بینک کا نام (اختیاری)',
      walletName: 'والیٹ کا نام',
      walletNameHint: 'وہ نام جس سے گاہک اسے جانتے ہیں',
      add: 'ادائیگی کا ایک اور طریقہ شامل کریں',
      removeWay: n => `ادائیگی کا طریقہ ${n} ہٹائیں`,
      preview: 'گاہک یہ پڑھے گا',
      previewTo: 'بنام',
      previewOwes: 'بقایا',
      previewEmpty: 'اوپر نمبر لکھیں، گاہک کو جو لائن نظر آئے گی وہ یہاں دکھائی دے گی۔',
      note: 'حساب یہ تفصیل صرف ان یاد دہانیوں پر لکھتا ہے جو آپ خود بھیجتے ہیں۔ نہ پیسے بھیجتا یا لیتا ہے، نہ آپ کے والیٹ یا بینک سے جڑتا ہے، نہ کوئی فیس لیتا ہے، اور نہ یہ نمبر گوگل کو بھیجتا ہے۔',
      save: 'ادائیگی کی تفصیل محفوظ کریں',
      remove: 'ادائیگی کی تفصیل ہٹائیں',
      removeTitle: 'ادائیگی کی تفصیل ہٹائیں؟',
      removeBody: 'یاد دہانیاں پہلے کی طرح ان کے بغیر جائیں گی۔ آپ جب چاہیں دوبارہ لکھ سکتے ہیں۔',
      removeConfirm: 'ہٹائیں',
      saved: 'ادائیگی کی تفصیل محفوظ ہو گئی۔ اب ہر یاد دہانی کے آخر میں یہ لکھی ہو گی۔',
      removed: 'ادائیگی کی تفصیل ہٹا دی گئی',
      errors: {
        bad_account_name: 'نام حروف میں لکھیں، 40 تک، جیسا اکاؤنٹ پر لکھا ہے۔ ہندسے، بریکٹ اور کاما نہ لکھیں۔',
        no_methods: 'کم از کم ایک نمبر یا IBAN لکھیں۔',
        too_many_methods: 'زیادہ سے زیادہ 3 طریقے لکھے جا سکتے ہیں۔',
        bad_method_kind: 'ادائیگی کا ذریعہ چنیں۔',
        bad_mobile: <>موبائل نمبر ایسے لکھیں: {URDU_EXAMPLE_NUMBER}</>,
        bad_raast: <>وہ موبائل نمبر (جیسے {URDU_EXAMPLE_NUMBER}) یا IBAN لکھیں جس سے آپ کی راست آئی ڈی جڑی ہے۔</>,
        bad_iban: 'IBAN میں پہلے PK، پھر 2 ہندسے، بینک کے 4 حروف اور پھر 16 ہندسے ہوتے ہیں، کل 24۔',
        bad_iban_checksum: 'اس IBAN میں ٹائپ کی غلطی ہے۔ چیک بک یا بینک ایپ سے ملا کر دیکھیں۔',
        bad_label: 'نام حروف میں لکھیں، 30 تک۔',
        duplicate_method: 'یہ اوپر پہلے سے لکھا ہے۔',
        other: 'محفوظ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
      },
    },

    waHint: 'حساب صرف آپ کی ⁦Message yourself⁩ چیٹ پڑھتا ہے — یعنی آپ کے اپنے نمبر والی چیٹ۔ گاہکوں، گھر والوں اور گروپس کی چیٹس کبھی نہیں پڑھی جاتیں۔',
    statusLabel: 'حالت',
    status: { connected: 'منسلک ہے', reconnecting: 'دوبارہ جڑ رہا ہے…', off: 'منسلک نہیں' },
    statusText: {
      connected: 'خود کو بھیجے گئے وائس نوٹ اور میسج آپ کے کھاتے میں لکھے جا رہے ہیں۔',
      reconnecting: 'واٹس ایپ کا رابطہ کچھ دیر کے لیے ٹوٹا ہے اور حساب خود دوبارہ جوڑ رہا ہے۔ اگر چند منٹ بعد بھی یہی حال رہے تو دوبارہ QR اسکین کریں۔',
      off: 'ابھی خود کو بھیجے گئے پیغامات ریکارڈ نہیں ہو رہے۔ دوبارہ جوڑنے کے لیے QR اسکین کریں۔',
    },
    linkedNumber: 'منسلک نمبر',
    waName: 'واٹس ایپ پر نام',
    reconnect: 'دوبارہ جوڑیں / QR اسکین کریں',
    disconnect: 'واٹس ایپ منقطع کریں',
    waTip: (
      <>
        یہ ڈیش بورڈ کسی دوسرے فون یا کمپیوٹر پر کھولنے کے لیے واٹس ایپ پر خود کو لفظ <b className="latin">dashboard</b> لکھ کر بھیجیں۔
      </>
    ),
    disconnectTitle: 'واٹس ایپ منقطع کریں؟',
    disconnectBody:
      'حساب آپ کی ⁦Message yourself⁩ چیٹ پڑھنا بند کر دے گا اور واٹس ایپ کے Linked devices سے ہٹ جائے گا۔ آپ کے گاہک، اندراجات اور وائس نوٹ یہاں محفوظ رہیں گے، اور آپ جب چاہیں دوبارہ QR اسکین کر سکتے ہیں۔',
    disconnectConfirm: 'منقطع کریں',
    disconnected: 'واٹس ایپ منقطع ہو گیا',
    disconnectFailed: 'منقطع نہیں ہو سکا۔ دوبارہ کوشش کریں۔',

    voiceIntro: 'حساب ہر پیغام کا مختصر تحریری جواب دیتا ہے۔ وائس نوٹ جواب آن ہوں تو ساتھ میں نئے بقایا کے ساتھ اردو میں ایک بولا ہوا وائس نوٹ بھی آتا ہے — جب ہاتھ مصروف ہوں تو بہت کام کا۔',
    voiceTitle: 'وائس نوٹ میں جواب',
    voiceStateOn: 'آن — تحریری جواب اور اردو وائس نوٹ۔',
    voiceStateOff: 'آف — صرف تحریری جواب۔',
    on: 'آن',
    off: 'آف',
    voiceOn: 'وائس نوٹ جواب آن ہو گئے',
    voiceOff: 'وائس نوٹ جواب بند — اب صرف تحریری جواب آئے گا',

    langNote: 'اس سے صرف ڈیش بورڈ بدلتا ہے۔ واٹس ایپ پر حساب کے جواب ہمیشہ اردو میں آتے ہیں۔',
    dashLang: 'ڈیش بورڈ کی زبان',
    langEn: 'English',
    langEnHint: 'Dashboard in English',
    langUr: 'اردو',
    langUrHint: 'ڈیش بورڈ اردو میں',

    dataHint: 'آپ کا کھاتہ آپ کی ملکیت ہے۔ جب چاہیں اس کی کاپی ڈاؤن لوڈ کریں، یا سب کچھ ہمیشہ کے لیے حذف کر دیں۔',
    exportLabel: 'ایکسپورٹ',
    exportTitle: 'پورا کھاتہ ایک فائل میں',
    download: 'کھاتہ ڈاؤن لوڈ کریں (Excel/CSV)',
    downloadNote: 'ایک فائل جس میں ہر اندراج ہے: تاریخ، گاہک، ادھار یا وصولی، رقم اور سامان۔ یہ Excel یا Google Sheets میں کھلتی ہے۔',

    dangerLabel: 'واپس نہیں ہو سکتا',
    dangerTitle: 'اکاؤنٹ حذف کریں',
    yourShop: 'آپ کی دکان',
    dangerBody: shop => `⁨${shop}⁩ کا سارا ریکارڈ ہمیشہ کے لیے حذف ہو جائے گا: ہر گاہک، ہر اندراج اور ہر وائس نوٹ، اور واٹس ایپ کا رابطہ بھی ختم۔ یہ واپس نہیں ہو سکتا۔`,
    dangerTip: 'اگر بعد میں ریکارڈ کی ضرورت پڑ سکتی ہے تو پہلے اپنا کھاتہ ڈاؤن لوڈ کر لیں۔',
    deleteBtn: 'اکاؤنٹ حذف کریں',
    deleteTitle: 'اکاؤنٹ ہمیشہ کے لیے حذف کریں؟',
    typeToConfirm: word => <>تصدیق کے لیے {word} لکھیں</>,
    deleteMismatch: 'یہ میل نہیں کھاتا۔ بالکل ویسے ہی لکھیں جیسے اوپر دکھایا ہے۔',
    deleteForever: 'سب کچھ حذف کریں',
    deleteFailed: 'اکاؤنٹ حذف نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
    deleted: 'آپ کا اکاؤنٹ اور کھاتہ حذف ہو گیا',

    sessionTitle: 'یہ ڈیوائس',
    sessionBody: phone => (
      <>
        آپ <bdi className="num">{phone}</bdi> سے سائن اِن ہیں۔
      </>
    ),
    sessionHint: 'سائن آؤٹ سے آپ کا کھاتہ محفوظ رہتا ہے۔ دوبارہ اپنے نمبر سے سائن اِن کریں، یا واٹس ایپ پر خود کو ⁦dashboard⁩ لکھ کر بھیجیں۔',
    signOut: 'سائن آؤٹ',
  },
}

const SECTION_IDS = {
  shop: 'set-shop',
  pay: 'set-pay',
  whatsapp: 'set-whatsapp',
  lists: 'set-lists',
  voice: 'set-voice',
  language: 'set-language',
  check: 'set-check',
  sample: 'set-sample',
  data: 'set-data',
}

const PROFILE_FIELDS = ['shop_name', 'owner_name', 'city', 'business_type']

const profileFrom = me => ({
  shop_name: me?.shopName || '',
  owner_name: me?.ownerName || '',
  city: me?.city || '',
  business_type: me?.businessType || '',
})
const sameProfile = (a, b) => PROFILE_FIELDS.every(k => String(a[k] || '').trim() === String(b[k] || '').trim())
const normalize = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const URDU_SCRIPT = /[؀-ۿ]/

/** connected | reconnecting | off, and the status-pill tone that goes with it. */
function waState(me) {
  const status = me.whatsapp?.status
  const state = status === 'connected' ? 'connected' : status === 'reconnecting' ? 'reconnecting' : 'off'
  const tone = state === 'connected' ? 'ok' : state === 'reconnecting' ? 'wait' : 'bad'
  return { state, tone }
}

/** The exact word to type, in the right script's font (a shop name may be written in Urdu). */
function ConfirmWord({ children }) {
  const urdu = URDU_SCRIPT.test(children)
  return (
    <b className={urdu ? 'ur' : 'latin'} lang={urdu ? 'ur' : 'en'}>
      <bdi>{children}</bdi>
    </b>
  )
}

/** h2 + one serif sentence, then the section's framed controls. */
function Section({ id, title, intro, className, children }) {
  return (
    <section id={id} className={['set-section', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {intro && <p className="set-intro">{intro}</p>}
      {children}
    </section>
  )
}

function ProfileSection({ me, setMe }) {
  const S = useStrings(STRINGS)
  const toast = useToast()
  const initial = useMemo(() => profileFrom(me), [me])
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // If the profile changes elsewhere (another tab, realtime), follow it unless the user is mid-edit.
  const previous = useRef(initial)
  useEffect(() => {
    const was = previous.current
    previous.current = initial
    setForm(f => (sameProfile(f, was) ? initial : f))
  }, [initial])

  const dirty = !sameProfile(form, initial)
  const set = key => e => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    if (key === 'shop_name') setError('')
  }
  const discard = () => {
    setForm(initial)
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    if (!dirty || saving) return
    if (!form.shop_name.trim()) {
      setError(S.shopNameRequired)
      document.getElementById('set-shop-name')?.focus()
      return
    }
    const body = {
      shop_name: form.shop_name.trim(),
      owner_name: form.owner_name.trim(),
      city: form.city.trim(),
    }
    if (form.business_type) body.business_type = form.business_type
    setSaving(true)
    try {
      const next = await api('/api/me', { method: 'PATCH', body })
      setMe(next)
      setForm(profileFrom(next))
      toast.success(S.saved)
    } catch {
      toast.error(S.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section id={SECTION_IDS.shop} title={S.nav.shop} intro={S.profileHint}>
      <Frame
        as="form"
        className="set-frame set-form"
        onSubmit={save}
        noValidate
        foot={
          <>
            <span className="set-foot-note" aria-live="polite">
              {dirty ? S.unsaved : ''}
            </span>
            {dirty && (
              <Button variant="ghost" onClick={discard} disabled={saving}>
                {S.discard}
              </Button>
            )}
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty || saving}>
              {S.save}
            </Button>
          </>
        }
      >
        <div className="set-fields">
          <div className="set-span">
            <Field label={S.shopName} htmlFor="set-shop-name" hint={S.shopNameHint} error={error}>
              <input
                id="set-shop-name"
                className="input"
                value={form.shop_name}
                onChange={set('shop_name')}
                maxLength={60}
                autoComplete="organization"
                required
                aria-invalid={error ? 'true' : undefined}
              />
            </Field>
          </div>
          <Field label={S.ownerName} htmlFor="set-owner">
            <input id="set-owner" className="input" value={form.owner_name} onChange={set('owner_name')} maxLength={60} autoComplete="name" />
          </Field>
          <Field label={S.city} htmlFor="set-city">
            <input id="set-city" className="input" value={form.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" />
          </Field>
          <div className="set-span">
            <Field label={S.type} htmlFor="set-type">
              <select id="set-type" className="select" value={form.business_type} onChange={set('business_type')}>
                {!form.business_type && (
                  <option value="" disabled>
                    {S.choose}
                  </option>
                )}
                {BUSINESS_TYPES.map(t => (
                  <option key={t} value={t}>
                    {S.types[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Frame>
    </Section>
  )
}

// ---- payment details on reminders: the shop's own wallet / Raast / IBAN, printed on every reminder (server/paydetails.js)

const LABELLED = new Set(['bank', 'other_wallet'])
let payRowSeq = 0
/** One "way to pay" row of the form, from a saved method (stored digits shown the way people write them) or blank. */
const payRow = (m = null) => ({
  id: ++payRowSeq,
  kind: m?.kind || 'jazzcash',
  value: m?.value ? (m.value.startsWith('PK') ? formatIban(m.value) : formatMobile(m.value)) : '',
  label: m?.label || '',
})
// No details yet: the owner's own name is the likely account title, and JazzCash the likely first wallet.
const payFormFrom = (pay, ownerName) => (pay ? { name: pay.name, methods: pay.methods.map(payRow) } : { name: ownerName || '', methods: [payRow()] })
const payKey = f => JSON.stringify([f.name.trim(), f.methods.map(m => [m.kind, m.value.trim(), LABELLED.has(m.kind) ? m.label.trim() : ''])])
const asMethod = m => (LABELLED.has(m.kind) ? { kind: m.kind, value: m.value, label: m.label } : { kind: m.kind, value: m.value })
const NO_PAY_ERRORS = { name: null, rows: {} }

/** What goes to the server: rows left empty are dropped. `rows[i]` is the form row of the i-th method sent. */
function payBody(form) {
  const rows = form.methods.map((m, i) => (m.value.trim() || (LABELLED.has(m.kind) && m.label.trim()) ? i : -1)).filter(i => i >= 0)
  return { rows, body: { name: form.name, methods: rows.map(i => asMethod(form.methods[i])) } }
}

/** [{ error, field, index? }] (checkPayDetails or the server's 400) -> errors per field of the form. */
function payErrors(errors, rows) {
  const out = { name: null, rows: {} }
  for (const e of errors || []) {
    if (e.field === 'name') out.name ||= e.error
    else {
      const row = e.index != null ? rows[e.index] ?? 0 : 0
      const field = e.index != null ? e.field : 'value'
      out.rows[row] = { ...out.rows[row], [field]: out.rows[row]?.[field] || e.error }
    }
  }
  return out
}

/** The details as typed so far, for the preview: every row that is already valid on its own. */
function previewDetails(form) {
  const methods = []
  for (const m of form.methods) {
    const { value } = checkPayDetails({ name: 'x', methods: [asMethod(m)] })
    if (value) methods.push(value.methods[0])
  }
  return methods.length ? { name: cleanAccountName(form.name) || '', methods } : null
}

function PayMethodRow({ row, index, count, errors, onChange, onRemove }) {
  const S = useStrings(STRINGS)
  const P = S.pay
  const E = P.errors
  const id = `set-pay-${row.id}`
  const iban = row.kind === 'bank' || row.kind === 'raast'
  const err = code => (code ? E[code] || E.other : '')
  return (
    <div className="set-pay-method" role="group" aria-labelledby={`${id}-h`}>
      <div className="set-pay-head">
        <span className="label" id={`${id}-h`}>
          {P.way(index + 1)}
        </span>
        {count > 1 && <IconButton icon="trash" label={P.removeWay(index + 1)} onClick={onRemove} />}
      </div>
      <div className="set-pay-grid">
        <Field label={P.kind} htmlFor={`${id}-kind`} error={err(errors.kind)}>
          <select id={`${id}-kind`} className="select" value={row.kind} onChange={e => onChange({ kind: e.target.value })} aria-invalid={errors.kind ? 'true' : undefined}>
            {PAY_KINDS.map(k => (
              <option key={k} value={k}>
                {P.kinds[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={P.value[row.kind]} htmlFor={`${id}-value`} hint={P.valueHint[row.kind]} error={err(errors.value)}>
          <input
            id={`${id}-value`}
            className="input num"
            dir="ltr"
            value={row.value}
            onChange={e => onChange({ value: e.target.value })}
            inputMode={iban ? 'text' : 'tel'}
            autoCapitalize={iban ? 'characters' : 'off'}
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            aria-invalid={errors.value ? 'true' : undefined}
          />
        </Field>
        {LABELLED.has(row.kind) && (
          <div className="set-span">
            <Field
              label={row.kind === 'bank' ? P.bankName : P.walletName}
              htmlFor={`${id}-label`}
              hint={row.kind === 'other_wallet' ? P.walletNameHint : undefined}
              error={err(errors.label)}
            >
              <input
                id={`${id}-label`}
                className="input"
                dir="auto"
                value={row.label}
                onChange={e => onChange({ label: e.target.value })}
                maxLength={LABEL_MAX}
                autoComplete="off"
                aria-invalid={errors.label ? 'true' : undefined}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

/** The reminder as the customer who owes the most will get it, the payment sentence marked; else the sentence alone. */
function PayPreview({ me, form, customers }) {
  const S = useStrings(STRINGS)
  const P = S.pay
  const details = previewDetails(form)
  const line = payLine(details)
  const example = useMemo(
    () => (customers || []).filter(c => c.balance > 0 && c.listKind !== 'suppliers').sort((a, b) => b.balance - a.balance)[0] || null,
    [customers],
  )
  const full = line && example ? reminderMessage(me.shopName, example, details) : null
  const at = full ? full.indexOf(line) : -1
  return (
    <QuoteCard
      tone="plain"
      className="set-pay-preview"
      label={P.preview}
      cells={
        full
          ? [
              { label: P.previewTo, value: <Script text={example.name} /> },
              { label: P.previewOwes, value: <Money value={example.balance} tone="owed" /> },
            ]
          : undefined
      }
    >
      {!line ? (
        <span className="set-pay-empty">{P.previewEmpty}</span>
      ) : at >= 0 ? (
        <span className="reminder-preview latin">
          {full.slice(0, at)}
          <mark className="set-pay-hl">{line}</mark>
          {full.slice(at + line.length)}
        </span>
      ) : (
        <span className="reminder-preview latin">
          <mark className="set-pay-hl">{line}</mark>
        </span>
      )}
    </QuoteCard>
  )
}

function PaySection({ me, setMe, customersRes }) {
  const S = useStrings(STRINGS)
  const P = S.pay
  const toast = useToast()
  const saved = me.payDetails || null
  const initial = useMemo(() => payFormFrom(saved, me.ownerName), [saved, me.ownerName])
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState(NO_PAY_ERRORS)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Saved elsewhere (another tab, realtime): follow it unless the shopkeeper is mid-edit.
  const previous = useRef(initial)
  useEffect(() => {
    const was = previous.current
    previous.current = initial
    setForm(f => (payKey(f) === payKey(was) ? initial : f))
  }, [initial])

  const dirty = payKey(form) !== payKey(initial)
  const setName = e => {
    const name = e.target.value
    setForm(f => ({ ...f, name }))
    setErrors(x => ({ ...x, name: null }))
  }
  const changeRow = index => patch => {
    setForm(f => ({ ...f, methods: f.methods.map((m, i) => (i === index ? { ...m, ...patch } : m)) }))
    setErrors(x => ({ ...x, rows: { ...x.rows, [index]: undefined } }))
  }
  const removeRow = index => () => {
    setForm(f => ({ ...f, methods: f.methods.filter((_, i) => i !== index) }))
    setErrors(NO_PAY_ERRORS)
    // The row (and its button) is gone: land on the first field of the row that takes its place.
    requestAnimationFrame(() => document.querySelector(`#${SECTION_IDS.pay} .set-pay-method select`)?.focus())
  }
  const addRow = () => {
    // The next kind not used yet: JazzCash, then Easypaisa, then Raast…
    setForm(f => (f.methods.length >= MAX_PAY_METHODS ? f : { ...f, methods: [...f.methods, payRow({ kind: PAY_KINDS.find(k => !f.methods.some(m => m.kind === k)) })] }))
    requestAnimationFrame(() => document.querySelector(`#${SECTION_IDS.pay} .set-pay-method:last-child select`)?.focus())
  }
  const discard = () => {
    setForm(initial)
    setErrors(NO_PAY_ERRORS)
  }
  const showErrors = (list, rows) => {
    setErrors(payErrors(list, rows))
    requestAnimationFrame(() => document.querySelector(`#${SECTION_IDS.pay} [aria-invalid="true"]`)?.focus())
  }

  async function save(e) {
    e.preventDefault()
    if (!dirty || saving) return
    const { rows, body } = payBody(form)
    const checked = checkPayDetails(body)
    if (checked.errors.length) return showErrors(checked.errors, rows)
    setSaving(true)
    try {
      const next = await request('/api/me', { method: 'PATCH', body: { payDetails: body } })
      setMe(next)
      setForm(payFormFrom(next.payDetails, next.ownerName))
      setErrors(NO_PAY_ERRORS)
      toast.success(P.saved)
    } catch (err) {
      if (err.status === 400 && err.data?.errors) showErrors(err.data.errors, rows)
      else toast.error(P.errors.other)
    } finally {
      setSaving(false)
    }
  }

  const closeRemove = useCallback(() => {
    if (!busyRef.current) setRemoving(false)
  }, [])

  async function remove() {
    busyRef.current = true
    setBusy(true)
    try {
      const next = await request('/api/me', { method: 'PATCH', body: { payDetails: null } })
      setMe(next)
      setForm(payFormFrom(null, next.ownerName))
      setErrors(NO_PAY_ERRORS)
      busyRef.current = false
      setRemoving(false)
      toast.success(P.removed)
    } catch {
      toast.error(P.errors.other)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Section id={SECTION_IDS.pay} title={P.title} intro={P.intro}>
      <Frame
        as="form"
        className="set-frame set-form set-pay"
        onSubmit={save}
        noValidate
        foot={
          <>
            <span className="set-foot-note" aria-live="polite">
              {dirty ? S.unsaved : ''}
            </span>
            {saved && !dirty && (
              <Button variant="danger" onClick={() => setRemoving(true)}>
                {P.remove}
              </Button>
            )}
            {dirty && (
              <Button variant="ghost" onClick={discard} disabled={saving}>
                {S.discard}
              </Button>
            )}
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty || saving}>
              {P.save}
            </Button>
          </>
        }
      >
        <Field label={P.name} htmlFor="set-pay-name" hint={P.nameHint} error={errors.name ? P.errors[errors.name] || P.errors.other : ''}>
          <input
            id="set-pay-name"
            className="input"
            dir="auto"
            value={form.name}
            onChange={setName}
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-invalid={errors.name ? 'true' : undefined}
          />
        </Field>
        <div className="set-pay-methods">
          {form.methods.map((row, i) => (
            <PayMethodRow
              key={row.id}
              row={row}
              index={i}
              count={form.methods.length}
              errors={errors.rows[i] || {}}
              onChange={changeRow(i)}
              onRemove={removeRow(i)}
            />
          ))}
        </div>
        {form.methods.length < MAX_PAY_METHODS && (
          <Button icon="plus" className="set-pay-add" onClick={addRow}>
            {P.add}
          </Button>
        )}
        <PayPreview me={me} form={form} customers={customersRes.data} />
        <p className="set-note set-pay-note">{P.note}</p>
      </Frame>
      <ConfirmSheet
        open={removing}
        onClose={closeRemove}
        onConfirm={remove}
        title={P.removeTitle}
        description={P.removeBody}
        confirmLabel={P.removeConfirm}
        danger
        busy={busy}
      />
    </Section>
  )
}

function WhatsAppSection({ me, setMe }) {
  const S = useStrings(STRINGS)
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const actionsRef = useRef(null)
  const refocus = useRef(false)
  const { state, tone } = waState(me)
  // A session can still exist while the status reads "disconnected" (e.g. replaced by another login).
  const canDisconnect = state !== 'off' || Boolean(me.whatsapp?.live)

  // Stable: Sheet re-runs its focus effect whenever onClose changes identity.
  const closeConfirm = useCallback(() => {
    if (!busyRef.current) setConfirming(false)
  }, [])

  // After a disconnect the Disconnect button that opened the sheet is gone, so the sheet cannot hand focus back to
  // it: land on Reconnect instead of <body>. (Runs after the sheet's own cleanup has tried the opener.)
  useEffect(() => {
    if (confirming || !refocus.current) return
    refocus.current = false
    const actions = actionsRef.current
    if (actions && !actions.contains(document.activeElement)) actions.querySelector('a, button')?.focus()
  }, [confirming])

  async function disconnect() {
    busyRef.current = true
    setBusy(true)
    try {
      setMe(await api('/api/whatsapp/disconnect', { method: 'POST' }))
      refocus.current = true
      setConfirming(false)
      toast.success(S.disconnected)
    } catch {
      toast.error(S.disconnectFailed)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const cells = [{ key: 'number', label: S.linkedNumber, value: <bdi className="num">{me.phoneLocal}</bdi> }]
  if (me.whatsapp?.name) cells.push({ key: 'name', label: S.waName, value: <bdi>{me.whatsapp.name}</bdi> })

  return (
    <Section id={SECTION_IDS.whatsapp} title={S.nav.whatsapp} intro={S.waHint}>
      <div className="frame set-frame set-wa">
        <div className="set-wa-status">
          <span className="label">{S.statusLabel}</span>
          <p className={`set-wa-state ${tone}`}>
            <span className="status-dot" aria-hidden="true" />
            {S.status[state]}
          </p>
          <p className="set-wa-text">{S.statusText[state]}</p>
        </div>
        <LabeledCells cells={cells} framed={false} min={180} />
        <div className="set-actions" ref={actionsRef}>
          <Button variant={state === 'off' ? 'primary' : 'secondary'} icon="qr" to="/connect?reconnect=1">
            {S.reconnect}
          </Button>
          {canDisconnect && (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {S.disconnect}
            </Button>
          )}
        </div>
      </div>
      <p className="caption set-caption">{S.waTip}</p>
      <ConfirmSheet
        open={confirming}
        onClose={closeConfirm}
        onConfirm={disconnect}
        title={S.disconnectTitle}
        description={S.disconnectBody}
        confirmLabel={S.disconnectConfirm}
        danger
        busy={busy}
      />
    </Section>
  )
}

function VoiceSection({ me, setMe }) {
  const S = useStrings(STRINGS)
  const toast = useToast()
  const [savingVoice, setSavingVoice] = useState(false)
  const voiceOn = Boolean(me.voiceReplies)

  async function toggleVoice(e) {
    const next = e.target.checked
    setSavingVoice(true)
    setMe(m => ({ ...m, voiceReplies: next }))
    try {
      setMe(await api('/api/me', { method: 'PATCH', body: { voice_replies: next } }))
      toast.success(next ? S.voiceOn : S.voiceOff)
    } catch {
      setMe(m => ({ ...m, voiceReplies: !next }))
      toast.error(S.saveFailed)
    } finally {
      setSavingVoice(false)
    }
  }

  return (
    <Section id={SECTION_IDS.voice} title={S.nav.voice} intro={S.voiceIntro}>
      <div className={['frame set-frame set-switch-row', voiceOn && 'is-on'].filter(Boolean).join(' ')}>
        <div className="set-row-text">
          <span className="set-row-title" id="set-voice-title">
            {S.voiceTitle}
          </span>
          <p className="set-row-hint" id="set-voice-hint">
            {voiceOn ? S.voiceStateOn : S.voiceStateOff}
          </p>
        </div>
        <label className="set-switch">
          <input
            type="checkbox"
            role="switch"
            checked={voiceOn}
            onChange={toggleVoice}
            disabled={savingVoice}
            aria-labelledby="set-voice-title"
            aria-describedby="set-voice-hint"
          />
          <span className="set-switch-track" aria-hidden="true">
            <span className="set-switch-knob" />
          </span>
          <span className="set-switch-state" aria-hidden="true">
            {voiceOn ? S.on : S.off}
          </span>
        </label>
      </div>
    </Section>
  )
}

function LanguageSection({ setMe }) {
  const S = useStrings(STRINGS)
  const toast = useToast()
  const { lang, setLang } = useLang()

  async function pickLang(value) {
    if (value === lang) return
    setLang(value)
    try {
      setMe(await api('/api/me', { method: 'PATCH', body: { ui_lang: value } }))
    } catch {
      toast.error(STRINGS[value].saveFailed)
    }
  }

  const options = [
    { value: 'en', title: S.langEn, hint: S.langEnHint },
    { value: 'ur', title: S.langUr, hint: S.langUrHint },
  ]

  return (
    <Section id={SECTION_IDS.language} title={S.nav.language} intro={S.langNote}>
      <div className="frame set-frame">
        <fieldset className="set-lang">
          <legend className="set-legend label">{S.dashLang}</legend>
          <div className="set-lang-options">
            {options.map(o => {
              const script = o.value === 'ur' ? 'ur' : 'latin'
              const dir = o.value === 'ur' ? 'rtl' : 'ltr'
              return (
                <label key={o.value} className={['set-lang-option', lang === o.value && 'is-on'].filter(Boolean).join(' ')}>
                  <input type="radio" name="set-lang" value={o.value} checked={lang === o.value} onChange={() => pickLang(o.value)} />
                  <span className="set-lang-text">
                    <span className={`set-lang-title ${script}`} lang={o.value} dir={dir}>
                      {o.title}
                    </span>
                    <span className={`set-lang-hint ${script}`} lang={o.value} dir={dir}>
                      {o.hint}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </Section>
  )
}

function DataSection({ me }) {
  const S = useStrings(STRINGS)
  return (
    <Section id={SECTION_IDS.data} title={S.nav.data} intro={S.dataHint}>
      <div className="frame set-frame set-export">
        <div className="set-export-text">
          <span className="label">{S.exportLabel}</span>
          <h3 className="set-frame-title">{S.exportTitle}</h3>
          <p className="set-note">{S.downloadNote}</p>
        </div>
        <Button href="/api/export.csv" download icon="download">
          {S.download}
        </Button>
      </div>
      <DangerZone me={me} />
    </Section>
  )
}

function DangerZone({ me }) {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const word = me.shopName?.trim() || 'DELETE'
  const shop = me.shopName?.trim() || S.yourShop
  const matches = normalize(typed) === normalize(word)

  // Stable identity: a new onClose on every keystroke would make Sheet steal and restore focus each time.
  const close = useCallback(() => {
    if (busyRef.current) return
    setOpen(false)
    setTyped('')
    setTried(false)
  }, [])

  async function remove(e) {
    e?.preventDefault()
    setTried(true)
    if (!matches || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await api('/api/me', { method: 'DELETE' })
      toast.show(S.deleted)
      navigate('/', { replace: true })
    } catch {
      toast.error(S.deleteFailed)
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="frame set-frame set-danger" role="group" aria-labelledby="set-danger-h">
      <div className="set-danger-text">
        <span className="label set-danger-label">{S.dangerLabel}</span>
        <h3 className="set-frame-title" id="set-danger-h">
          {S.dangerTitle}
        </h3>
        <p className="set-danger-body">{S.dangerBody(shop)}</p>
        <p className="set-note">{S.dangerTip}</p>
      </div>
      <Button variant="danger" icon="trash" onClick={() => setOpen(true)}>
        {S.deleteBtn}
      </Button>
      <Sheet
        open={open}
        onClose={close}
        title={S.deleteTitle}
        description={S.dangerBody(shop)}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              {C.cancel}
            </Button>
            <Button variant="danger" className="solid" icon="trash" loading={busy} disabled={!matches || busy} onClick={remove}>
              {S.deleteForever}
            </Button>
          </>
        }
      >
        <form onSubmit={remove} noValidate>
          <Field label={S.typeToConfirm(<ConfirmWord>{word}</ConfirmWord>)} htmlFor="set-delete-confirm" error={tried && !matches ? S.deleteMismatch : ''} hint={S.dangerTip}>
            <input
              id="set-delete-confirm"
              className="input"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-autofocus
              aria-invalid={tried && !matches ? 'true' : undefined}
            />
          </Field>
        </form>
      </Sheet>
    </div>
  )
}

/* ---------------------------------------------------------------- lists, system check, sample data */

const cx = (...parts) => parts.filter(Boolean).join(' ')

/** Like api(), but a failed request keeps the server's extra fields (retryAfter, list, people…). */
async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw Object.assign(new Error('network'), { status: 0, code: 'network', data: null })
  }
  if (res.status === 401) window.dispatchEvent(new Event('hisaab:signedout'))
  const data = (res.headers.get('content-type') || '').includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || Number(data?.retryAfter) || 0
    throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, code: data?.error, data, retryAfter })
  }
  return data
}

/** A name in the script it was written in: Urdu script in the English UI, Latin in the Urdu UI, each in its own font. */
function Script({ text, className }) {
  const { lang } = useLang()
  const urdu = URDU_SCRIPT.test(text || '')
  const island = urdu && lang !== 'ur' ? 'ur' : !urdu && lang === 'ur' ? 'latin' : null
  return (
    <bdi className={cx(island, className) || undefined} lang={island ? (urdu ? 'ur' : 'en') : undefined}>
      {text}
    </bdi>
  )
}

const listLabel = (l, lang) => (lang === 'ur' && l.nameUrdu ? l.nameUrdu : l.name)

/** General is not a list row: the people with no list. */
function generalStats(customers) {
  const members = (customers || []).filter(c => !c.listId)
  const owing = members.filter(c => c.balance > 0)
  return { people: members.length, owing: owing.length, total: owing.reduce((sum, c) => sum + c.balance, 0) }
}

function ListRow({ list, general, onRename, onDelete }) {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const kind = general ? 'customers' : list.kind
  const stats = general || list
  const name = general ? S.general : listLabel(list, lang)
  const alt = general ? null : lang === 'ur' ? (list.nameUrdu ? list.name : null) : list.nameUrdu || null
  // What the shop owes a supplier is the payable slate blue (lib/lists.css), never rust: rust only ever means udhaar.
  const total = <Money value={stats.total} tone={kind === 'suppliers' ? 'payable' : 'owed'} />
  const owed =
    stats.people === 0
      ? S.listEmpty
      : stats.owing
        ? kind === 'suppliers'
          ? S.listYouOwe(stats.owing, total)
          : S.listOwing(stats.owing, total)
        : kind === 'suppliers'
          ? S.listNothingToPay
          : S.listNobodyOwes
  return (
    <li className={cx('set-list-row', general && 'is-general')}>
      <div className="set-list-main">
        <p className="set-list-title">
          <Script text={name} className="set-list-name" />
          {alt && alt !== name && <Script text={alt} className="set-list-alt" />}
          {list?.sample && <Badge className="outline">{S.sampleBadge}</Badge>}
        </p>
        <p className="set-list-meta">
          <span className={cx('set-list-kind', kind === 'suppliers' && 'is-suppliers')}>{general ? S.generalSub : S.kind[kind]}</span>
          <span aria-hidden="true"> · </span>
          <span>{S.listPeople(stats.people)}</span>
          <span aria-hidden="true"> · </span>
          <span>{owed}</span>
        </p>
      </div>
      {!general && (
        <div className="set-list-actions">
          <IconButton icon="edit" label={S.rename(list.name)} onClick={() => onRename(list)} />
          <IconButton icon="trash" label={S.remove(list.name)} onClick={() => onDelete(list)} />
        </div>
      )}
    </li>
  )
}

/** Create a list (name, Urdu name, kind) or rename one (name, Urdu name; the kind never changes). */
function ListSheet({ open, list, onClose, onSaved }) {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const [name, setName] = useState('')
  const [nameUrdu, setNameUrdu] = useState('')
  // Renaming: the Urdu name goes to the server only when it was edited here. Left alone, the server makes a new
  // Urdu name from the new name instead of keeping the old one ("Mohalla" → "Bazaar wale" must not stay "محلہ").
  const [urduEdited, setUrduEdited] = useState(false)
  const [kind, setKind] = useState('customers')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const renaming = Boolean(list)

  useEffect(() => {
    if (!open) return
    setName(list?.name || '')
    setNameUrdu(list?.nameUrdu || '')
    setUrduEdited(false)
    setKind(list?.kind || 'customers')
    setError('')
  }, [open, list])

  const close = useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  async function submit(e) {
    e?.preventDefault()
    if (busyRef.current) return
    const clean = name.trim()
    if (!clean) {
      setError(S.listErrors.bad_name)
      document.getElementById('set-list-name')?.focus()
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const urdu = nameUrdu.trim()
      const saved = renaming
        ? await request(`/api/lists/${list.id}`, {
            method: 'PATCH',
            // Emptied along with a new name = "Hisaab, make it" (the hint's promise), so it is left out too.
            body: { name: clean, ...(urduEdited && (urdu || clean === list.name) ? { nameUrdu: urdu } : {}) },
          })
        : await request('/api/lists', { method: 'POST', body: { name: clean, kind, ...(urdu ? { nameUrdu: urdu } : {}) } })
      busyRef.current = false
      onSaved(saved, renaming)
    } catch (err) {
      const E = S.listErrors
      if (err.code === 'exists') setError(E.exists(err.data?.list ? err.data.list.name : null))
      else if (err.status === 404) setError(E.gone)
      else setError(E[err.code] && typeof E[err.code] === 'string' ? E[err.code] : E.other)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={renaming ? S.renameTitle : S.createTitle}
      description={renaming ? S.renameDesc(list.kind) : S.createDesc}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {C.cancel}
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {renaming ? S.saveName : S.create}
          </Button>
        </>
      }
    >
      <form className="set-list-form" onSubmit={submit} noValidate>
        <Field label={S.listName} htmlFor="set-list-name" hint={S.listNameHint} error={error}>
          <input
            id="set-list-name"
            className="input"
            value={name}
            onChange={e => {
              const next = e.target.value
              setName(next)
              setError('')
              // The old Urdu name belongs to the old name: clear it (Hisaab makes a new one) unless it was edited.
              if (renaming && !urduEdited) setNameUrdu(next.trim() === list.name ? list.nameUrdu || '' : '')
            }}
            maxLength={40}
            autoComplete="off"
            dir="auto"
            data-autofocus
            aria-invalid={error ? 'true' : undefined}
          />
        </Field>
        <Field label={S.listNameUrdu} htmlFor="set-list-urdu" hint={S.listNameUrduHint}>
          <input
            id="set-list-urdu"
            className="input ur"
            lang="ur"
            dir="rtl"
            value={nameUrdu}
            onChange={e => {
              setNameUrdu(e.target.value)
              setUrduEdited(true)
            }}
            maxLength={40}
            autoComplete="off"
          />
        </Field>
        {!renaming && (
          <fieldset className="set-kind">
            <legend className="field-label">{S.listKind}</legend>
            <div className="set-kind-options">
              {['customers', 'suppliers'].map(k => (
                <label key={k} className={cx('set-kind-option', kind === k && 'is-on')}>
                  <input type="radio" name="set-list-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  <span className="set-kind-text">
                    <span className="set-kind-title">{S.kind[k]}</span>
                    <span className="set-kind-hint">{S.kindHint[k]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

function ListsSection({ listsRes, customersRes }) {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const { lang } = useLang()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // null | { list: List | null }
  const [removing, setRemoving] = useState(null)
  const [blocked, setBlocked] = useState(null) // { list, people }
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const lists = listsRes.data || []
  const general = useMemo(() => generalStats(customersRes.data), [customersRes.data])
  const full = lists.length >= MAX_LISTS
  const loading = (listsRes.loading && !listsRes.data) || (customersRes.loading && !customersRes.data)
  const failed = !loading && ((listsRes.error && !listsRes.data) || (customersRes.error && !customersRes.data))

  const refresh = useCallback(() => {
    listsRes.reload(true)
    customersRes.reload(true)
  }, [listsRes.reload, customersRes.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeEdit = useCallback(() => setEditing(null), [])
  const closeRemove = useCallback(() => {
    if (!busyRef.current) setRemoving(null)
  }, [])
  const closeBlocked = useCallback(() => setBlocked(null), [])

  function saved(list, renamed) {
    setEditing(null)
    toast.success(renamed ? S.renamed(list.name) : S.created(list.name))
    refresh()
  }

  function askDelete(list) {
    // A suppliers list with people cannot go (what the shop owes would turn into udhaar): explain instead.
    if (list.kind === 'suppliers' && list.people > 0) setBlocked({ list, people: list.people })
    else setRemoving(list)
  }

  async function confirmDelete() {
    const list = removing
    if (!list || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const out = await request(`/api/lists/${list.id}`, { method: 'DELETE' })
      busyRef.current = false
      setRemoving(null)
      toast.success(S.listDeleted(out?.moved || 0))
    } catch (err) {
      busyRef.current = false
      setRemoving(null)
      if (err.code === 'not_empty') setBlocked({ list, people: err.data?.people ?? list.people })
      else toast.error(err.status === 404 ? S.listErrors.gone : S.listErrors.other)
    } finally {
      busyRef.current = false
      setBusy(false)
      refresh()
    }
  }

  return (
    <Section id={SECTION_IDS.lists} title={S.nav.lists} intro={S.listsIntro}>
      <Frame
        className="set-frame set-lists-frame"
        flush
        title={S.listsFrame}
        meta={listsRes.data ? S.listsCount(lists.length) : null}
        foot={
          <>
            <span className={cx('set-foot-note', 'set-lists-full')} aria-live="polite">
              {full ? S.full : ''}
            </span>
            <Button variant="primary" icon="plus" onClick={() => setEditing({ list: null })} disabled={full || loading || failed}>
              {S.newList}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="set-lists-loading" aria-busy="true">
            <span className="sr-only">{S.listsLoading}</span>
            {[0, 1, 2].map(i => (
              <div key={i} className="set-list-row">
                <div className="set-list-main">
                  <Skeleton width="40%" height={18} />
                  <Skeleton width="65%" height={14} />
                </div>
              </div>
            ))}
          </div>
        ) : failed ? (
          <div className="set-lists-error">
            <p>{S.listsFailed}</p>
            <Button size="sm" icon="refresh" onClick={() => refresh()}>
              {C.retry}
            </Button>
          </div>
        ) : (
          <ul className="set-list-rows">
            <ListRow general={general} />
            {lists.map(l => (
              <ListRow key={l.id} list={l} onRename={list => setEditing({ list })} onDelete={askDelete} />
            ))}
          </ul>
        )}
      </Frame>
      <p className="caption set-caption">{S.listsVoiceTip}</p>

      <ListSheet open={Boolean(editing)} list={editing?.list || null} onClose={closeEdit} onSaved={saved} />
      <ConfirmSheet
        open={Boolean(removing)}
        onClose={closeRemove}
        onConfirm={confirmDelete}
        title={removing ? S.listDeleteTitle(removing.name) : ''}
        description={removing ? S.deleteBody(removing.kind, removing.people) : ''}
        confirmLabel={S.deleteConfirm}
        danger
        busy={busy}
      />
      <Sheet
        open={Boolean(blocked)}
        onClose={closeBlocked}
        title={blocked ? S.notEmptyTitle(blocked.list.name) : ''}
        description={blocked ? S.notEmptyBody(blocked.people) : ''}
        footer={
          <>
            <Button variant="ghost" onClick={closeBlocked}>
              {C.close}
            </Button>
            <Button variant="primary" iconEnd="arrow-right" to={blocked ? listHref(blocked.list.id) : '/app/customers'}>
              {blocked ? S.openList(listLabel(blocked.list, lang)) : null}
            </Button>
          </>
        }
      />
    </Section>
  )
}

/** What to do about one failed check, in plain words. */
function fixFor(id, c, F) {
  if (!c || c.ok) return null
  const code = String(c.code || '')
  // Some advice depends on the result (the free tier's daily reset time comes from the server).
  const say = f => (typeof f === 'function' ? f(c) : f)
  if (id === 'ai') {
    if (code === 'no_key' || code === 'key') return F.ai.key
    if (code.startsWith('voice_')) {
      const base = code.slice(6)
      return [base === 'key' ? F.ai.key : say(F.ai[base]), F.ai.voice].filter(Boolean).join(' ')
    }
    return say(F.ai[code]) || F.ai.other
  }
  return F[id]?.[code] || F[id]?.other || null
}

// Model ids are long ("gemini-2.5-flash-native-audio-latest"): let them break after a hyphen on a phone.
const breakable = id =>
  String(id)
    .split('-')
    .flatMap((piece, i) => (i ? [<wbr key={i} />, `-${piece}`] : [piece]))

function CheckPart({ label, part, S, lang }) {
  if (!part) return null
  const secs = lang === 'ur' ? urSecs : enSecs
  return (
    <div className="set-check-part">
      <dt>{label}</dt>
      <dd>
        {part.skipped ? (
          S.checkSkipped
        ) : (
          <>
            <Icon name={part.ok ? 'check' : 'alert'} size="sm" className={part.ok ? 'is-ok' : 'is-bad'} />
            <span className="num">{secs(part.ms || 0)}</span>
            {part.model && (
              <span className="latin set-check-model" dir="ltr">
                {breakable(part.model)}
              </span>
            )}
            {part.model && part.path === 'live' && (
              <span className="latin set-check-model" dir="ltr">
                {S.checkLive}
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  )
}

function CheckRow({ id, c, running }) {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const state = running ? 'wait' : c ? (c.ok ? 'ok' : 'bad') : 'none'
  const fix = !running && fixFor(id, c, S.fix)
  const detail = c && !running ? (lang === 'ur' ? c.detailUr || c.detail : c.detail) : null
  const secs = lang === 'ur' ? urSecs : enSecs
  return (
    <li className={cx('set-check-row', `is-${state}`)}>
      <span className="set-check-mark" aria-hidden="true">
        {state === 'ok' ? <Icon name="check" /> : state === 'bad' ? <Icon name="alert" /> : state === 'wait' ? <span className="spinner" /> : <span className="set-check-blank" />}
      </span>
      <div className="set-check-main">
        <h3 className="set-check-name">
          {S.checkName[id]}
          <span className="sr-only"> — {S.checkWord[state]}</span>
        </h3>
        <p className="set-check-what">{S.checkWhat[id]}</p>
        {detail && (
          <p className="set-check-detail" dir="auto">
            {detail}
          </p>
        )}
        {id === 'ai' && c && !running && (c.text || c.voiceNote || c.call) && (
          <dl className="set-check-parts">
            <CheckPart label={S.checkText} part={c.text} S={S} lang={lang} />
            <CheckPart label={S.checkVoiceNote} part={c.voiceNote} S={S} lang={lang} />
            <CheckPart label={S.checkCall} part={c.call && { ...c.call, path: 'live' }} S={S} lang={lang} />
          </dl>
        )}
        {id === 'voice' && c?.audio && !running && (
          <div className="set-check-audio">
            <span className="label">{S.checkHear}</span>
            <VoiceNote src={c.audio} seconds={c.seconds} reply />
          </div>
        )}
        {fix && (
          <p className="set-check-fix">
            <strong>{S.checkFix}</strong> {fix}
          </p>
        )}
        {id === 'whatsapp' && c && !c.ok && !running && c.code !== 'reconnecting' && (
          <Button size="sm" icon="qr" to="/connect?reconnect=1" className="set-check-action">
            {S.reconnectWa}
          </Button>
        )}
      </div>
      <p className="set-check-end" aria-hidden="true">
        <span className="set-check-word">{S.checkWord[state]}</span>
        {c && !running && <span className="set-check-ms num">{secs(c.ms || 0)}</span>}
      </p>
    </li>
  )
}

function useSecondsLeft(until) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until || until <= Date.now()) return
    setNow(Date.now())
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

function CheckSection({ check, setCheck }) {
  const S = useStrings(STRINGS)
  const { lang } = useLang()
  const [send, setSend] = useState(false)
  const wait = useSecondsLeft(check.retryAt)
  const { running, data, error } = check
  const byId = Object.fromEntries((data?.checks || []).map(c => [c.id, c]))
  const bad = (data?.checks || []).filter(c => !c.ok).length
  const state = running ? 'wait' : data ? (data.ok ? 'ok' : 'bad') : 'none'

  async function run() {
    if (running || wait > 0) return
    setCheck(c => ({ ...c, running: true, error: null }))
    try {
      const result = await request(`/api/system-check${send ? '?send=1' : ''}`)
      setCheck({ running: false, data: result, error: null, retryAt: Date.now() + 20_000 })
    } catch (err) {
      if (err.status === 429) setCheck(c => ({ ...c, running: false, error: 'too_soon', retryAt: Date.now() + (err.retryAfter || 20) * 1000 }))
      else setCheck(c => ({ ...c, running: false, error: err.status === 0 ? 'offline' : 'failed' }))
    }
  }

  const headline = state === 'wait' ? S.checkRunning : state === 'ok' ? S.checkOk : state === 'bad' ? S.checkBad(bad) : S.checkNone
  const sub = state === 'wait' ? S.checkRunningText : data ? S.checkAt(when(data.ranAt, lang), data.ms || 0) : S.checkNoneText
  const errorText = error === 'offline' ? S.checkOffline : error === 'failed' ? S.checkFailed : null

  return (
    <Section id={SECTION_IDS.check} title={S.nav.check} intro={S.checkIntro}>
      <div className={cx('frame set-frame set-check', `is-${state}`)}>
        <div className="set-check-status" aria-live="polite">
          <span className="label">{S.checkLabel}</span>
          <p className={cx('set-check-state', state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : state === 'wait' ? 'wait' : null)}>
            <span className="status-dot" aria-hidden="true" />
            {headline}
          </p>
          <p className="set-wa-text">{sub}</p>
        </div>
        <ol className="set-check-rows" aria-busy={running || undefined}>
          {CHECK_IDS.map(id => (
            <CheckRow key={id} id={id} c={byId[id]} running={running} />
          ))}
        </ol>
        <div className="set-check-foot">
          <label className="checkbox set-check-send">
            <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} disabled={running} aria-describedby="set-check-send-hint" />
            <span>
              <span className="set-check-send-title">{S.sendTest}</span>
              <span className="set-check-send-hint" id="set-check-send-hint">
                {S.sendTestHint}
              </span>
            </span>
          </label>
          <div className="set-check-go">
            <Button variant="primary" size="lg" icon="refresh" loading={running} disabled={wait > 0} onClick={run}>
              {data ? S.runAgain : S.run}
            </Button>
            {(wait > 0 || errorText) && (
              <p className={cx('set-check-wait', errorText && !wait && 'is-error')} role={errorText ? 'alert' : undefined}>
                {wait > 0 ? S.tooSoon(wait) : errorText}
              </p>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

/** Sample data status: GET /api/sample-data, or (if that route is missing) the sample flags on lists and people. */
function sampleState(sampleRes, listsRes, customersRes) {
  if (sampleRes.data) return sampleRes.data
  if (!sampleRes.error || !customersRes.data) return null
  const people = customersRes.data.filter(c => c.sample).length
  return { ready: true, present: people > 0, people, lists: (listsRes.data || []).filter(l => l.sample).length, entries: null }
}

function SampleSection({ status, reload }) {
  const S = useStrings(STRINGS)
  const toast = useToast()
  const [asking, setAsking] = useState(null) // 'add' | 'remove'
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const present = Boolean(status?.present)
  const notReady = status && status.ready === false

  const close = useCallback(() => {
    if (!busyRef.current) setAsking(null)
  }, [])

  async function confirm() {
    if (busyRef.current) return
    const adding = asking === 'add'
    busyRef.current = true
    setBusy(true)
    try {
      const out = await request('/api/sample-data', { method: adding ? 'POST' : 'DELETE' })
      toast.success(adding ? S.sampleAdded(out?.added ?? out?.details?.people ?? 0) : S.sampleRemoved(out?.removed ?? out?.details?.people ?? 0))
    } catch (err) {
      if (err.code === 'already_has_sample') toast.show(S.sampleExists)
      else if (err.code === 'schema_not_ready') toast.error(S.sampleNotReady)
      else toast.error(S.sampleFailed)
    } finally {
      busyRef.current = false
      setBusy(false)
      setAsking(null)
      reload()
    }
  }

  const body = !status ? null : present ? S.sampleOnBody(status.people || 0, status.lists || 0, status.entries ?? null) : S.sampleOffBody

  return (
    <Section id={SECTION_IDS.sample} title={S.nav.sample} intro={S.sampleIntro}>
      <div className={cx('frame set-frame set-sample', present && 'is-on')}>
        <div className="set-sample-text">
          <span className="label">{present ? S.sampleOnLabel : S.sampleOffLabel}</span>
          <h3 className="set-frame-title">{present ? S.sampleOnTitle : S.sampleOffTitle}</h3>
          {status ? <p className="set-note">{notReady ? S.sampleNotReady : body}</p> : <Skeleton width="80%" height={16} />}
        </div>
        {present ? (
          <Button variant="danger" icon="trash" onClick={() => setAsking('remove')} disabled={!status}>
            {S.sampleRemove}
          </Button>
        ) : (
          <Button variant="secondary" icon="plus" onClick={() => setAsking('add')} disabled={!status || notReady}>
            {S.sampleAdd}
          </Button>
        )}
      </div>
      <ConfirmSheet
        open={Boolean(asking)}
        onClose={close}
        onConfirm={confirm}
        title={asking === 'remove' ? S.sampleRemoveTitle : S.sampleAddTitle}
        description={asking === 'remove' ? S.sampleRemoveBody(status?.people || 0) : S.sampleAddBody}
        confirmLabel={asking === 'remove' ? S.sampleRemoveConfirm : S.sampleAddConfirm}
        danger={asking === 'remove'}
        busy={busy}
      />
    </Section>
  )
}

function SessionSection({ me }) {
  const S = useStrings(STRINGS)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  return (
    <section className="set-device" aria-labelledby="set-device-h">
      <h2 className="set-device-title" id="set-device-h">
        {S.sessionTitle}
      </h2>
      <p className="set-device-who">{S.sessionBody(me.phoneLocal)}</p>
      <p className="set-note">{S.sessionHint}</p>
      <Button icon="logout" loading={busy} onClick={signOut}>
        {S.signOut}
      </Button>
    </section>
  )
}

export default function Settings() {
  const S = useStrings(STRINGS)
  useHashScroll()
  const { lang } = useLang()
  const { me, setMe } = useMe()
  const listsRes = useResource('/api/lists', { refreshOn: ['ledger'] })
  const customersRes = useResource('/api/customers', { refreshOn: ['ledger'] })
  const sampleRes = useResource('/api/sample-data', { refreshOn: ['ledger'] })
  const [check, setCheck] = useState({ running: false, data: null, error: null, retryAt: 0 })
  const sample = sampleState(sampleRes, listsRes, customersRes)
  const reloadSample = useCallback(() => {
    sampleRes.reload(true)
    listsRes.reload(true)
    customersRes.reload(true)
  }, [sampleRes.reload, listsRes.reload, customersRes.reload]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null

  const { state, tone } = waState(me)
  const badChecks = (check.data?.checks || []).filter(c => !c.ok).length
  const checkMeta = check.running ? (
    S.tocCheck.running
  ) : check.data ? (
    <span className={`set-toc-wa ${check.data.ok ? 'ok' : 'bad'}`}>
      <span className="status-dot" aria-hidden="true" />
      {check.data.ok ? S.tocCheck.ok : S.tocCheck.bad(badChecks)}
    </span>
  ) : (
    S.tocCheck.none
  )
  const toc = [
    {
      label: S.nav.shop,
      href: `#${SECTION_IDS.shop}`,
      // The name's own direction decides where it is cut, so a long name keeps its beginning in either script.
      meta: me.shopName ? (
        <span className="set-toc-shop" dir="auto">
          {me.shopName}
        </span>
      ) : null,
    },
    {
      label: S.pay.nav,
      href: `#${SECTION_IDS.pay}`,
      // The first way to pay ("JazzCash"); the column has no room for more.
      meta: me.payDetails ? (
        me.payDetails.methods[0].kind === 'other_wallet' ? (
          <Script text={me.payDetails.methods[0].label} />
        ) : (
          S.pay.tocKinds[me.payDetails.methods[0].kind]
        )
      ) : (
        S.pay.tocNone
      ),
    },
    {
      label: S.nav.whatsapp,
      href: `#${SECTION_IDS.whatsapp}`,
      meta: (
        <span className={`set-toc-wa ${tone}`}>
          <span className="status-dot" aria-hidden="true" />
          {S.status[state]}
        </span>
      ),
    },
    { label: S.nav.lists, href: `#${SECTION_IDS.lists}`, meta: listsRes.data ? S.tocLists(listsRes.data.length) : null },
    { label: S.nav.voice, href: `#${SECTION_IDS.voice}`, meta: me.voiceReplies ? S.on : S.off },
    { label: S.nav.language, href: `#${SECTION_IDS.language}`, meta: lang === 'ur' ? S.langUr : S.langEn },
    { label: S.nav.check, href: `#${SECTION_IDS.check}`, meta: checkMeta },
    { label: S.nav.sample, href: `#${SECTION_IDS.sample}`, meta: sample ? (sample.present ? S.tocSample.on : S.tocSample.off) : null },
    { label: S.nav.data, href: `#${SECTION_IDS.data}`, meta: <span className="latin">{S.tocData}</span> },
  ]

  return (
    <div className="set-page">
      <PageHeader eyebrow={me.shopName || undefined} title={S.title} lead={S.lead} />
      <div className="set-layout">
        <aside className="set-aside">
          <Toc items={toc} title={S.onThisPage} className="set-toc" />
        </aside>
        <div className="set-sections">
          <ProfileSection me={me} setMe={setMe} />
          <PaySection me={me} setMe={setMe} customersRes={customersRes} />
          <WhatsAppSection me={me} setMe={setMe} />
          <ListsSection listsRes={listsRes} customersRes={customersRes} />
          <VoiceSection me={me} setMe={setMe} />
          <LanguageSection setMe={setMe} />
          <CheckSection check={check} setCheck={setCheck} />
          <SampleSection status={sample} reload={reloadSample} />
          <DataSection me={me} />
          <SessionSection me={me} />
        </div>
      </div>
    </div>
  )
}
