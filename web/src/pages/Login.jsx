import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { FootnoteRef, Footnotes, QuoteCard } from '../components/editorial.jsx'
import { Button, Field, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { mmss } from '../lib/format.js'
import { useStrings } from '../lib/i18n.jsx'
import './Login.css'

const STRINGS = {
  en: {
    eyebrow: 'Log in',
    title: 'Log in to your khata',
    lead: 'We send a 6-digit code to your own WhatsApp. There is no password to remember.',
    expired: (
      <>That login link has expired. Send <b className="latin">dashboard</b> to yourself on WhatsApp for a new one, or log in below.</>
    ),
    phoneTitle: 'Get a login code',
    phoneMeta: 'Arrives in your “Message yourself” chat',
    phoneLabel: 'Your WhatsApp number',
    phoneHint: 'The number your shop’s WhatsApp runs on.',
    phonePh: '0300 1234567',
    sendCode: 'Send code',
    badPhone: 'Enter a Pakistani mobile number, like 0300 1234567.',
    errLabel: {
      tooMany: 'Too many tries',
      network: 'No connection',
      short: 'Not complete',
      wrong: 'Wrong code',
      expired: 'Code expired',
      locked: 'Code locked',
    },
    err: {
      tooMany: (
        <>Too many tries, so code login is paused for now. Try again later, or send <b className="latin">dashboard</b> to yourself on WhatsApp for a login link right away.</>
      ),
      network: 'Could not reach Hisaab. Check your internet and try again.',
      short: 'Enter all 6 digits.',
      wrong: 'That code is not right. Check the newest message from Hisaab and try again.',
      expired: 'This code has expired (codes work for 10 minutes). Tap “Resend code” to get a new one.',
      locked: (
        <>Too many wrong tries, so this code no longer works. Tap “Resend code” for a new one, or send <b className="latin">dashboard</b> to yourself on WhatsApp for a login link.</>
      ),
    },
    noAccountLabel: 'No account yet',
    noAccountTitle: 'There is no Hisaab account for this number yet.',
    noAccountBody: 'Connect your WhatsApp to start your khata. It takes about a minute.',
    connect: 'Connect WhatsApp',
    notConnectedLabel: 'WhatsApp not linked',
    notConnectedTitle: 'Your WhatsApp is not linked right now, so we cannot send a code.',
    notConnectedBody: 'Link your WhatsApp again to log in. Your khata is safe.',
    relink: 'Link WhatsApp to log in',
    codeTitle: 'Enter your code',
    codeMeta: 'Works for 10 minutes',
    codeSent: 'We sent a 6-digit code to your WhatsApp “Message yourself” chat.',
    sentTo: 'Sent to',
    codeLabel: '6-digit code',
    codeHint: 'Look for “Hisaab login code” in your own chat.',
    verify: 'Verify and log in',
    resend: 'Resend code',
    resendIn: s => <>Resend code in <span className="num">{mmss(s)}</span></>,
    resent: 'New code sent. Check your WhatsApp.',
    different: 'Use a different number',
    altTitle: 'Other ways in',
    alt1Title: 'Text “dashboard” to yourself.',
    alt1Body: (
      <>On your phone, send the word <b className="latin">dashboard</b> in your “Message yourself” chat and tap the link Hisaab sends back.</>
    ),
    youSend: 'You send',
    chatSent: 'dashboard',
    hisaabReplies: 'Hisaab replies',
    chatReply: 'Aap ke dashboard ka login link (15 minute tak chalega):',
    linkWorks: 'The link works',
    linkOnce: 'Once, for 15 minutes',
    alt2Title: 'Link your WhatsApp again.',
    alt2Body: 'New to Hisaab, or WhatsApp unlinked from your shop? Scan a QR or type a code. An existing khata stays as it was.',
    connectLink: 'Connect WhatsApp',
    fnLead: 'Codes and links.',
    fnText: 'They go only to your own “Message yourself” chat. A code works for 10 minutes and stops after 5 wrong tries; a link works once, for 15 minutes.',
    checking: 'Checking if you are already logged in…',
  },
  ur: {
    eyebrow: 'لاگ اِن',
    title: 'اپنے کھاتے میں لاگ اِن کریں',
    lead: 'ہم آپ کے اپنے واٹس ایپ پر 6 ہندسوں کا کوڈ بھیجتے ہیں۔ کوئی پاس ورڈ یاد رکھنے کی ضرورت نہیں۔',
    expired: (
      <>وہ لاگ اِن لنک ختم ہو چکا ہے۔ نیا لنک لینے کے لیے واٹس ایپ پر خود کو <b className="latin">dashboard</b> لکھ کر بھیجیں، یا نیچے سے لاگ اِن کریں۔</>
    ),
    phoneTitle: 'لاگ اِن کوڈ منگوائیں',
    phoneMeta: 'آپ کی "Message yourself" چیٹ میں آئے گا',
    phoneLabel: 'آپ کا واٹس ایپ نمبر',
    phoneHint: 'وہ نمبر جس پر آپ کی دکان کا واٹس ایپ چلتا ہے۔',
    phonePh: '0300 1234567',
    sendCode: 'کوڈ بھیجیں',
    badPhone: 'پاکستانی موبائل نمبر لکھیں، جیسے 0300 1234567',
    errLabel: {
      tooMany: 'بہت زیادہ کوششیں',
      network: 'رابطہ نہیں ہوا',
      short: 'کوڈ ادھورا ہے',
      wrong: 'غلط کوڈ',
      expired: 'کوڈ ختم ہو گیا',
      locked: 'کوڈ بند ہو گیا',
    },
    err: {
      tooMany: (
        <>بہت زیادہ کوششیں ہو گئیں، اس لیے کوڈ سے لاگ اِن ابھی کچھ دیر کے لیے بند ہے۔ بعد میں دوبارہ کوشش کریں، یا فوراً لاگ اِن لنک کے لیے واٹس ایپ پر خود کو <b className="latin">dashboard</b> لکھ کر بھیجیں۔</>
      ),
      network: 'حساب سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
      short: 'پورے 6 ہندسے لکھیں۔',
      wrong: 'یہ کوڈ درست نہیں۔ حساب کا سب سے نیا پیغام دیکھ کر دوبارہ کوشش کریں۔',
      expired: 'یہ کوڈ ختم ہو چکا ہے (کوڈ 10 منٹ چلتا ہے)۔ نیا کوڈ لینے کے لیے "کوڈ دوبارہ بھیجیں" پر ٹیپ کریں۔',
      locked: (
        <>کئی بار غلط کوڈ لکھا گیا، اس لیے اب یہ کوڈ نہیں چلے گا۔ نیا کوڈ لینے کے لیے "کوڈ دوبارہ بھیجیں" پر ٹیپ کریں، یا لاگ اِن لنک کے لیے واٹس ایپ پر خود کو <b className="latin">dashboard</b> لکھ کر بھیجیں۔</>
      ),
    },
    noAccountLabel: 'ابھی اکاؤنٹ نہیں',
    noAccountTitle: 'اس نمبر پر ابھی حساب کا کوئی اکاؤنٹ نہیں۔',
    noAccountBody: 'اپنا کھاتہ شروع کرنے کے لیے واٹس ایپ جوڑیں۔ اس میں تقریباً ایک منٹ لگتا ہے۔',
    connect: 'واٹس ایپ جوڑیں',
    notConnectedLabel: 'واٹس ایپ جڑا ہوا نہیں',
    notConnectedTitle: 'آپ کا واٹس ایپ ابھی جڑا ہوا نہیں، اس لیے ہم کوڈ نہیں بھیج سکتے۔',
    notConnectedBody: 'لاگ اِن کے لیے اپنا واٹس ایپ دوبارہ جوڑیں۔ آپ کا کھاتہ محفوظ ہے۔',
    relink: 'لاگ اِن کے لیے واٹس ایپ جوڑیں',
    codeTitle: 'اپنا کوڈ لکھیں',
    codeMeta: '10 منٹ تک چلتا ہے',
    codeSent: 'ہم نے آپ کی واٹس ایپ "Message yourself" چیٹ میں 6 ہندسوں کا کوڈ بھیجا ہے۔',
    sentTo: 'بھیجا گیا',
    codeLabel: '6 ہندسوں کا کوڈ',
    codeHint: 'اپنی چیٹ میں "Hisaab login code" والا پیغام دیکھیں۔',
    verify: 'تصدیق کر کے لاگ اِن کریں',
    resend: 'کوڈ دوبارہ بھیجیں',
    resendIn: s => <><span className="num">{mmss(s)}</span> بعد کوڈ دوبارہ بھیج سکیں گے</>,
    resent: 'نیا کوڈ بھیج دیا گیا۔ اپنا واٹس ایپ دیکھیں۔',
    different: 'دوسرا نمبر استعمال کریں',
    altTitle: 'لاگ اِن کے اور طریقے',
    alt1Title: 'خود کو "dashboard" لکھ کر بھیجیں۔',
    alt1Body: (
      <>فون پر اپنی "Message yourself" چیٹ میں لفظ <b className="latin">dashboard</b> بھیجیں اور حساب کے بھیجے ہوئے لنک پر ٹیپ کریں۔</>
    ),
    youSend: 'آپ بھیجتے ہیں',
    chatSent: 'dashboard',
    hisaabReplies: 'حساب کا جواب',
    chatReply: 'Aap ke dashboard ka login link (15 minute tak chalega):',
    linkWorks: 'لنک کب تک چلتا ہے',
    linkOnce: 'ایک بار، 15 منٹ تک',
    alt2Title: 'اپنا واٹس ایپ دوبارہ جوڑیں۔',
    alt2Body: 'حساب پر نئے ہیں، یا آپ کی دکان سے واٹس ایپ الگ ہو گیا ہے؟ QR اسکین کریں یا کوڈ لکھیں۔ پہلے سے موجود کھاتہ ویسے ہی رہتا ہے۔',
    connectLink: 'واٹس ایپ جوڑیں',
    fnLead: 'کوڈ اور لنک۔',
    fnText: 'یہ صرف آپ کی اپنی "Message yourself" چیٹ میں آتے ہیں۔ کوڈ 10 منٹ تک چلتا ہے اور 5 غلط کوششوں کے بعد بند ہو جاتا ہے؛ لنک صرف ایک بار، 15 منٹ تک چلتا ہے۔',
    checking: 'دیکھ رہے ہیں کہ آپ پہلے سے لاگ اِن تو نہیں…',
  },
}

const RESEND_AFTER = 30
// The server stops accepting a code after 5 wrong tries (answers 429 too_many_attempts).
const MAX_TRIES = 5
const digits = v => String(v || '').replace(/\D/g, '')
const safeNext = next => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/app')

/** Same rule as the server: 03001234567, +92 300 1234567, 0092…, 3001234567. */
function looksLikePhone(value) {
  const d = digits(value)
  if (d.startsWith('0092')) return d.length === 14
  if (d.startsWith('92')) return d.length === 12
  if (d.startsWith('0')) return d.length === 11
  if (d.startsWith('3')) return d.length === 10
  return d.length >= 10 && d.length <= 15
}

/** "03001234567" → "0300 1234567" for display. */
function prettyPhone(value) {
  let d = digits(value)
  if (d.startsWith('0092')) d = d.slice(2)
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2)
  if (d.startsWith('3') && d.length === 10) d = '0' + d
  return d.length === 11 && d.startsWith('0') ? `${d.slice(0, 4)} ${d.slice(4)}` : String(value).trim()
}

