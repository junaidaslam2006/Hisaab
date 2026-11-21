import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// node:sqlite prints an ExperimentalWarning once; it is stable enough for this workload.
const { DatabaseSync } = await import('node:sqlite')

fs.mkdirSync(config.dataDir, { recursive: true })
export const db = new DatabaseSync(path.join(config.dataDir, 'hisaab.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')

const MIGRATIONS = [
  `
  CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    shop_name TEXT,
    owner_name TEXT,
    city TEXT,
    business_type TEXT,
    ui_lang TEXT NOT NULL DEFAULT 'en',
    voice_replies INTEGER NOT NULL DEFAULT 1,
    wa_dir TEXT,
    wa_status TEXT NOT NULL DEFAULT 'disconnected',
    wa_jid TEXT,
    wa_lid TEXT,
    wa_name TEXT,
    created_at INTEGER NOT NULL,
    onboarded_at INTEGER,
    first_message_at INTEGER,
    last_message_at INTEGER
  );

  CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_urdu TEXT,
    phone TEXT,
    aliases TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    merged_into TEXT
  );
  CREATE INDEX customers_tenant ON customers(tenant_id);

  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('credit', 'payment')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    items TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    source TEXT NOT NULL,
    message_id TEXT,
    created_at INTEGER NOT NULL,
    voided_at INTEGER,
    void_reason TEXT
  );
  CREATE INDEX entries_tenant_time ON entries(tenant_id, created_at);
  CREATE INDEX entries_customer ON entries(customer_id);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT,
    audio TEXT,
    image TEXT,
    seconds REAL,
    transcript_ur TEXT,
    transcript_roman TEXT,
    language TEXT,
    results TEXT,
    reply_text TEXT,
    reply_spoken TEXT,
    reply_audio TEXT,
    reply_seconds REAL,
    status TEXT NOT NULL,
    error TEXT,
    model TEXT,
    ms INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_tenant_time ON messages(tenant_id, created_at);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT
  );

  CREATE TABLE login_codes (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE magic_links (
    token_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE usage (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, day)
  );
  `,
  `
  ALTER TABLE messages ADD COLUMN wa_id TEXT;
  CREATE INDEX messages_wa_id ON messages(tenant_id, wa_id);
  CREATE TABLE wa_sent (
    wa_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE tenants ADD COLUMN login_fails INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tenants ADD COLUMN login_locked_until INTEGER;
  `,
  // Separate lists of people per shop ("Factory wale", "Mohalla", "Suppliers"). A customer with list_id NULL
  // is in "General". A 'suppliers' list holds people the shop itself owes.
  `
  CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_urdu TEXT,
    kind TEXT NOT NULL DEFAULT 'customers' CHECK (kind IN ('customers', 'suppliers')),
    aliases TEXT NOT NULL DEFAULT '[]',
    sample INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX lists_tenant ON lists(tenant_id);
  ALTER TABLE customers ADD COLUMN list_id TEXT REFERENCES lists(id) ON DELETE SET NULL;
  ALTER TABLE customers ADD COLUMN sample INTEGER NOT NULL DEFAULT 0;
  `,
  // The shop's own payment details printed on its reminders (JSON, see server/paydetails.js). NULL = none.
  `
  ALTER TABLE tenants ADD COLUMN pay_details TEXT;
  `,
]

/** Exported so tests can build a database at an older schema version and check the upgrade. */
export { MIGRATIONS }

const version = db.prepare('PRAGMA user_version').get().user_version
for (let i = version; i < MIGRATIONS.length; i++) {
  db.exec('BEGIN')
  try {
    db.exec(MIGRATIONS[i])
    db.exec(`PRAGMA user_version = ${i + 1}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const one = (sql, ...params) => db.prepare(sql).get(...params) ?? null
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

export function tx(fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const json = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}
