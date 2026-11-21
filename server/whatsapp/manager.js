import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import QRCode from 'qrcode'
import makeWASocket, {
  DisconnectReason,
  areJidsSameUser,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from 'baileys'
import { config } from '../config.js'
import { publish, linkEvents } from '../realtime.js'
import * as tenants from '../tenants.js'
import { handleMessage, alreadyHandled, reserveTurn, registerIncoming, markFailed } from '../pipeline.js'
import { one, run } from '../db.js'
import { BOT_MARK, HELP_TEXT } from '../replies.js'
import { newId, DAY } from '../util.js'

// One WhatsApp Web connection per shop. Each shop links its own number by scanning a QR
// (like WhatsApp Web); Hisaab then reads ONLY that number's "Message yourself" chat.

const logger = pino({ level: process.env.WA_LOG_LEVEL || 'error' })
const sessions = new Map() // tenantId -> Connection
const links = new Map() // linkId -> Connection (QR shown, not linked yet)

let cachedVersion = null
async function waVersion() {
  if (!cachedVersion) {
    try {
      ({ version: cachedVersion } = await fetchLatestBaileysVersion())
    } catch {}
  }
  return cachedVersion
}

const dirPath = name => path.join(config.waDir, name)
const digitsOf = jid => jidNormalizedUser(jid).split('@')[0].split(':')[0]

function remember(set, id) {
  set.add(id)
  if (set.size > 3000) set.delete(set.values().next().value)
}

class Connection {
  constructor({ dirName, tenantId = null, linkId = null, expectTenantId = null, pairPhone = null }) {
    this.dirName = dirName
    this.tenantId = tenantId
    this.linkId = linkId
    this.expectTenantId = expectTenantId
    this.pairPhone = pairPhone // link with an 8-character code instead of a QR (one-phone shopkeepers)
    this.pairCode = null
    this.expiresAt = null
    this.state = 'starting'
    this.qr = null
    this.isNew = false
    this.linkResult = null // set once the QR attempt finishes: linked / mismatch
    this.sock = null
    this.stopped = false
    this.failures = 0
    this.seen = new Set()
    this.sentIds = new Set()
    this.botIds = new Set()
    this.logoutFailed = false
  }

  setState(state, extra = {}) {
    Object.assign(this, extra, { state })
    if (this.linkId) linkEvents.emit(this.linkId, this.linkStatus())
    if (this.tenantId) {
      const waStatus = { open: 'connected', reconnecting: 'reconnecting', logged_out: 'logged_out', replaced: 'disconnected' }[state]
      if (waStatus) tenants.setTenantSystem(this.tenantId, { wa_status: waStatus })
      publish(this.tenantId, 'tenant')
    }
  }

  linkStatus() {
    if (this.linkResult) return this.linkResult
    return { state: this.state, qr: this.state === 'qr' ? this.qr : null, code: this.state === 'code' ? this.pairCode : null, expiresAt: this.expiresAt }
  }

  async start() {
    if (this.stopped) return
    this.pairingRequested = false
    fs.mkdirSync(dirPath(this.dirName), { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(dirPath(this.dirName))
    if (this.stopped) return // stopped (disconnect/delete) while the auth files were loading
    const sock = makeWASocket({
      version: await waVersion(),
      auth: state,
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      // In code mode the owner needs time to find "Link with phone number instead"; keep the socket for the whole link window.
      ...(this.pairPhone ? { qrTimeout: config.linkTimeoutMs } : {}),
    })
    if (this.stopped) {
      sock.end(undefined)
      return
    }
    this.sock = sock
    sock.ev.on('creds.update', saveCreds)
    // Messages the owner sends to Meta AI (@bot) can arrive looking like self-chat messages; note their ids
    // from the raw frame (before Baileys decodes them) so they are never read as khata entries.
    sock.ws.on('CB:message', node => {
      if (String(node?.attrs?.recipient || '').endsWith('@bot') && node.attrs.id) remember(this.botIds, node.attrs.id)
    })
    sock.ev.on('connection.update', update => this.onConnection(sock, update).catch(err => console.error('[wa] connection handler', err)))
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (sock !== this.sock) return
      for (const m of messages) this.onMessage(m, type).catch(err => console.error(`[wa ${this.tenantId}] message failed`, err?.message || err))
    })
    // Baileys issue #2858: some accounts drop every ~50 min because <status> stanzas are never acked.
    sock.ws.on('CB:status', node => sock.sendMessageAck?.(node).catch(() => {}))
  }

  async onConnection(sock, update) {
    if (sock !== this.sock || this.stopped) return
    if (update.qr && this.pairPhone) {
      // The socket is ready to pair. Ask WhatsApp for a code the owner types on the same phone.
      if (!this.pairingRequested && !sock.authState.creds.registered) {
        this.pairingRequested = true
        try {
          const code = await sock.requestPairingCode(this.pairPhone)
          this.pairCode = String(code).replace(/^(.{4})(.{4})$/, '$1-$2')
          this.setState('code')
        } catch (err) {
          console.warn('[wa] pairing code failed', err?.message)
          this.setState('error')
        }
      }
    } else if (update.qr) {
      this.qr = await QRCode.toDataURL(update.qr, { margin: 1, width: 400, color: { dark: '#111111', light: '#ffffff' } })
      this.setState('qr')
    }
    if (update.connection === 'open') {
      this.failures = 0
      if (this.linkId && !this.tenantId) await this.completeLink(sock)
      else this.setState('open')
      this.sendRestartNotice()
    }
    if (update.connection === 'close') {
      const code = update.lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) return this.onLoggedOut()
      if (code === DisconnectReason.connectionReplaced) {
        this.stopped = true
        return this.setState('replaced')
      }
      if (this.linkId && this.state === 'expired') return
      // A pairing-code link that drops before the code was entered can't resume with half-written
      // credentials: start clean so WhatsApp issues a new code.
      if (this.pairPhone && !this.tenantId && !sock.authState.creds.registered) {
        fs.rmSync(dirPath(this.dirName), { recursive: true, force: true })
        this.pairCode = null
        this.setState('starting')
      }
      this.failures++
      if (this.tenantId) this.setState('reconnecting')
      const wait = code === DisconnectReason.restartRequired ? 300 : Math.min(30000, 2000 * this.failures)
      setTimeout(() => this.start().catch(err => console.error('[wa] restart failed', err)), wait)
    }
  }

  /** First successful scan: find or create the shop for this number and hand over the session. */
  async completeLink(sock) {
    const phone = digitsOf(sock.user.id)
    if (this.expectTenantId) {
      const expected = tenants.getTenant(this.expectTenantId)
      if (!expected || expected.phone !== phone) {
        this.linkResult = { state: 'mismatch', phone }
        this.setState('mismatch')
        await this.stop({ logout: true, removeDir: true })
        return
      }
    }
    const existing = tenants.tenantByPhone(phone)
    const tenant = existing || tenants.createTenant(phone)
    const previous = sessions.get(tenant.id)
    // If the old connection is mid-reconnect its logout can't reach WhatsApp; tell the owner to remove it.
    const staleDevice = Boolean(previous && previous !== this && previous.state !== 'open')
    if (previous && previous !== this) await previous.stop({ logout: true, removeDir: true })
    else if (tenant.wa_dir && tenant.wa_dir !== this.dirName) fs.rmSync(dirPath(tenant.wa_dir), { recursive: true, force: true })

    this.tenantId = tenant.id
    this.isNew = !existing
    sessions.set(tenant.id, this)
    tenants.setTenantSystem(tenant.id, {
      wa_dir: this.dirName,
      wa_status: 'connected',
      wa_jid: jidNormalizedUser(sock.user.id),
      wa_lid: sock.user.lid || null,
      wa_name: sock.user.name || sock.user.verifiedName || null,
    })
    this.linkResult = { state: 'linked', tenantId: tenant.id, isNew: this.isNew }
    links.delete(this.linkId)
    this.setState('open')

    const hello = this.isNew
      ? `${BOT_MARK}*Hisaab connect ho gaya* ✓\nAb isi chat mein voice note bhejein, jaise:\n"Umar ne 500 ka sauda liya"\n\nHisaab aap ka khata likh kar jawab dega. Madad ke liye "help" likhein.`
      : `${BOT_MARK}*Hisaab dobara connect ho gaya* ✓\nAap ka khata mehfooz hai.${staleDevice ? '\n\nWhatsApp > Linked devices mein agar purana "Hisaab" device nazar aaye to usay hata dein.' : ''}`
    this.sendToSelf(hello).catch(() => {})
    if (this.isNew) setTimeout(() => this.sendToSelf(`${BOT_MARK}${HELP_TEXT}`).catch(() => {}), 1500)
  }

  onLoggedOut() {
    this.stopped = true
    fs.rmSync(dirPath(this.dirName), { recursive: true, force: true })
    if (this.tenantId) {
      sessions.delete(this.tenantId)
      tenants.setTenantSystem(this.tenantId, { wa_status: 'logged_out', wa_dir: null })
      this.setState('logged_out')
    } else {
      this.setState('error')
      links.delete(this.linkId)
    }
  }

  async stop({ logout = false, removeDir = false } = {}) {
    this.stopped = true
    const sock = this.sock
    this.sock = null
    try {
      if (logout) await sock?.logout()
    } catch {
      // Not connected at this moment, so WhatsApp still lists the device; the owner can remove it there.
      this.logoutFailed = true
    } finally {
      try {
        sock?.end(undefined)
      } catch {}
    }
    if (removeDir) fs.rmSync(dirPath(this.dirName), { recursive: true, force: true })
  }

  /** After a restart: tell the owner once if notes they sent were cut off before being written. */
  sendRestartNotice() {
    const count = restartNotices.get(this.tenantId)
    if (!count) return
    restartNotices.delete(this.tenantId)
    const text = `*Hisaab*\nServer restart ki wajah se aap ke ${count} message khate mein nahi likhe gaye. Meharbani kar ke dobara bhej dein.`
    setTimeout(() => this.sendToSelf(`${BOT_MARK}${text}`).catch(() => {}), 2000)
  }

  selfJid() {
    return this.sock?.user ? jidNormalizedUser(this.sock.user.id) : null
  }

  isSelfChat(jid) {
    const me = this.sock?.user
    return Boolean(me && (areJidsSameUser(jid, me.id) || (me.lid && areJidsSameUser(jid, me.lid))))
  }

  sendOnce(jid, content, options = {}) {
    // Register our own id before sending: Baileys echoes our sends back as upserts,
    // and in the self chat they would otherwise be read as new input forever.
    const messageId = generateMessageIDV2(this.sock.user?.id)
    remember(this.sentIds, messageId)
    // Also persist it: after a restart WhatsApp re-delivers our own voice replies, and they carry no text marker.
    if (this.tenantId) run('INSERT OR IGNORE INTO wa_sent (wa_id, tenant_id, created_at) VALUES (?, ?, ?)', messageId, this.tenantId, Date.now())
    return this.sock.sendMessage(jid, content, { ...options, messageId })
  }

  async send(jid, content, options) {
    try {
      return await this.sendOnce(jid, content, options)
    } catch (err) {
      // Socket dropped mid-reply (network blip): wait for the reconnect and retry once.
      await new Promise(resolve => {
        const deadline = Date.now() + 20000
        const tick = () => (this.state === 'open' || Date.now() > deadline ? resolve() : setTimeout(tick, 500))
        setTimeout(tick, 1500)
      })
      if (this.state !== 'open') throw err
      return this.sendOnce(jid, content, options)
    }
  }

  sendToSelf(text) {
    const jid = this.selfJid()
    if (!jid || this.state === 'reconnecting') return Promise.reject(new Error('whatsapp_not_connected'))
    return this.send(jid, { text })
  }

  async react(jid, key, emoji) {
    try {
      await this.sendOnce(jid, { react: { text: emoji, key } })
    } catch {}
  }

  async onMessage(m, type) {
    if (!this.tenantId || (type !== 'notify' && type !== 'append')) return
    const id = m.key?.id
    if (!m.message || !id || this.seen.has(id) || this.sentIds.has(id) || this.botIds.has(id) || accepting === false) return
    const jid = m.key.remoteJid
    // Only the shop owner's own "Message yourself" chat — never customers' or anyone else's chats.
    if (!jid || !m.key.fromMe || !this.isSelfChat(jid)) return
    if (one('SELECT 1 AS x FROM wa_sent WHERE wa_id = ?', id) || alreadyHandled(this.tenantId, id)) return
    // Catch up on notes sent while the server was down (WhatsApp re-delivers them), but never
    // anything from before this shop joined, and nothing older than two days.
    const tenant = tenants.getTenant(this.tenantId)
    const ts = Number(m.messageTimestamp || 0) * 1000
    if (ts && ts < Math.max(Date.now() - 2 * DAY, tenant?.created_at || 0)) return

    const content = normalizeMessageContent(m.message)
    const audioMsg = content?.audioMessage
    const imageMsg = content?.imageMessage
    const text = (content?.conversation || content?.extendedTextMessage?.text || imageMsg?.caption || '').trim()
    if (!audioMsg && !imageMsg && !text) return
    if (text.startsWith(BOT_MARK) || text.startsWith('*Hisaab')) return
    remember(this.seen, id)
    // Save it and take its place in line now, in arrival order, before any slow download.
    const msgId = newId('m')
    const sentAt = ts || Date.now()
    registerIncoming(this.tenantId, { id: msgId, channel: 'whatsapp', kind: audioMsg ? 'voice' : imageMsg ? 'photo' : 'text', waId: id, sentAt })
    const turn = reserveTurn(this.tenantId)
    try {
      await this.handleOwnMessage(m, jid, { id, msgId, sentAt, audioMsg, imageMsg, text, turn })
    } finally {
      turn.release()
    }
  }

  async handleOwnMessage(m, jid, { id, msgId, sentAt, audioMsg, imageMsg, text, turn }) {
    await this.react(jid, m.key, audioMsg ? '🎧' : '👀')
    let audio = null
    let image = null
    try {
      if (audioMsg || imageMsg) {
        const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: this.sock.updateMediaMessage })
        if (audioMsg) audio = { buffer, mimeType: audioMsg.mimetype || 'audio/ogg' }
        else image = { buffer, mimeType: imageMsg.mimetype || 'image/jpeg' }
      }
    } catch (err) {
      console.warn(`[wa ${this.tenantId}] media download failed`, err?.message)
      markFailed(this.tenantId, msgId, 'network')
      await this.send(jid, { text: `${BOT_MARK}*Hisaab*\nVoice note download nahi hua. Dobara bhej dein.` }, { quoted: m }).catch(() => {})
      return this.react(jid, m.key, '⚠️')
    }

    // Google slow: one short "still writing" line in the owner's own chat (BOT_MARK keeps it from being read as input).
    const onInterim = line => this.send(jid, { text: `${BOT_MARK}${line}` }, { quoted: m }).catch(() => {})
    const result = await handleMessage(this.tenantId, { channel: 'whatsapp', audio, image, text: audio ? null : text, waId: id, id: msgId, sentAt, onInterim }, turn)

    let voiceSent = false
    if (result.voice) {
      try {
        await this.send(jid, {
          audio: fs.readFileSync(result.voice.file),
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
          seconds: Math.max(1, Math.round(result.voice.seconds)),
        }, { quoted: m })
        voiceSent = true
      } catch (err) {
        console.warn(`[wa ${this.tenantId}] voice reply failed`, err?.message)
      }
    }
    try {
      await this.send(jid, { text: result.text }, voiceSent ? {} : { quoted: m })
    } catch (err) {
      console.error(`[wa ${this.tenantId}] text reply failed`, err?.message)
    }
    await this.react(jid, m.key, '✅')
  }
}

