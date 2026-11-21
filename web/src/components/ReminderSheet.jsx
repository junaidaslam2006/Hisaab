import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import { Button, Field, Money } from './ui.jsx'
import { LabeledCells, QuoteCard } from './editorial.jsx'
import { useToast } from './Toast.jsx'
import { api } from '../lib/api.js'
import { useStrings, useCommon, useLang } from '../lib/i18n.jsx'
import { useMe } from '../lib/me.jsx'
import '../lib/lists.jsx'

// One quiet line when the shop has no payment details yet (Settings → Payment details on reminders). Never on WhatsApp.
const PAY_TIP = {
  en: (
    <>
      <Link to="/app/settings#set-pay">Add your JazzCash, Easypaisa or Raast number</Link> so customers can pay at once.
    </>
  ),
  ur: (
    <>
      <Link to="/app/settings#set-pay">اپنا جاز کیش، ایزی پیسہ یا راست نمبر لکھیں</Link> تاکہ گاہک فوراً ادائیگی کر سکیں۔
    </>
  ),
}

const STRINGS = {
  en: {
    title: n => `Remind ${n}`,
    desc: 'A polite message from your own WhatsApp. Nothing is sent until you press Send in WhatsApp.',
    owes: 'Balance',
    to: 'To',
    message: 'Message from your WhatsApp',
    open: 'Open in WhatsApp',
    copy: 'Copy message',
    copied: 'Message copied',
    phone: 'Customer’s WhatsApp number',
    phoneHint: 'Save it once and future reminders open their chat directly.',
    savePhone: 'Save number',
    savedPhone: 'Number saved',
    badPhone: 'Enter a number like 0300 1234567',
    failed: 'Could not load the reminder.',
    nothingOwed: 'Nothing is owed now, so there is nothing to remind.',
  },
  ur: {
    title: n => `\u2068${n}\u2069 کو یاد دہانی`,
    desc: 'آپ کے اپنے واٹس ایپ سے ایک شائستہ پیغام۔ جب تک آپ واٹس ایپ میں بھیجیں نہ دبائیں، کچھ نہیں جائے گا۔',
    owes: 'بقایا',
    to: 'بنام',
    message: 'آپ کے واٹس ایپ سے پیغام',
    open: 'واٹس ایپ میں کھولیں',
    copy: 'پیغام کاپی کریں',
    copied: 'پیغام کاپی ہو گیا',
    phone: 'گاہک کا واٹس ایپ نمبر',
    phoneHint: 'ایک بار محفوظ کریں، آئندہ یاد دہانی سیدھی ان کی چیٹ میں کھلے گی۔',
    savePhone: 'نمبر محفوظ کریں',
    savedPhone: 'نمبر محفوظ ہو گیا',
    badPhone: 'نمبر ایسے لکھیں: 0300 1234567',
    failed: 'یاد دہانی لوڈ نہیں ہو سکی۔',
    nothingOwed: 'اب کوئی بقایا نہیں، اس لیے یاد دہانی کی ضرورت نہیں۔',
  },
}

