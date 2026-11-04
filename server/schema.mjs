import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'node-sqlite3-wasm';

const { Database } = pkg;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DB_PATH = path.join(PROJECT_ROOT, 'data', 'transdash.sqlite');

export const SCHEMA_VERSION = 3;

/**
 * Transactions carry both `date` (ISO 8601, what we sort and filter on) and
 * `date_raw` (exactly the string the row arrived with). Keeping the raw form
 * means a round-trip never silently rewrites a timestamp's offset or precision.
 */
// No `journal_mode = WAL` here: node-sqlite3-wasm's VFS does not support it
// and silently stays in rollback-journal mode, so asking for it only misleads
// anyone reading this. Backups therefore use VACUUM INTO — see backup.mjs.
const DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transactions (
  id               TEXT PRIMARY KEY,
  note             TEXT    NOT NULL DEFAULT '',
  date             TEXT    NOT NULL,
  date_raw         TEXT,
  value            REAL    NOT NULL DEFAULT 0,
  currency_code    TEXT    NOT NULL DEFAULT 'SGD',
  exchange_rate    REAL    NOT NULL DEFAULT 1,
  category         TEXT    NOT NULL DEFAULT '',
  statement        TEXT    NOT NULL DEFAULT '',
  transaction_type TEXT    NOT NULL DEFAULT '',
  account_name     TEXT    NOT NULL DEFAULT '',
  account_type     TEXT    NOT NULL DEFAULT '',
  category_group   TEXT    NOT NULL DEFAULT '',
  affect_cash_flow INTEGER NOT NULL DEFAULT 1,
  trip_name        TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement);
CREATE INDEX IF NOT EXISTS idx_transactions_account   ON transactions(account_name);
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category);

CREATE TABLE IF NOT EXISTS categories (
  label             TEXT PRIMARY KEY,
  transaction_type  TEXT    NOT NULL DEFAULT '',
  category_group    TEXT    NOT NULL DEFAULT '',
  affect_cash_flow  INTEGER NOT NULL DEFAULT 1,
  monthly_budget_id TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  name         TEXT PRIMARY KEY,
  account_type TEXT    NOT NULL DEFAULT '',
  disabled     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS statements (
  value TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS budgets (
  id            TEXT PRIMARY KEY,
  category_group TEXT    NOT NULL DEFAULT '',
  year          INTEGER NOT NULL DEFAULT 0,
  amount        REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
  id             TEXT PRIMARY KEY,
  name           TEXT    NOT NULL DEFAULT '',
  amount         REAL    NOT NULL DEFAULT 0,
  salary_percent REAL    NOT NULL DEFAULT 0,
  is_savings     INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  covers_overspend INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS yearly_budgets (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  amount       REAL NOT NULL DEFAULT 0,
  pool_percent REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quick_add_presets (
  id         TEXT PRIMARY KEY,
  label      TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  category   TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  amount     REAL
);

CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id            TEXT PRIMARY KEY,
  label         TEXT    NOT NULL DEFAULT '',
  note          TEXT    NOT NULL DEFAULT '',
  day_of_month  INTEGER NOT NULL DEFAULT 1,
  value         REAL    NOT NULL DEFAULT 0,
  currency_code TEXT    NOT NULL DEFAULT 'SGD',
  exchange_rate REAL    NOT NULL DEFAULT 1,
  category      TEXT    NOT NULL DEFAULT '',
  account_name  TEXT    NOT NULL DEFAULT '',
  disabled      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS start_balances (
  statement     TEXT NOT NULL,
  account_name  TEXT NOT NULL,
  start_balance REAL,
  end_balance   REAL,
  PRIMARY KEY (statement, account_name)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * CREATE TABLE IF NOT EXISTS leaves existing tables alone, so columns added
 * after a database was created are appended here instead.
 */
function addColumnIfMissing(db, table, column, definition) {
  const columns = db.all(`PRAGMA table_info(${table})`).map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.exec(DDL);
  // v2: optional default amount on quick add buttons (NULL = none).
  addColumnIfMissing(db, 'quick_add_presets', 'amount', 'REAL');
  // v3: budgets whose leftover absorbs overspend before savings does.
  addColumnIfMissing(db, 'monthly_budgets', 'covers_overspend', 'INTEGER NOT NULL DEFAULT 0');
  db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
    'schema_version',
    String(SCHEMA_VERSION),
  ]);
  return db;
}
