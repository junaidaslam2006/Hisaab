// Automatic backups of the database (hisaab.db): a consistent copy made with SQLite's VACUUM INTO.
//
// - When: at server start (skipped if a backup is less than 30 minutes old), then whenever the newest backup is 6 hours
//   old (checked every 10 minutes, so a restart or a laptop that slept does not reset the clock).
// - Where: BACKUP_DIR/hisaab-<8 hex> if BACKUP_DIR is set (a OneDrive folder, a USB drive); the 8 hex come from the
//   data dir's path, so each data dir has its own subfolder. BACKUP_DIR must already exist: a missing folder is usually
//   an unplugged drive or a typo, so it is reported instead of being created. Without BACKUP_DIR: <data dir>/backups.
// - Kept: the newest 8, plus the newest one of each Pakistan-time day for the last 14 days (today and the 13 days
//   before). Only files named like ours are ever deleted.
// - Encryption: with BACKUP_KEY (32 bytes, as 64 hex characters or base64) each backup is AES-256-GCM, ".db.enc".
//   Layout: "HISAAB" (6 bytes), version (1 byte), IV (12 bytes), GCM tag (16 bytes), then the encrypted database.
//   The first 19 bytes are authenticated too. The plain copy only ever exists in the data dir and is deleted.
// - Not backed up: data/wa (WhatsApp logins: re-linking by QR is the recovery) and data/media (voice notes, photos).
//
// VACUUM INTO runs on its own read-only connection in a worker thread, so the server keeps answering while it runs.
// Nothing here may stop the server: every failure is logged and shown in the system check (lastBackup()).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { config } from './config.js'

export const EVERY_MS = 6 * 3600e3
export const STALE_MS = 7 * 3600e3
export const BOOT_SKIP_MS = 30 * 60e3
export const KEEP_NEWEST = 8
export const KEEP_DAYS = 14
const TICK_MS = 10 * 60e3
const RETRY_AFTER_FAIL_MS = 3600e3
const JOB_TIMEOUT_MS = 10 * 60e3
const TEMP_MAX_AGE_MS = 3600e3

const MAGIC = Buffer.from('HISAAB')
const VERSION = 1
const IV_LEN = 12
const TAG_LEN = 16
const AAD_LEN = MAGIC.length + 1 + IV_LEN
export const HEADER_LEN = AAD_LEN + TAG_LEN

const NAME = /^hisaab-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?\.db(\.enc)?$/
const PKT_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const pktDay = ts => PKT_PARTS.format(ts).slice(0, 10)

export class BackupError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** BACKUP_KEY as 32 bytes, or null when it is not set. Throws BackupError 'bad_key'; the key is never in a message. */
export function parseKey(raw = process.env.BACKUP_KEY) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let buf = null
  if (/^[0-9a-f]{64}$/i.test(s)) buf = Buffer.from(s, 'hex')
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) buf = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (!buf || buf.length !== 32) throw new BackupError('bad_key', 'BACKUP_KEY must be 32 bytes, written as 64 hex characters or 44 base64 characters.')
  return buf
}

/**
 * Where this data dir's backups go: { dir, root, fromEnv }. With BACKUP_DIR, each data dir gets its own subfolder
 * (hisaab-<8 hex of the data dir's path>), so a second server that loads the same .env (a restored copy, a test server)
 * never lists, ages or deletes the real server's backups. root is the folder that must already exist.
 */
export function backupDir(dataDir = config.dataDir) {
  const fromEnv = String(process.env.BACKUP_DIR || '').trim()
  if (!fromEnv) {
    const dir = path.resolve(dataDir, 'backups')
    return { dir, root: dir, fromEnv: false }
  }
  const root = path.resolve(fromEnv)
  const full = path.resolve(dataDir)
  const id = crypto.createHash('sha256').update(process.platform === 'win32' ? full.toLowerCase() : full).digest('hex').slice(0, 8)
  return { dir: path.join(root, `hisaab-${id}`), root, fromEnv: true }
}

/** hisaab-2026-11-01_07-40-12.db(.enc), stamped in Pakistan time (no daylight saving, so names sort by time). */
export function backupName(at, encrypted, n = 0) {
  const p = PKT_PARTS.format(at).replace(', ', '_').replace(/:/g, '-')
  return `hisaab-${p}${n ? `-${n}` : ''}.db${encrypted ? '.enc' : ''}`
}