/** Reminder for one customer: preview + open their WhatsApp chat with the message typed in. */
export default function ReminderSheet({ open, onClose, customer, onChanged }) {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const { lang } = useLang()
  const toast = useToast()
  const [data, setData] = useState(null)
  // null | 'nothing_owed' | 'failed' — shown in place of "Loading…" when there is no reminder to show.
  const [loadError, setLoadError] = useState(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoadError(null)
    return api(`/api/customers/${customer.id}/reminder`)
      .then(setData)
      .catch(err => setLoadError(err?.code === 'nothing_owed' ? 'nothing_owed' : 'failed'))
  }

  // The retry button goes away while loading: park focus on the dialog so Escape and Tab keep working.
  const retry = e => {
    e.currentTarget.closest('[role="dialog"]')?.focus()
    load()
  }

  useEffect(() => {
    if (!open || !customer) return
    setData(null)
    setPhone('')
    setPhoneError('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id])

  async function savePhone(e) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return setPhoneError(S.badPhone)
    // This button is disabled while saving, then the whole field goes away: keep focus inside the dialog.
    e.currentTarget.closest('[role="dialog"]')?.focus()
    setSaving(true)
    try {
      await api(`/api/customers/${customer.id}`, { method: 'PATCH', body: { phone } })
      toast.success(S.savedPhone)
      onChanged?.()
      await load()
    } catch {
      setPhoneError(S.badPhone)
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.text)
      toast.success(S.copied)
    } catch {}
  }

  if (!customer) return null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={S.title(customer.name)}
      description={S.desc}
      footer={
        <>
          <Button variant="ghost" onClick={copy} disabled={!data}>{S.copy}</Button>
          {/* Disabled until loaded, so it is never the control that gets focus while it is still a <button>. */}
          <Button variant="primary" icon="whatsapp" href={data?.whatsappUrl} target="_blank" rel="noopener" disabled={!data}>{S.open}</Button>
        </>
      }
    >
      <QuoteCard
        tone="plain"
        label={S.message}
        cells={[
          { label: S.to, value: customer.name },
          { label: S.owes, value: <Money value={customer.balance} tone="auto" /> },
        ]}
      >
        {data ? (
          <span className="reminder-preview latin">{data.text}</span>
        ) : (
          <span className="muted">{loadError === 'nothing_owed' ? S.nothingOwed : loadError ? S.failed : C.loading}</span>
        )}
      </QuoteCard>
      {!data && loadError === 'failed' && (
        <div>
          <Button size="sm" icon="refresh" onClick={retry}>{C.retry}</Button>
        </div>
      )}
      {data && !data.hasPhone && (
        <Field label={S.phone} hint={S.phoneHint} error={phoneError} htmlFor="reminder-phone">
          <div className="reminder-phone">
            <input id="reminder-phone" className="input num" inputMode="tel" placeholder="0300 1234567" value={phone} onChange={e => setPhone(e.target.value)} aria-invalid={Boolean(phoneError)} />
            <Button onClick={savePhone} loading={saving}>{S.savePhone}</Button>
          </div>
        </Field>
      )}
      {data && data.hasPayDetails === false && <p className="lst-remind-note">{PAY_TIP[lang] || PAY_TIP.en}</p>}
    </Sheet>
  )
}

const LIST_STRINGS = {
  en: {
    title: n => `Remind everyone in ${n}`,
    desc: 'One polite WhatsApp message for each person who owes you, from your own WhatsApp. Nothing is sent until you press Send in each chat.',
    cellOwing: 'Owe you',
    cellTotal: 'Together',
    cellNoPhone: 'No number saved',
    people: n => (n === 1 ? '1 person' : `${n} people`),
    openChat: 'Open chat',
    pickChat: 'Choose chat',
    openChatFor: n => `Open the reminder for ${n} in WhatsApp`,
    noNumber: 'No number saved',
    opened: 'Opened',
    failedRow: 'Try again',
    failedRowFor: n => `Could not load the reminder for ${n}. Try again`,
    noPhoneNote: n =>
      `${n === 1 ? '1 person has' : `${n} people have`} no WhatsApp number saved. “Choose chat” opens WhatsApp with the message typed in, and you pick their chat. Save their number on their page to skip this next time.`,
    done: 'Done',
  },
  ur: {
    title: n => `⁨${n}⁩ میں سب کو یاد دہانی`,
    desc: 'ہر اس شخص کے لیے جس کے ذمے ادھار ہے، آپ کے اپنے واٹس ایپ سے ایک شائستہ پیغام۔ جب تک آپ ہر چیٹ میں بھیجیں نہ دبائیں، کچھ نہیں جائے گا۔',
    cellOwing: 'ادھار والے',
    cellTotal: 'کل',
    cellNoPhone: 'نمبر محفوظ نہیں',
    people: n => (n === 1 ? 'ایک شخص' : `${n} لوگ`),
    openChat: 'چیٹ کھولیں',
    pickChat: 'چیٹ چنیں',
    openChatFor: n => `⁨${n}⁩ کی یاد دہانی واٹس ایپ میں کھولیں`,
    noNumber: 'نمبر محفوظ نہیں',
    opened: 'کھول دی',
    failedRow: 'دوبارہ کوشش کریں',
    failedRowFor: n => `⁨${n}⁩ کی یاد دہانی لوڈ نہیں ہو سکی۔ دوبارہ کوشش کریں`,
    noPhoneNote: n =>
      `${n === 1 ? 'ایک شخص کا' : `${n} لوگوں کا`} واٹس ایپ نمبر محفوظ نہیں۔ چیٹ چنیں دبانے سے واٹس ایپ پیغام لکھا ہوا کھولے گا اور آپ ان کی چیٹ خود چن لیں گے۔ اگلی بار کے لیے ان کے صفحے پر نمبر محفوظ کر دیں۔`,
    done: 'ہو گیا',
  },
}

