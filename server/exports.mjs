/**
 * User-requested SQL dumps, written into the data folder on demand.
 *
 * Kept apart from the daily backup and the undo points: those are the system's
 * own files with their own lifecycles, and an export someone asked for should
 * never overwrite either of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './schema.mjs';
import { dumpDatabase } from './dump.mjs';
import { DAILY_BACKUP_NAME } from './backup.mjs';

export const DATA_DIR = path.dirname(DB_PATH);

const SUFFIX = '.sql';
/** Names the app owns; an export may not take one of them. */
const RESERVED = new Set([DAILY_BACKUP_NAME, path.basename(DB_PATH)]);

export function defaultExportName(now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `transdash-export-${stamp}${SUFFIX}`;
}

/**
 * Turns whatever was typed into a safe filename inside the data folder.
 * Throws rather than silently rewriting into something unexpected.
 */
export function safeExportName(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return defaultExportName();

  // Any directory part is dropped: an export always lands in the data folder.
  let name = path.basename(trimmed);
  if (name.toLowerCase().endsWith(SUFFIX)) name = name.slice(0, -SUFFIX.length);

  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('Use letters, numbers, dots, dashes and underscores only.');
  }
  if (name.startsWith('.')) throw new Error('The name cannot start with a dot.');

  const full = `${name}${SUFFIX}`;
  if (RESERVED.has(full)) throw new Error(`${full} is used by the app. Pick another name.`);
  return full;
}

/** Every .sql file in the data folder that is not the daily backup. */
export function listExports() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(SUFFIX) && !RESERVED.has(name))
    .map((name) => {
      const stat = fs.statSync(path.join(DATA_DIR, name));
      return { name, bytes: stat.size, created: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function exportPath(name) {
  return path.join(DATA_DIR, path.basename(name));
}

/**
 * Writes a dump to data/<name>.sql. `overwrite` must be set to replace an
 * existing file, so a typo cannot quietly destroy an earlier export.
 */
export function writeExport(requestedName, { overwrite = false } = {}) {
  if (!fs.existsSync(DB_PATH)) throw new Error('There is no database to export yet.');

  const name = safeExportName(requestedName);
  const target = exportPath(name);

  if (fs.existsSync(target) && !overwrite) {
    const error = new Error(`${name} already exists.`);
    error.code = 'EXISTS';
    throw error;
  }

  const pending = `${target}.partial`;
  fs.writeFileSync(pending, dumpDatabase(), 'utf8');
  fs.renameSync(pending, target);

  const stat = fs.statSync(target);
  return { name, path: target, bytes: stat.size, created: stat.mtime.toISOString() };
}

export function deleteExport(name) {
  const target = exportPath(safeExportName(name));
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}
