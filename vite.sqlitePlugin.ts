import type { Connect, Plugin } from 'vite';
import * as repo from './server/repository.mjs';
import {
  listExports,
  writeExport,
  deleteExport,
  defaultExportName,
  exportPath,
} from './server/exports.mjs';
import {
  listBackups,
  createBackup,
  writeDailyBackup,
  startDailyBackupSchedule,
  backupHour,
  backupScheduleEnabled,
  schedulerTimeZone,
  msUntilNextRun,
  resolveBackup,
  DAILY_BACKUP_NAME,
  KEEP_BACKUPS,
} from './server/backup.mjs';
import fs from 'node:fs';
import path from 'node:path';

type Handler = (
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  params: Record<string, string>,
  body: unknown
) => void | Promise<void>;

function send(res: import('node:http').ServerResponse, status: number, payload?: unknown) {
  if (payload === undefined) {
    res.statusCode = status;
    res.end();
    return;
  }
  const json = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.end(json);
}

/** Generous next to a full-history replace, small enough to bound memory. */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

function readBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** `METHOD /path/:param` -> matcher. Kept tiny on purpose; there are 9 routes. */
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(spec: string, handler: Handler) {
  const [method, path] = spec.split(' ');
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:([A-Za-z]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ method, pattern, keys, handler });
}

route('GET /api/transactions', (req, res) => {
  const url = new URL(req.url ?? '', 'http://localhost');
  send(res, 200, repo.listTransactions({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  }));
});

route('POST /api/transactions', (_req, res, _params, body) => {
  const transaction = body as { id?: string };
  if (!transaction?.id) return send(res, 400, { error: 'Transaction id is required' });
  if (repo.getTransaction(transaction.id)) {
    return send(res, 409, { error: 'A transaction with that id already exists' });
  }
  send(res, 201, repo.createTransaction(transaction));
});

route('POST /api/transactions/replace', (_req, res, _params, body) => {
  const rows = body as unknown[];
  if (!Array.isArray(rows)) return send(res, 400, { error: 'Expected an array of transactions' });
  send(res, 200, { count: repo.replaceTransactions(rows) });
});

route('PATCH /api/transactions', (_req, res, _params, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return send(res, 400, { error: 'Expected an object of { id: changes }' });
  }
  send(res, 200, repo.updateTransactions(body as Record<string, unknown>));
});

route('PATCH /api/transactions/:id', (_req, res, params, body) => {
  const updated = repo.updateTransaction(params.id, body ?? {});
  if (!updated) return send(res, 404, { error: 'Transaction not found' });
  send(res, 200, updated);
});

route('DELETE /api/transactions/:id', (_req, res, params) => {
  if (!repo.deleteTransaction(params.id)) {
    return send(res, 404, { error: 'Transaction not found' });
  }
  send(res, 204);
});

route('POST /api/accounts/sync-types', (_req, res, _params, body) => {
  if (!Array.isArray(body)) return send(res, 400, { error: 'Expected an array of accounts' });
  send(res, 200, { updated: repo.syncAccountTypes(body) });
});

route('GET /api/backups', (_req, res) => {
  send(res, 200, {
    backups: listBackups(),
    keep: KEEP_BACKUPS,
    scheduleEnabled: backupScheduleEnabled(),
    backupHour: backupHour(),
    timeZone: schedulerTimeZone(),
    dailyName: DAILY_BACKUP_NAME,
    nextScheduled: backupScheduleEnabled()
      ? new Date(Date.now() + msUntilNextRun()).toISOString()
      : null,
  });
});

route('POST /api/backups', (_req, res) => {
  // "Back up now" refreshes the daily file rather than adding another one.
  const backup = writeDailyBackup();
  if (!backup) return send(res, 400, { error: 'There is no database to back up yet.' });
  send(res, 201, backup);
});

route('POST /api/backups/:name/restore', async (_req, res, params) => {
  try {
    send(res, 200, await repo.restoreFromBackup(params.name));
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : 'Restore failed' });
  }
});

route('DELETE /api/backups/:name', (_req, res, params) => {
  if (path.basename(params.name) === DAILY_BACKUP_NAME) {
    return send(res, 400, { error: 'The daily backup is overwritten each day, not deleted.' });
  }
  const file = resolveBackup(params.name);
  if (!fs.existsSync(file)) return send(res, 404, { error: 'Backup not found' });
  fs.unlinkSync(file);
  send(res, 204);
});

route('GET /api/exports', (_req, res) =>
  send(res, 200, { exports: listExports(), suggestedName: defaultExportName() })
);

