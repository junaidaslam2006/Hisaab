// One backup of the database, right now. Safe while the server runs (it reads through its own read-only connection).
// Usage (in the hisaab-app folder):  node scripts/backup-now.mjs
// Uses the same settings as the server: HISAAB_DATA_DIR, BACKUP_DIR, BACKUP_KEY (from the environment or .env).
import { makeBackup, BackupError } from '../server/backup.js'

const mb = bytes => `${(bytes / 1024 ** 2).toFixed(1)} MB`

try {
  const out = await makeBackup()
  console.log(`Backup saved: ${out.file}`)
  console.log(`  ${mb(out.bytes)}${out.encrypted ? ', encrypted (BACKUP_KEY)' : ', not encrypted'} · took ${(out.ms / 1000).toFixed(1)} s · passed SQLite's quick_check`)
  console.log(`  ${out.kept} backup${out.kept === 1 ? '' : 's'} kept in ${out.dir}${out.removed.length ? ` · deleted ${out.removed.length} old one${out.removed.length === 1 ? '' : 's'}` : ''}`)
  console.log('  Not in a backup: data/wa (WhatsApp logins: link again by QR) and data/media (voice notes, photos).')
} catch (err) {
  console.error(`Backup FAILED${err instanceof BackupError ? ` (${err.code})` : ''}: ${err.message}`)
  process.exit(1)
}
