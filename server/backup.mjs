/**
 * Backups of the database, written as plain SQL dumps.
 *
 * A .sql dump is the durable artefact: greppable, diffable, compressible, and
 * replayable by any SQLite version — or by anything else that speaks SQL. The
 * binary file is only ever a rebuildable convenience.
 *
 * Two kinds of file, deliberately kept apart:
 *
 *   data/transdash.backup.sql   the daily backup, one fixed name, overwritten
 *   data/backups/*.sql          undo points, written before a destructive action
 *
 * They are separate so that running an import cannot clobber the daily backup,
 * which is the one you would actually reach for.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pkg from 'node-sqlite3-wasm';
import { DB_PATH } from './schema.mjs';
import { getDb } from './repository.mjs';
import { dumpDatabase } from './dump.mjs';

const DATA_DIR = path.dirname(DB_PATH);

/** The daily backup. One file, same name every day. */
export const DAILY_BACKUP_NAME = 'transdash.backup.sql';
export const DAILY_BACKUP_PATH = path.join(DATA_DIR, DAILY_BACKUP_NAME);

/** Undo points taken before an import or a restore. */
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/** How many undo points to keep. The daily backup is not part of this count. */
export const KEEP_BACKUPS = 14;

const PREFIX = 'transdash-';
const SUFFIX = '.sql';

/** Hour of the day the daily backup is written, in the server's timezone. */
export const DEFAULT_BACKUP_HOUR = 0;

/**
 * The timezone the schedule actually runs in — whatever the Node process
 * resolves to, which is the TZ env var or the host's zone.
 *
 * Reported to the UI because it is otherwise invisible: a container with no
 * tzdata silently runs in UTC, so a "00:00" backup lands mid-morning for
 * anyone east of Greenwich, with nothing on screen to explain why.
 */
