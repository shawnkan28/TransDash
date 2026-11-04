/**
 * Shared money formatters. These were previously re-declared, with small
 * unintended variations, in six components.
 */

/** The app's default display currency formatter, e.g. $1,234.50. */
export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Whole-dollar variant for stat tiles, e.g. $1,235. */
export const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const byCurrency = new Map<string, Intl.NumberFormat>();

/**
 * Formatter for an arbitrary currency code, cached because constructing an
 * Intl.NumberFormat is not cheap and these run inside per-row rendering.
 */
export function formatterFor(currencyCode: string): Intl.NumberFormat {
  const code = currencyCode || 'SGD';
  let formatter = byCurrency.get(code);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    byCurrency.set(code, formatter);
  }
  return formatter;
}

/** An amount in its own currency, e.g. ¥1,200 or $45.90. */
export function formatCurrency(value: number, currencyCode: string): string {
  return formatterFor(currencyCode).format(value);
}

/** A transaction amount with the sign its type implies, e.g. -$45.90. */
export function formatSignedAmount(
  value: number,
  currencyCode: string,
  transactionType: string
): string {
  const sign = transactionType === 'Income' ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(value), currencyCode)}`;
}