/** Our backup files in `dir`, newest first: { name, file, at, bytes, encrypted }. A missing folder lists nothing. */
export function listBackups(dir) {
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const m = NAME.exec(name)
    if (!m) continue
    const at = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:00`) + Number(m[7] || 0)
    let bytes = 0
    try {
      bytes = fs.statSync(path.join(dir, name)).size
    } catch {
      continue
    }
    out.push({ name, file: path.join(dir, name), at, bytes, encrypted: Boolean(m[8]) })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Which backups to keep (pure; `files` newest first): the newest KEEP_NEWEST, plus each day's newest for KEEP_DAYS days. */
export function retentionPlan(files, now = Date.now()) {
  const sorted = [...files].sort((a, b) => b.at - a.at)
  const keep = new Set(sorted.slice(0, KEEP_NEWEST).map(f => f.name))
  const today = Date.parse(`${pktDay(now)}T00:00:00+05:00`)
  const firstDay = pktDay(today - (KEEP_DAYS - 1) * 864e5 + 12 * 3600e3)
  const seen = new Set()
  for (const f of sorted) {
    const day = pktDay(f.at)
    if (seen.has(day)) continue
    seen.add(day)
    if (day >= firstDay) keep.add(f.name)
  }
  return { keep: sorted.filter(f => keep.has(f.name)), remove: sorted.filter(f => !keep.has(f.name)) }
}

// Deleting a large file can take tens of milliseconds on Windows, so deletes are async (the server keeps answering).
export async function prune(dir, now = Date.now()) {
  const { keep, remove } = retentionPlan(listBackups(dir), now)
  const removed = []
  for (const f of remove) {
    try {
      await fsp.rm(f.file, { force: true })
      removed.push(f.name)
    } catch (err) {
      console.warn(`[backup] could not delete old backup ${f.name}: ${err.message}`)
    }
  }
  return { kept: keep.length, removed }
}

// Temp files a crashed or killed run left behind (another process's run may be going on: only old ones).
function sweepTemps(dirs, now = Date.now()) {
  for (const dir of dirs) {
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!/^\.?hisaab-backup-.*\.(tmp|part)$/.test(name) && !/^hisaab-.*\.db(\.enc)?\.part$/.test(name)) continue
      const file = path.join(dir, name)
      try {
        if (now - fs.statSync(file).mtimeMs > TEMP_MAX_AGE_MS) fs.rmSync(file, { force: true })
      } catch {}
    }
  }
}

// ---------------------------------------------------------------- encryption

export function isEncrypted(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const head = Buffer.alloc(MAGIC.length)
    return fs.readSync(fd, head, 0, head.length, 0) === head.length && head.equals(MAGIC)
  } catch {
    return false
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

/** src (plain) -> dest (header + AES-256-GCM). dest must not exist. */
export async function encryptFile(src, dest, key) {
  const iv = crypto.randomBytes(IV_LEN)
  const aad = Buffer.concat([MAGIC, Buffer.from([VERSION]), iv])
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const fh = await fsp.open(dest, 'wx')
  try {
    await fh.write(Buffer.concat([aad, Buffer.alloc(TAG_LEN)]), 0, HEADER_LEN, 0)
    let pos = HEADER_LEN
    for await (const chunk of fs.createReadStream(src, { highWaterMark: 1 << 20 })) {
      const out = cipher.update(chunk)
      await fh.write(out, 0, out.length, pos)
      pos += out.length
    }
    const last = cipher.final()
    if (last.length) await fh.write(last, 0, last.length, pos)
    await fh.write(cipher.getAuthTag(), 0, TAG_LEN, AAD_LEN)
    await fh.sync()
  } finally {
    await fh.close()
  }
}

/** src (ours, encrypted) -> dest (plain). dest must not exist; it is deleted again when the check fails. */
export async function decryptFile(src, dest, key) {
  const fh = await fsp.open(src, 'r')
  const head = Buffer.alloc(HEADER_LEN)
  try {
    const { bytesRead } = await fh.read(head, 0, HEADER_LEN, 0)
    if (bytesRead < HEADER_LEN || !head.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('not_encrypted', 'This is not an encrypted Hisaab backup.')
    if (head[MAGIC.length] !== VERSION) throw new BackupError('bad_version', `Unknown backup format version ${head[MAGIC.length]}.`)
  } finally {
    await fh.close()
  }
  const iv = head.subarray(MAGIC.length + 1, AAD_LEN)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(head.subarray(0, AAD_LEN))
  decipher.setAuthTag(head.subarray(AAD_LEN, HEADER_LEN))
  const out = await fsp.open(dest, 'wx')
  try {
    for await (const chunk of fs.createReadStream(src, { start: HEADER_LEN, highWaterMark: 1 << 20 })) {
      const plain = decipher.update(chunk)
      await out.write(plain)
    }
    try {
      decipher.final()
    } catch {
      throw new BackupError('wrong_key', 'The backup did not decrypt: BACKUP_KEY is not the key it was made with, or the file is damaged.')
    }
    await out.sync()
  } catch (err) {
    await out.close()
    fs.rmSync(dest, { force: true })
    throw err
  }
  await out.close()
}

// ---------------------------------------------------------------- one backup

// Runs in a worker thread with its own read-only connection: VACUUM INTO, then a quick_check of the copy.
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
const { DatabaseSync } = require('node:sqlite')
const value = r => Object.values(r)[0]
let db = null
try {
  const t0 = performance.now()
  db = new DatabaseSync(workerData.dbPath, { readOnly: true })
  db.exec('PRAGMA busy_timeout = 5000')
  db.prepare('VACUUM INTO ?').run(workerData.outPath)
  db.close()
  db = null
  const vacuumMs = performance.now() - t0
  const t1 = performance.now()
  const copy = new DatabaseSync(workerData.outPath, { readOnly: true })
  const rows = copy.prepare('PRAGMA quick_check').all()
  const version = copy.prepare('PRAGMA user_version').get().user_version
  copy.close()
  const ok = rows.length === 1 && value(rows[0]) === 'ok'
  parentPort.postMessage({ ok, vacuumMs, checkMs: performance.now() - t1, version, problem: ok ? null : rows.slice(0, 3).map(value).join('; ') })
} catch (err) {
  try { if (db) db.close() } catch {}
  parentPort.postMessage({ ok: false, error: String((err && err.message) || err) })
}
`

function vacuumInWorker(dbPath, outPath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { eval: true, workerData: { dbPath, outPath }, execArgv: ['--disable-warning=ExperimentalWarning'] })
    let answer = null
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new BackupError('timeout', `VACUUM INTO took longer than ${JOB_TIMEOUT_MS / 60e3} minutes.`))
    }, JOB_TIMEOUT_MS)
    worker.on('message', m => (answer = m))
    worker.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    worker.on('exit', () => {
      clearTimeout(timer)
      if (!answer) return reject(new BackupError('error', 'the backup worker stopped without an answer'))
      if (answer.error) return reject(new BackupError('error', answer.error))
      if (!answer.ok) return reject(new BackupError('check_failed', `the new copy failed SQLite's quick_check: ${answer.problem}`))
      resolve(answer)
    })
  })
}

