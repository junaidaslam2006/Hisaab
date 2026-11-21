import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { config, baseUrl } from './config.js'
import { all, one, run } from './db.js'
import * as auth from './auth.js'
import * as tenants from './tenants.js'
import * as ledger from './ledger.js'
import * as wa from './whatsapp/manager.js'
import { handleMessage, publicMessage, mediaDir, idle } from './pipeline.js'
import { reminderMessage, whatsappLink } from './replies.js'
import { payDetailsOf } from './paydetails.js'
import { subscribe } from './realtime.js'
import { checkModels } from './brain.js'
import { handleLiveSocket } from './live.js'
import { normalizePhone, localPhone, newId } from './util.js'
import opsRouter from './ops.js'
import { startBackups } from './backup.js'

// Third-party libraries (Edge TTS, WhatsApp) can throw inside their own event handlers where
// no try/catch reaches. Log and keep serving every other shop instead of exiting.
process.on('uncaughtException', err => console.error('[uncaught]', err?.stack || err))
process.on('unhandledRejection', err => console.error('[unhandled]', err?.stack || err))

const app = express()
app.disable('x-powered-by')
// Only trust X-Forwarded-For from a proxy on this machine (cloudflared, nginx); otherwise anyone could fake their IP
// and dodge the rate limits. Set TRUST_PROXY to a hop count or subnet if your proxy is elsewhere.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback')
app.use(express.json({ limit: '1mb' }))

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const me = req => ({
  ...tenants.publicTenant(req.tenant),
  whatsapp: { status: req.tenant.wa_status, live: wa.whatsappState(req.tenant.id), name: req.tenant.wa_name },
  limits: { dailyMessages: config.dailyMessageLimit },
})

// ---------------------------------------------------------------- session + linking

app.get('/api/session', (req, res) => {
  const tenant = auth.tenantFromRequest(req)
  res.json({ signedIn: Boolean(tenant), tenant: tenant ? tenants.publicTenant(tenant) : null })
})

// Sliding-window rate limits kept in memory; pruned so the maps never grow without bound.
const TEN_MIN = 10 * 60 * 1000
const DAY_MS = 24 * 3600e3
const linkStarts = new Map()
const codeLinks = new Map()
const codeRequests = new Map()
const codeRequestsDaily = new Map()
const loginByIp = new Map()
const verifyByIp = new Map()
function hit(map, key, limit, windowMs = TEN_MIN) {
  const recent = (map.get(key) || []).filter(t => Date.now() - t < windowMs)
  if (recent.length >= limit) return false
  map.set(key, [...recent, Date.now()])
  return true
}
setInterval(() => {
  for (const map of [linkStarts, codeLinks, codeRequests, codeRequestsDaily, loginByIp, verifyByIp]) {
    for (const [key, times] of map) if (!times.some(t => Date.now() - t < DAY_MS)) map.delete(key)
  }
}, TEN_MIN)

app.post('/api/link', wrap(async (req, res) => {
  // Each attempt opens a WhatsApp socket: limit per address, and cap how many are open at once.
  if (wa.pendingLinks() >= 40) return res.status(429).json({ error: 'too_many_attempts' })
  if (!hit(linkStarts, req.ip, 6)) return res.status(429).json({ error: 'too_many_attempts' })

  const previous = auth.linkIdFromRequest(req)
  if (previous) wa.cancelLink(previous)
  const signedIn = auth.tenantFromRequest(req)
  const reconnect = Boolean(req.body?.reconnect && signedIn)
  // method 'code': link with an 8-character code typed on the same phone (no second screen needed).
  let phone = null
  if (req.body?.method === 'code') {
    phone = reconnect ? signedIn.phone : normalizePhone(req.body?.phone)
    if (!phone) return res.status(400).json({ error: 'bad_phone' })
    // A code request makes WhatsApp notify that number, so never let one number be spammed.
    if (!hit(codeLinks, phone, 3)) return res.status(429).json({ error: 'too_many_attempts' })
  }
  const linkId = await wa.createLink({ expectTenantId: reconnect ? signedIn.id : null, phone })
  auth.setLinkCookie(req, res, linkId)
  res.json({ ok: true })
}))

