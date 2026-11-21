// The shop's own payment details, printed on its payment reminders so a customer can pay at once: a JazzCash,
// Easypaisa or other wallet number, a Raast ID, or a bank IBAN, with the account holder's name. Hisaab never moves
// money, never talks to a wallet or bank and takes no fee: it only prints what the shop typed. These details are never
// sent to Google (not in the understanding roster, the live call's instruction or its tool results).
//
// Pure, no imports: the web app imports this file too (Settings checks the form and previews the reminder with it).

export const PAY_KINDS = ['jazzcash', 'easypaisa', 'raast', 'bank', 'other_wallet']
export const MAX_PAY_METHODS = 3
export const NAME_MAX = 40
export const LABEL_MAX = 30
const RAW_MAX = 64

// Invisible marks phone keyboards slip in (zero-width joiners, direction marks, BOM). Anything else invisible is refused.
const INVISIBLE = /[​-‏﻿]/g
// Urdu / Arabic-Indic digits typed on an Urdu keyboard count as the same digits.
const latinDigits = s => s.replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf))
const tidy = v => latinDigits(String(v).normalize('NFC').replace(INVISIBLE, ''))
// Numbers and IBANs only: spaces, dashes, brackets, dots, and the direction marks a number copied from WhatsApp or
// the phone's contacts arrives wrapped in (U+202A-U+202E, U+2066-U+2069).
const compact = v => tidy(v).replace(/[\s\u2010-\u2015\u202A-\u202E\u2066-\u2069().-]/g, '')

/** "0300-1234567", "(0300) 1234567", "+92 300 1234567", "923001234567", "0092…", "300 1234567" -> "03001234567"; else null. */
export function normalizeMobile(input) {
  if (input == null || String(input).length > RAW_MAX) return null
  const m = /^(?:\+92|0092|92|0)?(3\d{9})$/.exec(compact(input))
  return m ? `0${m[1]}` : null
}

/** "03001234567" -> "0300 1234567" (how Pakistanis write it). */
export const formatMobile = n => `${n.slice(0, 4)} ${n.slice(4)}`

/** "pk36 scbl 0000 0011 2345 6702" -> "PK36SCBL0000001123456702" when the shape is right (checksum not checked). */
export function normalizeIban(input) {
  if (input == null || String(input).length > RAW_MAX) return null
  const s = compact(input).toUpperCase()
  return /^PK\d{2}[A-Z]{4}\d{16}$/.test(s) ? s : null
}

/** ISO 13616 / ISO 7064 mod-97: country and check digits moved to the end, letters as 10..35, remainder 1. */
export function ibanChecksumOk(iban) {
  let rest = 0
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const code = ch.charCodeAt(0)
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

/** "PK36SCBL0000001123456702" -> "PK36 SCBL 0000 0011 2345 6702" (the printed form, groups of four). */
export const formatIban = iban => iban.replace(/(.{4})(?=.)/g, '$1 ')

const isIban = v => /^PK/.test(v)
const one = s => s.trim().replace(/\s+/g, ' ')
// One letter or mark of the Latin or Arabic script (Urdu, Pashto), checked one character at a time.
const SCRIPT_LETTER = /^(?=[\p{L}\p{M}])[\p{Script=Latin}\p{Script=Arabic}\p{Script=Inherited}]$/u
const HAS_LETTER = /\p{L}/u
const allowed = (s, extra) => [...s].every(ch => extra.includes(ch) || SCRIPT_LETTER.test(ch))

/** Account holder: 1-40 letters, spaces and . - & / ' (as in "M/S Al-Rehman & Sons"), in Latin or Urdu script. */
export function cleanAccountName(input) {
  if (typeof input !== 'string') return null
  const s = one(tidy(input))
  if (!s || [...s].length > NAME_MAX || !HAS_LETTER.test(s) || !allowed(s, " .-&/'’")) return null
  return s
}

/** A bank's or wallet's name: 1-30 letters, digits, spaces and . & ' - */
export function cleanLabel(input) {
  if (typeof input !== 'string') return null
  const s = one(tidy(input))
  if (!s || [...s].length > LABEL_MAX || !HAS_LETTER.test(s) || !allowed(s, " .&'’-0123456789")) return null
  return s
}

const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v)
const blank = v => v == null || (typeof v === 'string' && !v.trim())

