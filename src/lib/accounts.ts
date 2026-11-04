import { db } from './db';
import { syncAccountTypesApi } from './api';
import type { Account, Transaction } from './types';

export function collectAccountsFromTransactions(transactions: Transaction[]): Account[] {
  const accountMap = new Map<string, string>();

  transactions.forEach((transaction) => {
    if (!transaction.accountName || accountMap.has(transaction.accountName)) return;
    accountMap.set(transaction.accountName, transaction.accountType ?? '');
  });

  return [...accountMap.entries()]
    .map(([name, accountType]) => ({ name, accountType }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function seedAccountsFromTransactions(
  transactions: Transaction[]
): Promise<void> {
  const count = await db.accounts.count();
  if (count > 0) return;

  const accounts = collectAccountsFromTransactions(transactions);

  if (accounts.length > 0) {
    await db.accounts.bulkPut(accounts);
  }
}

export async function syncTransactionAccountTypes(accounts: Account[]): Promise<void> {
  await syncAccountTypesApi(
    accounts.map((account) => ({ name: account.name, accountType: account.accountType }))
  );
}

export function resolveAccountType(
  accountName: string,
  accounts: Account[],
  transactions: Transaction[]
): string {
  const account = accounts.find((item) => item.name === accountName);
  if (account?.accountType) return account.accountType;

  const transaction = transactions.find((item) => item.accountName === accountName);
  return transaction?.accountType ?? '';
}

export function computeEndBalance(
  accountType: string,
  startBalance: number,
  income: number,
  expenses: number
): number {
  if (accountType === 'Credit Card') {
    return startBalance - income + expenses;
  }

  return startBalance + income - expenses;
}
