// Restore a backup into a NEW, empty data folder, check it, and print how to start a server on it.
// Usage (in the hisaab-app folder):  node scripts/restore.mjs <backup-file> <target-data-dir>
// An encrypted backup (.db.enc) needs the BACKUP_KEY it was made with (environment or .env).
// It never overwrites anything: a target folder that has any file in it is refused.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseKey, isEncrypted, decryptFile, BackupError } from '../server/backup.js'

const { emitWarning } = process
process.emitWarning = (w, ...rest) => (/SQLite is an experimental feature/.test(String(w?.message ?? w)) ? undefined : emitWarning.call(process, w, ...rest))
const { DatabaseSync } = await import('node:sqlite')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' })
const fail = (msg, code = 1) => {
  console.error(`Restore FAILED: ${msg}`)
  process.exit(code)
}

const [src, targetArg] = process.argv.slice(2)
if (!src || !targetArg) fail('usage: node scripts/restore.mjs <backup-file> <target-data-dir>', 2)
const file = path.resolve(src)
const target = path.resolve(targetArg)
if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`no backup file at ${file}`)
const created = !fs.existsSync(target)
if (!created) {
  if (!fs.statSync(target).isDirectory()) fail(`${target} is a file, not a folder`)
  const inside = fs.readdirSync(target)
  if (inside.length) fail(`the target folder is not empty (${inside.slice(0, 3).join(', ')}${inside.length > 3 ? ', …' : ''}): ${target}. Restore into a new, empty folder, so nothing is overwritten.`)
}
fs.mkdirSync(target, { recursive: true })

const work = path.join(target, 'hisaab.db.restoring')
const finalDb = path.join(target, 'hisaab.db')
const cleanUp = () => {
  for (const f of [work, `${work}-wal`, `${work}-shm`, `${work}-journal`]) fs.rmSync(f, { force: true })
  if (created) fs.rmSync(target, { recursive: true, force: true })
}

let db = null
try {
  const encrypted = isEncrypted(file)
  if (encrypted) {
    let key
    try {
      key = parseKey()
    } catch (err) {
      throw new BackupError('bad_key', err.message)
    }
    if (!key) throw new BackupError('no_key', 'this backup is encrypted: set BACKUP_KEY (the key it was made with) in the environment or .env.')
    await decryptFile(file, work, key)
  } else {
    fs.copyFileSync(file, work, fs.constants.COPYFILE_EXCL)
  }

  try {
    db = new DatabaseSync(work, { readOnly: true })
    const check = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0])
    if (check.length !== 1 || check[0] !== 'ok') throw new BackupError('integrity', `PRAGMA integrity_check found problems: ${check.slice(0, 5).join('; ')}`)
  } catch (err) {
    if (err instanceof BackupError) throw err
    throw new BackupError('integrity', `PRAGMA integrity_check could not read the file (${err.message}). It is damaged or not a database.`)
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name)
  for (const need of ['tenants', 'customers', 'entries', 'messages']) {
    if (!tables.includes(need)) throw new BackupError('not_hisaab', `the file is a database but has no "${need}" table: not a Hisaab backup.`)
  }
  const version = db.prepare('PRAGMA user_version').get().user_version
  const counts = tables.map(t => [t, db.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n])
  const newestEntry = db.prepare('SELECT MAX(created_at) AS at FROM entries').get().at
  const newestMessage = db.prepare('SELECT MAX(created_at) AS at FROM messages').get().at
  db.close()
  db = null
  // A read-only open of a WAL-mode file can leave empty -wal / -shm files beside it.
  for (const f of [`${work}-wal`, `${work}-shm`]) fs.rmSync(f, { force: true })
  fs.renameSync(work, finalDb)

  const winPath = target
  const bashPath = target.replace(/\\/g, '/')
  console.log(`Restored ${path.basename(file)}${encrypted ? ' (decrypted with BACKUP_KEY)' : ''}`)
  console.log(`  into ${finalDb}`)
  console.log(`  integrity_check: ok · schema version ${version}`)
  console.log('  Rows per table:')
  const width = Math.max(...counts.map(([t]) => t.length))
  for (const [t, n] of counts) console.log(`    ${t.padEnd(width)}  ${n.toLocaleString('en-US')}`)
  console.log(`  Newest entry:   ${newestEntry ? `${PKT.format(newestEntry)} PKT` : 'none'}`)
  console.log(`  Newest message: ${newestMessage ? `${PKT.format(newestMessage)} PKT` : 'none'}`)
  console.log('')
  console.log('Start a server on it (in the hisaab-app folder). Port 3001 keeps it apart from a server on 3000:')
  console.log(`  PowerShell:  $env:HISAAB_DATA_DIR="${winPath}"; $env:PORT="3001"; $env:BACKUP_DIR=" "; npm start`)
  console.log(`  Git Bash:    HISAAB_DATA_DIR="${bashPath}" PORT=3001 BACKUP_DIR= npm start`)
  console.log(`  (run it from ${ROOT})`)
  console.log('  BACKUP_DIR is blanked, so this copy keeps its own backups in its data folder, away from the real ones.')
  console.log('  PowerShell needs the space (an empty value would let .env set it again), and it keeps these settings')
  console.log('  for the whole window: start the real server from a new window.')
  console.log('')
  console.log('Not in a backup: WhatsApp logins (data/wa) and voice notes / photos (data/media).')
  console.log('Shops that were linked show WhatsApp as logged out on the restored server: link it again by QR in Settings.')
} catch (err) {
  try {
    db?.close()
  } catch {}
  cleanUp()
  fail(err instanceof BackupError ? err.message : `${err.code ? `${err.code}: ` : ''}${err.message}`)
}
