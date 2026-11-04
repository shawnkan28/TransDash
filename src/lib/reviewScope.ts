import type { Transaction } from './types';

/**
 * A unit of reconciliation: an account, or one currency within an account.
 *
 * A multi-currency wallet holds a separate balance per currency, and the paper
 * statement reports them separately, so reviewing it as one account would ask
 * you to reconcile against a total that does not exist. Splitting means every
 * scope is single-currency, which is also why nothing in review needs
 * converting — the figures are the ones actually on the statement.
 *
 * Single-currency accounts keep the plain account name as their id, so balances
 * saved before this split still resolve.
 */
export interface ReviewScope {
  /** Balance-store key and selection id. The account name when not split. */
  id: string;
  /** Underlying account. */
  accountName: string;
  /** The currency this scope covers, or null when the account has only one. */
  currency: string | null;
  /** What to show: "YouTrip (JPY)" when split, otherwise the account name. */
  label: string;
}

function currencyOf(transaction: Transaction): string {
  return transaction.currencyCode || 'SGD';
}

export function scopeIdFor(accountName: string, currency: string | null): string {
  return currency ? `${accountName} (${currency})` : accountName;
}

/** True when a transaction belongs to this scope. */
export function inScope(transaction: Transaction, scope: ReviewScope): boolean {
  if (transaction.accountName !== scope.accountName) return false;
  return scope.currency === null || currencyOf(transaction) === scope.currency;
}

/**
 * One scope per account, or one per currency for accounts that hold several.
 * Currencies are ordered by how much they are used, so the main one leads.
 */
export function buildReviewScopes(transactions: Transaction[]): ReviewScope[] {
  const byAccount = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    const account = transaction.accountName;
    if (!account) continue;
    const currencies = byAccount.get(account) ?? new Map<string, number>();
    const code = currencyOf(transaction);
    currencies.set(code, (currencies.get(code) ?? 0) + 1);
    byAccount.set(account, currencies);
  }

  const scopes: ReviewScope[] = [];

  for (const [accountName, currencies] of byAccount) {
    if (currencies.size <= 1) {
      scopes.push({ id: accountName, accountName, currency: null, label: accountName });
      continue;
    }

    const ordered = Array.from(currencies.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code]) => code);

    for (const currency of ordered) {
      scopes.push({
        id: scopeIdFor(accountName, currency),
        accountName,
        currency,
        label: `${accountName} (${currency})`,
      });
    }
  }

  return scopes.sort((a, b) => a.label.localeCompare(b.label));
}

/** The currency a scope settles in — what its balances are denominated in. */
export function scopeCurrency(scope: ReviewScope, transactions: Transaction[]): string {
  if (scope.currency) return scope.currency;
  const first = transactions.find((transaction) => transaction.accountName === scope.accountName);
  return first ? currencyOf(first) : 'SGD';
}
