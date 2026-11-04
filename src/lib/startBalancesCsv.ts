import {
  emptyStatementBalances,
  startBalanceKey,
  parseStartBalanceKey,
  type StatementBalances,
} from './startBalances';
import { fetchStartBalances, saveStartBalances, type StartBalanceRow } from './api';

/**
 * Statement balances now live in SQLite rather than start_balances.csv. The
 * function names and the StatementBalances shape are unchanged so Review.svelte
 * did not need to change.
 */

export async function loadStatementBalancesCsv(): Promise<StatementBalances> {
  try {
    const rows = await fetchStartBalances();
    const balances = emptyStatementBalances();

    for (const row of rows) {
      const key = startBalanceKey(row.statement, row.accountName);
      if (row.startBalance != null) balances.start[key] = String(row.startBalance);
      if (row.endBalance != null) balances.end[key] = String(row.endBalance);
    }

    return balances;
  } catch {
    return emptyStatementBalances();
  }
}

export async function saveStatementBalancesCsv(balances: StatementBalances): Promise<void> {
  const keys = new Set([...Object.keys(balances.start), ...Object.keys(balances.end)]);

  const rows: StartBalanceRow[] = [...keys].map((key) => {
    const { statement, accountName } = parseStartBalanceKey(key);
    const start = balances.start[key];
    const end = balances.end[key];
    return {
      statement,
      accountName,
      startBalance: start === undefined || start === '' ? null : Number(start),
      endBalance: end === undefined || end === '' ? null : Number(end),
    };
  });

  await saveStartBalances(rows);
}
