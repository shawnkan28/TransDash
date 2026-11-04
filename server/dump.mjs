/**
 * Plain-SQL dumps of the database, equivalent to the sqlite3 CLI's `.dump`.
 *
 * Written by hand because the sqlite3 CLI is not installed here and is not in
 * the Alpine image either. A text dump is the durable format: greppable,
 * diffable, compressible, and readable by any SQLite version — or by anything
 * else that speaks SQL, should this app ever go away.
 */
import { getDb } from './repository.mjs';

/** SQLite string literal: double the single quotes, nothing else is special. */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    // A non-finite float has no SQL literal; NULL is the honest round-trip.
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Uint8Array) {
    return `X'${Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('')}'`;
  }
  return quote(value);
}

function identifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * The whole database as SQL text. Mirrors `.dump`: schema, then data, wrapped
 * in one transaction so a partial replay cannot leave a half-built database.
 */
export function dumpDatabase(db = getDb()) {
  const lines = [];

  lines.push('-- TransDash SQL dump');
  lines.push(`-- generated ${new Date().toISOString()}`);
  lines.push(`-- sqlite ${db.get('SELECT sqlite_version() v').v}`);
  lines.push('');
  lines.push('PRAGMA foreign_keys=OFF;');
  lines.push('BEGIN TRANSACTION;');

  const objects = db.all(`
    SELECT name, type, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`);

  const tables = objects.filter((o) => o.type === 'table');

  for (const table of tables) {
    lines.push('');
    lines.push(`DROP TABLE IF EXISTS ${identifier(table.name)};`);
    lines.push(`${table.sql};`);

    const columns = db.all(`PRAGMA table_info(${identifier(table.name)})`).map((c) => c.name);
    if (columns.length === 0) continue;

    const rows = db.all(`SELECT * FROM ${identifier(table.name)}`);
    const columnList = columns.map(identifier).join(',');

    for (const row of rows) {
      const values = columns.map((c) => literal(row[c])).join(',');
      lines.push(`INSERT INTO ${identifier(table.name)} (${columnList}) VALUES (${values});`);
    }
  }

  // Indexes after the data: building them once at the end is faster than
  // maintaining them through several thousand inserts.
  for (const object of objects.filter((o) => o.type !== 'table')) {
    lines.push(`${object.sql};`);
  }

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}
