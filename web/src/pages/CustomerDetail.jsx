import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import EntrySheet from '../components/EntrySheet.jsx'
import Icon from '../components/Icon.jsx'
import ReminderSheet from '../components/ReminderSheet.jsx'
import Sheet from '../components/Sheet.jsx'
import { useToast } from '../components/Toast.jsx'
import VoiceNote from '../components/VoiceNote.jsx'
import { FootnoteRef, Footnotes, Frame, LabeledCells, QuoteCard, SectionRail } from '../components/editorial.jsx'
import { Button, Field, LoadError, Money, Skeleton } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { dayCount, money, when } from '../lib/format.js'
import { useCommon, useLang, useStrings } from '../lib/i18n.jsx'
import { SampleBadge, isSupplier, listHref, listName, personListName, pickerLists, useListWords } from '../lib/lists.jsx'
import { useMe } from '../lib/me.jsx'
import { useResource } from '../lib/useResource.js'
import './CustomerDetail.css'

const STRINGS = {
  en: {
    back: 'All customers',
    backTo: n => `Back to ${n}`,
    kindLabel: 'Customer',
    eyebrow: (kind, list, d) => `${kind}${list ? ` · ${list}` : ''} · in your khata since ${d}`,
    eyebrowNoDate: (kind, list) => `${kind}${list ? ` · ${list}` : ''}`,
    // lead, written from the khata
    leadOwes: a => <>Owes {a}.</>,
    leadUnpaid: d => `Unpaid for ${d}.`,
    leadLastPaid: (a, on) => (
      <>
        Last paid {a} {on}.
      </>
    ),
    leadNeverPaid: 'No payment yet.',
    leadAdvance: a => <>Has paid {a} in advance; it comes off their next udhaar.</>,
    leadSettled: 'All settled — owes you nothing.',
    leadEmpty: 'Nothing written in this khata yet.',
    onDay: w => (w === 'Today' ? 'today' : w === 'Yesterday' ? 'yesterday' : `on ${w}`),
    // actions
    addUdhaar: 'Add udhaar',
    recordPayment: 'Record payment',
    sendReminder: 'Send reminder',
    call: 'Call',
    callLabel: p => `Call ${p}`,
    whatsapp: 'WhatsApp',
    addPhone: 'Add number',
    // cells
    cellPhone: 'Phone',
    cellList: 'List',
    cellAlso: 'Also called',
    cellEntries: 'Entries',
    cellFirst: 'First entry',
    notSaved: 'Not saved',
    nobody: 'No other names',
    noneYet: 'None yet',
    entriesValue: (live, voided) => (voided ? <><bdi>{live}</bdi> · <bdi>{voided} cancelled</bdi></> : live),
    // statement
    statement: 'Statement',
    statementMeta: n => `${n} ${n === 1 ? 'entry' : 'entries'} · newest first`,
    statementLead: (n, say) => (
      <>
        Every udhaar and payment for {n}, with the balance after each one. To add one without typing, send yourself {say} on WhatsApp.
      </>
    ),
    sayCredit: n => `${n} ne 500 ka sauda liya`,
    tableCaption: n => `${n}’s statement, newest entry first`,
    caption: 'Totals leave out cancelled entries.',
    colDate: 'Date',
    colDetails: 'Details',
    colUdhaar: 'Udhaar (+)',
    colPaid: 'Paid (−)',
    colBalance: 'Balance',
    total: 'Total',
    liveCount: n => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    totalUdhaar: 'Udhaar given',
    totalPaid: 'Paid',
    kindCredit: 'Udhaar',
    kindPayment: 'Paid',
    plainCredit: 'Udhaar given',
    plainPayment: 'Payment received',
    advWord: 'advance',
    settledWord: 'settled',
    sources: {
      whatsapp_voice: 'WhatsApp voice note',
      whatsapp_text: 'WhatsApp message',
      web_voice: 'Voice note on dashboard',
      web_text: 'Typed to Hisaab on dashboard',
      web: 'Added on dashboard',
      call: 'Phone call with Hisaab',
      sample: 'Sample data',
    },
    heard: 'You said',
    cancelled: 'Cancelled',
    reasons: {
      'cancelled from dashboard': 'Cancelled on the dashboard',
      undo: 'Undone by a voice note',
      corrected: 'Replaced by a correction',
      cancelled: 'Cancelled',
    },
    cancelEntry: 'Cancel',
    cancelEntryLabel: (amt, kind, date) => `Cancel ${amt} ${kind} from ${date}`,
    kindWord: { credit: 'udhaar', payment: 'payment' },
    emptyLabel: 'Say this in your own WhatsApp chat',
    emptyWrites: 'Hisaab writes',
    emptyWritesValue: n => `+Rs 500 udhaar for ${n}`,
    emptyOr: 'Or press “Add udhaar” above to type it in.',
    // void
    voidTitle: 'Cancel this entry?',
    voidDesc: (amt, kind, date) => `${amt} ${kind} from ${date} will no longer count.`,
    voidNow: 'Balance now',
    voidAfter: 'After cancelling',
    voidNote: 'The entry stays in the statement, struck through, so you always have a record.',
    voidKeep: 'Keep it',
    voidConfirm: 'Cancel entry',
    voided: (n, x, adv) => (adv ? `Entry cancelled. ${n} now has ${x} in advance.` : `Entry cancelled. ${n}’s balance is now ${x}.`),
    voidFailed: 'Could not cancel this entry. Please try again.',
    // manage
    manage: 'Manage',
    manageLead: n => `Fix how ${n}’s name is spelled, save their WhatsApp number for reminders, move them to another list, or tidy up a second khata for the same person.`,
    // move to list
    moveTitle: 'List',
    moveBody: (n, l) => `${n} is in ${l}. Moving changes only the list they appear in; their khata stays the same.`,
    moveTo: 'Move to',
    moveAction: 'Move',
    moved: (n, l) => `${n} moved to ${l}`,
    moveHasEntries: n =>
      `${n} has entries, so they cannot move between a customers list and a suppliers list: every entry would change meaning. Start a new khata in that list instead.`,
    moveFailed: 'Could not move. Please try again.',
    moveNoLists: 'You have no lists yet. Make one on the Customers page with “New list”.',
    newListLink: 'Go to Customers',
    customerLists: 'Customers lists',
    supplierLists: 'Suppliers lists',
    mergeHasEntries: 'A customer’s khata and a supplier’s khata cannot be merged once either has entries.',
    optYouOwe: x => `you owe ${x}`,
    optSupplier: 'supplier',
    editTitle: 'Name and number',
    name: 'Name',
    nameHint: 'Write it the way you say it in voice notes.',
    nameUr: 'Name in Urdu (optional)',
    nameUrPh: 'مثلاً عمر فاروق',
    phone: 'WhatsApp number (optional)',
    phonePh: '0300 1234567',
    phoneHint: 'Used to send payment reminders to their WhatsApp. Leave empty to remove.',
    needName: 'Write the customer’s name',
    badPhone: 'Enter a number like 0300 1234567',
    saveChanges: 'Save changes',
    undo: 'Undo changes',
    saved: 'Saved',
    saveFailed: 'Could not save. Please try again.',
    mergeFrame: 'Two khatas for one person?',
    mergeBody: n =>
      `If ${n} also has a khata under another spelling, merge them. Every entry moves into the khata you pick, and “${n}” becomes another name for that person.`,
    mergeAction: 'Merge with another khata',
    deleteFrame: 'Delete this khata',
    deleteBody: (n, count) =>
      count === 0
        ? `Removes ${n} from your customers. This cannot be undone.`
        : `Removes ${n} and ${count === 1 ? 'their one entry' : `all ${count} entries`} for good. This cannot be undone.`,
    deleteStillOwes: (n, x) => `${n} still owes you ${x}.`,
    deleteAction: 'Delete khata',
    // merge sheet
    mergeTitle: n => `Merge ${n} into another khata`,
    mergeDesc: n =>
      `Use this when the same person has two khatas (e.g. Umer and Umar). All entries move into the one you pick; “${n}” becomes another name for them, so future voice notes land in the right khata.`,
    mergeInto: 'Move all entries into',
    mergePick: 'Choose a customer',
    mergeSimilar: 'Similar names',
    mergeOthers: 'Everyone else',
    mergeNone: 'You have no other customers to merge with.',
    mergeLoading: 'Loading your customers…',
    mergeMoves: (n, from, to) => `${n} ${n === 1 ? 'entry moves' : 'entries move'} from ${from} to ${to}.`,
    mergeNow: t => `${t} now`,
    mergeAfter: 'After merging',
    mergeConfirm: 'Merge khatas',
    merged: t => `Merged. Everything is now in ${t}’s khata.`,
    mergeFailed: 'Could not merge. Please try again.',
    optOwes: x => `owes ${x}`,
    optAdvance: x => `advance ${x}`,
    optSettled: 'settled',
    // delete sheet
    deleteTitle: n => `Delete ${n}’s khata?`,
    deleteDesc: (n, count) =>
      count ? `This removes ${n} and all ${count} ${count === 1 ? 'entry' : 'entries'}. It cannot be undone.` : `This removes ${n} from your customers. It cannot be undone.`,
    deleteOwes: (n, x) => `${n} still owes you ${x}. After deleting, you will have no record of it.`,
    deleteType: n => `Type “${n}” to confirm`,
    deleteConfirm: 'Delete khata',
    deleted: n => `${n}’s khata deleted`,
    deleteFailed: 'Could not delete. Please try again.',
    // footnotes
    fnAlso: n => ({ lead: 'Also called.', text: `Other names Hisaab has heard for ${n} in your voice notes. Notes that use them are written in this khata.` }),
    fnBalance: n => ({
      lead: 'Balance.',
      text: `What ${n} owed you after each entry. Cancelled entries stay in the statement, struck through, and do not count.`,
    }),
    // not found
    nfEyebrow: 'Customer',
    nfTitle: 'This customer is not in your khata',
    nfBody: 'They may have been deleted, or merged into another customer.',
    // A supplier's khata reads the other way round: credit = goods the shop took on credit, balance > 0 = the shop owes them.
    sup: {
      isSup: true,
      kindLabel: 'Supplier',
      leadOwes: (a, n) => <>You owe <bdi>{n}</bdi> {a}.</>,
      leadUnpaid: d => `You have not paid them for ${d}.`,
      leadLastPaid: (a, on) => (
        <>
          You last paid them {a} {on}.
        </>
      ),
      leadNeverPaid: 'You have not paid them anything yet.',
      leadAdvance: a => <>You have paid them {a} in advance; it comes off your next purchase.</>,
      leadSettled: 'All settled — you owe them nothing.',
      addUdhaar: 'Record purchase',
      recordPayment: 'Pay supplier',
      statementLead: (n, say) => (
        <>
          Every purchase on credit from {n} and every payment you made, with what you owe after each one. To add one without typing, send yourself {say} on WhatsApp.
        </>
      ),
      sayCredit: n => `${n} se 5000 ka maal udhaar liya`,
      colUdhaar: 'Bought (+)',
      colPaid: 'Paid (−)',
      totalUdhaar: 'Bought on credit',
      totalPaid: 'You paid',
      kindCredit: 'Purchase',
      kindPayment: 'You paid',
      plainCredit: 'Goods taken on credit',
      plainPayment: 'Payment made',
      kindWord: { credit: 'purchase', payment: 'payment' },
      emptyWritesValue: n => `+Rs 5,000 purchase from ${n}`,
      emptyOr: 'Or press “Record purchase” above to type it in.',
      voided: (n, x, adv) => (adv ? `Entry cancelled. You have ${x} paid ahead with ${n}.` : `Entry cancelled. You now owe ${n} ${x}.`),
      manageLead: n => `Fix how ${n}’s name is spelled, save their number, move them to another list, or tidy up a second khata for the same supplier.`,
      phoneHint: 'Lets you call or WhatsApp them from this page. Leave empty to remove.',
      needName: 'Write the supplier’s name',
      deleteBody: (n, count) =>
        count === 0
          ? `Removes ${n} from your suppliers. This cannot be undone.`
          : `Removes ${n} and ${count === 1 ? 'their one entry' : `all ${count} entries`} for good. This cannot be undone.`,
      deleteStillOwes: (n, x) => `You still owe ${n} ${x}.`,
      deleteDesc: (n, count) =>
        count ? `This removes ${n} and all ${count} ${count === 1 ? 'entry' : 'entries'}. It cannot be undone.` : `This removes ${n} from your suppliers. It cannot be undone.`,
      deleteOwes: (n, x) => `You still owe ${n} ${x}. After deleting, you will have no record of it.`,
      fnBalance: n => ({
        lead: 'Balance.',
        text: `What you owed ${n} after each entry. Cancelled entries stay in the statement, struck through, and do not count.`,
      }),
    },
  },
  ur: {
    back: 'تمام گاہک',
    backTo: n => `⁨${n}⁩ پر واپس`,
    kindLabel: 'گاہک',
    eyebrow: (kind, list, d) => `${kind}${list ? ` · ⁨${list}⁩` : ''} · ${d} سے آپ کے کھاتے میں`,
    eyebrowNoDate: (kind, list) => `${kind}${list ? ` · ⁨${list}⁩` : ''}`,
    leadOwes: a => <>ان کے ذمے {a} ہیں۔</>,
    leadUnpaid: d => `${d} سے کوئی ادائیگی نہیں۔`,
    leadLastPaid: (a, on) => (
      <>
        آخری بار {on} {a} دیے۔
      </>
    ),
    leadNeverPaid: 'ابھی تک کوئی ادائیگی نہیں ہوئی۔',
    leadAdvance: a => <>انہوں نے {a} ایڈوانس دے رکھے ہیں، جو اگلے ادھار میں کٹ جائیں گے۔</>,
    leadSettled: 'حساب صاف ہے — ان کے ذمے کچھ نہیں۔',
    leadEmpty: 'اس کھاتے میں ابھی کچھ نہیں لکھا گیا۔',
    onDay: w => (w === 'آج' || w === 'کل' ? w : `${w} کو`),
    addUdhaar: 'ادھار لکھیں',
    recordPayment: 'وصولی لکھیں',
    sendReminder: 'یاد دہانی بھیجیں',
    call: 'کال',
    callLabel: p => `${p} پر کال کریں`,
    whatsapp: 'واٹس ایپ',
    addPhone: 'نمبر شامل کریں',
    cellPhone: 'فون',
    cellList: 'لسٹ',
    cellAlso: 'دوسرے نام',
    cellEntries: 'اندراج',
    cellFirst: 'پہلا اندراج',
    notSaved: 'محفوظ نہیں',
    nobody: 'کوئی اور نام نہیں',
    noneYet: 'ابھی نہیں',
    entriesValue: (live, voided) => (voided ? <><bdi>{live}</bdi> · <bdi>{voided} منسوخ</bdi></> : live),
    statement: 'کھاتہ',
    statementMeta: n => `${n} اندراج · نیا اندراج اوپر`,
    statementLead: (n, say) => (
      <>
        {n} کا ہر ادھار اور ہر وصولی، اور ہر اندراج کے بعد کا بقایا۔ بغیر لکھے نیا اندراج کرنے کے لیے واٹس ایپ پر اپنی چیٹ میں بھیجیں: {say}
      </>
    ),
    sayCredit: (n, nu) => (nu ? `${nu} نے 500 کا سودا لیا` : `${n} ne 500 ka sauda liya`),
    tableCaption: n => `${n} کا کھاتہ، نیا اندراج اوپر`,
    caption: 'کل رقم میں منسوخ اندراج شامل نہیں۔',
    colDate: 'تاریخ',
    colDetails: 'تفصیل',
    colUdhaar: 'ادھار (+)',
    colPaid: 'وصولی (−)',
    colBalance: 'بقایا',
    total: 'کل',
    liveCount: n => `${n} اندراج`,
    totalUdhaar: 'کل ادھار',
    totalPaid: 'کل وصولی',
    kindCredit: 'ادھار',
    kindPayment: 'وصولی',
    plainCredit: 'ادھار دیا',
    plainPayment: 'رقم وصول ہوئی',
    advWord: 'ایڈوانس',
    settledWord: 'حساب صاف',
    sources: {
      whatsapp_voice: 'واٹس ایپ وائس نوٹ',
      whatsapp_text: 'واٹس ایپ میسج',
      web_voice: 'ڈیش بورڈ سے وائس نوٹ',
      web_text: 'ڈیش بورڈ پر حساب کو لکھا',
      web: 'ڈیش بورڈ پر درج کیا',
      call: 'حساب کو فون کال',
      sample: 'نمونے کا ڈیٹا',
    },
    heard: 'آپ نے کہا',
    cancelled: 'منسوخ',
    reasons: {
      'cancelled from dashboard': 'ڈیش بورڈ سے منسوخ کیا',
      undo: 'وائس نوٹ سے واپس لیا',
      corrected: 'درستی کی وجہ سے بدلا گیا',
      cancelled: 'منسوخ کیا گیا',
    },
    cancelEntry: 'منسوخ کریں',
    cancelEntryLabel: (amt, kind, date) => `${date} کا ${amt} ${kind} منسوخ کریں`,
    kindWord: { credit: 'ادھار', payment: 'وصولی' },
    emptyLabel: 'اپنی واٹس ایپ چیٹ میں یہ کہیں',
    emptyWrites: 'حساب لکھتا ہے',
    emptyWritesValue: n => `${n} کے کھاتے میں 500 روپے ادھار`,
    emptyOr: 'یا اوپر "ادھار لکھیں" دبا کر خود لکھیں۔',
    voidTitle: 'یہ اندراج منسوخ کریں؟',
    voidDesc: (amt, kind, date) => `${date} کا ${amt} ${kind} اب حساب میں شامل نہیں رہے گا۔`,
    voidNow: 'ابھی بقایا',
    voidAfter: 'منسوخی کے بعد',
    voidNote: 'اندراج کھاتے میں کٹا ہوا نظر آئے گا تاکہ ریکارڈ ہمیشہ رہے۔',
    voidKeep: 'رہنے دیں',
    voidConfirm: 'اندراج منسوخ کریں',
    voided: (n, x, adv) => (adv ? `اندراج منسوخ ہو گیا۔ ${n} کا ایڈوانس اب ${x} ہے۔` : `اندراج منسوخ ہو گیا۔ ${n} کا بقایا اب ${x} ہے۔`),
    voidFailed: 'منسوخ نہیں ہو سکا، دوبارہ کوشش کریں۔',
    manage: 'ترتیبات',
    manageLead: n => `${n} کے نام کی املا درست کریں، یاد دہانی کے لیے ان کا واٹس ایپ نمبر محفوظ کریں، انہیں کسی اور لسٹ میں منتقل کریں، یا ایک ہی شخص کا دوسرا کھاتہ اس میں ملائیں۔`,
    moveTitle: 'لسٹ',
    moveBody: (n, l) => `${n} ⁨${l}⁩ میں ہیں۔ منتقل کرنے سے صرف ان کی لسٹ بدلتی ہے؛ کھاتہ وہی رہتا ہے۔`,
    moveTo: 'اس لسٹ میں منتقل کریں',
    moveAction: 'منتقل کریں',
    moved: (n, l) => `${n} کو ⁨${l}⁩ میں منتقل کر دیا`,
    moveHasEntries: n =>
      `${n} کے کھاتے میں اندراج ہیں، اس لیے انہیں گاہکوں اور سپلائرز کی لسٹ کے درمیان منتقل نہیں کیا جا سکتا: ہر اندراج کا مطلب بدل جائے گا۔ اس کی بجائے اس لسٹ میں نیا کھاتہ کھولیں۔`,
    moveFailed: 'منتقل نہیں ہو سکا، دوبارہ کوشش کریں۔',
    moveNoLists: 'ابھی آپ کی کوئی لسٹ نہیں۔ گاہکوں والے صفحے پر نئی لسٹ بنائیں۔',
    newListLink: 'گاہکوں والے صفحے پر جائیں',
    customerLists: 'گاہکوں کی لسٹیں',
    supplierLists: 'سپلائرز کی لسٹیں',
    mergeHasEntries: 'گاہک اور سپلائر کے کھاتے، اندراج ہونے کے بعد، آپس میں نہیں ملائے جا سکتے۔',
    optYouOwe: x => `آپ نے ${x} دینے ہیں`,
    optSupplier: 'سپلائر',
    editTitle: 'نام اور نمبر',
    name: 'نام',
    nameHint: 'ویسے لکھیں جیسے آپ وائس نوٹ میں بولتے ہیں۔',
    nameUr: 'اردو میں نام (اختیاری)',
    nameUrPh: 'مثلاً عمر فاروق',
    phone: 'واٹس ایپ نمبر (اختیاری)',
    phonePh: '0300 1234567',
    phoneHint: 'ادائیگی کی یاد دہانی ان کے واٹس ایپ پر بھیجنے کے لیے۔ ہٹانے کے لیے خالی چھوڑ دیں۔',
    needName: 'گاہک کا نام لکھیں',
    badPhone: 'نمبر ایسے لکھیں: 0300 1234567',
    saveChanges: 'تبدیلیاں محفوظ کریں',
    undo: 'تبدیلیاں واپس لیں',
    saved: 'محفوظ ہو گیا',
    saveFailed: 'محفوظ نہیں ہو سکا، دوبارہ کوشش کریں۔',
    mergeFrame: 'ایک شخص کے دو کھاتے؟',
    mergeBody: n =>
      `اگر ${n} کا کسی اور املا سے بھی کھاتہ بنا ہوا ہے تو دونوں ملا دیں۔ سارے اندراج آپ کے چنے ہوئے کھاتے میں چلے جائیں گے، اور "${n}" اس شخص کا دوسرا نام بن جائے گا۔`,
    mergeAction: 'دوسرے کھاتے میں ملائیں',
    deleteFrame: 'یہ کھاتہ حذف کریں',
    deleteBody: (n, count) =>
      count === 0 ? `${n} آپ کے گاہکوں سے ہٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔` : `${n} اور ان کے ${count} اندراج ہمیشہ کے لیے مٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔`,
    deleteStillOwes: (n, x) => `${n} کے ذمے ابھی ${x} باقی ہیں۔`,
    deleteAction: 'کھاتہ حذف کریں',
    mergeTitle: n => `${n} کو دوسرے کھاتے میں ملائیں`,
    mergeDesc: n =>
      `یہ تب استعمال کریں جب ایک ہی شخص کے دو کھاتے بن جائیں (مثلاً Umer اور Umar)۔ سارے اندراج آپ کے چنے ہوئے کھاتے میں چلے جائیں گے، اور "${n}" ان کا دوسرا نام بن جائے گا تاکہ آئندہ وائس نوٹ صحیح کھاتے میں جائیں۔`,
    mergeInto: 'سارے اندراج اس کھاتے میں منتقل کریں',
    mergePick: 'گاہک چنیں',
    mergeSimilar: 'ملتے جلتے نام',
    mergeOthers: 'باقی گاہک',
    mergeNone: 'ملانے کے لیے کوئی اور گاہک نہیں۔',
    mergeLoading: 'گاہک لوڈ ہو رہے ہیں…',
    mergeMoves: (n, from, to) => `${from} کے ${n} اندراج ${to} کے کھاتے میں چلے جائیں گے۔`,
    mergeNow: t => `${t} کا ابھی بقایا`,
    mergeAfter: 'ملانے کے بعد',
    mergeConfirm: 'کھاتے ملائیں',
    merged: t => `کھاتے مل گئے۔ سب کچھ اب ${t} کے کھاتے میں ہے۔`,
    mergeFailed: 'کھاتے نہیں مل سکے، دوبارہ کوشش کریں۔',
    optOwes: x => `بقایا ${x}`,
    optAdvance: x => `ایڈوانس ${x}`,
    optSettled: 'حساب صاف',
    deleteTitle: n => `${n} کا کھاتہ حذف کریں؟`,
    deleteDesc: (n, count) =>
      count ? `${n} اور ان کے ${count} اندراج ہمیشہ کے لیے مٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔` : `${n} آپ کے گاہکوں سے ہٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔`,
    deleteOwes: (n, x) => `${n} کے ذمے ابھی ${x} باقی ہیں۔ حذف کرنے کے بعد اس کا کوئی ریکارڈ نہیں رہے گا۔`,
    deleteType: n => `تصدیق کے لیے "${n}" لکھیں`,
    deleteConfirm: 'کھاتہ حذف کریں',
    deleted: n => `${n} کا کھاتہ حذف ہو گیا`,
    deleteFailed: 'حذف نہیں ہو سکا، دوبارہ کوشش کریں۔',
    fnAlso: n => ({ lead: 'دوسرے نام۔', text: `وہ نام جو حساب نے آپ کے وائس نوٹس میں ${n} کے لیے سنے۔ ان ناموں والے وائس نوٹ اسی کھاتے میں لکھے جاتے ہیں۔` }),
    fnBalance: n => ({
      lead: 'بقایا۔',
      text: `ہر اندراج کے بعد ${n} کے ذمے کتنا تھا۔ منسوخ اندراج کھاتے میں کٹے ہوئے نظر آتے ہیں اور حساب میں شامل نہیں ہوتے۔`,
    }),
    nfEyebrow: 'گاہک',
    nfTitle: 'یہ گاہک آپ کے کھاتے میں نہیں',
    nfBody: 'شاید حذف ہو گیا ہے یا کسی اور گاہک میں ملا دیا گیا ہے۔',
    sup: {
      isSup: true,
      kindLabel: 'سپلائر',
      leadOwes: (a, n) => <>آپ نے <bdi>{n}</bdi> کے {a} دینے ہیں۔</>,
      leadUnpaid: d => `${d} سے آپ نے انہیں کچھ ادا نہیں کیا۔`,
      leadLastPaid: (a, on) => (
        <>
          آپ نے آخری بار {on} انہیں {a} دیے۔
        </>
      ),
      leadNeverPaid: 'آپ نے ابھی تک انہیں کوئی ادائیگی نہیں کی۔',
      leadAdvance: a => <>آپ نے انہیں {a} ایڈوانس دے رکھے ہیں، جو اگلی خریداری میں کٹ جائیں گے۔</>,
      leadSettled: 'حساب صاف ہے — آپ نے انہیں کچھ نہیں دینا۔',
      addUdhaar: 'خریداری لکھیں',
      recordPayment: 'سپلائر کو ادائیگی',
      statementLead: (n, say) => (
        <>
          {n} سے ادھار لیا ہر مال اور آپ کی ہر ادائیگی، اور ہر اندراج کے بعد آپ نے کتنا دینا ہے۔ بغیر لکھے نیا اندراج کرنے کے لیے واٹس ایپ پر اپنی چیٹ میں بھیجیں: {say}
        </>
      ),
      sayCredit: (n, nu) => (nu ? `${nu} سے 5000 کا مال ادھار لیا` : `${n} se 5000 ka maal udhaar liya`),
      colUdhaar: 'خریدا (+)',
      colPaid: 'ادا کیا (−)',
      totalUdhaar: 'کل ادھار مال',
      totalPaid: 'کل ادائیگی',
      kindCredit: 'خریداری',
      kindPayment: 'ادائیگی',
      plainCredit: 'مال ادھار لیا',
      plainPayment: 'ادائیگی کی',
      kindWord: { credit: 'خریداری', payment: 'ادائیگی' },
      emptyWritesValue: n => `${n} سے 5000 روپے کا ادھار مال`,
      emptyOr: 'یا اوپر خریداری لکھیں دبا کر خود لکھیں۔',
      voided: (n, x, adv) => (adv ? `اندراج منسوخ ہو گیا۔ ${n} کے پاس آپ کا ${x} ایڈوانس ہے۔` : `اندراج منسوخ ہو گیا۔ اب آپ نے ${n} کے ${x} دینے ہیں۔`),
      manageLead: n => `${n} کے نام کی املا درست کریں، ان کا نمبر محفوظ کریں، انہیں کسی اور لسٹ میں منتقل کریں، یا اسی سپلائر کا دوسرا کھاتہ اس میں ملائیں۔`,
      phoneHint: 'اس صفحے سے انہیں کال یا واٹس ایپ کرنے کے لیے۔ ہٹانے کے لیے خالی چھوڑ دیں۔',
      needName: 'سپلائر کا نام لکھیں',
      deleteBody: (n, count) =>
        count === 0 ? `${n} آپ کے سپلائرز سے ہٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔` : `${n} اور ان کے ${count} اندراج ہمیشہ کے لیے مٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔`,
      deleteStillOwes: (n, x) => `آپ نے ابھی ${n} کے ${x} دینے ہیں۔`,
      deleteDesc: (n, count) =>
        count ? `${n} اور ان کے ${count} اندراج ہمیشہ کے لیے مٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔` : `${n} آپ کے سپلائرز سے ہٹ جائیں گے۔ یہ واپس نہیں ہو سکتا۔`,
      deleteOwes: (n, x) => `آپ نے ابھی ${n} کے ${x} دینے ہیں۔ حذف کرنے کے بعد اس کا کوئی ریکارڈ نہیں رہے گا۔`,
      fnBalance: n => ({
        lead: 'بقایا۔',
        text: `ہر اندراج کے بعد آپ نے ${n} کے کتنے دینے تھے۔ منسوخ اندراج کھاتے میں کٹے ہوئے نظر آتے ہیں اور حساب میں شامل نہیں ہوتے۔`,
      }),
    },
  },
}