route('POST /api/exports', (_req, res, _params, body) => {
  const { filename, overwrite } = (body ?? {}) as { filename?: string; overwrite?: boolean };
  try {
    send(res, 201, writeExport(filename, { overwrite: overwrite === true }));
  } catch (error) {
    const err = error as Error & { code?: string };
    // A name clash is a question for the user, not a failure.
    send(res, err.code === 'EXISTS' ? 409 : 400, { error: err.message, code: err.code });
  }
});

route('DELETE /api/exports/:name', (_req, res, params) => {
  try {
    if (!deleteExport(params.name)) return send(res, 404, { error: 'Export not found' });
    send(res, 204);
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : 'Could not delete that file' });
  }
});

// CSV import is a rare admin action, so the migration module (and the
// PapaParse dependency it pulls in) only loads into the server process on
// first use, instead of sitting resident in memory for every boot.
route('GET /api/import/csv', async (_req, res) => {
  const { importStatus } = await import('./server/migrate-csv-to-sqlite.mjs');
  send(res, 200, importStatus());
});

route('POST /api/import/csv', async (_req, res) => {
  const { importStatus, backupDatabase, migrate } = await import('./server/migrate-csv-to-sqlite.mjs');
  const before = importStatus();
  if (!before.csvAvailable) {
    return send(res, 400, { error: 'data/data.csv was not found on the server.' });
  }

  // The import replaces every table, so the current database is copied aside
  // first. migrate() itself rolls back and writes nothing if verification fails.
  const backupPath = backupDatabase();
  repo.closeDb();

  try {
    const counts = migrate({ verbose: false });
    return send(res, 200, { counts, backupPath, previousRows: before.currentRows });
  } catch (error) {
    return send(res, 500, {
      error: error instanceof Error ? error.message : 'Import failed',
      backupPath,
    });
  }
});

route('GET /api/settings', (_req, res) => send(res, 200, repo.readSettings()));

route('PUT /api/settings', (_req, res, _params, body) => {
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Expected a settings object' });
  repo.writeSettings(body as Parameters<typeof repo.writeSettings>[0]);
  send(res, 200, repo.readSettings());
});

route('GET /api/start-balances', (_req, res) => send(res, 200, repo.readStartBalances()));

route('PUT /api/start-balances', (_req, res, _params, body) => {
  if (!Array.isArray(body)) return send(res, 400, { error: 'Expected an array of balances' });
  repo.writeStartBalances(body);
  send(res, 200, repo.readStartBalances());
});

function attach(server: { middlewares: Connect.Server }) {
  if (backupScheduleEnabled()) {
    const hour = String(backupHour()).padStart(2, '0');
    startDailyBackupSchedule({
      onBackup: (backup, reason) =>
        console.log(`[sqlite] ${DAILY_BACKUP_NAME} written (${reason}), ${(backup.bytes / 1024 / 1024).toFixed(2)} MB`),
    });
    console.log(`[sqlite] daily backup scheduled for ${hour}:00 ${schedulerTimeZone()}`);
  } else {
    console.log('[sqlite] daily backup disabled (BACKUP_SCHEDULE=0)');
  }

  server.middlewares.use(async (req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (!pathname.startsWith('/api/')) return next();

    // Downloading a backup returns a file, not JSON.
    const download = /^\/api\/(backups|exports)\/([^/]+)\/download$/.exec(pathname);
    if (download && req.method === 'GET') {
      const name = path.basename(decodeURIComponent(download[2]));
      const file = download[1] === 'exports' ? exportPath(name) : resolveBackup(name);
      if (!fs.existsSync(file)) {
        return send(res as import('node:http').ServerResponse, 404, { error: 'Backup not found' });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return fs.createReadStream(file).pipe(res);
    }

    const match = routes.find(
      (r) => r.method === req.method && r.pattern.test(pathname)
    );
    if (!match) return next();

    const values = match.pattern.exec(pathname) ?? [];
    const params: Record<string, string> = {};
    match.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(values[i + 1]);
    });

    try {
      const body = req.method === 'GET' || req.method === 'DELETE'
        ? undefined
        : await readBody(req);
      await match.handler(req, res as import('node:http').ServerResponse, params, body);
    } catch (error) {
      console.error(`[sqlite-api] ${req.method} ${pathname}:`, error);
      send(res as import('node:http').ServerResponse, 500, {
        error: error instanceof Error ? error.message : 'Server error',
      });
    }
  });
}

export function sqliteApiPlugin(): Plugin {
  return {
    name: 'transdash-sqlite-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