export function schedulerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function backupHour() {
  const raw = Number(process.env.BACKUP_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_BACKUP_HOUR;
}

/** Scheduling is skipped entirely when BACKUP_SCHEDULE is 0/false. */
export function backupScheduleEnabled() {
  const raw = process.env.BACKUP_SCHEDULE;
  return !(raw === '0' || raw === 'false');
}

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Dumps to a temporary name and renames into place. The rename is atomic, so
 * an interrupted write can never leave a truncated file where a good backup
 * used to be — which matters most for the daily file, since it is overwritten.
 */
function writeDump(target) {
  const pending = `${target}.partial`;
  fs.writeFileSync(pending, dumpDatabase(), 'utf8');
  fs.renameSync(pending, target);
  return fs.statSync(target);
}

function describe(file, name, format = 'sql') {
  const stat = fs.statSync(file);
  return { path: file, name, bytes: stat.size, created: stat.mtime.toISOString(), format };
}

// ---------- the daily backup ----------

export function writeDailyBackup() {
  if (!fs.existsSync(DB_PATH)) return null;
  writeDump(DAILY_BACKUP_PATH);
  return describe(DAILY_BACKUP_PATH, DAILY_BACKUP_NAME);
}

export function dailyBackup() {
  return fs.existsSync(DAILY_BACKUP_PATH)
    ? describe(DAILY_BACKUP_PATH, DAILY_BACKUP_NAME)
    : null;
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Milliseconds until the next occurrence of `hour` in local time. */
export function msUntilNextRun(hour = backupHour(), now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Writes the daily backup at `hour` every day, local time.
 *
 * Re-arms by recomputing the delay after each run rather than repeating a fixed
 * 24h interval, so it stays on the wall clock across DST changes.
 *
 * On start it also writes one if the existing file is not from today — a box
 * that was switched off at midnight would otherwise wait a full day.
 */
export function startDailyBackupSchedule({ hour = backupHour(), onBackup, now = () => new Date() } = {}) {
  if (!backupScheduleEnabled()) return () => {};

  let timer = null;

  const run = (reason) => {
    try {
      const backup = writeDailyBackup();
      if (backup && onBackup) onBackup(backup, reason);
    } catch (error) {
      console.warn('[sqlite] daily backup failed:', error);
    }
  };

  const arm = (afterRun = false) => {
    // setTimeout can fire a millisecond or two early. Re-arming from that
    // instant would see the target as still ahead and fire again immediately,
    // so after a run the next one is measured from just past the hour.
    const reference = afterRun ? new Date(now().getTime() + 61_000) : now();
    const delay = msUntilNextRun(hour, reference);
    timer = setTimeout(() => {
      run('scheduled');
      arm(true);
    }, delay);
    timer.unref?.();
    return delay;
  };

  const existing = dailyBackup();
  if (!existing || !sameLocalDay(new Date(existing.created), now())) {
    run(existing ? 'catch-up' : 'first run');
  }

  const delay = arm();
  return { stop: () => timer && clearTimeout(timer), nextRunMs: delay };
}

// ---------- undo points ----------

/**
 * When an undo point was taken, read from its filename rather than the file's
 * mtime, which a copy or restore would reset.
 */
function createdFromName(name) {
  const match = /^transdash-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-/.exec(name);
  if (!match) return null;
  const [date, time] = match[1].split('T');
  // 13-07-56-530Z -> 13:07:56.530Z
  const iso = `${date}T${time.replace(/-/g, ':').replace(/:(\d{3})Z$/, '.$1Z')}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function listUndoPoints() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return {
        name,
        bytes: stat.size,
        created: createdFromName(name) ?? stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

/** The daily backup first, then the undo points, newest first. */
export function listBackups() {
  const daily = dailyBackup();
  const rows = listUndoPoints();
  return daily ? [{ ...daily, daily: true }, ...rows] : rows;
}

/** Writes an undo point before a destructive action. Never touches the daily file. */
export function createBackup(label = 'manual') {
  if (!fs.existsSync(DB_PATH)) return null;

  // "Back up now" means the daily backup; everything else is an undo point.
  if (label === 'manual') return writeDailyBackup();

  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `${PREFIX}${stamp}-${label}${SUFFIX}`);
  writeDump(target);
  pruneBackups();
  return describe(target, path.basename(target));
}

export function pruneBackups(keep = KEEP_BACKUPS) {
  const rows = listUndoPoints();
  for (const row of rows.slice(keep)) {
    fs.unlinkSync(path.join(BACKUP_DIR, row.name));
  }
  return Math.max(0, rows.length - keep);
}

// ---------- reading a backup back ----------

/** Resolves a backup name to its path, across both locations. */
export function resolveBackup(name) {
  const base = path.basename(name);
  if (base === DAILY_BACKUP_NAME) return DAILY_BACKUP_PATH;
  return path.join(BACKUP_DIR, base);
}

/**
 * Guards a restore: replays the dump into a throwaway database in the system
 * temp folder and checks it there, so a corrupt or truncated dump is caught
 * while the live database is still untouched.
 *
 * That scratch file is the only .sqlite this module ever writes, it never
 * reaches the data folder, and `cleanup()` removes it.
 */
export function inspectBackup(name) {
  const file = resolveBackup(name);
  if (!fs.existsSync(file)) return { ok: false, error: 'Backup not found', cleanup: () => {} };

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const scratch = path.join(os.tmpdir(), `transdash-restore-${unique}.sqlite`);
  const cleanup = () => {
    if (fs.existsSync(scratch)) fs.unlinkSync(scratch);
  };

  try {
    const build = new pkg.Database(scratch);
    build.exec(fs.readFileSync(file, 'utf8'));
    build.close();

    const db = new pkg.Database(scratch);
    const integrity = db.get('PRAGMA integrity_check').integrity_check;
    const rows = db.get('SELECT COUNT(*) c FROM transactions').c;
    db.close();

    return { ok: integrity === 'ok', integrity, rows, file: scratch, cleanup };
  } catch (error) {
    cleanup();
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read that backup',
      cleanup: () => {},
    };
  }
}

// Entry point for an external scheduler (cron, systemd timer):
//   node server/backup.mjs   -> write data/transdash.backup.sql
if (import.meta.url === `file://${process.argv[1]}`) {
  const backup = writeDailyBackup();
  if (backup) {
    console.log(`Backup written: ${backup.path} (${(backup.bytes / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.error('No database to back up.');
    process.exit(1);
  }
}
