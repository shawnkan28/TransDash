import type { Transaction } from './types';

/**
 * Talks to the SQLite-backed endpoints in vite.sqlitePlugin.ts.
 *
 * Dates cross the wire as ISO strings and become Date objects here, so the
 * rest of the app keeps working with real Dates as it always has.
 */

interface TransactionDto extends Omit<Transaction, 'date'> {
  date: string;
}

function toTransaction(dto: TransactionDto): Transaction {
  return { ...dto, date: new Date(dto.date) };
}

function toDto(transaction: Transaction): TransactionDto {
  return { ...transaction, date: transaction.date.toISOString() };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });

  if (!response.ok) {
    let message = `${init?.method ?? 'GET'} ${url} failed (${response.status})`;
    let code: string | undefined;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
      if (payload?.code) code = payload.code;
    } catch {
      // Non-JSON error body; the status line above is the best we have.
    }
    // status and code travel with the error so callers can tell a name clash
    // (which deserves a question) from a real failure.
    throw Object.assign(new Error(message), { status: response.status, code });
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Omitting the range loads the full history; mobile passes a `from`. */
export async function fetchTransactions(range?: { from?: Date; to?: Date }): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from.toISOString());
  if (range?.to) params.set('to', range.to.toISOString());
  const query = params.toString();
  const dtos = await request<TransactionDto[]>(`/api/transactions${query ? `?${query}` : ''}`);
  return dtos.map(toTransaction);
}

export async function createTransactionApi(transaction: Transaction): Promise<Transaction> {
  return toTransaction(
    await request<TransactionDto>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(toDto(transaction)),
    })
  );
}

export async function updateTransactionApi(
  id: string,
  updates: Partial<Transaction>
): Promise<Transaction> {
  const payload: Record<string, unknown> = { ...updates };
  if (updates.date instanceof Date) payload.date = updates.date.toISOString();

  return toTransaction(
    await request<TransactionDto>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  );
}

/** Applies partial updates to many transactions in one request. */
export async function updateTransactionsApi(
  updates: Record<string, Partial<Transaction>>
): Promise<Transaction[]> {
  const payload: Record<string, unknown> = {};
  for (const [id, changes] of Object.entries(updates)) {
    const entry: Record<string, unknown> = { ...changes };
    if (changes.date instanceof Date) entry.date = changes.date.toISOString();
    payload[id] = entry;
  }

  const dtos = await request<TransactionDto[]>('/api/transactions', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return dtos.map(toTransaction);
}

export async function deleteTransactionApi(id: string): Promise<void> {
  await request<void>(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Whole-table replace. Only the Settings CSV import uses this. */
export async function replaceTransactionsApi(transactions: Transaction[]): Promise<number> {
  const result = await request<{ count: number }>('/api/transactions/replace', {
    method: 'POST',
    body: JSON.stringify(transactions.map(toDto)),
  });
  return result.count;
}

export interface BackupInfo {
  name: string;
  bytes: number;
  created: string;
  /** True for the single daily file, which is overwritten rather than kept. */
  daily?: boolean;
}

export interface BackupSettings {
  backups: BackupInfo[];
  keep: number;
  scheduleEnabled: boolean;
  /** Hour of the day the daily backup is written, in the server's timezone. */
  backupHour: number;
  /** The timezone that hour is in — the server's, not the browser's. */
  timeZone: string;
  dailyName: string;
  nextScheduled: string | null;
}

export async function fetchBackups(): Promise<BackupSettings> {
  return request<BackupSettings>('/api/backups');
}

export async function createBackupApi(): Promise<BackupInfo> {
  return request<BackupInfo>('/api/backups', { method: 'POST' });
}

export async function restoreBackupApi(
  name: string
): Promise<{ restoredRows: number; safetyBackup: string | null }> {
  return request<{ restoredRows: number; safetyBackup: string | null }>(
    `/api/backups/${encodeURIComponent(name)}/restore`,
    { method: 'POST' }
  );
}

export async function deleteBackupApi(name: string): Promise<void> {
  await request<void>(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/** Browser download URL for a backup file. */
export function backupDownloadUrl(name: string): string {
  return `/api/backups/${encodeURIComponent(name)}/download`;
}

export interface SqlExport {
  name: string;
  bytes: number;
  created: string;
}

export async function fetchExports(): Promise<{ exports: SqlExport[]; suggestedName: string }> {
  return request<{ exports: SqlExport[]; suggestedName: string }>('/api/exports');
}

export async function createExport(
  filename: string,
  overwrite = false
): Promise<SqlExport & { path: string }> {
  return request<SqlExport & { path: string }>('/api/exports', {
    method: 'POST',
    body: JSON.stringify({ filename, overwrite }),
  });
}

export async function deleteExportApi(name: string): Promise<void> {
  await request<void>(`/api/exports/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export function exportDownloadUrl(name: string): string {
  return `/api/exports/${encodeURIComponent(name)}/download`;
}

export interface CsvImportStatus {
  csvAvailable: boolean;
  csvRows: number;
  csvModified: string | null;
  currentRows: number;
}

export interface CsvImportResult {
  counts: Record<string, number>;
  backupPath: string | null;
  previousRows: number;
}

/** What a re-import from data/data.csv would involve, without running it. */
export async function fetchCsvImportStatus(): Promise<CsvImportStatus> {
  return request<CsvImportStatus>('/api/import/csv');
}

/** Rebuilds every table from the data/*.csv + settings.json files on the server. */
export async function runCsvImport(): Promise<CsvImportResult> {
  return request<CsvImportResult>('/api/import/csv', { method: 'POST' });
}

/** Pushes each account's type down onto its transactions, server-side. */
export async function syncAccountTypesApi(
  accounts: { name: string; accountType: string }[]
): Promise<void> {
  await request<{ updated: number }>('/api/accounts/sync-types', {
    method: 'POST',
    body: JSON.stringify(accounts),
  });
}

export interface StartBalanceRow {
  statement: string;
  accountName: string;
  startBalance: number | null;
  endBalance: number | null;
}

export async function fetchStartBalances(): Promise<StartBalanceRow[]> {
  return request<StartBalanceRow[]>('/api/start-balances');
}

export async function saveStartBalances(rows: StartBalanceRow[]): Promise<void> {
  await request<StartBalanceRow[]>('/api/start-balances', {
    method: 'PUT',
    body: JSON.stringify(rows),
  });
}
