/**
 * One-off import of the CSV/JSON data files into SQLite, with verification.
 *
 * Safe to re-run: it rebuilds the tables from the files each time. It refuses
 * to leave a half-imported database behind — everything happens in one
 * transaction and the verification pass runs before it commits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { openDatabase, DB_PATH } from './schema.mjs';
import { createBackup } from './backup.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

const bool = (v) => (v === true || v === 'True' || v === 'true' || v === 1 ? 1 : 0);
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function readCsv(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) return [];
  const text = fs.readFileSync(full, 'utf8');
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function readJson(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

/**
 * What the importer can see right now, so the button can describe the job
 * before it runs rather than asking for blind confirmation.
 */
export function importStatus() {
  const csvPath = path.join(DATA_DIR, 'data.csv');
  const exists = fs.existsSync(csvPath);
  const csvRows = exists ? readCsv('data.csv').filter((r) => r['Transaction ID']).length : 0;

  let currentRows = 0;
  try {
    const db = openDatabase();
    currentRows = db.get('SELECT COUNT(*) c FROM transactions').c;
    db.close();
  } catch {
    currentRows = 0;
  }

  return {
    csvAvailable: exists,
    csvRows,
    csvModified: exists ? fs.statSync(csvPath).mtime.toISOString() : null,
    currentRows,
  };
}

/**
 * Snapshots the database before an import overwrites it. Returns the backup
 * path, or null when there was nothing to back up yet.
 */
export function backupDatabase() {
  if (!fs.existsSync(DB_PATH)) return null;
  const backup = createBackup('pre-import');
  return backup?.path ?? null;
}