async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return await fsp.rename(from, to)
    } catch (err) {
      // Windows: an antivirus or indexer may hold a new file for a moment.
      if (i >= 4 || !['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err
      await new Promise(r => setTimeout(r, 250 * (i + 1)))
    }
  }
}

function folderError(err, dir, fromEnv) {
  const where = fromEnv ? `${dir} (BACKUP_DIR)` : dir
  if (err instanceof BackupError) return err
  if (err.code === 'ENOENT') return new BackupError('dir_missing', `Backup folder not found: ${where}. Plug in the drive or fix BACKUP_DIR.`)
  if (err.code === 'ENOTDIR') return new BackupError('dir_missing', `Backup folder is not a folder: ${where}.`)
  if (['EACCES', 'EPERM', 'EROFS'].includes(err.code)) return new BackupError('dir_unwritable', `Cannot write to the backup folder: ${where}.`)
  if (err.code === 'ENOSPC') return new BackupError('no_space', `The disk is full: ${where}.`)
  return new BackupError('error', `${err.code ? `${err.code}: ` : ''}${err.message}`)
}

/** Check BACKUP_DIR exists (it is never created; its subfolder is) and that a file can be written. Throws BackupError. */
export function checkFolder({ dir, root, fromEnv } = backupDir()) {
  try {
    if (fromEnv && !fs.statSync(root).isDirectory()) throw Object.assign(new Error('not a folder'), { code: 'ENOTDIR' })
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.statSync(dir).isDirectory()) throw Object.assign(new Error('not a folder'), { code: 'ENOTDIR' })
    const probe = path.join(dir, `.hisaab-backup-check-${process.pid}.tmp`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
  } catch (err) {
    throw folderError(err, fromEnv ? root : dir, fromEnv)
  }
}

/**
 * One backup now, safe while the server runs (also from another process: scripts/backup-now.mjs).
 * Resolves { file, name, dir, bytes, encrypted, ms, vacuumMs, checkMs, kept, removed }; rejects with a BackupError.
 */