app.get('/api/link', (req, res) => {
  const linkId = auth.linkIdFromRequest(req)
  if (!linkId) return res.json({ state: 'none' })
  const status = wa.linkStatus(linkId)
  if (status.state === 'linked' && status.tenantId && !status.consumed) {
    status.consumed = true // the session is issued once, to the browser holding this link cookie
    // Re-linking an existing shop proves ownership afresh: sign out every other browser first.
    if (!status.isNew) auth.revokeSessions(status.tenantId)
    auth.startSession(req, res, status.tenantId)
    auth.clearLinkCookie(req, res)
    const t = tenants.getTenant(status.tenantId)
    return res.json({ state: 'linked', isNew: status.isNew, next: t.onboarded_at ? '/app' : '/welcome' })
  }
  if (status.state === 'mismatch') return res.json({ state: 'mismatch', phone: localPhone(status.phone) })
  res.json({ state: status.state, qr: status.qr || null, code: status.code || null, expiresAt: status.expiresAt || null })
})

app.delete('/api/link', (req, res) => {
  const linkId = auth.linkIdFromRequest(req)
  if (linkId) wa.cancelLink(linkId)
  auth.clearLinkCookie(req, res)
  res.json({ ok: true })
})

app.post('/api/login/code', wrap(async (req, res) => {
  // Limit per address first, so this can't be used to probe which numbers are shops at full speed.
  if (!hit(loginByIp, req.ip, 10)) return res.status(429).json({ error: 'too_many_attempts' })
  const phone = normalizePhone(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'bad_phone' })
  const tenant = tenants.tenantByPhone(phone)
  if (!tenant) return res.json({ method: 'qr', reason: 'no_account' })
  if (wa.whatsappState(tenant.id) !== 'open') return res.json({ method: 'qr', reason: 'not_connected' })
  if (auth.loginLocked(tenant.id)) return res.status(429).json({ error: 'too_many_attempts' })
  if (!hit(codeRequests, phone, 3) || !hit(codeRequestsDaily, phone, 10, DAY_MS)) return res.status(429).json({ error: 'too_many_attempts' })
  const code = auth.createLoginCode(tenant.id)
  await wa.sendToSelf(tenant.id, `*Hisaab login code: ${code}*\n10 minute tak chalega. Yeh code kisi ko na batayein.`)
  res.json({ method: 'code' })
}))

app.post('/api/login/verify', (req, res) => {
  if (!hit(verifyByIp, req.ip, 20)) return res.status(429).json({ error: 'too_many_attempts' })
  const tenant = tenants.tenantByPhone(normalizePhone(req.body?.phone))
  const result = tenant ? auth.verifyLoginCode(tenant.id, req.body?.code) : 'wrong'
  if (result === 'locked') return res.status(429).json({ error: 'too_many_attempts' })
  if (result === 'expired') return res.status(400).json({ error: 'code_expired' })
  if (result !== 'ok') return res.status(400).json({ error: 'wrong_code' })
  auth.startSession(req, res, tenant.id)
  res.json({ ok: true, next: tenant.onboarded_at ? '/app' : '/welcome' })
})

// Opening a one-time link shows which shop it opens; signing in needs one tap (a same-site POST), so a link
// someone else forwarded can't silently switch this browser into their account.
app.get('/auth/magic', (req, res) => {
  const token = String(req.query.t || '')
  const tenantId = auth.peekMagicLink(token)
  if (!tenantId) return res.redirect('/login?expired=1')
  const t = tenants.getTenant(tenantId)
  const current = auth.tenantFromRequest(req)
  res.setHeader('Cache-Control', 'no-store')
  res.send(magicPage({ token, shop: t.shop_name || 'your shop', phone: localPhone(t.phone), switching: current && current.id !== tenantId }))
})