/** The strings for this person: a supplier's khata swaps in the supplier wording. */
const kindStrings = (S, person) => (isSupplier(person) ? { ...S, ...S.sup } : S)

const SOURCE_ICON = { whatsapp_voice: 'mic', whatsapp_text: 'message', web_voice: 'mic', web_text: 'keyboard', web: 'keyboard', call: 'phone', sample: 'info' }
const TZ = 'Asia/Karachi'
const URDU_SCRIPT = /[؀-ۿ]/
const scriptClass = text => (URDU_SCRIPT.test(text) ? 'ur' : 'latin')
const cx = (...parts) => parts.filter(Boolean).join(' ')

/** "12 Sep 2026" / "12 September 2026" — always with the year. */
const fullDate = (ts, lang, month = 'short') =>
  new Date(ts).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: TZ, day: 'numeric', month, year: 'numeric' })

/** "Today" → "today" mid-sentence (English only). */
const midSentence = (text, lang) => (lang === 'en' ? text.replace(/^(Today|Yesterday)/, w => w.toLowerCase()) : text)

/** "3:40 pm" / "دوپہر 3:40" — Urdu gets its own day-part word instead of a Latin AM/PM. */
function clock(ts, lang) {
  if (lang !== 'ur') return new Date(ts).toLocaleTimeString('en-PK', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ts))
      .map(p => [p.type, p.value]),
  )
  const h = Number(parts.hour)
  const period = h >= 4 && h < 12 ? 'صبح' : h >= 12 && h < 16 ? 'دوپہر' : h >= 16 && h < 19 ? 'شام' : 'رات'
  return `${period} ${h % 12 || 12}:${parts.minute}`
}