export default function Login() {
  const S = useStrings(STRINGS)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('expired') === '1'

  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  // Error kinds (keys of S.err), so a language switch re-renders them in the new language.
  const [formError, setFormError] = useState('')
  const [qrReason, setQrReason] = useState(null)
  const [sending, setSending] = useState(false)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [wrongTries, setWrongTries] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [resent, setResent] = useState(false)
  const codeRef = useRef(null)
  const phoneRef = useRef(null)
  const calloutRef = useRef(null)

  useEffect(() => {
    let alive = true
    api('/api/session')
      .then(s => {
        if (!alive) return
        if (s?.signedIn) navigate('/app', { replace: true })
        else setChecking(false)
      })
      .catch(() => alive && setChecking(false))
    return () => {
      alive = false
    }
  }, [navigate])

  // Countdown for "Resend code".
  const waitLeft = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (step !== 'code' || !resendAt) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= resendAt) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [step, resendAt])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  // The callout replaces the "Send code" button: if focus went with it, move it to the callout.
  useEffect(() => {
    const active = document.activeElement
    if (qrReason && (!active || active === document.body)) calloutRef.current?.focus()
  }, [qrReason])

  async function requestCode({ resend = false } = {}) {
    setFormError('')
    setPhoneError(false)
    setQrReason(null)
    setResent(false)
    if (!looksLikePhone(phone)) {
      setPhoneError(true)
      phoneRef.current?.focus()
      return
    }
    setSending(true)
    try {
      const res = await api('/api/login/code', { method: 'POST', body: { phone } })
      if (res?.method === 'code') {
        const t = Date.now()
        setNow(t)
        setResendAt(t + RESEND_AFTER * 1000)
        setCode('')
        setCodeError('')
        setWrongTries(0)
        setStep('code')
        if (resend) setResent(true)
      } else if (res?.method === 'qr') {
        setStep('phone')
        setQrReason(res.reason === 'not_connected' ? 'not_connected' : 'no_account')
      }
    } catch (err) {
      if (err.code === 'bad_phone') {
        setStep('phone')
        setPhoneError(true)
      } else if (err.status === 429) {
        if (resend) setCodeError('tooMany')
        else setFormError('tooMany')
      } else if (resend) {
        setCodeError('network')
      } else {
        setFormError('network')
      }
    } finally {
      setSending(false)
    }
  }

  async function verify(value = code) {
    if (verifying) return
    if (wrongTries >= MAX_TRIES) {
      setCodeError('locked')
      return
    }
    const clean = digits(value)
    if (clean.length !== 6) {
      setCodeError('short')
      codeRef.current?.focus()
      return
    }
    setCodeError('')
    setResent(false)
    setVerifying(true)
    try {
      const res = await api('/api/login/verify', { method: 'POST', body: { phone, code: clean } })
      navigate(safeNext(res?.next), { replace: true })
    } catch (err) {
      setVerifying(false)
      if (err.code === 'wrong_code') {
        const tries = wrongTries + 1
        setWrongTries(tries)
        setCodeError(tries >= MAX_TRIES ? 'locked' : 'wrong')
      } else if (err.code === 'code_expired') setCodeError('expired')
      else if (err.status === 429) {
        setWrongTries(MAX_TRIES)
        setCodeError('locked')
      } else setCodeError('network')
      codeRef.current?.select()
    }
  }

  const onCodeChange = e => {
    const value = digits(e.target.value).slice(0, 6)
    setCode(value)
    if (wrongTries >= MAX_TRIES) return
    if (codeError) setCodeError('')
    if (value.length === 6) verify(value)
  }

  const changeNumber = () => {
    setStep('phone')
    setCode('')
    setCodeError('')
    setResent(false)
    setResendAt(0)
    setTimeout(() => phoneRef.current?.focus(), 0)
  }

  if (checking) {
    return (
      <div className="login-checking">
        <Spinner size="lg" />
        <p>{S.checking}</p>
      </div>
    )
  }

  const host = window.location.host

  return (
    <div className="login-page">
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">{S.eyebrow}</p>
          <h1>{S.title}</h1>
          <p className="lead">
            {S.lead}
            <FootnoteRef n={1} />
          </p>
        </div>
      </header>

      {expired && (
        <div className="banner info login-expired" role="status">
          <Icon name="clock" />
          <span className="banner-text">{S.expired}</span>
        </div>
      )}

      <section className="frame login-frame" aria-labelledby="login-frame-title">
        {step === 'phone' ? (
          <form
            noValidate
            onSubmit={e => {
              e.preventDefault()
              requestCode()
            }}
          >
            <div className="frame-head">
              <h2 className="frame-title" id="login-frame-title">{S.phoneTitle}</h2>
              <span className="frame-meta">{S.phoneMeta}</span>
            </div>
            <div className="frame-body login-body">
              <Field label={S.phoneLabel} hint={S.phoneHint} error={phoneError ? S.badPhone : ''} htmlFor="login-phone">
                <input
                  ref={phoneRef}
                  id="login-phone"
                  className="input lg num login-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={S.phonePh}
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value)
                    if (phoneError) setPhoneError(false)
                    if (qrReason) setQrReason(null)
                  }}
                  aria-invalid={phoneError ? 'true' : undefined}
                  dir="ltr"
                  required
                />
              </Field>

              {formError && <Alert S={S} kind={formError} />}

              {qrReason ? (
                <div ref={calloutRef} tabIndex={-1} className="login-callout" role="status">
                  <p className="label">{qrReason === 'no_account' ? S.noAccountLabel : S.notConnectedLabel}</p>
                  <p className="login-callout-title">{qrReason === 'no_account' ? S.noAccountTitle : S.notConnectedTitle}</p>
                  <p className="login-callout-body">{qrReason === 'no_account' ? S.noAccountBody : S.notConnectedBody}</p>
                  <Button variant="primary" size="lg" icon="whatsapp" to="/connect">
                    {qrReason === 'no_account' ? S.connect : S.relink}
                  </Button>
                </div>
              ) : (
                <Button type="submit" variant="primary" size="lg" icon="whatsapp" loading={sending} className="login-submit">
                  {S.sendCode}
                </Button>
              )}
            </div>
          </form>
        ) : (
          <form
            noValidate
            onSubmit={e => {
              e.preventDefault()
              verify()
            }}
          >
            <div className="frame-head">
              <h2 className="frame-title" id="login-frame-title">{S.codeTitle}</h2>
              <span className="frame-meta">{S.codeMeta}</span>
            </div>
            <div className="frame-body login-body">
              <p className="login-sent-text">{S.codeSent}</p>
              <p className="login-sent">
                <span className="label">{S.sentTo}</span>
                <b className="num" dir="ltr">{prettyPhone(phone)}</b>
                <button type="button" className="login-link" onClick={changeNumber}>{S.different}</button>
              </p>

              <Field label={S.codeLabel} hint={S.codeHint} htmlFor="login-code">
                <input
                  ref={codeRef}
                  id="login-code"
                  className="input login-code num"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={onCodeChange}
                  aria-invalid={codeError ? 'true' : undefined}
                  aria-describedby={codeError ? 'login-code-error' : undefined}
                  dir="ltr"
                  required
                />
              </Field>

              {codeError && <Alert S={S} kind={codeError} id="login-code-error" />}

              {resent && (
                <p className="login-resent" role="status">
                  <Icon name="check" />
                  <span>{S.resent}</span>
                </p>
              )}

              <div className="login-actions">
                <Button type="submit" variant="primary" size="lg" loading={verifying} className="login-submit">
                  {S.verify}
                </Button>
                <Button
                  variant="ghost"
                  icon="refresh"
                  disabled={waitLeft > 0 || sending}
                  loading={sending}
                  onClick={() => requestCode({ resend: true })}
                >
                  {waitLeft > 0 ? S.resendIn(waitLeft) : S.resend}
                </Button>
              </div>
            </div>
          </form>
        )}
      </section>

      <section className="login-alt" aria-labelledby="login-alt-title">
        <h2 id="login-alt-title">{S.altTitle}</h2>
        <ol className="login-alt-list">
          <li>
            <span className="login-alt-n num" aria-hidden="true">[1]</span>
            <div className="login-alt-main">
              <p className="body-serif">
                <strong>{S.alt1Title}</strong> {S.alt1Body}
              </p>
              <QuoteCard
                tone="plain"
                label={S.youSend}
                className="login-chat"
                cells={[
                  {
                    label: S.hisaabReplies,
                    value: (
                      <span className="latin login-chat-reply" dir="ltr">
                        {S.chatReply} <span className="login-chat-url">{host}/auth/magic?t=…</span>
                      </span>
                    ),
                  },
                  { label: S.linkWorks, value: S.linkOnce },
                ]}
              >
                <span className="latin" dir="ltr">“{S.chatSent}”</span>
              </QuoteCard>
            </div>
          </li>
          <li>
            <span className="login-alt-n num" aria-hidden="true">[2]</span>
            <div className="login-alt-main">
              <p className="body-serif">
                <strong>{S.alt2Title}</strong> {S.alt2Body}
              </p>
              <div className="cluster">
                <Button icon="whatsapp" to="/connect">{S.connectLink}</Button>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <Footnotes items={[{ lead: S.fnLead, text: S.fnText }]} />
    </div>
  )
}

/** A framed notice with a small label: wrong / expired / locked codes, network trouble. */
function Alert({ S, kind, id }) {
  const quiet = kind === 'short' || kind === 'network'
  return (
    <div id={id} className={`login-alert${quiet ? '' : ' is-warn'}`} role="alert">
      <Icon name="alert" />
      <div className="login-alert-main">
        <p className="label">{S.errLabel[kind]}</p>
        <p className="login-alert-text">{S.err[kind]}</p>
      </div>
    </div>
  )
}
