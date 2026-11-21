import { useEffect } from 'react'
import { FootnoteRef, Footnotes, FurtherReading, LabeledCells, Toc } from '../components/editorial.jsx'
import { useStrings } from '../lib/i18n.jsx'
import './Legal.css'

const GEMINI_TERMS = 'https://ai.google.dev/gemini-api/terms'

const STRINGS = {
  en: {
    docTitle: 'Privacy policy — Hisaab',
    eyebrow: 'Legal · Updated October 2026',
    title: 'Privacy policy',
    intro:
      'Hisaab keeps a credit ledger (khata) for your shop from the messages you send to yourself on WhatsApp. This page explains in plain words what we keep, who processes it, and how you can delete it.',
    contents: 'Contents',
    shortTitle: 'In short',
    short: [
      { label: 'What we read', text: 'Hisaab reads only your “Message yourself” chat — never your chats with customers, family or groups.' },
      { label: 'Your customers', text: 'Hisaab never messages your customers on its own.' },
      { label: 'Advertising', text: 'We do not sell your data or use it for advertising.' },
      { label: 'Google’s free tier', text: 'Hisaab’s AI runs on Google’s free Gemini tier. Google may use what Hisaab sends it to improve its products, and people at Google may read it.' },
      { label: 'Your control', text: 'You can download your khata or delete everything from Settings, anytime.' },
    ],
    sections: [
      {
        h: 'What we store',
        p: ['To keep your khata, Hisaab stores:'],
        list: [
          'Shop profile: shop name, owner name, city, type of business, and your language and voice-reply settings.',
          'Your WhatsApp number and profile name, and the linked-device session that lets Hisaab read and reply in your “Message yourself” chat.',
          'Customers: names (and Urdu spelling), phone numbers you save, and other names you have used for them.',
          'Payment details, if you add them in Settings: the account holder’s name and up to three JazzCash, Easypaisa, Raast, bank (IBAN) or other wallet numbers, printed on the reminders you send. They are never sent to Google, and Hisaab never uses them to move money.',
          'Khata entries: udhaar and payments, amounts, items, notes, dates, and entries you cancelled.',
          'What you send to your self chat or record in the dashboard: voice notes, photos and text, the transcript Hisaab makes of them, and Hisaab’s replies (text and voice).',
          <>
            Sign-in and usage data: a session cookie in your browser, short-lived login codes, and a daily message count for the fair-use limit.
            <FootnoteRef n={1} />
          </>,
        ],
      },
      {
        h: 'Who processes it',
        list: [
          'Google Gemini (AI): your voice notes, photos and texts are sent to Google’s Gemini API, on its free tier (section 3), to understand who, how much and what happened. So it can match names, it also receives your customer list: names, Urdu spellings, the other names you use for them and the name of each list (and whether it is a suppliers list) — no balances or phone numbers. The AI does not calculate anything — Hisaab’s own code does every calculation.',
          'Live call (only if you use it): when you start a call with Hisaab from the dashboard, your microphone audio is streamed to Google’s Gemini Live service while the call is open. It also receives your shop name, your name and your city, and the answers to what you ask on the call: customers’ names and balances, today’s totals and, when you ask for a reminder, only whether it is ready and whether the customer’s number is saved. The reminder message itself, with the customer’s phone number and your payment details, stays on your screen. Hisaab does not save the call audio; only the entries made during the call are written to your khata.',
          'Text-to-speech: the text of Hisaab’s reply — not your own voice — is sent to a text-to-speech provider (such as Uplift AI, Microsoft or Google) to create the Urdu voice reply. Google’s text-to-speech is only the backup voice, on the same free tier. You can turn voice replies off in Settings.',
          <>
            WhatsApp: messages travel through WhatsApp as usual. Hisaab connects to your number as a linked device, using WhatsApp Web technology.
            <FootnoteRef n={2} />
          </>,
        ],
      },
      {
        h: 'Google’s free tier: what Google may do with it',
        p: [
          'Hisaab uses the free (unpaid) tier of Google’s Gemini API. That covers everything Hisaab sends to Gemini: your voice notes, photos and texts, your customers’ names, the live call, and Gemini text-to-speech when it is the backup voice. Google’s terms for its unpaid services say:',
        ],
        list: [
          <>
            Google uses what is sent, and the answers it generates, to provide, improve and develop its products and machine-learning technology.
            <FootnoteRef n={3} />
          </>,
          'Human reviewers at Google may read, annotate and process it. Google says it first disconnects it from Hisaab’s Google account, API key and Cloud project — but the content itself, such as a customer’s name and amount in your voice note, can still be read.',
          'Google asks developers not to send sensitive, confidential or personal information to its unpaid services. Hisaab needs names and amounts to keep a khata, so it sends them; beyond that, it sends Google only what section 2 lists.',
          'The terms set no time limit on how long Google keeps free-tier content. Deleting your Hisaab account cannot remove what Google has already received.',
        ],
        after: [
          'So that as little as possible reaches Google, say only what the khata needs — never CNIC numbers, bank or card details, passwords or health information. Type the payment details for your reminders in Settings instead of saying them: Settings keeps them away from Google. If this is not acceptable for your shop, please do not use Hisaab; Settings → Delete account removes it from Hisaab’s server (backup copies are deleted within 14 days, see section 5).',
        ],
      },
      {
        h: 'What we do not do',
        list: [
          'Read any chat other than your “Message yourself” chat.',
          'Send messages to your customers. Reminders are prepared for you, and you send them yourself.',
          'Sell or rent your data, or use it for advertising.',
          'Show one shop’s data to another shop. Each shop sees only its own khata.',
        ],
        after: ['The people who run Hisaab look at a shop’s data only to fix a problem that shop reports, or when the law requires it.'],
      },
      {
        h: 'How long we keep it, and deleting it',
        list: [
          'Your khata is kept while your account exists, so your history stays complete.',
          'Unlinking stops processing. Remove Hisaab in WhatsApp under Linked devices, or use Disconnect WhatsApp in Settings. Hisaab stops reading and replying straight away; your existing khata stays in the dashboard.',
          'Deleting your account in Settings removes everything: shop profile, customers, entries, messages, voice notes and photos are erased from Hisaab’s server, and WhatsApp is unlinked. This cannot be undone, so download the CSV first if you want a copy.',
          'Hisaab also keeps copies of its database (backups), so a lost laptop or disk does not lose your khata. They are kept for up to 14 days, then deleted. After you delete your account, your data stays in these copies until they are deleted.',
          'Deleting does not reach copies that others already received: on the free tier, Google may keep what it received to improve its products, with no time limit in its terms (section 3). The text-to-speech provider keeps what it received under its own policy.',
        ],
      },
      {
        h: 'Keeping it safe',
        list: [
          'You sign in with a one-time code sent to your own WhatsApp, so there is no password to leak.',
          'Do not share login codes or the dashboard link Hisaab sends you — anyone with them can open your khata.',
          'Anyone who can open WhatsApp on your phone can also read Hisaab’s replies. Keep your phone locked.',
        ],
      },
    ],
    contactTitle: 'Contact',
    contactBody: 'Questions about your data, or need it deleted and cannot open Settings? Write to us.',
    footnotes: [
      {
        lead: 'Fair use.',
        text: 'The daily message count is kept to apply the fair-use limit: up to 300 messages a day per shop, free during early access.',
      },
      {
        lead: 'Linked devices.',
        text: 'Hisaab uses WhatsApp’s linked-devices feature — the same one WhatsApp Web uses — not Meta’s business API. You can see Hisaab, and remove it, under Linked devices in WhatsApp.',
      },
      {
        lead: 'Google’s terms.',
        text: (
          <>
            Gemini API Additional Terms of Service (effective 23 March 2026, updated 28 April 2026), “Unpaid Services”, at{' '}
            <a href={GEMINI_TERMS} className="latin" dir="ltr">
              ai.google.dev/gemini-api/terms
            </a>
            ; and Google’s Gemini API pricing page (updated 30 October 2026), which marks the free tier “Used to improve our products: Yes”. This is our plain summary; Google’s own wording is what applies.
          </>
        ),
      },
    ],
    further: [
      { text: 'The terms you agree to while using Hisaab.', link: { label: 'Read the terms of use', to: '/terms' } },
      { text: 'Download your khata, disconnect WhatsApp or delete your account.', link: { label: 'Open Settings', to: '/app/settings' } },
      { text: 'How Hisaab works, from the first voice note.', link: { label: 'Back to home', to: '/' } },
    ],
  },

  ur: {
    docTitle: 'رازداری کی پالیسی — حساب',
    eyebrow: 'قانونی · اکتوبر 2026 میں تازہ کیا گیا',
    title: 'رازداری کی پالیسی',
    intro:
      'حساب آپ کی دکان کا ادھار کھاتہ اُن پیغامات سے بناتا ہے جو آپ واٹس ایپ پر خود کو بھیجتے ہیں۔ یہ صفحہ سیدھے الفاظ میں بتاتا ہے کہ ہم کیا رکھتے ہیں، اسے کون پراسیس کرتا ہے، اور آپ اسے کیسے حذف کر سکتے ہیں۔',
    contents: 'فہرست',
    shortTitle: 'مختصر یہ کہ',
    short: [
      { label: 'ہم کیا پڑھتے ہیں', text: 'حساب صرف آپ کی "Message yourself" چیٹ پڑھتا ہے — گاہکوں، گھر والوں یا گروپس کی چیٹ کبھی نہیں۔' },
      { label: 'آپ کے گاہک', text: 'حساب آپ کے گاہکوں کو خود سے کبھی میسج نہیں کرتا۔' },
      { label: 'اشتہارات', text: 'ہم آپ کا ڈیٹا نہ بیچتے ہیں، نہ اشتہارات کے لیے استعمال کرتے ہیں۔' },
      { label: 'گوگل کی مفت سطح', text: 'حساب کی AI گوگل جیمنائی کی مفت سطح (free tier) پر چلتی ہے۔ حساب جو کچھ گوگل کو بھیجتا ہے، گوگل اسے اپنی سروسز بہتر بنانے کے لیے استعمال کر سکتا ہے، اور گوگل کے لوگ اسے پڑھ سکتے ہیں۔' },
      { label: 'آپ کا اختیار', text: 'آپ سیٹنگز سے جب چاہیں اپنا کھاتہ ڈاؤن لوڈ کر سکتے ہیں یا سب کچھ حذف کر سکتے ہیں۔' },
    ],
    sections: [
      {
        h: 'ہم کیا محفوظ کرتے ہیں',
        p: ['آپ کا کھاتہ رکھنے کے لیے حساب یہ چیزیں محفوظ کرتا ہے:'],
        list: [
          'دکان کی معلومات: دکان کا نام، مالک کا نام، شہر، کاروبار کی قسم، اور زبان اور وائس جواب کی سیٹنگ۔',
          'آپ کا واٹس ایپ نمبر اور پروفائل نام، اور وہ linked device سیشن جس سے حساب آپ کی "Message yourself" چیٹ پڑھ کر جواب دیتا ہے۔',
          'گاہک: نام (اور اردو ہجے)، وہ فون نمبر جو آپ محفوظ کرواتے ہیں، اور ان کے دوسرے نام جو آپ نے استعمال کیے۔',
          'ادائیگی کی تفصیل، اگر آپ سیٹنگز میں لکھیں: اکاؤنٹ ٹائٹل اور جاز کیش، ایزی پیسہ، راست، بینک (IBAN) یا کسی اور والیٹ کے تین تک نمبر، جو آپ کی بھیجی ہوئی یاد دہانیوں پر لکھے جاتے ہیں۔ یہ کبھی گوگل کو نہیں بھیجے جاتے، اور حساب ان سے کبھی پیسوں کا لین دین نہیں کرتا۔',
          'کھاتے کے اندراج: ادھار اور وصولیاں، رقم، سامان، نوٹ، تاریخیں، اور وہ اندراج جو آپ نے منسوخ کیے۔',
          'جو آپ اپنی چیٹ میں بھیجتے ہیں یا ڈیش بورڈ میں ریکارڈ کرتے ہیں: وائس نوٹ، تصویریں اور میسج، ان کی تحریر (transcript)، اور حساب کے جواب (میسج اور آواز)۔',
          <>
            لاگ ان اور استعمال کا ڈیٹا: براؤزر میں سیشن کوکی، تھوڑی دیر کے لیے کارآمد لاگ ان کوڈ، اور مناسب استعمال کی حد کے لیے روزانہ میسجز کی گنتی۔
            <FootnoteRef n={1} />
          </>,
        ],
      },
      {
        h: 'اسے کون پراسیس کرتا ہے',
        list: [
          'گوگل Gemini (AI): آپ کے وائس نوٹ، تصویریں اور میسج گوگل کے Gemini API کو، اس کی مفت سطح پر (حصہ 3)، بھیجے جاتے ہیں تاکہ سمجھا جا سکے کہ کون، کتنے، اور کیا ہوا۔ نام ملانے کے لیے اسے آپ کے گاہکوں کی فہرست بھی جاتی ہے: نام، اردو ہجے، ان کے دوسرے نام جو آپ استعمال کرتے ہیں، اور ہر لسٹ کا نام (اور یہ کہ وہ سپلائرز کی لسٹ ہے یا نہیں) — بقایا یا فون نمبر نہیں۔ AI کوئی حساب نہیں لگاتا — ہر جمع تفریق حساب کا اپنا کوڈ کرتا ہے۔',
          'لائیو کال (صرف اگر آپ استعمال کریں): جب آپ ڈیش بورڈ سے حساب کو کال کرتے ہیں تو کال کھلی رہنے تک آپ کے مائیک کی آواز گوگل کی Gemini Live سروس کو جاتی ہے۔ اسے آپ کی دکان کا نام، آپ کا نام اور شہر بھی جاتا ہے، اور کال پر آپ جو پوچھیں اس کے جواب بھی: گاہکوں کے نام اور بقایا، آج کا کل حساب، اور یاد دہانی مانگیں تو صرف یہ کہ یاد دہانی تیار ہے اور گاہک کا نمبر محفوظ ہے یا نہیں۔ یاد دہانی کا پیغام خود، گاہک کے فون نمبر اور آپ کی ادائیگی کی تفصیل سمیت، آپ کی اسکرین پر ہی رہتا ہے۔ حساب کال کی آواز محفوظ نہیں کرتا؛ صرف کال میں ہونے والے اندراج آپ کے کھاتے میں لکھے جاتے ہیں۔',
          'آواز بنانا (text-to-speech): حساب کے جواب کی تحریر — آپ کی اپنی آواز نہیں — ایک text-to-speech سروس (جیسے Uplift AI، Microsoft یا Google) کو بھیجی جاتی ہے تاکہ اردو وائس جواب بنایا جا سکے۔ گوگل کی آواز صرف متبادل ہے، اور وہ بھی اسی مفت سطح پر۔ آپ سیٹنگز میں وائس جواب بند کر سکتے ہیں۔',
          <>
            واٹس ایپ: پیغامات معمول کے مطابق واٹس ایپ کے ذریعے آتے جاتے ہیں۔ حساب واٹس ایپ ویب کی ٹیکنالوجی سے آپ کے نمبر کے ساتھ linked device کے طور پر جڑتا ہے۔
            <FootnoteRef n={2} />
          </>,
        ],
      },
      {
        h: 'گوگل کی مفت سطح: گوگل اس کے ساتھ کیا کر سکتا ہے',
        p: [
          'حساب گوگل کے Gemini API کی مفت (بغیر ادائیگی والی) سطح استعمال کرتا ہے۔ اس میں وہ سب شامل ہے جو حساب جیمنائی کو بھیجتا ہے: آپ کے وائس نوٹ، تصویریں اور میسج، گاہکوں کے نام، لائیو کال، اور جب گوگل کی آواز متبادل کے طور پر استعمال ہو تو وہ بھی۔ بغیر ادائیگی والی سروسز کے لیے گوگل کی شرائط کہتی ہیں:',
        ],
        list: [
          <>
            گوگل بھیجا گیا مواد، اور اس پر بنائے گئے اپنے جواب، اپنی سروسز اور مشین لرننگ ٹیکنالوجی فراہم کرنے، بہتر بنانے اور تیار کرنے کے لیے استعمال کرتا ہے۔
            <FootnoteRef n={3} />
          </>,
          'گوگل کے انسانی جائزہ کار اسے پڑھ سکتے ہیں، اس پر نشان لگا سکتے ہیں اور اسے پراسیس کر سکتے ہیں۔ گوگل کہتا ہے کہ وہ پہلے اسے حساب کے گوگل اکاؤنٹ، API key اور Cloud پروجیکٹ سے الگ کر دیتا ہے — مگر مواد خود، مثلاً آپ کے وائس نوٹ میں کسی گاہک کا نام اور رقم، پھر بھی پڑھا جا سکتا ہے۔',
          'گوگل ڈویلپرز سے کہتا ہے کہ بغیر ادائیگی والی سروسز کو حساس، خفیہ یا ذاتی معلومات نہ بھیجیں۔ کھاتہ رکھنے کے لیے حساب کو نام اور رقمیں چاہییں، اس لیے وہ یہ بھیجتا ہے؛ اس کے علاوہ وہ گوگل کو صرف وہی بھیجتا ہے جو حصہ 2 میں لکھا ہے۔',
          'شرائط میں یہ مدت نہیں لکھی کہ گوگل مفت سطح کا مواد کب تک رکھتا ہے۔ حساب کا اکاؤنٹ حذف کرنے سے وہ مواد نہیں مٹتا جو گوگل پہلے ہی وصول کر چکا ہے۔',
        ],
        after: [
          'تاکہ کم سے کم معلومات گوگل تک پہنچیں، صرف وہی بولیں جو کھاتے کے لیے ضروری ہو — شناختی کارڈ نمبر، بینک یا کارڈ کی تفصیل، پاس ورڈ یا صحت کی معلومات کبھی نہیں۔ یاد دہانیوں کے لیے ادائیگی کی تفصیل بول کر نہ بتائیں، سیٹنگز میں لکھیں: سیٹنگز اسے گوگل سے دور رکھتی ہے۔ اگر یہ آپ کی دکان کے لیے قابلِ قبول نہیں تو براہِ کرم حساب استعمال نہ کریں؛ سیٹنگز ← اکاؤنٹ حذف کریں سے یہ حساب کے سرور سے مٹ جاتا ہے (بیک اپ کی نقلیں 14 دن کے اندر مٹ جاتی ہیں، حصہ 5 دیکھیں)۔',
        ],
      },
      {
        h: 'ہم کیا نہیں کرتے',
        list: [
          '"Message yourself" کے علاوہ کوئی اور چیٹ نہیں پڑھتے۔',
          'آپ کے گاہکوں کو میسج نہیں بھیجتے۔ یاد دہانی آپ کے لیے تیار کی جاتی ہے، اور بھیجتے آپ خود ہیں۔',
          'آپ کا ڈیٹا نہ بیچتے ہیں، نہ کرائے پر دیتے ہیں، نہ اشتہارات کے لیے استعمال کرتے ہیں۔',
          'ایک دکان کا ڈیٹا دوسری دکان کو نہیں دکھاتے۔ ہر دکان صرف اپنا کھاتہ دیکھتی ہے۔',
        ],
        after: ['حساب چلانے والے کسی دکان کا ڈیٹا صرف تب دیکھتے ہیں جب وہ دکان کوئی مسئلہ بتائے، یا جب قانون اس کا تقاضا کرے۔'],
      },
      {
        h: 'ہم اسے کب تک رکھتے ہیں، اور حذف کرنا',
        list: [
          'جب تک آپ کا اکاؤنٹ موجود ہے، آپ کا کھاتہ محفوظ رہتا ہے تاکہ پوری تاریخ مکمل رہے۔',
          'الگ کرنے سے پراسیسنگ رک جاتی ہے۔ واٹس ایپ میں Linked devices سے حساب کو ہٹائیں، یا سیٹنگز میں واٹس ایپ منقطع کریں۔ حساب فوراً پڑھنا اور جواب دینا بند کر دیتا ہے؛ آپ کا موجودہ کھاتہ ڈیش بورڈ میں رہتا ہے۔',
          'سیٹنگز سے اکاؤنٹ حذف کرنے پر سب کچھ مٹ جاتا ہے: دکان کی معلومات، گاہک، اندراج، پیغامات، وائس نوٹ اور تصویریں حساب کے سرور سے ختم ہو جاتی ہیں، اور واٹس ایپ الگ ہو جاتا ہے۔ یہ واپس نہیں ہو سکتا، اس لیے کاپی چاہیے تو پہلے CSV ڈاؤن لوڈ کر لیں۔',
          'حساب اپنے ڈیٹا بیس کی نقلیں (بیک اپ) بھی رکھتا ہے، تاکہ لیپ ٹاپ یا ڈسک خراب ہونے پر آپ کا کھاتہ ضائع نہ ہو۔ یہ نقلیں زیادہ سے زیادہ 14 دن رکھی جاتی ہیں، پھر مٹا دی جاتی ہیں۔ اکاؤنٹ حذف کرنے کے بعد بھی آپ کا ڈیٹا ان نقلوں میں تب تک رہتا ہے جب تک وہ مٹ نہ جائیں۔',
          'حذف کرنے سے وہ نقلیں نہیں مٹتیں جو دوسرے پہلے ہی وصول کر چکے ہیں: مفت سطح پر گوگل جو کچھ وصول کرے اسے اپنی سروسز بہتر بنانے کے لیے رکھ سکتا ہے، اور اس کی شرائط میں اس کی کوئی مدت نہیں لکھی (حصہ 3)۔ text-to-speech سروس جو کچھ وصول کرتی ہے، اسے اپنی پالیسی کے مطابق رکھتی ہے۔',
        ],
      },
      {
        h: 'حفاظت',
        list: [
          'آپ اپنے ہی واٹس ایپ پر آنے والے ایک بار کے کوڈ سے لاگ ان کرتے ہیں، اس لیے کوئی پاس ورڈ لیک ہونے کا خطرہ نہیں۔',
          'لاگ ان کوڈ یا حساب کا بھیجا ہوا ڈیش بورڈ لنک کسی کو نہ دیں — جس کے پاس یہ ہو وہ آپ کا کھاتہ کھول سکتا ہے۔',
          'جو بھی آپ کے فون پر واٹس ایپ کھول سکتا ہے، وہ حساب کے جواب بھی پڑھ سکتا ہے۔ فون لاک رکھیں۔',
        ],
      },
    ],
    contactTitle: 'رابطہ',
    contactBody: 'اپنے ڈیٹا کے بارے میں سوال ہے، یا سیٹنگز نہیں کھل رہیں اور ڈیٹا حذف کروانا ہے؟ ہمیں لکھیں۔',
    footnotes: [
      {
        lead: 'مناسب استعمال۔',
        text: 'روزانہ میسجز کی گنتی مناسب استعمال کی حد لاگو کرنے کے لیے رکھی جاتی ہے: ابتدائی رسائی کے دوران مفت، ہر دکان کے لیے روزانہ 300 میسج تک۔',
      },
      {
        lead: 'لنکڈ ڈیوائسز۔',
        text: 'حساب واٹس ایپ کا linked devices والا فیچر استعمال کرتا ہے — وہی جو واٹس ایپ ویب استعمال کرتا ہے — Meta کا بزنس API نہیں۔ آپ واٹس ایپ میں Linked devices کے تحت حساب کو دیکھ بھی سکتے ہیں اور ہٹا بھی سکتے ہیں۔',
      },
      {
        lead: 'گوگل کی شرائط۔',
        text: (
          <>
            ⁦Gemini API Additional Terms of Service⁩ کا حصہ ⁦Unpaid Services⁩ (23 مارچ 2026 سے نافذ، 28 اپریل 2026 کو تازہ کیا گیا)، جو اس پتے پر ہے{' '}
            <a href={GEMINI_TERMS} className="latin" dir="ltr">
              ai.google.dev/gemini-api/terms
            </a>
            ؛ اور گوگل کا Gemini API قیمتوں والا صفحہ (30 اکتوبر 2026 کو تازہ کیا گیا)، جس میں مفت سطح کے آگے لکھا ہے ⁦Used to improve our products: Yes⁩ ۔ یہ ہمارا سادہ خلاصہ ہے؛ لاگو گوگل کے اپنے الفاظ ہوتے ہیں۔
          </>
        ),
      },
    ],
    further: [
      { text: 'وہ شرائط جن پر آپ حساب استعمال کرتے ہیں۔', link: { label: 'استعمال کی شرائط پڑھیں', to: '/terms' } },
      { text: 'اپنا کھاتہ ڈاؤن لوڈ کریں، واٹس ایپ منقطع کریں یا اکاؤنٹ حذف کریں۔', link: { label: 'سیٹنگز کھولیں', to: '/app/settings' } },
      { text: 'حساب کیسے کام کرتا ہے، پہلے وائس نوٹ سے۔', link: { label: 'ہوم پیج پر واپس', to: '/' } },
    ],
  },
}