app.post('/auth/magic', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
  const origin = req.headers.origin
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).send('Forbidden')
  const tenantId = auth.useMagicLink(String(req.body?.t || ''))
  if (!tenantId) return res.redirect(303, '/login?expired=1')
  auth.startSession(req, res, tenantId)
  res.redirect(303, '/app')
})

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
function magicPage({ token, shop, phone, switching }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open ${escapeHtml(shop)} · Hisaab</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ef;color:#16181a;font:16px/1.5 'IBM Plex Sans',system-ui,sans-serif;padding:16px}
main{width:100%;max-width:400px;background:#fff;border:1px solid #e2ddd2;border-radius:14px;padding:28px 24px}
.mark{width:40px;height:40px;border-radius:10px;background:#0b5d4b;color:#fff;display:grid;place-items:center;font:22px serif;padding-bottom:6px;box-sizing:border-box}
h1{font-size:22px;margin:16px 0 4px}p{color:#3c4147;margin:0 0 8px}.num{font-variant-numeric:tabular-nums}
.warn{background:#fcf1dc;color:#5c3600;border-radius:8px;padding:10px 12px;font-size:14px;margin:12px 0}
button{width:100%;min-height:52px;margin-top:16px;border:0;border-radius:8px;background:#0b5d4b;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer}
a{display:block;text-align:center;margin-top:12px;color:#0b5d4b}
</style></head><body><main>
<div class="mark">ح</div>
<h1>Open ${escapeHtml(shop)}?</h1>
<p>This link signs you in to the khata of <b>${escapeHtml(shop)}</b> (<span class="num">${escapeHtml(phone)}</span>).</p>
${switching ? '<p class="warn">You are signed in to a different shop in this browser. Continuing will switch to this one.</p>' : ''}
<form method="post" action="/auth/magic"><input type="hidden" name="t" value="${escapeHtml(token)}"><button type="submit">Open my khata</button></form>
<a href="/">Not my shop</a>
</main></body></html>`
}

app.post('/api/logout', (req, res) => {
  auth.endSession(req, res)
  res.json({ ok: true })
})

// ---------------------------------------------------------------- the signed-in shop

const api = express.Router()
api.use(auth.requireTenant)

api.get('/me', (req, res) => res.json(me(req)))

api.patch('/me', (req, res) => {
  req.tenant = tenants.updateTenant(req.tenant.id, req.body || {})
  res.json(me(req))
})

api.post('/onboarding', (req, res) => {
  tenants.updateTenant(req.tenant.id, req.body || {})
  req.tenant = tenants.setTenantSystem(req.tenant.id, { onboarded_at: req.tenant.onboarded_at || Date.now() })
  res.json(me(req))
})

api.get('/overview', (req, res) => res.json(ledger.overview(req.tenant.id)))

// Lists of people ("Factory wale", "Mohalla", "Suppliers"). General is not a list: it is everyone with listId null.
api.get('/lists', (req, res) => res.json(ledger.listLists(req.tenant.id)))

api.post('/lists', (req, res) => {
  const { name, nameUrdu, kind } = req.body || {}
  res.status(201).json(ledger.createList(req.tenant.id, { name, nameUrdu, kind }))
})

api.patch('/lists/:id', (req, res) => {
  const { name, nameUrdu } = req.body || {}
  const list = ledger.renameList(req.tenant.id, req.params.id, { name, nameUrdu })
  if (!list) return res.status(404).json({ error: 'not_found' })
  res.json(list)
})

api.delete('/lists/:id', (req, res) => {
  const out = ledger.deleteList(req.tenant.id, req.params.id)
  if (!out) return res.status(404).json({ error: 'not_found' })
  res.json(out)
})

api.get('/customers', (req, res) => res.json(ledger.listCustomers(req.tenant.id)))

api.post('/customers', (req, res) => {
  const { name, nameUrdu, phone, listId } = req.body || {}
  const c = ledger.createCustomer(req.tenant.id, { name, nameUrdu, phone, listId: listId ?? null })
  res.status(201).json(ledger.getCustomer(req.tenant.id, c.id))
})

api.get('/customers/:id', (req, res) => {
  const detail = ledger.customerDetail(req.tenant.id, req.params.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  res.json(detail)
})

api.patch('/customers/:id', (req, res) => {
  const { name, nameUrdu, phone, listId } = req.body || {}
  const c = ledger.updateCustomer(req.tenant.id, req.params.id, { name, nameUrdu, phone, listId })
  if (!c) return res.status(404).json({ error: 'not_found' })
  res.json(c)
})

api.delete('/customers/:id', (req, res) => {
  if (!ledger.deleteCustomer(req.tenant.id, req.params.id)) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

api.post('/customers/:id/merge', (req, res) => {
  const merged = ledger.mergeCustomers(req.tenant.id, req.params.id, req.body?.intoId)
  if (!merged) return res.status(400).json({ error: 'cannot_merge' })
  res.json(merged)
})

api.get('/customers/:id/reminder', (req, res) => {
  const c = ledger.getCustomer(req.tenant.id, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  // A supplier owes the shop nothing (a positive balance is what the shop owes them).
  if (c.balance <= 0 || c.listKind === 'suppliers') return res.status(409).json({ error: 'nothing_owed' })
  const pay = payDetailsOf(req.tenant)
  const text = reminderMessage(req.tenant.shop_name, c, pay)
  res.json({ text, whatsappUrl: whatsappLink(c.phone, text) || `https://wa.me/?text=${encodeURIComponent(text)}`, hasPhone: Boolean(c.phone), hasPayDetails: Boolean(pay) })
})

api.post('/entries', (req, res) => res.status(201).json(ledger.addManualEntry(req.tenant.id, req.body || {})))

api.post('/entries/:id/void', (req, res) => {
  if (!ledger.voidEntry(req.tenant.id, req.params.id, 'cancelled from dashboard')) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

api.get('/messages', (req, res) => {
  const before = Number(req.query.before) || Date.now() + 1
  const limit = Math.min(50, Number(req.query.limit) || 25)
  res.json(all('SELECT * FROM messages WHERE tenant_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?', req.tenant.id, before, limit).map(publicMessage))
})

const runInBackground = job => job.catch(err => console.error('[dashboard message]', err))

api.post('/messages/voice', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  if (!req.body?.length) return res.status(400).json({ error: 'empty_audio' })
  const id = newId('m')
  runInBackground(handleMessage(req.tenant.id, { channel: 'web', id, audio: { buffer: req.body, mimeType: req.headers['content-type'] || 'audio/webm' } }))
  res.status(202).json({ ok: true, id })
})

api.post('/messages/text', (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500)
  if (!text) return res.status(400).json({ error: 'empty_text' })
  const id = newId('m')
  runInBackground(handleMessage(req.tenant.id, { channel: 'web', id, text }))
  res.status(202).json({ ok: true, id })
})

api.get('/export.csv', (req, res) => {
  const name = (req.tenant.shop_name || 'hisaab').replace(/[^\w-]+/g, '-').toLowerCase()
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${name}-khata-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send(ledger.exportCsv(req.tenant.id))
})

api.post('/whatsapp/disconnect', wrap(async (req, res) => {
  await wa.disconnect(req.tenant.id)
  req.tenant = tenants.getTenant(req.tenant.id)
  res.json(me(req))
}))

api.delete('/me', wrap(async (req, res) => {
  await wa.disconnect(req.tenant.id)
  fs.rmSync(path.join(config.mediaDir, req.tenant.id), { recursive: true, force: true })
  tenants.deleteTenant(req.tenant.id)
  auth.endSession(req, res)
  res.json({ ok: true })
}))

// Pitch-day tools (system check, sample data), behind the same sign-in as everything above.
api.use(opsRouter)

app.use('/api', api)

// Voice notes and photos: only the shop that owns them can load them.
app.get('/media/:name', auth.requireTenant, (req, res) => {
  const name = req.params.name
  if (!/^(in|out)-m[0-9a-f]{12}\.(ogg|jpg|png|webp)$/.test(name)) return res.status(404).end()
  const file = path.join(mediaDir(req.tenant.id), name)
  if (!fs.existsSync(file)) return res.status(404).end()
  const headers = { 'Cache-Control': 'private, max-age=86400' }
  if (name.endsWith('.ogg')) headers['Content-Type'] = 'audio/ogg'
  res.sendFile(file, { headers }, err => err && !res.headersSent && res.status(404).end())
})

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }))

// ---------------------------------------------------------------- web app

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api|media|auth).*/, (req, res) => res.sendFile(path.join(config.distDir, 'index.html')))
} else {
  app.get('/', (req, res) => res.type('text').send('Web app not built yet. Run: npm run build'))
}

