import type { Transaction } from './types';

/** Convert a transaction amount to SGD using its currency and exchange rate. */
export function transactionValueInSGD(tx: Transaction): number {
  return toSGD(tx.value, tx.currencyCode, tx.exchangeRate ?? 1);
}

/** Convert an amount to SGD using the stored exchange rate (foreign units per 1 SGD). */
export function toSGD(value: number, currencyCode: string, exchangeRate = 1): number {
  if (currencyCode === 'SGD') return value;
  if (exchangeRate > 0) return value / exchangeRate;
  return value;
}

/** Format SGD amounts compactly, e.g. 28.3k or 1.2m */
export function formatCompactSGD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const n = abs / 1_000_000;
    return `${sign}${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}m`;
  }
  if (abs >= 1_000) {
    const n = abs / 1_000;
    return `${sign}${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}k`;
  }
  return `${sign}${Math.round(abs)}`;
}