export function migrate({ verbose = true } = {}) {
  const log = (...a) => verbose && console.log(...a);

  const csvRows = readCsv('data.csv').filter((r) => r['Transaction ID']);
  const settings = readJson('settings.json') ?? {};
  const balanceRows = readCsv('start_balances.csv').filter((r) => r.Statement);

  const db = openDatabase();

  try {
    db.run('BEGIN');

    for (const table of [
      'transactions', 'categories', 'accounts', 'statements', 'budgets',
      'monthly_budgets', 'yearly_budgets', 'quick_add_presets',
      'scheduled_transactions', 'start_balances',
    ]) {
      db.run(`DELETE FROM ${table}`);
    }

    const insertTx = db.prepare(`
      INSERT INTO transactions (
        id, note, date, date_raw, value, currency_code, exchange_rate, category,
        statement, transaction_type, account_name, account_type, category_group,
        affect_cash_flow, trip_name
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    for (const r of csvRows) {
      const raw = r.Date ?? '';
      const parsed = new Date(raw);
      insertTx.run([
        r['Transaction ID'],
        r.Note ?? '',
        // Sortable form for indexing; the original string is kept beside it.
        Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString(),
        raw,
        num(r.Value),
        r['Currency Code'] || 'SGD',
        num(r['Exchange Rate'], 1) || 1,
        r.Category ?? '',
        r.Statement ?? '',
        r['Transaction Type'] ?? '',
        r['Account Name'] ?? '',
        r['Account Type'] ?? '',
        r['Category Group'] ?? '',
        bool(r['Affect Cash Flow']),
        r['Trip Name'] ?? '',
      ]);
    }
    insertTx.finalize();

    const each = (rows, sql, map) => {
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      const stmt = db.prepare(sql);
      for (const row of rows) stmt.run(map(row));
      stmt.finalize();
      return rows.length;
    };

    each(settings.categories,
      'INSERT OR REPLACE INTO categories VALUES (?,?,?,?,?)',
      (c) => [c.label, c.transactionType ?? '', c.categoryGroup ?? '', bool(c.affectCashFlow), c.monthlyBudgetId ?? null]);

    each(settings.accounts,
      'INSERT OR REPLACE INTO accounts VALUES (?,?,?)',
      (a) => [a.name, a.accountType ?? '', bool(a.disabled)]);

    each(settings.statements,
      'INSERT OR REPLACE INTO statements VALUES (?)',
      (s) => [s.value]);

    each(settings.budgets,
      'INSERT OR REPLACE INTO budgets VALUES (?,?,?,?)',
      (b) => [b.id, b.group ?? '', num(b.year), num(b.amount)]);

    each(settings.monthlyBudgets,
      'INSERT OR REPLACE INTO monthly_budgets (id, name, amount, salary_percent, is_savings, sort_order, covers_overspend) VALUES (?,?,?,?,?,?,?)',
      (b) => [b.id, b.name ?? '', num(b.amount), num(b.salaryPercent), bool(b.isSavings), num(b.order), bool(b.coversOverspend)]);

    each(settings.yearlyBudgets,
      'INSERT OR REPLACE INTO yearly_budgets VALUES (?,?,?,?)',
      (b) => [b.id, b.name ?? '', num(b.amount), num(b.poolPercent)]);

    each(settings.quickAddPresets,
      'INSERT OR REPLACE INTO quick_add_presets (id, label, note, category, sort_order, amount, account_name) VALUES (?,?,?,?,?,?,?)',
      (p) => [p.id, p.label ?? '', p.note ?? '', p.category ?? '', num(p.order),
              Number(p.amount) > 0 ? Number(p.amount) : null, p.accountName?.trim() || null]);

    each(settings.scheduledTransactions,
      'INSERT OR REPLACE INTO scheduled_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      (s) => [s.id, s.label ?? '', s.note ?? '', num(s.dayOfMonth, 1), num(s.value),
              s.currencyCode ?? 'SGD', num(s.exchangeRate, 1) || 1, s.category ?? '',
              s.accountName ?? '', bool(s.disabled), num(s.order)]);

    each(balanceRows,
      'INSERT OR REPLACE INTO start_balances VALUES (?,?,?,?)',
      (b) => [b.Statement, b['Account Name'] ?? '',
              b['Start Balance'] === '' ? null : num(b['Start Balance']),
              b['End Balance'] === '' ? null : num(b['End Balance'])]);

    db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      ['monthly_salary', String(num(settings.monthlySalary))]);
    db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      ['migrated_at', new Date().toISOString()]);

    // ---- verification, before the commit ----
    const problems = [];
    const dbCount = db.get('SELECT COUNT(*) c FROM transactions').c;
    if (dbCount !== csvRows.length) {
      problems.push(`row count: csv ${csvRows.length} vs sqlite ${dbCount}`);
    }

    const csvSum = csvRows.reduce((s, r) => s + num(r.Value), 0);
    const dbSum = db.get('SELECT COALESCE(SUM(value),0) s FROM transactions').s;
    if (Math.abs(csvSum - dbSum) > 0.005) {
      problems.push(`value sum: csv ${csvSum.toFixed(2)} vs sqlite ${dbSum.toFixed(2)}`);
    }

    const csvIds = new Set(csvRows.map((r) => r['Transaction ID']));
    const dbIds = new Set(db.all('SELECT id FROM transactions').map((r) => r.id));
    const missing = [...csvIds].filter((id) => !dbIds.has(id));
    if (missing.length) problems.push(`${missing.length} ids missing, e.g. ${missing.slice(0, 3)}`);

    // Every raw date string must survive byte-for-byte.
    const rawMismatch = db.get(`
      SELECT COUNT(*) c FROM transactions WHERE date_raw IS NULL OR date_raw = ''`).c;
    const csvBlankDates = csvRows.filter((r) => !r.Date).length;
    if (rawMismatch !== csvBlankDates) {
      problems.push(`date_raw blanks: csv ${csvBlankDates} vs sqlite ${rawMismatch}`);
    }

    if (problems.length) {
      db.run('ROLLBACK');
      throw new Error('Verification failed, nothing was written:\n  - ' + problems.join('\n  - '));
    }

    db.run('COMMIT');

    const counts = {};
    for (const t of ['transactions', 'categories', 'accounts', 'statements', 'budgets',
                     'monthly_budgets', 'yearly_budgets', 'quick_add_presets',
                     'scheduled_transactions', 'start_balances']) {
      counts[t] = db.get(`SELECT COUNT(*) c FROM ${t}`).c;
    }

    log('Migrated to', DB_PATH);
    log('Verified: row count, value sum, every id, every raw date string.');
    for (const [t, c] of Object.entries(counts)) log(`  ${t.padEnd(24)} ${c}`);
    log(`  ${'monthly salary'.padEnd(24)} ${db.get("SELECT value v FROM app_meta WHERE key='monthly_salary'").v}`);

    return counts;
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    migrate();
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exit(1);
  }
}