/** Fetch every reminder, at most 4 at a time; `onEach(id, result)` as each one lands. */
async function loadAll(people, onEach, isCurrent) {
  const queue = people.slice()
  const worker = async () => {
    while (queue.length && isCurrent()) {
      const p = queue.shift()
      try {
        const data = await api(`/api/customers/${encodeURIComponent(p.id)}/reminder`)
        if (isCurrent()) onEach(p.id, { status: 'ok', data })
      } catch {
        if (isCurrent()) onEach(p.id, { status: 'failed' })
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

/**
 * Reminders for everyone owing in one customers list: each person's own WhatsApp link (their chat when the number is
 * saved, else WhatsApp's chat picker), how many have no number saved, and a tick once a chat was opened.
 * `people`: the list's customers with balance > 0. `listLabel`: the list's name as the page shows it.
 */
export function ListReminderSheet({ open, onClose, listLabel, people = [] }) {
  const S = useStrings(LIST_STRINGS)
  const { lang } = useLang()
  const { me } = useMe()
  // Snapshot at open: a realtime refresh must not reorder the rows under the shopkeeper's thumb.
  const [rows, setRows] = useState([])
  const [state, setState] = useState({})
  const [opened, setOpened] = useState(() => new Set())
  // One token per opening: closing the sheet drops late answers, a single-row retry does not cancel the other rows.
  const opening = useRef(0)

  const fetchRows = list => {
    const mine = opening.current
    setState(s => ({ ...s, ...Object.fromEntries(list.map(p => [p.id, { status: 'loading' }])) }))
    loadAll(list, (id, result) => setState(s => ({ ...s, [id]: result })), () => opening.current === mine)
  }

  useEffect(() => {
    opening.current++
    if (!open) return
    const list = people.slice().sort((a, b) => b.balance - a.balance)
    setRows(list)
    setState({})
    setOpened(new Set())
    fetchRows(list)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const noPhone = rows.filter(p => !p.phone).length
  const total = rows.reduce((s, p) => s + p.balance, 0)
  const nameOf = p => (lang === 'ur' && p.nameUrdu) || p.name

  return (
    <Sheet open={open} onClose={onClose} title={S.title(listLabel)} description={S.desc} wide footer={<Button variant="primary" onClick={onClose}>{S.done}</Button>}>
      <LabeledCells
        tone="plain"
        min={120}
        cells={[
          { key: 'owing', label: S.cellOwing, value: S.people(rows.length) },
          { key: 'total', label: S.cellTotal, value: <Money value={total} tone="owed" /> },
          { key: 'nophone', label: S.cellNoPhone, value: <span className="num">{noPhone}</span> },
        ]}
      />
      <ul className="lst-remind">
        {rows.map(p => {
          const st = state[p.id] || { status: 'loading' }
          const name = nameOf(p)
          return (
            <li key={p.id} className="lst-remind-row">
              <span className="lst-remind-who">
                <bdi className="lst-remind-name" dir="auto">{name}</bdi>
                <span className="lst-remind-meta">
                  {p.phoneLocal ? <bdi className="num" dir="ltr">{p.phoneLocal}</bdi> : S.noNumber}
                  {opened.has(p.id) && (
                    <span className="lst-remind-opened">
                      <Icon name="check" size="sm" />
                      {S.opened}
                    </span>
                  )}
                </span>
              </span>
              <Money value={p.balance} tone="owed" className="lst-remind-amt" />
              <span className="lst-remind-act">
                {st.status === 'ok' ? (
                  <Button
                    size="sm"
                    variant={st.data.hasPhone ? 'primary' : 'secondary'}
                    icon="whatsapp"
                    href={st.data.whatsappUrl}
                    target="_blank"
                    rel="noopener"
                    aria-label={S.openChatFor(name)}
                    onClick={() => setOpened(s => new Set(s).add(p.id))}
                  >
                    {st.data.hasPhone ? S.openChat : S.pickChat}
                  </Button>
                ) : st.status === 'failed' ? (
                  <Button size="sm" icon="refresh" aria-label={S.failedRowFor(name)} onClick={() => fetchRows([p])}>
                    {S.failedRow}
                  </Button>
                ) : (
                  <span className="spinner" aria-hidden="true" />
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {noPhone > 0 && <p className="lst-remind-note">{S.noPhoneNote(noPhone)}</p>}
      {me && !me.payDetails && <p className="lst-remind-note">{PAY_TIP[lang] || PAY_TIP.en}</p>}
    </Sheet>
  )
}
