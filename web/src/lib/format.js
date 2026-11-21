const DAY = 24 * 3600e3
const TZ = 'Asia/Karachi'

/** Rs 1,850 — always Western digits, no sign. */
export function money(n) {
  return `Rs ${Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-PK')}`
}

const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))

// Times keep Latin digits and AM/PM; in Urdu text they sit in a left-to-right isolate so
// "3:40 PM" does not render as "PM 3:40".
const LTR = s => `\u2066${s}\u2069`

function time(ts, lang) {
  const t = new Date(ts).toLocaleTimeString('en-PK', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  return lang === 'ur' ? LTR(t) : t
}

function date(ts, lang, withYear = false) {
  return new Date(ts).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/** "Today 3:40 pm", "Yesterday 9:10 am", "12 Oct", "12 Oct 2025". */
export function when(ts, lang = 'en', { withTime = true } = {}) {
  if (!ts) return ''
  const now = Date.now()
  const today = dayKey(now)
  const k = dayKey(ts)
  const t = withTime ? ` ${time(ts, lang)}` : ''
  if (k === today) return (lang === 'ur' ? 'آج' : 'Today') + t
  if (k === dayKey(now - DAY)) return (lang === 'ur' ? 'کل' : 'Yesterday') + t
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear()
  return date(ts, lang, !sameYear) + (withTime && now - ts < 7 * DAY ? t : '')
}

/** Full date for headers: "Monday, 26 October". */
export function longDate(ts = Date.now(), lang = 'en') {
  return new Date(ts).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
}

/** Short relative: "just now", "5 min ago", "3 days ago". */
export function ago(ts, lang = 'en') {
  if (!ts) return ''
  const s = Math.max(0, (Date.now() - ts) / 1000)
  const ur = lang === 'ur'
  if (s < 60) return ur ? 'ابھی' : 'just now'
  if (s < 3600) return ur ? `${Math.round(s / 60)} منٹ پہلے` : `${Math.round(s / 60)} min ago`
  if (s < 86400) return ur ? `${Math.round(s / 3600)} گھنٹے پہلے` : `${Math.round(s / 3600)} hr ago`
  const d = Math.round(s / 86400)
  return ur ? `${d} دن پہلے` : `${d} day${d === 1 ? '' : 's'} ago`
}

export function dayCount(days, lang = 'en') {
  if (days == null) return ''
  if (lang === 'ur') return days === 0 ? 'آج' : `${days} دن`
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`
}

export function mmss(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function initials(name = '') {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

/** Escape, then render WhatsApp markdown (*bold* _italic_ ~strike~ ```mono```) and links. */
export function whatsappHtml(text = '') {
  const esc = String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
  return esc
    .replace(/```([\s\S]*?)```/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
}