/** Mirrors the server's normalizePhone: local numbers are 03xx + 7 digits, international 10–15 digits. */
const validPhone = value => {
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

/** Totals over the entries that still count, plus the oldest entry's date (cancelled ones included) and the last payment. */
function summarize(entries) {
  let given = 0
  let received = 0
  let live = 0
  let lastPayment = null
  let first = null
  for (const e of entries) {
    if (e.createdAt && (first == null || e.createdAt < first)) first = e.createdAt
    if (e.voidedAt) continue
    live++
    if (e.kind === 'credit') given += e.amount
    else {
      received += e.amount
      if (!lastPayment) lastPayment = e // entries arrive newest first
    }
  }
  return { given, received, live, voided: entries.length - live, lastPayment, first }
}

/** Keyed by id so moving to another customer (e.g. after a merge) starts clean: no stale data, sheets or refetches. */
export default function CustomerDetailPage() {
  const { id } = useParams()
  return <CustomerDetail key={id} id={id} />
}

function CustomerDetail({ id }) {
  const base = useStrings(STRINGS)
  const W = useListWords()
  const { lang } = useLang()
  const { me } = useMe()
  const location = useLocation()
  // Read once: a #footnote or rail jump replaces the history state, and the way back to the filtered list must survive it.
  const [back] = useState(() => location.state?.back)
  const backTo = typeof back === 'string' && back.startsWith('?') ? `/app/customers${back}` : '/app/customers'
  const wide = useMedia('(min-width: 720px)')
  const { data: c, error, reload } = useResource(`/api/customers/${encodeURIComponent(id)}`, { refreshOn: ['ledger'] })
  const S = kindStrings(base, c)
  const supplier = isSupplier(c)
  // Came from one list's tab: the back link names that list.
  const backList = typeof back === 'string' && back.startsWith('?') ? new URLSearchParams(back).get('list') : null
  const backLabel =
    backList === 'general' && c && !c.listId ? S.backTo(W.general) : c && backList && backList === c.listId ? S.backTo(personListName(c, lang, W)) : S.back
  const phoneRef = useRef(null)

  // Sheets: one at a time. Entry/void sheets keep a snapshot so a realtime refresh never resets a half-typed form.
  const [sheet, setSheet] = useState(null)
  const [entry, setEntry] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const closeSheet = useCallback(() => setSheet(null), [])
  const closeEntry = useCallback(() => setEntry(null), [])
  const closeVoid = useCallback(() => setVoiding(null), [])
  const refresh = useCallback(() => reload(true), [reload])
  const stats = useMemo(() => summarize(c?.entries || []), [c?.entries])

  // Cancelling removes the entry's Cancel button, where the sheet hands focus back: once the refresh shows the
  // entry cancelled, keep keyboard focus on that entry instead of dropping it to the top of the page.
  const voidedId = useRef(null)
  const markVoided = useCallback(entryId => {
    voidedId.current = entryId
  }, [])
  useEffect(() => {
    const entryId = voidedId.current
    if (!entryId || voiding || !c?.entries?.some(e => e.id === entryId && e.voidedAt)) return
    voidedId.current = null
    const active = document.activeElement
    if (!active || active === document.body) document.getElementById(`cd-entry-${entryId}`)?.focus({ preventScroll: true })
  }, [c, voiding])

  const notFound = error?.status === 404

  useEffect(() => {
    if (!c?.name) return
    const before = document.title
    document.title = `${c.name} · ${me?.shopName || 'Hisaab'}`
    return () => {
      document.title = before
    }
  }, [c?.name, me?.shopName])

  if (notFound) return <NotFoundCustomer S={S} backTo={backTo} />
  if (!c && error) {
    return (
      <div className="cd-page">
        <BackLink label={backLabel} to={backTo} />
        <LoadError onRetry={reload} />
      </div>
    )
  }
  if (!c) return <DetailSkeleton S={S} backTo={backTo} />

  const entries = c.entries || []
  const aliases = c.aliases || []
  const openEntry = kind => setEntry({ kind, customer: { id: c.id, name: c.name, balance: c.balance, listKind: c.listKind } })
  const [primary, secondary] = lang === 'ur' && c.nameUrdu ? [c.nameUrdu, c.name] : [c.name, c.nameUrdu || '']
  // The example sentence in the shopkeeper's own words: Urdu script when we know the Urdu name, else Roman Urdu.
  const sayText = S.sayCredit(c.name, c.nameUrdu)
  // dir=auto isolates the quote with its own direction, so a Roman sentence in the Urdu UI keeps its quote marks the right way round.
  const say = (
    <q className={cx('cd-say', scriptClass(sayText))} dir="auto">
      {sayText}
    </q>
  )
  // A customer row can be created after its oldest entry (a catch-up or an import): they have been in the khata since whichever came first.
  const since = stats.first && (!c.createdAt || stats.first < c.createdAt) ? stats.first : c.createdAt
  // The list they are in (null = General: the eyebrow leaves it out, the List cell says General).
  const listLabel = c.listId ? personListName(c, lang, W) : null

  const focusPhone = () => {
    const el = phoneRef.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  // Footnotes are numbered in reading order: "Also called" sits in the header, "Balance" in the statement's
  // table header (phones show the statement as lines without it, so that note is left out there).
  const notes = []
  if (aliases.length) notes.push({ id: 'cd-also', ...S.fnAlso(c.name) })
  if (entries.length && wide) notes.push({ id: 'cd-balance', ...S.fnBalance(c.name) })
  const noteRef = noteId => <FootnoteRef n={notes.findIndex(n => n.id === noteId) + 1} id={noteId} />

  const cells = [
    {
      key: 'phone',
      label: S.cellPhone,
      value: c.phoneLocal ? (
        <bdi className="num" dir="ltr">{c.phoneLocal}</bdi>
      ) : (
        <span className="cd-quiet">{S.notSaved}</span>
      ),
    },
    {
      key: 'list',
      label: S.cellList,
      value: (
        <Link className={cx('cd-list-link', supplier && 'lst-payable')} to={listHref(c.listId)}>
          <bdi dir="auto">{listLabel || W.general}</bdi>
        </Link>
      ),
    },
    {
      key: 'also',
      label: S.cellAlso,
      value: aliases.length ? (
        <>
          <bdi className="latin">{aliases.join(', ')}</bdi>
          {noteRef('cd-also')}
        </>
      ) : (
        <span className="cd-quiet">{S.nobody}</span>
      ),
    },
    { key: 'entries', label: S.cellEntries, value: S.entriesValue(stats.live, stats.voided) },
    { key: 'first', label: S.cellFirst, value: stats.first ? fullDate(stats.first, lang) : <span className="cd-quiet">{S.noneYet}</span> },
  ]

  return (
    <div className="cd-page">
      <BackLink label={backLabel} to={backTo} />

      <header className="page-header cd-header">
        <div className="page-header-text">
          <p className="eyebrow cd-eyebrow">
            <span>{since ? S.eyebrow(S.kindLabel, listLabel, fullDate(since, lang, 'long')) : S.eyebrowNoDate(S.kindLabel, listLabel)}</span>
            {c.sample && <SampleBadge W={W} />}
          </p>
          <h1 className={cx('cd-title', scriptClass(primary) === 'latin' && 'is-latin')}>
            <bdi className={scriptClass(primary)} dir="auto">{primary}</bdi>
          </h1>
          {secondary && (
            <p className="cd-title-alt">
              <bdi className={scriptClass(secondary)} lang={URDU_SCRIPT.test(secondary) ? 'ur' : 'en'}>
                {secondary}
              </bdi>
            </p>
          )}
          <p className="lead cd-lead">
            <Lead c={c} stats={stats} S={S} lang={lang} name={primary} />
          </p>
        </div>
        <div className="actions">
          <Button variant="primary" icon="plus" onClick={() => openEntry('credit')}>{S.addUdhaar}</Button>
          <Button icon="minus" onClick={() => openEntry('payment')}>{S.recordPayment}</Button>
          {c.balance > 0 && !supplier && (
            <Button icon="bell" onClick={() => setSheet('reminder')}>{S.sendReminder}</Button>
          )}
          {c.phone ? (
            <>
              <Button variant="ghost" icon="phone" href={`tel:+${c.phone}`} aria-label={S.callLabel(c.phoneLocal)}>
                {S.call}
              </Button>
              <Button variant="ghost" icon="whatsapp" href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer">
                {S.whatsapp}
              </Button>
            </>
          ) : (
            <Button variant="ghost" icon="plus" onClick={focusPhone}>{S.addPhone}</Button>
          )}
        </div>
        <LabeledCells className="cd-cells" tone="plain" min={150} cells={cells} />
      </header>

      <section className="section cd-statement" id="cd-statement" aria-labelledby="cd-statement-h">
        <div className="section-head">
          <h2 id="cd-statement-h">{S.statement}</h2>
          {entries.length > 0 && <span className="meta">{S.statementMeta(entries.length)}</span>}
        </div>
        {entries.length === 0 ? (
          <div className="cd-empty">
            <QuoteCard label={S.emptyLabel} cells={[{ label: S.emptyWrites, value: S.emptyWritesValue(primary) }]}>
              <bdi className={scriptClass(sayText)}>“{sayText}”</bdi>
            </QuoteCard>
            <p className="body-serif cd-empty-or">{S.emptyOr}</p>
          </div>
        ) : (
          <>
            <p className="section-lead">{S.statementLead(primary, say)}</p>
            {wide ? (
              <StatementTable c={c} entries={entries} stats={stats} S={S} lang={lang} onVoid={setVoiding} balanceRef={noteRef('cd-balance')} />
            ) : (
              <StatementList c={c} entries={entries} stats={stats} S={S} lang={lang} onVoid={setVoiding} />
            )}
            <p className="caption cd-caption">{S.caption}</p>
          </>
        )}
      </section>

      <section className="section cd-manage" id="cd-manage" aria-labelledby="cd-manage-h">
        <div className="section-head">
          <h2 id="cd-manage-h">{S.manage}</h2>
        </div>
        <p className="section-lead">{S.manageLead(primary)}</p>
        <div className="cd-manage-grid">
          <EditFrame customer={c} S={S} onSaved={refresh} phoneRef={phoneRef} />
          <MoveFrame customer={c} S={S} W={W} lang={lang} entries={stats.live} onSaved={refresh} />
          <Frame title={S.mergeFrame} className="cd-tool">
            <p className="cd-tool-text">{S.mergeBody(c.name)}</p>
            <Button icon="merge" onClick={() => setSheet('merge')}>{S.mergeAction}</Button>
          </Frame>
          <Frame title={S.deleteFrame} className="cd-tool">
            <p className="cd-tool-text">{S.deleteBody(c.name, entries.length)}</p>
            {c.balance > 0 && (
              <p className="cd-tool-warn">
                <Icon name="alert" size="sm" />
                <span>{S.deleteStillOwes(c.name, money(c.balance))}</span>
              </p>
            )}
            <Button variant="danger" icon="trash" onClick={() => setSheet('delete')}>{S.deleteAction}</Button>
          </Frame>
        </div>
      </section>

      {notes.length > 0 && <Footnotes className="cd-notes" items={notes} />}
      <SectionRail
        sections={[
          { id: 'cd-statement', label: S.statement },
          { id: 'cd-manage', label: S.manage },
        ]}
      />

      <EntrySheet open={Boolean(entry)} onClose={closeEntry} customer={entry?.customer} kind={entry?.kind || 'credit'} onSaved={refresh} />
      <ReminderSheet open={sheet === 'reminder'} onClose={closeSheet} customer={c} onChanged={refresh} />
      <VoidSheet entry={voiding} customer={c} onClose={closeVoid} onVoided={markVoided} onDone={refresh} />
      <MergeSheet open={sheet === 'merge'} onClose={closeSheet} customer={c} back={back} />
      <DeleteSheet open={sheet === 'delete'} onClose={closeSheet} customer={c} backTo={backTo} />
    </div>
  )
}

/** The serif lead, written from this customer's khata. */
function Lead({ c, stats, S, lang, name }) {
  const amount = (value, tone) => <bdi className={cx('cd-lead-amt', tone)}>{money(value)}</bdi>
  const lastPaid = stats.lastPayment
    ? S.leadLastPaid(amount(stats.lastPayment.amount), S.onDay(when(stats.lastPayment.createdAt, lang, { withTime: false })))
    : null

  if (!c.entries?.length) return S.leadEmpty
  if (c.balance > 0) {
    const days = c.unpaidDays ?? 0
    return (
      <>
        {S.leadOwes(amount(c.balance, S.isSup ? 'payable' : 'owed'), name)} {days > 0 && <>{S.leadUnpaid(dayCount(days, lang))} </>}
        {lastPaid || S.leadNeverPaid}
      </>
    )
  }
  if (c.balance < 0) {
    return (
      <>
        {S.leadAdvance(amount(c.balance, S.isSup ? 'neutral' : 'paid'))} {lastPaid}
      </>
    )
  }
  return (
    <>
      {S.leadSettled} {lastPaid}
    </>
  )
}

function BackLink({ label, to }) {
  return (
    <Link to={to} className="cd-back">
      <Icon name="arrow-left" className="flip-rtl" />
      <span>{label}</span>
    </Link>
  )
}

function NotFoundCustomer({ S, backTo }) {
  return (
    <div className="cd-page">
      <BackLink label={S.back} to={backTo} />
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">{S.nfEyebrow}</p>
          <h1>{S.nfTitle}</h1>
          <p className="lead">{S.nfBody}</p>
        </div>
        <div className="actions">
          <Button variant="primary" to={backTo} icon="users">{S.back}</Button>
        </div>
      </header>
    </div>
  )
}

function DetailSkeleton({ S, backTo }) {
  return (
    <div className="cd-page" aria-busy="true">
      <BackLink label={S.back} to={backTo} />
      <div className="page-header cd-skel-head">
        <Skeleton width={260} height={14} />
        <Skeleton width="min(420px, 80%)" height={46} style={{ marginTop: 20 }} />
        <Skeleton width="min(600px, 100%)" height={22} style={{ marginTop: 28 }} />
        <Skeleton width="min(380px, 70%)" height={22} style={{ marginTop: 10 }} />
        <div className="cd-skel-pills">
          {[128, 150, 140].map(w => (
            <Skeleton key={w} width={w} height={40} style={{ borderRadius: 999 }} />
          ))}
        </div>
        <div className="cd-skel-cells">
          {[0, 1, 2, 3].map(i => (
            <div key={i}>
              <Skeleton width={56} height={10} />
              <Skeleton width={`${70 - i * 8}%`} height={14} style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="cd-skel-table">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="cd-skel-row">
            <Skeleton width={56} height={14} />
            <Skeleton width={`${46 - i * 6}%`} height={14} />
            <span className="cd-skel-bal">
              <Skeleton width={72} height={14} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- statement */

function EntryAmount({ e, size, S }) {
  const voided = Boolean(e.voidedAt)
  // A supplier purchase adds to what the shop owes (payable); paying a supplier is money going out, not money received.
  const tone = voided ? 'neutral' : e.kind === 'credit' ? (S.isSup ? 'payable' : 'owed') : S.isSup ? 'neutral' : 'paid'
  return <Money value={e.amount} tone={tone} sign={e.kind} size={size} className={voided ? 'cd-struck' : ''} />
}

/** Running balance with the word that says what a zero or a negative means. */
function RunningBalance({ value, S, size }) {
  if (S.isSup) return <SupplierBalance value={value} S={S} size={size} />
  if (value > 0) return <Money value={value} tone="owed" size={size} />
  return (
    <>
      <Money value={value} tone={value < 0 ? 'paid' : 'neutral'} size={size} />
      <span className={cx('cd-word', value < 0 && 'paid')}>{value < 0 ? S.advWord : S.settledWord}</span>
    </>
  )
}

/** A supplier balance: "you owe" in the payable colour, "paid ahead" for an advance, "settled" at zero. */
function SupplierBalance({ value, S, size }) {
  const W = useListWords()
  if (value === 0) {
    return (
      <>
        <Money value={0} tone="neutral" size={size} />
        <span className="cd-word">{S.settledWord}</span>
      </>
    )
  }
  return (
    <>
      <Money value={value} tone={value > 0 ? 'payable' : 'neutral'} size={size} />
      <span className={cx('cd-word', value > 0 && 'payable')}>{value > 0 ? W.youOwe : W.paidAhead}</span>
    </>
  )
}

/** A balance inside a sheet's labelled cell: amount and word side by side. */
function SheetBalance({ value, S, size }) {
  return (
    <span className="cd-sheet-bal">
      <RunningBalance value={value} S={S} size={size} />
    </span>
  )
}

function cancelLabel(e, S, lang) {
  return S.cancelEntryLabel(money(e.amount), S.kindWord[e.kind], midSentence(when(e.createdAt, lang, { withTime: false }), lang))
}

function EntryDetails({ e, S, lang, onVoid }) {
  const voided = Boolean(e.voidedAt)
  const items = (e.items || []).filter(Boolean)
  const title = items.length ? items.join(', ') : e.note || (e.kind === 'credit' ? S.plainCredit : S.plainPayment)
  return (
    <div className="cd-detail">
      <span className="cd-detail-title">
        <bdi>{title}</bdi>
      </span>
      {items.length > 0 && e.note && (
        <span className="cd-detail-note">
          <bdi>{e.note}</bdi>
        </span>
      )}
      {voided && (
        <span className="cd-void">
          <span className="badge outline">{S.cancelled}</span>
          {e.voidReason && <span>{S.reasons[e.voidReason] || e.voidReason}</span>}
        </span>
      )}
      {e.audio && (
        <div className="cd-voice">
          <VoiceNote src={`/media/${e.audio}`} seconds={e.audioSeconds} />
        </div>
      )}
      {(e.transcript || e.transcriptRoman) && (
        <p className="cd-heard">
          <span className="label">{S.heard}</span>
          {e.transcript ? (
            <span className="ur" lang="ur">{e.transcript}</span>
          ) : (
            <bdi className="latin cd-heard-roman">“{e.transcriptRoman}”</bdi>
          )}
        </p>
      )}
      <div className="cd-detail-foot">
        <span className="badge outline cd-source">
          <Icon name={SOURCE_ICON[e.source] || 'keyboard'} />
          {S.sources[e.source] || S.sources.web}
        </span>
        {!voided && (
          <Button variant="ghost" size="sm" className="cd-cancel" onClick={() => onVoid(e)} aria-label={cancelLabel(e, S, lang)}>
            {S.cancelEntry}
          </Button>
        )}
      </div>
    </div>
  )
}

function StatementTable({ c, entries, stats, S, lang, onVoid, balanceRef }) {
  return (
    <div className="grid-table-wrap">
      <table className="grid-table cd-table">
        <caption className="sr-only">{S.tableCaption(c.name)}</caption>
        <thead>
          <tr>
            <th scope="col">{S.colDate}</th>
            <th scope="col">{S.colDetails}</th>
            <th scope="col" className="end cd-amt">{S.colUdhaar}</th>
            <th scope="col" className="end cd-amt">{S.colPaid}</th>
            <th scope="col" className="hl end cd-amt">
              {S.colBalance}
              {balanceRef}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const voided = Boolean(e.voidedAt)
            return (
              <tr key={e.id} id={`cd-entry-${e.id}`} className={voided ? 'is-void' : undefined} tabIndex={voided ? -1 : undefined}>
                <th scope="row" className="cd-date">
                  {when(e.createdAt, lang, { withTime: false })}
                  <span className="sub">{clock(e.createdAt, lang)}</span>
                </th>
                <td>
                  <EntryDetails e={e} S={S} lang={lang} onVoid={onVoid} />
                </td>
                <td className="end cd-amt">{e.kind === 'credit' && <EntryAmount e={e} S={S} />}</td>
                <td className="end cd-amt">{e.kind === 'payment' && <EntryAmount e={e} S={S} />}</td>
                <td className="hl end cd-amt">{voided ? <span className="cd-dash">—</span> : <RunningBalance value={e.runningBalance} S={S} />}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              {S.total}
              <span className="sub">{S.liveCount(stats.live)}</span>
            </th>
            <td className="end cd-amt">
              <Money value={stats.given} tone={stats.given ? (S.isSup ? 'payable' : 'owed') : 'neutral'} sign={stats.given ? 'credit' : undefined} />
            </td>
            <td className="end cd-amt">
              <Money value={stats.received} tone={stats.received && !S.isSup ? 'paid' : 'neutral'} sign={stats.received ? 'payment' : undefined} />
            </td>
            <td className="hl end cd-amt">
              <RunningBalance value={c.balance} S={S} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Phones: one framed statement, each entry with its balance in a sage band. */
function StatementList({ c, entries, stats, S, lang, onVoid }) {
  return (
    <div className="cd-lines-wrap">
      <ol className="cd-lines" aria-label={S.tableCaption(c.name)}>
        {entries.map(e => {
          const voided = Boolean(e.voidedAt)
          return (
            <li key={e.id} id={`cd-entry-${e.id}`} className={cx('cd-line', voided && 'is-void')} tabIndex={voided ? -1 : undefined}>
              <div className="cd-line-head">
                <span className="cd-line-when">
                  <span className="label">{e.kind === 'credit' ? S.kindCredit : S.kindPayment}</span>
                  <span className="cd-line-date">
                    {when(e.createdAt, lang, { withTime: false })} · {clock(e.createdAt, lang)}
                  </span>
                </span>
                <EntryAmount e={e} S={S} size="lg" />
              </div>
              <EntryDetails e={e} S={S} lang={lang} onVoid={onVoid} />
              <div className="cd-line-bal">
                <span className="label">{S.colBalance}</span>
                <span className="cd-line-bal-amt">{voided ? <span className="cd-dash">—</span> : <RunningBalance value={e.runningBalance} S={S} />}</span>
              </div>
            </li>
          )
        })}
      </ol>
      <LabeledCells
        className="cd-line-totals"
        tone="plain"
        min={140}
        cells={[
          { key: 'given', label: S.totalUdhaar, value: <Money value={stats.given} tone={stats.given ? (S.isSup ? 'payable' : 'owed') : 'neutral'} sign={stats.given ? 'credit' : undefined} /> },
          { key: 'paid', label: S.totalPaid, value: <Money value={stats.received} tone={stats.received && !S.isSup ? 'paid' : 'neutral'} sign={stats.received ? 'payment' : undefined} /> },
          { key: 'bal', label: S.colBalance, value: <span className="cd-line-bal-amt"><RunningBalance value={c.balance} S={S} /></span> },
        ]}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- manage */

function EditFrame({ customer, S, onSaved, phoneRef }) {
  const toast = useToast()
  // `draft` is null until the owner types, so a realtime refresh updates the fields without wiping what is being typed.
  const base = useMemo(
    () => ({ name: customer.name, nameUrdu: customer.nameUrdu || '', phone: customer.phoneLocal || '' }),
    [customer.name, customer.nameUrdu, customer.phoneLocal],
  )
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const form = draft || base
  const dirty = Boolean(draft) && (draft.name !== base.name || draft.nameUrdu !== base.nameUrdu || draft.phone !== base.phone)

  const set = key => e => {
    const value = e.target.value
    setDraft(d => ({ ...(d || base), [key]: value }))
  }

  const undo = () => {
    setDraft(null)
    setErrors({})
  }

  async function submit(e) {
    e.preventDefault()
    if (busy || !dirty) return
    const next = {}
    if (!form.name.trim()) next.name = S.needName
    if (!validPhone(form.phone)) next.phone = S.badPhone
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await api(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        body: { name: form.name.trim(), nameUrdu: form.nameUrdu.trim(), phone: form.phone.trim() },
      })
      toast.success(S.saved)
      await onSaved()
      setDraft(null)
    } catch (err) {
      if (err?.code === 'bad_phone') setErrors({ phone: S.badPhone })
      else toast.error(S.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame title={S.editTitle} className="cd-tool cd-edit">
      <form className="cd-form" onSubmit={submit} noValidate>
        <Field label={S.name} htmlFor="cd-edit-name" error={errors.name} hint={S.nameHint}>
          <input
            id="cd-edit-name"
            className="input"
            value={form.name}
            onChange={set('name')}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={60}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label={S.nameUr} htmlFor="cd-edit-ur">
          <input
            id="cd-edit-ur"
            className="input cd-ur-input"
            dir="rtl"
            lang="ur"
            value={form.nameUrdu}
            onChange={set('nameUrdu')}
            placeholder={S.nameUrPh}
            autoComplete="off"
            maxLength={60}
          />
        </Field>
        <Field label={S.phone} htmlFor="cd-edit-phone" error={errors.phone} hint={S.phoneHint}>
          <input
            ref={phoneRef}
            id="cd-edit-phone"
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
        <div className="cluster cd-form-actions">
          <Button variant="primary" type="submit" loading={busy} disabled={!dirty}>{S.saveChanges}</Button>
          {dirty && (
            <Button variant="ghost" onClick={undo}>{S.undo}</Button>
          )}
        </div>
      </form>
    </Frame>
  )
}

/**
 * "List": where this person is listed, and a picker to move them. Between a customers list (or General) and a
 * suppliers list only while the khata has no entries — the server refuses it otherwise (409 has_entries).
 */
function MoveFrame({ customer, S, W, lang, entries, onSaved }) {
  const toast = useToast()
  const { data: lists, error, reload } = useResource('/api/lists', { refreshOn: ['ledger'] })
  const current = customer.listId || ''
  const [target, setTarget] = useState(current)
  // A move (here or by voice) changes the current list: the picker follows it.
  const [seen, setSeen] = useState(current)
  if (current !== seen) {
    setSeen(current)
    setTarget(current)
  }
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const all = useMemo(() => pickerLists(lists || []), [lists])
  const kindOf = listId => (listId ? all.find(l => l.id === listId)?.kind || 'customers' : 'customers')
  const blocked = target !== current && kindOf(target) !== customer.listKind && entries > 0
  const nameOfList = listId => (listId ? listName(all.find(l => l.id === listId), lang, W) : W.general)

  async function move(e) {
    e.preventDefault()
    if (busy || target === current || blocked) return
    setBusy(true)
    setFailure(null)
    try {
      await api(`/api/customers/${encodeURIComponent(customer.id)}`, { method: 'PATCH', body: { listId: target || null } })
      toast.success(S.moved(customer.name, nameOfList(target)))
      await onSaved()
    } catch (err) {
      if (err?.code === 'has_entries') setFailure(S.moveHasEntries(customer.name))
      else toast.error(S.moveFailed)
    } finally {
      setBusy(false)
    }
  }

  let body
  if (!lists && error) body = <LoadError onRetry={reload} />
  else if (lists && !all.length) {
    body = (
      <p className="cd-tool-text">
        {S.moveNoLists} <Link to="/app/customers">{S.newListLink}</Link>
      </p>
    )
  } else {
    body = (
      <form className="cd-form" onSubmit={move} noValidate>
        <Field label={S.moveTo} htmlFor="cd-move-to" error={blocked ? S.moveHasEntries(customer.name) : failure}>
          <select
            id="cd-move-to"
            className="select"
            value={target}
            disabled={!lists}
            aria-invalid={Boolean(blocked || failure)}
            onChange={e => {
              setTarget(e.target.value)
              setFailure(null)
            }}
          >
            <optgroup label={S.customerLists}>
              <option value="">{W.general}</option>
              {all
                .filter(l => l.kind !== 'suppliers')
                .map(l => (
                  <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
                ))}
            </optgroup>
            {all.some(l => l.kind === 'suppliers') && (
              <optgroup label={S.supplierLists}>
                {all
                  .filter(l => l.kind === 'suppliers')
                  .map(l => (
                    <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
                  ))}
              </optgroup>
            )}
          </select>
        </Field>
        <div className="cluster cd-form-actions">
          <Button variant="primary" type="submit" icon="list" loading={busy} disabled={target === current || blocked}>{S.moveAction}</Button>
        </div>
      </form>
    )
  }

  return (
    <Frame title={S.moveTitle} className="cd-tool cd-move">
      <p className="cd-tool-text">{S.moveBody(customer.name, current ? personListName(customer, lang, W) : W.general)}</p>
      {body}
    </Frame>
  )
}

/* ---------------------------------------------------------------- sheets */

function VoidSheet({ entry, customer, onClose, onVoided, onDone }) {
  const S = kindStrings(useStrings(STRINGS), customer)
  const { lang } = useLang()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!entry) return null

  const after = customer.balance + (entry.kind === 'credit' ? -entry.amount : entry.amount)
  const date = midSentence(when(entry.createdAt, lang, { withTime: false }), lang)

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await api(`/api/entries/${entry.id}/void`, { method: 'POST' })
      toast.success(S.voided(customer.name, money(after), after < 0))
      onVoided(entry.id)
      onClose()
    } catch {
      toast.error(S.voidFailed)
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={S.voidTitle}
      description={S.voidDesc(money(entry.amount), S.kindWord[entry.kind], date)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{S.voidKeep}</Button>
          <Button variant="danger" className="solid" loading={busy} onClick={confirm}>{S.voidConfirm}</Button>
        </>
      }
    >
      <LabeledCells
        tone="plain"
        min={140}
        cells={[
          { key: 'now', label: S.voidNow, value: <SheetBalance value={customer.balance} S={S} size="lg" /> },
          { key: 'after', label: S.voidAfter, value: <SheetBalance value={after} S={S} size="lg" /> },
        ]}
      />
      <p className="cd-sheet-note">{S.voidNote}</p>
    </Sheet>
  )
}

/* Similar-name detection for the merge picker (Umer ~ Umar, "Umar" ~ "Umar Farooq"). */
const COMMON_WORDS = new Set(['muhammad', 'mohammad', 'muhammed', 'mohammed', 'm', 'syed', 'sayyed', 'haji', 'bhai', 'chacha', 'sahab', 'sb', 'mian', 'baji', 'khan'])
const norm = s => String(s || '').toLowerCase().replace(/[^a-z؀-ۿ\s]/g, '').trim()

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

function closeness(a, b) {
  const x = norm(a).replace(/\s+/g, '')
  const y = norm(b).replace(/\s+/g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  return 1 - editDistance(x, y) / Math.max(x.length, y.length)
}

function wordMatch(a, b) {
  const words = s => norm(s).split(/\s+/).filter(w => w.length >= 3 && !COMMON_WORDS.has(w))
  const wa = words(a)
  const wb = words(b)
  let best = 0
  for (const x of wa) for (const y of wb) best = Math.max(best, closeness(x, y))
  return best >= 0.75 ? best * 0.9 : 0
}

function similarity(me, other) {
  if (me.phone && me.phone === other.phone) return 1
  const mine = [me.name, ...(me.aliases || [])]
  const theirs = [other.name, ...(other.aliases || [])]
  let best = 0
  for (const a of mine) for (const b of theirs) best = Math.max(best, closeness(a, b), wordMatch(a, b))
  if (me.nameUrdu && other.nameUrdu) best = Math.max(best, closeness(me.nameUrdu, other.nameUrdu))
  return best
}

function optionLabel(o, S) {
  const sup = isSupplier(o)
  const balance = o.balance > 0 ? (sup ? S.optYouOwe : S.optOwes)(money(o.balance)) : o.balance < 0 ? S.optAdvance(money(o.balance)) : S.optSettled
  return `${o.name}${o.nameUrdu ? ` (${o.nameUrdu})` : ''}${sup ? ` · ${S.optSupplier}` : ''} — ${balance}`
}

function MergeSheet({ open, onClose, customer, back }) {
  const base = useStrings(STRINGS)
  const S = kindStrings(base, customer)
  const C = useCommon()
  const toast = useToast()
  const navigate = useNavigate()
  const [others, setOthers] = useState(null)
  const [failed, setFailed] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const selectRef = useRef(null)

  const load = useCallback(() => {
    setOthers(null)
    setFailed(false)
    return api('/api/customers')
      .then(list => setOthers(list.filter(o => o.id !== customer.id)))
      .catch(() => setFailed(true))
  }, [customer.id])

  useEffect(() => {
    if (!open) return
    setTargetId('')
    load()
  }, [open, load])

  const groups = useMemo(() => {
    if (!others) return null
    const scored = others.map(o => ({ o, score: similarity(customer, o) }))
    const similar = scored.filter(x => x.score >= 0.6).sort((a, b) => b.score - a.score).map(x => x.o)
    const rest = scored.filter(x => x.score < 0.6).map(x => x.o).sort((a, b) => a.name.localeCompare(b.name))
    return { similar, rest }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, customer.id, customer.name])

  // The list arrives after the sheet has opened, so move focus to the picker once it exists.
  useEffect(() => {
    if (open && groups) selectRef.current?.focus()
  }, [open, groups])

  const target = others?.find(o => o.id === targetId) || null
  const moving = (customer.entries || []).length

  async function merge() {
    if (!target || busy) return
    setBusy(true)
    try {
      const into = await api(`/api/customers/${customer.id}/merge`, { method: 'POST', body: { intoId: target.id } })
      toast.success(S.merged(into.name))
      onClose()
      navigate(`/app/customers/${into.id}`, { replace: true, state: back ? { back } : undefined })
    } catch (err) {
      toast.error(err?.code === 'has_entries' ? S.mergeHasEntries : S.mergeFailed)
    } finally {
      setBusy(false)
    }
  }

  let picker
  if (failed) picker = <LoadError onRetry={load} />
  else if (!groups) picker = <p className="cd-sheet-note">{S.mergeLoading}</p>
  else if (!others.length) picker = <p className="cd-sheet-note">{S.mergeNone}</p>
  else {
    picker = (
      <Field label={S.mergeInto} htmlFor="cd-merge-target">
        <select ref={selectRef} id="cd-merge-target" className="select" value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">{S.mergePick}</option>
          {groups.similar.length > 0 && (
            <optgroup label={S.mergeSimilar}>
              {groups.similar.map(o => (
                <option key={o.id} value={o.id}>{optionLabel(o, S)}</option>
              ))}
            </optgroup>
          )}
          {groups.rest.length > 0 &&
            (groups.similar.length > 0 ? (
              <optgroup label={S.mergeOthers}>
                {groups.rest.map(o => (
                  <option key={o.id} value={o.id}>{optionLabel(o, S)}</option>
                ))}
              </optgroup>
            ) : (
              groups.rest.map(o => (
                <option key={o.id} value={o.id}>{optionLabel(o, S)}</option>
              ))
            ))}
        </select>
      </Field>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={S.mergeTitle(customer.name)}
      description={S.mergeDesc(customer.name)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="primary" icon="merge" className="cd-wrap-btn" loading={busy} disabled={!target || busy} onClick={merge}>
            {S.mergeConfirm}
          </Button>
        </>
      }
    >
      {picker}
      {target && (
        <>
          <p className="cd-sheet-note">{S.mergeMoves(moving, customer.name, target.name)}</p>
          <LabeledCells
            tone="plain"
            min={140}
            cells={[
              { key: 'now', label: S.mergeNow(target.name), value: <SheetBalance value={target.balance} S={kindStrings(base, target)} /> },
              { key: 'after', label: S.mergeAfter, value: <SheetBalance value={target.balance + customer.balance} S={kindStrings(base, target)} size="lg" /> },
            ]}
          />
        </>
      )}
    </Sheet>
  )
}

function DeleteSheet({ open, onClose, customer, backTo }) {
  const S = kindStrings(useStrings(STRINGS), customer)
  const C = useCommon()
  const toast = useToast()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  // The Latin name is what we ask for; the Urdu name is accepted too for owners typing on an Urdu keyboard.
  const answer = typed.trim().replace(/\s+/g, ' ').toLowerCase()
  const matches = Boolean(answer) && [customer.name, customer.nameUrdu].some(n => n && n.trim().replace(/\s+/g, ' ').toLowerCase() === answer)

  async function remove() {
    if (!matches || busy) return
    setBusy(true)
    try {
      await api(`/api/customers/${encodeURIComponent(customer.id)}`, { method: 'DELETE' })
      toast.success(S.deleted(customer.name))
      onClose()
      navigate(backTo || '/app/customers', { replace: true })
    } catch {
      toast.error(S.deleteFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={S.deleteTitle(customer.name)}
      description={S.deleteDesc(customer.name, (customer.entries || []).length)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="danger" className="solid" icon="trash" loading={busy} disabled={!matches || busy} onClick={remove}>{S.deleteConfirm}</Button>
        </>
      }
    >
      {customer.balance > 0 && (
        <div className="banner warn" role="note">
          <Icon name="alert" />
          <span className="banner-text">{S.deleteOwes(customer.name, money(customer.balance))}</span>
        </div>
      )}
      <form
        className="cd-form"
        onSubmit={e => {
          e.preventDefault()
          remove()
        }}
      >
        <Field label={S.deleteType(customer.name)} htmlFor="cd-delete-confirm">
          <input
            id="cd-delete-confirm"
            className="input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-autofocus
          />
        </Field>
      </form>
    </Sheet>
  )
}