// Set VITE_SUPPORT_EMAIL in the app's .env and rebuild. Privacy and Terms both show it as a mailto link; while it
// is empty they show a dashed placeholder instead.
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL || '').trim()

const CONTACT = {
  en: { label: 'Email:', missing: '[add your support email]' },
  ur: { label: 'ای میل:', missing: '[یہاں سپورٹ کا ای میل لکھیں]' },
}

/** The contact line under "Write to us", shared by Privacy and Terms. */
export function ContactEmail() {
  const S = useStrings(CONTACT)
  if (!SUPPORT_EMAIL) {
    return (
      <p className="legal-placeholder">
        {S.label} {S.missing}
      </p>
    )
  }
  return (
    <p className="legal-contact">
      {S.label}{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="latin" dir="ltr">
        {SUPPORT_EMAIL}
      </a>
    </p>
  )
}

export default function Privacy() {
  const S = useStrings(STRINGS)

  useEffect(() => {
    const previous = document.title
    document.title = S.docTitle
    return () => {
      document.title = previous
    }
  }, [S.docTitle])

  const n = S.sections.length + 1
  const toc = [...S.sections.map((s, i) => ({ label: s.h, href: `#legal-s${i + 1}` })), { label: S.contactTitle, href: '#legal-contact' }]

  return (
    <article className="legal-page article prose" aria-labelledby="legal-title">
      <header className="legal-head">
        <p className="eyebrow">{S.eyebrow}</p>
        <h1 id="legal-title">{S.title}</h1>
        <p className="lead">{S.intro}</p>
      </header>

      <Toc variant="hero" className="legal-toc" label={S.contents} items={toc} />

      <section className="legal-short wide" aria-labelledby="legal-short-title">
        <h2 id="legal-short-title" className="label">
          {S.shortTitle}
        </h2>
        <LabeledCells tone="sage" min={300} cells={S.short.map(s => ({ key: s.label, label: s.label, value: s.text }))} />
      </section>

      {S.sections.map((section, i) => (
        <section key={section.h} id={`legal-s${i + 1}`} className="legal-section" aria-labelledby={`legal-s${i + 1}-h`}>
          <h2 id={`legal-s${i + 1}-h`}>
            <span className="legal-n num" dir="ltr">
              {i + 1}.
            </span>{' '}
            {section.h}
          </h2>
          {section.p?.map((text, k) => <p key={k}>{text}</p>)}
          {section.list && (
            <ul>
              {section.list.map((text, k) => (
                <li key={k}>{text}</li>
              ))}
            </ul>
          )}
          {section.after?.map((text, k) => <p key={k}>{text}</p>)}
        </section>
      ))}

      <section id="legal-contact" className="legal-section" aria-labelledby="legal-contact-h">
        <h2 id="legal-contact-h">
          <span className="legal-n num" dir="ltr">
            {n}.
          </span>{' '}
          {S.contactTitle}
        </h2>
        <p>{S.contactBody}</p>
        <ContactEmail />
      </section>

      <Footnotes items={S.footnotes} />
      <FurtherReading items={S.further} />
    </article>
  )
}