export async function makeBackup({ now = Date.now(), dataDir = config.dataDir } = {}) {
  const target = backupDir(dataDir)
  const key = parseKey()
  checkFolder(target)
  sweepTemps([dataDir, target.dir])
  const t0 = Date.now()
  const dbPath = path.join(dataDir, 'hisaab.db')
  if (!fs.existsSync(dbPath)) throw new BackupError('no_database', `No database at ${dbPath}.`)
  const tmp = path.join(dataDir, `.hisaab-backup-${process.pid}-${t0}.tmp`)
  let part = null
  try {
    const job = await vacuumInWorker(dbPath, tmp)
    let name = backupName(now, Boolean(key))
    for (let n = 1; fs.existsSync(path.join(target.dir, name)); n++) name = backupName(now, Boolean(key), n)
    const file = path.join(target.dir, name)
    part = `${file}.part`
    try {
      if (key) {
        await encryptFile(tmp, part, key)
        await renameRetry(part, file)
      } else {
        try {
          await renameRetry(tmp, file)
        } catch (err) {
          if (err.code !== 'EXDEV') throw err
          await fsp.copyFile(tmp, part)
          await renameRetry(part, file)
        }
      }
    } catch (err) {
      throw folderError(err, target.dir, target.fromEnv)
    }
    const bytes = fs.statSync(file).size
    const { kept, removed } = await prune(target.dir, now)
    return { file, name, dir: target.dir, bytes, encrypted: Boolean(key), ms: Date.now() - t0, vacuumMs: Math.round(job.vacuumMs), checkMs: Math.round(job.checkMs), version: job.version, kept, removed }
  } finally {
    // A temp file that cannot be deleted now is swept by a later run (sweepTemps).
    await fsp.rm(tmp, { force: true }).catch(() => {})
    if (part) await fsp.rm(part, { force: true }).catch(() => {})
  }
}

// ---------------------------------------------------------------- the server's schedule

const state = { running: false, error: null, timer: null }

const mb = bytes => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

async function runBackup(reason) {
  if (state.running) return null
  state.running = true
  try {
    const out = await makeBackup()
    state.error = null
    console.log(`[backup] ${reason}: saved ${out.name} (${mb(out.bytes)}${out.encrypted ? ', encrypted' : ''}, ${out.ms} ms) · ${out.kept} kept in ${out.dir}${out.removed.length ? ` · deleted ${out.removed.length} old` : ''}`)
    return out
  } catch (err) {
    const e = err instanceof BackupError ? err : new BackupError('error', String(err?.message || err))
    state.error = { at: Date.now(), code: e.code, message: e.message }
    console.error(`[backup] ${reason}: FAILED (${e.code}) ${e.message}`)
    return null
  } finally {
    state.running = false
  }
}

function newestAt() {
  return listBackups(backupDir().dir)[0]?.at ?? null
}

/** Called once the database is open: a boot backup, then one whenever the newest is 6 h old. Never throws. */
export function startBackups() {
  if (state.timer) return
  try {
    const tick = reason => {
      try {
        const now = Date.now()
        const newest = newestAt()
        const age = newest == null ? Infinity : now - newest
        if (reason === 'boot' && age < BOOT_SKIP_MS) {
          console.log(`[backup] boot: skipped, the newest backup is ${Math.round(age / 60e3)} min old`)
          return
        }
        if (reason === 'scheduled' && (age < EVERY_MS || (state.error && now - state.error.at < RETRY_AFTER_FAIL_MS))) return
        runBackup(reason).catch(() => {})
      } catch (err) {
        console.error('[backup]', err?.message || err)
      }
    }
    state.timer = setInterval(() => tick('scheduled'), TICK_MS)
    state.timer.unref()
    setImmediate(() => tick('boot'))
  } catch (err) {
    console.error('[backup] could not start the schedule:', err?.message || err)
  }
}

/**
 * For the system check: the newest backup on disk (this server's or backup-now's), how many are kept and where, and
 * whether the last attempt failed. Never throws.
 */
export function lastBackup(now = Date.now()) {
  try {
    const { dir, root, fromEnv } = backupDir()
    const files = listBackups(dir)
    const newest = files[0] || null
    const failed = Boolean(state.error && (!newest || state.error.at > newest.at))
    return {
      dir,
      root,
      fromEnv,
      kept: files.length,
      running: state.running,
      at: newest?.at ?? null,
      ageMs: newest ? now - newest.at : null,
      bytes: newest?.bytes ?? null,
      name: newest?.name ?? null,
      encrypted: newest?.encrypted ?? false,
      stale: !newest || now - newest.at > STALE_MS,
      failed,
      error: failed ? state.error : null,
      everyHours: EVERY_MS / 3600e3,
    }
  } catch (err) {
    return { dir: null, kept: 0, running: false, at: null, stale: true, failed: true, error: { at: now, code: 'error', message: String(err?.message || err) } }
  }
}
