import type { Transaction } from './types';
import { matchesSearchPattern } from './search';

export const STATEMENT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const STATEMENT_PATTERN =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/i;

export function statementFromDate(date: Date): string {
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${STATEMENT_MONTHS[date.getMonth()]}-${year}`;
}

export function normalizeStatement(value: string): string | null {
  const match = value.trim().match(STATEMENT_PATTERN);
  if (!match) return null;

  const monthIndex = STATEMENT_MONTHS.findIndex(
    (month) => month.toLowerCase() === match[1].toLowerCase()
  );
  if (monthIndex < 0) return null;

  return `${STATEMENT_MONTHS[monthIndex]}-${match[2]}`;
}

export function isUnassignedStatement(statement: string | undefined | null): boolean {
  return !statement || !statement.trim();
}

export function compareStatements(a: string, b: string): number {
  const parsedA = parseStatement(a);
  const parsedB = parseStatement(b);
  if (!parsedA || !parsedB) return a.localeCompare(b);
  return parsedA.getTime() - parsedB.getTime();
}

function parseStatement(value: string): Date | null {
  const normalized = normalizeStatement(value);
  if (!normalized) return null;

  const match = normalized.match(STATEMENT_PATTERN);
  if (!match) return null;

  const monthIndex = STATEMENT_MONTHS.findIndex((month) => month === match[1]);
  if (monthIndex < 0) return null;

  const year = Number(match[2]);
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;

  return new Date(fullYear, monthIndex, 1);
}

export function collectStatementOptions(transactions: Transaction[]): string[] {
  const options = new Set<string>();

  transactions.forEach((transaction) => {
    const normalized = normalizeStatement(transaction.statement);
    if (normalized) options.add(normalized);
  });

  if (transactions.length === 0) {
    return [...options].sort(compareStatements);
  }

  const timestamps = transactions.map((transaction) => transaction.date.getTime());
  const minDate = new Date(Math.min(...timestamps));
  const maxDate = new Date(Math.max(...timestamps));

  minDate.setMonth(minDate.getMonth() - 2, 1);
  maxDate.setMonth(maxDate.getMonth() + 2, 1);

  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  while (cursor <= end) {
    options.add(statementFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return [...options].sort(compareStatements);
}

export function uniqueAssignedStatements(transactions: Transaction[]): string[] {
  const values = new Set<string>();

  transactions.forEach((transaction) => {
    if (!isUnassignedStatement(transaction.statement)) {
      values.add(transaction.statement.trim());
    }
  });

  return [...values].sort((a, b) => {
    const normalizedA = normalizeStatement(a);
    const normalizedB = normalizeStatement(b);
    if (normalizedA && normalizedB) return compareStatements(normalizedA, normalizedB);
    return a.localeCompare(b);
  });
}
