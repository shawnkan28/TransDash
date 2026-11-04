/**
 * All SQL lives here. The HTTP layer above only parses requests and serialises
 * what these functions return.
 *
 * Transactions are read and written a row at a time. The old CSV store had to
 * rewrite all 552 KB for a one-field edit, which is both slow and a window in
 * which an interrupted write truncated everything.
 */
import { openDatabase } from './schema.mjs';

let database = null;

export function getDb() {
  if (!database) database = openDatabase();
  return database;
}

export function closeDb() {
  if (database) {
    database.close();
    database = null;
  }
}

// ---------- transactions ----------

const TX_COLUMNS = [
  'id', 'note', 'date', 'date_raw', 'value', 'currency_code', 'exchange_rate',
  'category', 'statement', 'transaction_type', 'account_name', 'account_type',
  'category_group', 'affect_cash_flow', 'trip_name',
];

function rowToTransaction(row) {
  return {
    id: row.id,
    note: row.note,
    date: row.date,
    dateRaw: row.date_raw ?? undefined,
    value: row.value,
    currencyCode: row.currency_code,
    exchangeRate: row.exchange_rate,
    category: row.category,
    statement: row.statement,
    transactionType: row.transaction_type,
    accountName: row.account_name,
    accountType: row.account_type || undefined,
    categoryGroup: row.category_group,
    affectCashFlow: row.affect_cash_flow === 1,
    tripName: row.trip_name,
  };
}

function transactionToValues(t) {
  const parsed = new Date(t.date ?? t.dateRaw);
  const iso = Number.isNaN(parsed.getTime()) ? String(t.dateRaw ?? '') : parsed.toISOString();

  // date_raw exists to preserve the exact string a row arrived with, so it is
  // kept only while it still describes the same instant as `date`. Editing the
  // date used to leave the two disagreeing, and a re-import reading date_raw
  // would then resurrect the old one.
  const rawDate = new Date(t.dateRaw ?? '');
  const rawStillMatches =
    t.dateRaw && !Number.isNaN(rawDate.getTime()) && rawDate.getTime() === parsed.getTime();

  return [
    t.id,
    t.note ?? '',
    iso,
    rawStillMatches ? t.dateRaw : iso,
    Number(t.value) || 0,
    t.currencyCode || 'SGD',
    Number(t.exchangeRate) || 1,
    t.category ?? '',
    t.statement ?? '',
    t.transactionType ?? '',
    t.accountName ?? '',
    t.accountType ?? '',
    t.categoryGroup ?? '',
    t.affectCashFlow ? 1 : 0,
    t.tripName ?? '',
  ];
}

/**
 * `from`/`to` are ISO strings. Mobile asks for one month; the desktop asks for
 * everything. This is the whole point of the move — the phone no longer
 * downloads four years of history to render the current month.
 */
export function listTransactions({ from, to } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  const sql = `SELECT * FROM transactions${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC`;
  return db.all(sql, params).map(rowToTransaction);
}

export function getTransaction(id) {
  const row = getDb().get('SELECT * FROM transactions WHERE id = ?', [id]);
  return row ? rowToTransaction(row) : null;
}

export function createTransaction(transaction) {
  getDb().run(
    `INSERT INTO transactions (${TX_COLUMNS.join(',')}) VALUES (${TX_COLUMNS.map(() => '?').join(',')})`,
    transactionToValues(transaction)
  );
  return getTransaction(transaction.id);
}

export function updateTransaction(id, transaction) {
  const existing = getTransaction(id);
  if (!existing) return null;
  const merged = { ...existing, ...transaction, id };
  const values = transactionToValues(merged);
  // id is both the first column and the WHERE key, so it is passed twice.
  getDb().run(
    `UPDATE transactions SET ${TX_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...values, id]
  );
  return getTransaction(id);
}

/**
 * Applies partial updates to many rows in one transaction.
 *
 * The Review screen assigns statements to every unassigned row at once, which
 * used to be one HTTP request and one write per row — several seconds for a
 * normal month's backlog.
 */
export function updateTransactions(updates) {
  const db = getDb();
  const ids = Object.keys(updates);
  if (ids.length === 0) return [];

  db.run('BEGIN');
  try {
    const saved = [];
    for (const id of ids) {
      const existing = getTransaction(id);
      if (!existing) continue;
      const merged = { ...existing, ...updates[id], id };
      db.run(
        `UPDATE transactions SET ${TX_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...transactionToValues(merged), id]
      );
      saved.push(id);
    }
    db.run('COMMIT');
    return saved.map((id) => getTransaction(id));
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function deleteTransaction(id) {
  const db = getDb();
  const existed = !!db.get('SELECT 1 x FROM transactions WHERE id = ?', [id]);
  db.run('DELETE FROM transactions WHERE id = ?', [id]);
  return existed;
}