app.use((err, req, res, next) => {
  const status = err.status || 500
  if (status >= 500) console.error('[api]', err)
  res.status(status).json(status >= 500 ? { error: 'server_error' } : { ...err.extra, error: err.message })
})

// ---------------------------------------------------------------- WebSockets: live updates + live call

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  try {
    const { pathname } = new URL(req.url, 'http://x')
    const tenant = auth.tenantFromRequest(req)
    if (!tenant || (pathname !== '/ws' && pathname !== '/live')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return socket.destroy()
    }
    const hash = auth.sessionHash(req)
    wss.handleUpgrade(req, socket, head, ws => {
      // Signed out elsewhere (or the shop re-linked WhatsApp)? Close this socket at the next ping.
      const ping = setInterval(() => {
        if (!auth.sessionValid(hash)) return ws.close(4401, 'signed_out')
        if (ws.readyState === ws.OPEN) ws.ping()
      }, 25000)
      ws.on('close', () => clearInterval(ping))
      if (pathname === '/live') return handleLiveSocket(ws, tenant)
      const unsubscribe = subscribe(tenant.id, event => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
      })
      ws.on('close', unsubscribe)
    })
  } catch (err) {
    console.warn('[ws] bad upgrade request', err?.message)
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
  }
})

// Messages that were mid-way when the server stopped. The ledger is only touched in one synchronous step, so
// anything not yet at 'speaking' wrote nothing: mark it, and tell each shop once on WhatsApp to resend.
// Rows at 'speaking' had already written their entries.
for (const r of all("SELECT tenant_id, COUNT(*) AS n FROM messages WHERE status IN ('received', 'thinking') AND channel = 'whatsapp' GROUP BY tenant_id")) {
  wa.queueRestartNotice(r.tenant_id, r.n)
}
run("UPDATE messages SET status = 'error', error = 'interrupted' WHERE status IN ('received', 'thinking')")
run("UPDATE messages SET status = 'done' WHERE status = 'speaking'")

// Clean stop (Ctrl+C, service restart): take no new messages, let the ones in progress finish (max 20 s).
let stopping = false
async function shutdown(signal) {
  if (stopping) return
  stopping = true
  console.log(`\n[${signal}] finishing messages in progress…`)
  wa.stopAccepting()
  await Promise.race([idle(), new Promise(r => setTimeout(r, 20000))])
  server.close()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

server.listen(config.port, async () => {
  console.log(`\n  Hisaab is running`)
  console.log(`  This computer:  http://localhost:${config.port}`)
  console.log(`  Phones (same Wi-Fi) / login links:  ${baseUrl()}\n`)
  startBackups()
  const restored = await wa.restoreAll()
  if (restored) console.log(`[whatsapp] reconnecting ${restored} shop${restored > 1 ? 's' : ''}`)
  const status = await checkModels()
  console.log(status.ok ? `[gemini] ready: ${status.available.join(', ')}` : `[gemini] NOT ready: ${String(status.reason).slice(0, 200)}`)
  const shops = one('SELECT COUNT(*) AS n FROM tenants').n
  console.log(`[db] ${shops} shop${shops === 1 ? '' : 's'}`)
  setInterval(auth.pruneAuth, 3600e3)
})
