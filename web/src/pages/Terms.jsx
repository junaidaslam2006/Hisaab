import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FootnoteRef, Footnotes, FurtherReading, LabeledCells, Toc } from '../components/editorial.jsx'
import { useStrings } from '../lib/i18n.jsx'
import { ContactEmail } from './Privacy.jsx'
import './Legal.css'

const GEMINI_TERMS = 'https://ai.google.dev/gemini-api/terms'

const STRINGS = {
  en: {
    docTitle: 'Terms of use — Hisaab',
    eyebrow: 'Legal · Updated October 2026',
    title: 'Terms of use',
    intro: 'These terms cover your use of Hisaab during early access. The short version: it is free, it is new, and you should keep your own record too.',
    contents: 'Contents',
    shortTitle: 'In short',
    short: [
      { label: 'Price', text: 'Free during early access, with fair use up to 300 messages a day per shop.' },
      { label: 'Accuracy', text: 'Provided as is. Check each reply, and keep your own paper record for now.' },
      { label: 'WhatsApp', text: 'Hisaab is not affiliated with WhatsApp or Meta.' },
      { label: 'Your data', text: 'Your khata is yours: download or delete it anytime.' },
    ],
    sections: [
      {
        h: 'What Hisaab is',
        p: [
          'Hisaab records the udhaar and payments you tell it about in your WhatsApp “Message yourself” chat, and shows them in a dashboard. It is a record-keeping aid. It is not a bank, a payment service or a debt-collection service, and it never moves money.',
        ],
      },
      {
        h: 'Early access',
        p: [
          <>
            Hisaab is in early access and is provided “as is”, without guarantees. It can mishear a name or an amount, be unavailable for a while, or change how it
            works.
            <FootnoteRef n={1} />
          </>,
          'Every entry is confirmed back to you in the chat — check it, and say “undo” if it is wrong. During early access, also keep your own paper record, or download the CSV regularly.',
          'Hisaab’s AI runs on Google’s free Gemini tier. That tier has per-minute and daily limits shared by every shop on Hisaab, so at busy moments a reply can be slower. If Google cannot answer for about 90 seconds, Hisaab tells you so and writes nothing — send the message again. Google may use what is sent on its free tier to improve its products; the privacy policy explains this.',
        ],
      },
      {
        h: 'Price and fair use',
        p: [
          'Hisaab is free during early access. Fair use is up to 300 messages per shop per day; after that, Hisaab tells you the limit is reached and does not record new messages until the next day. If paid plans are introduced, you will be told before they apply, and you can download your khata and leave at any time.',
        ],
      },
      {
        h: 'WhatsApp',
        p: [
          <>
            Hisaab links to your number as a linked device, using WhatsApp Web technology.
            <FootnoteRef n={2} /> Hisaab is not affiliated with, endorsed by or sponsored by WhatsApp or Meta, and WhatsApp’s own terms still apply to your
            account.
          </>,
          'WhatsApp can log out linked devices at any time. If that happens, the dashboard shows that WhatsApp is not connected, and you can link again.',
        ],
      },
      {
        h: 'Your responsibilities',
        list: [
          <>
            Be 18 or older, and use Hisaab for a shop in Pakistan. Google’s terms for the AI Hisaab uses do not allow it for people under 18, and do not allow its free tier to be
            offered in the European Economic Area, Switzerland or the UK.
            <FootnoteRef n={3} />
          </>,
          'Record real transactions only.',
          'Send reminders politely. Do not use Hisaab to harass or threaten anyone.',
          'If you add payment details to your reminders, make sure they are your own and correct. Hisaab prints them exactly as you entered them; it does not check accounts and does not process any payment.',
          'Confirm amounts with your customer before acting on a balance. You are responsible for the entries in your khata.',
          'Keep your phone, your WhatsApp and your login codes safe.',
        ],
      },
      {
        h: 'Your data',
        p: [
          'Your khata belongs to you. You can download it as a CSV file or delete your account from Settings at any time. The privacy policy explains what is stored and who processes it.',
        ],
        link: 'Read the privacy policy',
      },
      {
        h: 'Stopping',
        p: [
          'You can stop at any time by unlinking WhatsApp or deleting your account in Settings. We may suspend a shop that misuses the service, for example to send spam. If early access ends, we will give notice so you have time to download your khata.',
        ],
      },
      {
        h: 'Limits of responsibility',
        p: [
          'As far as the law allows, Hisaab is not responsible for losses caused by wrong entries, missed messages or downtime. That is why every entry is confirmed to you, and why we ask you to keep your own record during early access.',
        ],
      },
      {
        h: 'Changes to these terms',
        p: [
          'We may update these terms. The date at the top will change, and if a change affects how you use Hisaab, we will tell you before it applies.',
        ],
      },
    ],
    contactTitle: 'Contact',
    contactBody: 'Questions about these terms? Write to us.',
    footnotes: [
      {
        lead: 'Early access.',
        text: '“Early access” and “the pilot” mean the same thing: the current period in which Hisaab is free, up to 300 messages a day per shop.',
      },
      {
        lead: 'Linked devices.',
        text: 'Hisaab uses WhatsApp’s linked-devices feature — the same one WhatsApp Web uses — not Meta’s business API. You can see Hisaab, and remove it, under Linked devices in WhatsApp.',
      },
      {
        lead: 'Google’s terms.',
        text: (
          <>
            Gemini API Additional Terms of Service (updated 28 April 2026), “Age Requirements” and “Use Restrictions”:{' '}
            <a href={GEMINI_TERMS} className="latin" dir="ltr">
              ai.google.dev/gemini-api/terms
            </a>
            . Pakistan is on Google’s list of regions where the Gemini API is available.
          </>
        ),
      },
    ],
    further: [
      { text: 'What Hisaab stores, who processes it and how to delete it.', link: { label: 'Read the privacy policy', to: '/privacy' } },
      { text: 'Download your khata, disconnect WhatsApp or delete your account.', link: { label: 'Open Settings', to: '/app/settings' } },
      { text: 'How Hisaab works, from the first voice note.', link: { label: 'Back to home', to: '/' } },
    ],
  },

  ur: {
    docTitle: 'استعمال کی شرائط — حساب',
    eyebrow: 'قانونی · اکتوبر 2026 میں تازہ کیا گیا',
    title: 'استعمال کی شرائط',
    intro:
      'یہ شرائط ابتدائی رسائی (early access) کے دوران حساب کے استعمال پر لاگو ہوتی ہیں۔ مختصر بات: یہ مفت ہے، نیا ہے، اور آپ کو اپنا ریکارڈ بھی ساتھ رکھنا چاہیے۔',
    contents: 'فہرست',
    shortTitle: 'مختصر یہ کہ',
    short: [
      { label: 'قیمت', text: 'ابتدائی رسائی کے دوران مفت، ہر دکان کے لیے روزانہ 300 میسج تک مناسب استعمال۔' },
      { label: 'درستی', text: 'جیسا ہے ویسا فراہم کیا جاتا ہے۔ ہر جواب چیک کریں، اور فی الحال کاغذ کا ریکارڈ بھی رکھیں۔' },
      { label: 'واٹس ایپ', text: 'حساب کا واٹس ایپ یا Meta سے کوئی تعلق نہیں۔' },
      { label: 'آپ کا ڈیٹا', text: 'آپ کا کھاتہ آپ کا ہے: جب چاہیں ڈاؤن لوڈ یا حذف کریں۔' },
    ],
    sections: [
      {
        h: 'حساب کیا ہے',
        p: [
          'حساب وہ ادھار اور وصولیاں لکھتا ہے جو آپ اسے اپنی واٹس ایپ "Message yourself" چیٹ میں بتاتے ہیں، اور انہیں ڈیش بورڈ میں دکھاتا ہے۔ یہ ریکارڈ رکھنے کا ذریعہ ہے۔ یہ بینک، ادائیگی کی سروس یا وصولی کرنے والی کمپنی نہیں، اور یہ کبھی پیسے منتقل نہیں کرتا۔',
        ],
      },
      {
        h: 'ابتدائی رسائی',
        p: [
          <>
            حساب ابتدائی رسائی میں ہے اور "جیسا ہے ویسا" فراہم کیا جاتا ہے، بغیر کسی ضمانت کے۔ یہ کسی نام یا رقم کو غلط سن سکتا ہے، کچھ دیر کے لیے بند ہو سکتا
            ہے، یا اس کا طریقہ بدل سکتا ہے۔
            <FootnoteRef n={1} />
          </>,
          'ہر اندراج کی تصدیق چیٹ میں آپ کو واپس آتی ہے — اسے چیک کریں، اور غلط ہو تو "undo" کہیں۔ ابتدائی رسائی کے دوران اپنا کاغذی ریکارڈ بھی رکھیں، یا باقاعدگی سے CSV ڈاؤن لوڈ کرتے رہیں۔',
          'حساب کی AI گوگل جیمنائی کی مفت سطح (free tier) پر چلتی ہے۔ اس سطح کی فی منٹ اور روزانہ حدیں ہیں جو حساب کی سب دکانوں میں بٹی ہوئی ہیں، اس لیے مصروف وقت میں جواب دیر سے آ سکتا ہے۔ اگر گوگل تقریباً 90 سیکنڈ تک جواب نہ دے تو حساب آپ کو بتا دیتا ہے اور کچھ نہیں لکھتا — پیغام دوبارہ بھیج دیں۔ مفت سطح پر جو بھیجا جائے، گوگل اسے اپنی سروسز بہتر بنانے کے لیے استعمال کر سکتا ہے؛ رازداری کی پالیسی میں اس کی تفصیل ہے۔',
        ],
      },
      {
        h: 'قیمت اور مناسب استعمال',
        p: [
          'ابتدائی رسائی کے دوران حساب مفت ہے۔ مناسب استعمال کی حد ہر دکان کے لیے روزانہ 300 میسج ہے؛ اس کے بعد حساب بتا دیتا ہے کہ حد پوری ہو گئی، اور اگلے دن تک نئے میسج درج نہیں کرتا۔ اگر پیسے والے پلان آئے تو لاگو ہونے سے پہلے آپ کو بتایا جائے گا، اور آپ کسی بھی وقت اپنا کھاتہ ڈاؤن لوڈ کر کے چھوڑ سکتے ہیں۔',
        ],
      },
      {
        h: 'واٹس ایپ',
        p: [
          <>
            حساب واٹس ایپ ویب کی ٹیکنالوجی سے آپ کے نمبر کے ساتھ linked device کے طور پر جڑتا ہے۔
            <FootnoteRef n={2} /> حساب کا واٹس ایپ یا Meta سے کوئی تعلق، تائید یا سرپرستی نہیں، اور آپ کے اکاؤنٹ پر واٹس ایپ کی اپنی شرائط بدستور لاگو ہیں۔
          </>,
          'واٹس ایپ کسی بھی وقت linked devices کو لاگ آؤٹ کر سکتا ہے۔ ایسا ہو تو ڈیش بورڈ بتا دیتا ہے کہ واٹس ایپ منسلک نہیں، اور آپ دوبارہ جوڑ سکتے ہیں۔',
        ],
      },
      {
        h: 'آپ کی ذمہ داریاں',
        list: [
          <>
            آپ کی عمر 18 سال یا زیادہ ہو، اور حساب پاکستان کی کسی دکان کے لیے استعمال کریں۔ حساب جس AI پر چلتا ہے، اس کے لیے گوگل کی شرائط 18 سال سے کم عمر لوگوں کے لیے اس کی
            اجازت نہیں دیتیں، اور اس کی مفت سطح یورپی اقتصادی علاقے (EEA)، سوئٹزرلینڈ یا برطانیہ میں پیش کرنے کی اجازت نہیں دیتیں۔
            <FootnoteRef n={3} />
          </>,
          'صرف اصل لین دین درج کریں۔',
          'یاد دہانی شائستگی سے بھیجیں۔ کسی کو تنگ کرنے یا دھمکانے کے لیے حساب استعمال نہ کریں۔',
          'اگر آپ یاد دہانیوں میں ادائیگی کی تفصیل لکھتے ہیں تو یقینی بنائیں کہ وہ آپ کی اپنی اور درست ہے۔ حساب اسے بالکل ویسے ہی لکھتا ہے جیسے آپ نے درج کی؛ نہ اکاؤنٹ کی جانچ کرتا ہے، نہ کوئی ادائیگی پراسیس کرتا ہے۔',
          'کسی بقایا پر عمل کرنے سے پہلے گاہک سے رقم کی تصدیق کر لیں۔ آپ کے کھاتے کے اندراج کی ذمہ داری آپ کی ہے۔',
          'اپنا فون، واٹس ایپ اور لاگ ان کوڈ محفوظ رکھیں۔',
        ],
      },
      {
        h: 'آپ کا ڈیٹا',
        p: [
          'آپ کا کھاتہ آپ کی ملکیت ہے۔ آپ کسی بھی وقت سیٹنگز سے اسے CSV فائل میں ڈاؤن لوڈ کر سکتے ہیں یا اکاؤنٹ حذف کر سکتے ہیں۔ رازداری کی پالیسی بتاتی ہے کہ کیا محفوظ ہوتا ہے اور اسے کون پراسیس کرتا ہے۔',
        ],
        link: 'رازداری کی پالیسی پڑھیں',
      },
      {
        h: 'استعمال بند کرنا',
        p: [
          'آپ کسی بھی وقت واٹس ایپ الگ کر کے یا سیٹنگز سے اکاؤنٹ حذف کر کے استعمال بند کر سکتے ہیں۔ جو دکان سروس کا غلط استعمال کرے، مثلاً اسپام بھیجنے کے لیے، ہم اسے معطل کر سکتے ہیں۔ اگر ابتدائی رسائی ختم ہوئی تو ہم پہلے اطلاع دیں گے تاکہ آپ اپنا کھاتہ ڈاؤن لوڈ کر سکیں۔',
        ],
      },
      {
        h: 'ذمہ داری کی حد',
        p: [
          'قانون جہاں تک اجازت دیتا ہے، غلط اندراج، چھوٹ جانے والے پیغامات یا سروس بند ہونے سے ہونے والے نقصان کی ذمہ داری حساب پر نہیں۔ اسی لیے ہر اندراج کی تصدیق آپ کو بھیجی جاتی ہے، اور ابتدائی رسائی کے دوران اپنا ریکارڈ رکھنے کو کہا جاتا ہے۔',
        ],
      },
      {
        h: 'ان شرائط میں تبدیلی',
        p: [
          'ہم یہ شرائط بدل سکتے ہیں۔ اوپر لکھی تاریخ بدل جائے گی، اور اگر کوئی تبدیلی آپ کے استعمال پر اثر ڈالے تو لاگو ہونے سے پہلے آپ کو بتایا جائے گا۔',
        ],
      },
    ],
    contactTitle: 'رابطہ',
    contactBody: 'ان شرائط کے بارے میں کوئی سوال ہے؟ ہمیں لکھیں۔',
    footnotes: [
      {
        lead: 'ابتدائی رسائی۔',
        text: '"ابتدائی رسائی" اور "پائلٹ" سے مراد ایک ہی چیز ہے: موجودہ دور جس میں حساب مفت ہے، ہر دکان کے لیے روزانہ 300 میسج تک۔',
      },
      {
        lead: 'لنکڈ ڈیوائسز۔',
        text: 'حساب واٹس ایپ کا linked devices والا فیچر استعمال کرتا ہے — وہی جو واٹس ایپ ویب استعمال کرتا ہے — Meta کا بزنس API نہیں۔ آپ واٹس ایپ میں Linked devices کے تحت حساب کو دیکھ بھی سکتے ہیں اور ہٹا بھی سکتے ہیں۔',
      },
      {
        lead: 'گوگل کی شرائط۔',
        text: (
          <>
            ⁦Gemini API Additional Terms of Service⁩ کے حصے ⁦Age Requirements⁩ اور ⁦Use Restrictions⁩ (28 اپریل 2026 کو تازہ کیا گیا)، جو اس پتے پر ہیں{' '}
            <a href={GEMINI_TERMS} className="latin" dir="ltr">
              ai.google.dev/gemini-api/terms
            </a>
            ۔ پاکستان گوگل کی اُن علاقوں کی فہرست میں شامل ہے جہاں Gemini API دستیاب ہے۔
          </>
        ),
      },
    ],
    further: [
      { text: 'حساب کیا محفوظ کرتا ہے، اسے کون پراسیس کرتا ہے اور اسے کیسے حذف کریں۔', link: { label: 'رازداری کی پالیسی پڑھیں', to: '/privacy' } },
      { text: 'اپنا کھاتہ ڈاؤن لوڈ کریں، واٹس ایپ منقطع کریں یا اکاؤنٹ حذف کریں۔', link: { label: 'سیٹنگز کھولیں', to: '/app/settings' } },
      { text: 'حساب کیسے کام کرتا ہے، پہلے وائس نوٹ سے۔', link: { label: 'ہوم پیج پر واپس', to: '/' } },
    ],
  },
}

export default function Terms() {
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
          {section.link && (
            <p>
              <Link to="/privacy">{section.link}</Link>
            </p>
          )}
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
