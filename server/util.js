import crypto from 'node:crypto'

export const newId = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
export const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex')

export const TZ = 'Asia/Karachi'
export const DAY = 24 * 3600e3
export const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts))

/** Start of "today" in Pakistan time, as a UTC timestamp. */
export function startOfToday(now = Date.now()) {
  const key = dayKey(now)
  return Date.parse(`${key}T00:00:00+05:00`)
}

/**
 * Normalise Pakistani phone numbers to international digits (923001234567).
 * Accepts 03001234567, +92 300 1234567, 0092..., 3001234567.
 */
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0092')) d = d.slice(2)
  if (d.startsWith('92') && d.length === 12) return d
  if (d.startsWith('0') && d.length === 11) return '92' + d.slice(1)
  if (d.startsWith('3') && d.length === 10) return '92' + d
  return d.length >= 10 && d.length <= 15 ? d : ''
}

/** 923001234567 -> 0300 1234567 (how Pakistanis write it). */
export function localPhone(digits) {
  if (!digits) return ''
  if (digits.startsWith('92') && digits.length === 12) return `0${digits.slice(2, 5)} ${digits.slice(5)}`
  return `+${digits}`
}

export const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)))
