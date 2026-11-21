import { one, all, run } from './db.js'
import { newId, localPhone } from './util.js'
import { checkPayDetails, payDetailsOf } from './paydetails.js'

const httpError = (status, code, extra) => Object.assign(new Error(code), { status }, extra ? { extra } : {})

const EDITABLE = {
  shop_name: v => String(v || '').trim().slice(0, 60) || null,
  owner_name: v => String(v || '').trim().slice(0, 60) || null,
  city: v => String(v || '').trim().slice(0, 60) || null,
  business_type: v => (['kiryana', 'pharmacy', 'wholesale', 'clothing', 'hardware', 'mobile', 'other'].includes(v) ? v : 'other'),
  ui_lang: v => (v === 'ur' ? 'ur' : 'en'),
  voice_replies: v => (v ? 1 : 0),
}

export const getTenant = id => (id ? one('SELECT * FROM tenants WHERE id = ?', id) : null)
export const tenantByPhone = phone => (phone ? one('SELECT * FROM tenants WHERE phone = ?', phone) : null)
export const tenantsWithWhatsApp = () => all("SELECT * FROM tenants WHERE wa_dir IS NOT NULL AND wa_status != 'logged_out'")

export function createTenant(phone) {
  const id = newId('t')
  run('INSERT INTO tenants (id, phone, created_at, voice_replies) VALUES (?, ?, ?, 0)', id, phone, Date.now())
  return getTenant(id)
}

export function updateTenant(id, patch) {
  const sets = []
  const values = []
  for (const [key, value] of Object.entries(patch)) {
    if (EDITABLE[key]) {
      sets.push(`${key} = ?`)
      values.push(EDITABLE[key](value))
    }
  }
  // Payment details for reminders: checked strictly (nothing is saved if any part is wrong); null removes them.
  if (Object.hasOwn(patch, 'payDetails')) {
    const { value, errors } = checkPayDetails(patch.payDetails)
    if (errors.length) throw httpError(400, errors[0].error, { field: errors[0].field, index: errors[0].index, errors })
    sets.push('pay_details = ?')
    values.push(value ? JSON.stringify(value) : null)
  }
  if (sets.length) run(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, ...values, id)
  return getTenant(id)
}

/** Internal fields (WhatsApp link state, timestamps) — never from user input. */
export function setTenantSystem(id, patch) {
  const allowed = ['wa_dir', 'wa_status', 'wa_jid', 'wa_lid', 'wa_name', 'onboarded_at', 'first_message_at', 'last_message_at']
  const keys = Object.keys(patch).filter(k => allowed.includes(k))
  if (!keys.length) return getTenant(id)
  run(`UPDATE tenants SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => patch[k]), id)
  return getTenant(id)
}

export function deleteTenant(id) {
  run('DELETE FROM tenants WHERE id = ?', id)
}

/** What the browser is allowed to see about the signed-in shop. */
export function publicTenant(t) {
  if (!t) return null
  return {
    id: t.id,
    phone: t.phone,
    phoneLocal: localPhone(t.phone),
    shopName: t.shop_name,
    ownerName: t.owner_name,
    city: t.city,
    businessType: t.business_type,
    uiLang: t.ui_lang,
    voiceReplies: Boolean(t.voice_replies),
    whatsapp: { status: t.wa_status, name: t.wa_name },
    createdAt: t.created_at,
    onboarded: Boolean(t.onboarded_at),
    firstMessageAt: t.first_message_at,
    // { name, methods: [{ kind, value, label? }] } or null: printed on reminders, never sent to Google.
    payDetails: payDetailsOf(t),
  }
}
