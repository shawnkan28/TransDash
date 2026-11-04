export interface StatementBalances {
  start: Record<string, string>;
  end: Record<string, string>;
}

export type BalanceCheckStatus = 'match' | 'mismatch' | 'missing';

export interface BalanceCheck {
  savedEndBalance: number | null;
  difference: number;
  status: BalanceCheckStatus;
}

/** Half a cent, so rounding noise never reads as a mismatch. */
const BALANCE_TOLERANCE = 0.005;

export function startBalanceKey(statement: string, accountName: string): string {
  return `${statement}|${accountName}`;
}

export function parseStartBalanceKey(key: string): { statement: string; accountName: string } {
  const separator = key.indexOf('|');
  if (separator === -1) {
    return { statement: key, accountName: '' };
  }

  return {
    statement: key.slice(0, separator),
    accountName: key.slice(separator + 1),
  };
}

export function emptyStatementBalances(): StatementBalances {
  return { start: {}, end: {} };
}

export function serializeStatementBalances(balances: StatementBalances): string {
  return JSON.stringify([serializeBalanceMap(balances.start), serializeBalanceMap(balances.end)]);
}

function serializeBalanceMap(balances: Record<string, string>): [string, string][] {
  return Object.entries(balances)
    .filter(([, value]) => value.trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b));
}

export function parseBalance(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Compare a computed end balance against the one saved from the bank statement. */
export function checkEndBalance(
  computedEndBalance: number,
  savedEndBalance: string | number | null | undefined
): BalanceCheck {
  const saved =
    typeof savedEndBalance === 'number' ? savedEndBalance : parseBalance(savedEndBalance ?? '');

  if (saved === null) {
    return { savedEndBalance: null, difference: 0, status: 'missing' };
  }

  const difference = computedEndBalance - saved;

  return {
    savedEndBalance: saved,
    difference,
    status: Math.abs(difference) < BALANCE_TOLERANCE ? 'match' : 'mismatch',
  };
}