// ---------------------------------------------------------------- public API

/** Start a QR link attempt. `expectTenantId` = reconnecting a signed-in shop (must be the same number). */
export async function createLink({ expectTenantId = null, phone = null } = {}) {
  const linkId = newId('l')
  const conn = new Connection({ dirName: newId('s'), linkId, expectTenantId, pairPhone: phone })
  conn.expiresAt = Date.now() + config.linkTimeoutMs
  links.set(linkId, conn)
  await conn.start()
  // Every attempt leaves the pending list when its window ends, whatever happened (expired, mismatch, error),
  // so failed attempts can never fill the global cap.
  setTimeout(() => {
    if (links.get(linkId) === conn) links.delete(linkId)
    if (!conn.linkResult) {
      conn.setState('expired')
      conn.stop({ removeDir: true })
    }
  }, config.linkTimeoutMs)
  return linkId
}

/** QR / code attempts still waiting for a scan (finished ones don't count against the cap). */
export const pendingLinks = () => [...links.values()].filter(c => !c.linkResult).length

// tenantId -> number of notes cut off by the last restart (told to the owner once WhatsApp reconnects).
const restartNotices = new Map()
export function queueRestartNotice(tenantId, count) {
  if (count > 0) restartNotices.set(tenantId, count)
}

// Set to false during shutdown so no new message starts processing.
let accepting = true
export function stopAccepting() {
  accepting = false
}