/** One method's value, normalised, or the error code that explains what is wrong with it. */
function methodValue(kind, raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: kind === 'bank' ? 'bad_iban' : kind === 'raast' ? 'bad_raast' : 'bad_mobile' }
  const text = String(raw)
  if (kind === 'bank' || (kind === 'raast' && /^pk/i.test(compact(text)))) {
    const iban = normalizeIban(text)
    if (!iban) return { error: kind === 'raast' ? 'bad_raast' : 'bad_iban' }
    if (!ibanChecksumOk(iban)) return { error: 'bad_iban_checksum' }
    return { value: iban }
  }
  const mobile = normalizeMobile(text)
  return mobile ? { value: mobile } : { error: kind === 'raast' ? 'bad_raast' : 'bad_mobile' }
}

/**
 * Check what the shop typed. null = remove the details. Otherwise { name, methods: [{ kind, value, label? }] } with
 * 1-3 methods. Returns { value, errors }: value is the normalised details (or null), errors is [{ error, field, index? }]
 * — every problem at once, so the form can mark each field.
 */
export function checkPayDetails(input) {
  if (input === null) return { value: null, errors: [] }
  if (!isObject(input) || !Array.isArray(input.methods)) return { value: null, errors: [{ error: 'bad_pay_details', field: 'methods' }] }
  const errors = []
  const name = cleanAccountName(input.name)
  if (!name) errors.push({ error: 'bad_account_name', field: 'name' })
  if (!input.methods.length) errors.push({ error: 'no_methods', field: 'methods' })
  if (input.methods.length > MAX_PAY_METHODS) {
    errors.push({ error: 'too_many_methods', field: 'methods' })
    return { value: null, errors }
  }
  const methods = []
  const seen = new Set()
  input.methods.forEach((m, index) => {
    if (!isObject(m) || !PAY_KINDS.includes(m.kind)) return errors.push({ error: 'bad_method_kind', field: 'kind', index })
    const { value, error } = methodValue(m.kind, m.value)
    if (error) errors.push({ error, field: 'value', index })
    let label = null
    if (m.kind === 'bank' || m.kind === 'other_wallet') {
      label = blank(m.label) ? null : cleanLabel(m.label)
      if (label == null && (m.kind === 'other_wallet' || !blank(m.label))) errors.push({ error: 'bad_label', field: 'label', index })
    }
    if (!value) return
    const key = `${m.kind}:${value}`
    if (seen.has(key)) return errors.push({ error: 'duplicate_method', field: 'value', index })
    seen.add(key)
    methods.push(label ? { kind: m.kind, value, label } : { kind: m.kind, value })
  })
  return errors.length ? { value: null, errors } : { value: { name, methods }, errors }
}

/** The saved details of a tenant row (pay_details JSON), checked again on the way out; null when there are none. */
export function payDetailsOf(tenant) {
  const raw = tenant?.pay_details
  if (!raw) return null
  try {
    return checkPayDetails(JSON.parse(raw)).value
  } catch {
    return null
  }
}

const KIND_TEXT = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', raast: 'Raast ID' }
// A name in Urdu script turns the digits after it into right-to-left numbers, so "0300 1234567" would show as
// "1234567 0300". A left-to-right mark after such a name keeps the number in the order it was typed.
const RTL_SCRIPT = /\p{Script=Arabic}/u
const ltrEnd = label => (RTL_SCRIPT.test(label) ? `${label}\u200E` : label)

/** "JazzCash 0300 1234567", "Meezan Bank IBAN PK36 SCBL …", "Raast ID 0300 1234567". */
export function methodText(m) {
  const value = isIban(m.value) ? formatIban(m.value) : formatMobile(m.value)
  if (m.kind === 'bank') return `${ltrEnd(m.label || 'Bank')} IBAN ${value}`
  if (m.kind === 'other_wallet') return `${ltrEnd(m.label)} ${value}`
  return `${KIND_TEXT[m.kind]} ${value}`
}

/**
 * The reminder's payment sentence (Roman Urdu), '' without details:
 * "Aap JazzCash 0300 1234567 (Junaid Ahmed) par bhej sakte hain." — two methods joined with "ya", three as "A, B ya C".
 */
export function payLine(details) {
  const methods = Array.isArray(details?.methods) ? details.methods.filter(m => m && PAY_KINDS.includes(m.kind) && m.value) : []
  if (!methods.length) return ''
  const items = methods.slice(0, MAX_PAY_METHODS).map(methodText)
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} ya ${items[items.length - 1]}`
  return `Aap ${list}${details.name ? ` (${details.name})` : ''} par bhej sakte hain.`
}
