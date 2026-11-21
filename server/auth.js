import crypto from 'node:crypto'
import { one, run } from './db.js'
import { config } from './config.js'
import { randomToken, sha256, DAY } from './util.js'
import { getTenant } from './tenants.js'

// No passwords: owning the WhatsApp number IS the login.
// - Scanning the QR proves the number (WhatsApp Web style).
// - A 6-digit code can be sent to the shop's own WhatsApp.
// - Sending "dashboard" to yourself on WhatsApp returns a one-time link.

const SESSION_COOKIE = 'hisaab_session'
const LINK_COOKIE = 'hisaab_link'

export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      // A malformed value (bad % escape) is ignored rather than crashing the request.
    }
  }
  return out
}

function cookie(req, name, value, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
}

function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value)
}

export function startSession(req, res, tenantId) {
  const token = randomToken()
  const now = Date.now()
  run(
    'INSERT INTO sessions (token_hash, tenant_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    sha256(token), tenantId, now, now + config.sessionDays * DAY, String(req.headers['user-agent'] || '').slice(0, 200),
  )
  appendCookie(res, cookie(req, SESSION_COOKIE, token, config.sessionDays * 86400))
}

export function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
  appendCookie(res, cookie(req, SESSION_COOKIE, '', 0))
}

/** Hash of this request's session token (to tie WebSockets to a session), or null. */
export function sessionHash(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  return token ? sha256(token) : null
}

export function sessionValid(hash) {
  return Boolean(hash && one('SELECT 1 AS x FROM sessions WHERE token_hash = ? AND expires_at > ?', hash, Date.now()))
}

/** Sign the shop out everywhere (e.g. after its WhatsApp was re-linked). */
export function revokeSessions(tenantId) {
  run('DELETE FROM sessions WHERE tenant_id = ?', tenantId)
}

export function tenantFromRequest(req) {
  const hash = sessionHash(req)
  if (!hash) return null
  const s = one('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', hash, Date.now())
  return s ? getTenant(s.tenant_id) : null
}

export function requireTenant(req, res, next) {
  const tenant = tenantFromRequest(req)
  if (!tenant) return res.status(401).json({ error: 'not_signed_in' })
  req.tenant = tenant
  next()
}

// ---------- QR link attempts are bound to the browser that started them ----------

export function setLinkCookie(req, res, linkId) {
  appendCookie(res, cookie(req, LINK_COOKIE, linkId, Math.ceil(config.linkTimeoutMs / 1000) + 600))
}

export function linkIdFromRequest(req) {
  return parseCookies(req.headers.cookie)[LINK_COOKIE] || null
}

export function clearLinkCookie(req, res) {
  appendCookie(res, cookie(req, LINK_COOKIE, '', 0))
}

// ---------- 6-digit WhatsApp codes ----------

export function createLoginCode(tenantId) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  run(
    'INSERT INTO login_codes (tenant_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(tenant_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0',
    tenantId, sha256(`${tenantId}:${code}`), Date.now() + 10 * 60 * 1000,
  )
  return code
}

/**
 * Wrong guesses are counted per shop across ALL codes (a new code does not reset them): every 10th wrong
 * guess locks code login for 1 hour, and from the 20th for 24 hours. A successful login resets the count.
 */
export function loginLocked(tenantId) {
  const t = one('SELECT login_locked_until FROM tenants WHERE id = ?', tenantId)
  return Boolean(t?.login_locked_until && t.login_locked_until > Date.now())
}

function recordWrongGuess(tenantId) {
  run('UPDATE tenants SET login_fails = login_fails + 1 WHERE id = ?', tenantId)
  const { login_fails: fails } = one('SELECT login_fails FROM tenants WHERE id = ?', tenantId)
  if (fails % 10 === 0) run('UPDATE tenants SET login_locked_until = ? WHERE id = ?', Date.now() + (fails >= 20 ? 24 : 1) * 3600e3, tenantId)
}

/** Returns 'ok', 'wrong', 'expired' (ask for a new code) or 'locked' (too many wrong tries). */
export function verifyLoginCode(tenantId, code) {
  if (loginLocked(tenantId)) return 'locked'
  const row = one('SELECT * FROM login_codes WHERE tenant_id = ?', tenantId)
  // No code was asked for: nothing to guess, so don't count it (that would let anyone lock the shop out).
  if (!row) return 'wrong'
  if (row.attempts >= 5) return 'locked'
  if (row.expires_at < Date.now()) return 'expired'
  if (row.code_hash !== sha256(`${tenantId}:${String(code).trim()}`)) {
    run('UPDATE login_codes SET attempts = attempts + 1 WHERE tenant_id = ?', tenantId)
    recordWrongGuess(tenantId)
    return row.attempts + 1 >= 5 || loginLocked(tenantId) ? 'locked' : 'wrong'
  }
  run('DELETE FROM login_codes WHERE tenant_id = ?', tenantId)
  run('UPDATE tenants SET login_fails = 0, login_locked_until = NULL WHERE id = ?', tenantId)
  return 'ok'
}

// ---------- one-time magic links (sent on WhatsApp) ----------

export function createMagicLink(tenantId) {
  const token = randomToken(24)
  run('INSERT INTO magic_links (token_hash, tenant_id, expires_at) VALUES (?, ?, ?)', sha256(token), tenantId, Date.now() + 15 * 60 * 1000)
  return token
}

/** The shop a one-time link would sign into, without using it up (for the confirmation page). */
export function peekMagicLink(token) {
  const row = one('SELECT * FROM magic_links WHERE token_hash = ?', sha256(token || ''))
  return row && !row.used_at && row.expires_at > Date.now() ? row.tenant_id : null
}

export function useMagicLink(token) {
  const row = one('SELECT * FROM magic_links WHERE token_hash = ?', sha256(token || ''))
  if (!row || row.used_at || row.expires_at < Date.now()) return null
  run('UPDATE magic_links SET used_at = ? WHERE token_hash = ?', Date.now(), row.token_hash)
  return row.tenant_id
}

export function pruneAuth() {
  const now = Date.now()
  run('DELETE FROM sessions WHERE expires_at < ?', now)
  run('DELETE FROM magic_links WHERE expires_at < ?', now - DAY)
  run('DELETE FROM login_codes WHERE expires_at < ?', now)
}