export function linkStatus(linkId) {
  const conn = links.get(linkId) || [...sessions.values()].find(c => c.linkId === linkId)
  return conn ? conn.linkStatus() : { state: 'expired', qr: null }
}

export function cancelLink(linkId) {
  const conn = links.get(linkId)
  if (conn && !conn.tenantId) {
    conn.setState('expired')
    conn.stop({ removeDir: true })
    links.delete(linkId)
  }
}

export function whatsappState(tenantId) {
  return sessions.get(tenantId)?.state || null
}

export async function sendToSelf(tenantId, text) {
  const conn = sessions.get(tenantId)
  if (!conn || conn.state !== 'open') throw new Error('whatsapp_not_connected')
  return conn.sendToSelf(`${BOT_MARK}${text}`)
}

export async function disconnect(tenantId) {
  const conn = sessions.get(tenantId)
  sessions.delete(tenantId)
  if (conn) await conn.stop({ logout: true, removeDir: true })
  const t = tenants.getTenant(tenantId)
  if (t?.wa_dir) fs.rmSync(dirPath(t.wa_dir), { recursive: true, force: true })
  tenants.setTenantSystem(tenantId, { wa_status: 'disconnected', wa_dir: null })
  publish(tenantId, 'tenant')
}

/** On boot: reconnect every shop that was linked, and delete abandoned QR sessions. */
export async function restoreAll() {
  fs.mkdirSync(config.waDir, { recursive: true })
  const keep = new Set()
  for (const t of tenants.tenantsWithWhatsApp()) {
    if (!fs.existsSync(dirPath(t.wa_dir))) {
      tenants.setTenantSystem(t.id, { wa_status: 'logged_out', wa_dir: null })
      continue
    }
    keep.add(t.wa_dir)
    const conn = new Connection({ dirName: t.wa_dir, tenantId: t.id })
    sessions.set(t.id, conn)
    tenants.setTenantSystem(t.id, { wa_status: 'reconnecting' })
    conn.start().catch(err => console.error(`[wa ${t.id}] restore failed`, err?.message))
  }
  for (const name of fs.readdirSync(config.waDir)) {
    if (!keep.has(name)) fs.rmSync(dirPath(name), { recursive: true, force: true })
  }
  setInterval(() => run('DELETE FROM wa_sent WHERE created_at < ?', Date.now() - 7 * DAY), 6 * 3600e3)
  return keep.size
}