/** Whole-table replace, used only by the Settings CSV import. */
export function replaceTransactions(transactions) {
  const db = getDb();
  db.run('BEGIN');
  try {
    db.run('DELETE FROM transactions');
    const stmt = db.prepare(
      `INSERT INTO transactions (${TX_COLUMNS.join(',')}) VALUES (${TX_COLUMNS.map(() => '?').join(',')})`
    );
    for (const t of transactions) stmt.run(transactionToValues(t));
    stmt.finalize();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  return db.get('SELECT COUNT(*) c FROM transactions').c;
}

/**
 * Renaming an account's type used to mean loading every transaction into the
 * browser, editing them and rewriting the whole CSV. It is now one UPDATE per
 * account, touching only the matching rows.
 */
export function syncAccountTypes(accounts) {
  const db = getDb();
  db.run('BEGIN');
  try {
    const stmt = db.prepare('UPDATE transactions SET account_type = ? WHERE account_name = ?');
    let changed = 0;
    for (const account of accounts) {
      stmt.run([account.accountType ?? '', account.name]);
      changed += 1;
    }
    stmt.finalize();
    db.run('COMMIT');
    return changed;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function transactionCount() {
  return getDb().get('SELECT COUNT(*) c FROM transactions').c;
}

/**
 * Replaces the live database with a backup file. The current state is
 * snapshotted first, so a restore is itself undoable.
 */
export async function restoreFromBackup(backupFile) {
  const fs = await import('node:fs');
  const { DB_PATH } = await import('./schema.mjs');
  const { createBackup, inspectBackup } = await import('./backup.mjs');

  const check = inspectBackup(backupFile);
  if (!check.ok) {
    check.cleanup?.();
    throw new Error(check.error ?? `Backup failed its integrity check (${check.integrity})`);
  }

  try {
    const safety = createBackup('pre-restore');
    closeDb();
    fs.copyFileSync(check.file, DB_PATH);
    getDb();

    return { restoredRows: transactionCount(), safetyBackup: safety?.name ?? null };
  } finally {
    check.cleanup?.();
  }
}

// ---------- settings ----------

/** Same JSON shape the client already exchanged with settings.json. */
export function readSettings() {
  const db = getDb();
  const salary = db.get("SELECT value v FROM app_meta WHERE key = 'monthly_salary'");

  return {
    version: 1,
    monthlySalary: Number(salary?.v ?? 0),
    categories: db.all('SELECT * FROM categories ORDER BY label').map((c) => ({
      label: c.label,
      transactionType: c.transaction_type,
      categoryGroup: c.category_group,
      affectCashFlow: c.affect_cash_flow === 1,
      ...(c.monthly_budget_id ? { monthlyBudgetId: c.monthly_budget_id } : {}),
    })),
    accounts: db.all('SELECT * FROM accounts ORDER BY name').map((a) => ({
      name: a.name,
      accountType: a.account_type,
      disabled: a.disabled === 1,
    })),
    statements: db.all('SELECT * FROM statements').map((s) => ({ value: s.value })),
    budgets: db.all('SELECT * FROM budgets').map((b) => ({
      id: b.id, group: b.category_group, year: b.year, amount: b.amount,
    })),
    monthlyBudgets: db.all('SELECT * FROM monthly_budgets ORDER BY sort_order').map((b) => ({
      id: b.id, name: b.name, amount: b.amount, salaryPercent: b.salary_percent,
      isSavings: b.is_savings === 1, order: b.sort_order,
      coversOverspend: b.covers_overspend === 1,
    })),
    yearlyBudgets: db.all('SELECT * FROM yearly_budgets').map((b) => ({
      id: b.id, name: b.name, amount: b.amount, poolPercent: b.pool_percent,
    })),
    quickAddPresets: db.all('SELECT * FROM quick_add_presets ORDER BY sort_order').map((p) => ({
      id: p.id, label: p.label, note: p.note, category: p.category, order: p.sort_order,
      ...(p.amount != null ? { amount: p.amount } : {}),
    })),
    scheduledTransactions: db.all('SELECT * FROM scheduled_transactions ORDER BY sort_order').map((s) => ({
      id: s.id, label: s.label, note: s.note, dayOfMonth: s.day_of_month, value: s.value,
      currencyCode: s.currency_code, exchangeRate: s.exchange_rate, category: s.category,
      accountName: s.account_name, disabled: s.disabled === 1, order: s.sort_order,
    })),
  };
}

const bool = (v) => (v ? 1 : 0);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
/** A positive amount, or null when none is set. */
const optionalAmount = (v) => (v !== null && v !== '' && Number(v) > 0 ? Number(v) : null);

export function writeSettings(settings) {
  const db = getDb();
  db.run('BEGIN');
  try {
    const replace = (table, rows, sql, map) => {
      db.run(`DELETE FROM ${table}`);
      if (!Array.isArray(rows) || rows.length === 0) return;
      const stmt = db.prepare(sql);
      for (const row of rows) stmt.run(map(row));
      stmt.finalize();
    };

    replace('categories', settings.categories,
      'INSERT OR REPLACE INTO categories VALUES (?,?,?,?,?)',
      (c) => [c.label, c.transactionType ?? '', c.categoryGroup ?? '', bool(c.affectCashFlow), c.monthlyBudgetId || null]);

    replace('accounts', settings.accounts,
      'INSERT OR REPLACE INTO accounts VALUES (?,?,?)',
      (a) => [a.name, a.accountType ?? '', bool(a.disabled)]);

    replace('statements', settings.statements,
      'INSERT OR REPLACE INTO statements VALUES (?)', (s) => [s.value]);

    replace('budgets', settings.budgets,
      'INSERT OR REPLACE INTO budgets VALUES (?,?,?,?)',
      (b) => [b.id, b.group ?? '', num(b.year), num(b.amount)]);

    replace('monthly_budgets', settings.monthlyBudgets,
      'INSERT OR REPLACE INTO monthly_budgets (id, name, amount, salary_percent, is_savings, sort_order, covers_overspend) VALUES (?,?,?,?,?,?,?)',
      (b) => [b.id, b.name ?? '', num(b.amount), num(b.salaryPercent), bool(b.isSavings), num(b.order), bool(b.coversOverspend)]);

    replace('yearly_budgets', settings.yearlyBudgets,
      'INSERT OR REPLACE INTO yearly_budgets VALUES (?,?,?,?)',
      (b) => [b.id, b.name ?? '', num(b.amount), num(b.poolPercent)]);

    replace('quick_add_presets', settings.quickAddPresets,
      'INSERT OR REPLACE INTO quick_add_presets (id, label, note, category, sort_order, amount) VALUES (?,?,?,?,?,?)',
      (p) => [p.id, p.label ?? '', p.note ?? '', p.category ?? '', num(p.order), optionalAmount(p.amount)]);

    replace('scheduled_transactions', settings.scheduledTransactions,
      'INSERT OR REPLACE INTO scheduled_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      (s) => [s.id, s.label ?? '', s.note ?? '', num(s.dayOfMonth, 1), num(s.value),
              s.currencyCode ?? 'SGD', num(s.exchangeRate, 1) || 1, s.category ?? '',
              s.accountName ?? '', bool(s.disabled), num(s.order)]);

    db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('monthly_salary', ?)",
      [String(num(settings.monthlySalary))]);

    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

// ---------- start balances ----------

export function readStartBalances() {
  return getDb().all('SELECT * FROM start_balances ORDER BY statement, account_name').map((b) => ({
    statement: b.statement,
    accountName: b.account_name,
    startBalance: b.start_balance,
    endBalance: b.end_balance,
  }));
}

export function writeStartBalances(balances) {
  const db = getDb();
  db.run('BEGIN');
  try {
    db.run('DELETE FROM start_balances');
    if (Array.isArray(balances) && balances.length) {
      const stmt = db.prepare('INSERT OR REPLACE INTO start_balances VALUES (?,?,?,?)');
      for (const b of balances) {
        stmt.run([
          b.statement, b.accountName ?? '',
          b.startBalance == null || b.startBalance === '' ? null : num(b.startBalance),
          b.endBalance == null || b.endBalance === '' ? null : num(b.endBalance),
        ]);
      }
      stmt.finalize();
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
