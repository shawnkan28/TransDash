import Papa from 'papaparse';
import { db } from './db';
import { replaceTransactionsApi } from './api';
import type { TransactionCSV, Transaction, Category } from './types';

async function mapTransactionRows(rows: TransactionCSV[]): Promise<Transaction[]> {
  // Fetch all categories for mapping
  const allCategories = await db.categories.toArray();
  const categoryMap = new Map<string, Category>(allCategories.map((c) => [c.label, c]));

  const allAccounts = await db.accounts.toArray();
  const accountMap = new Map(allAccounts.map((a) => [a.name, a.accountType]));

  return rows.map((row) => {
    const mappedCat = categoryMap.get(row.Category);
    const accountName = row['Account Name'];

    return {
      id: row['Transaction ID'],
      date: new Date(row.Date),
      note: row.Note,
      value: parseFloat(row.Value),
      currencyCode: row['Currency Code'],
      exchangeRate: parseFloat(row['Exchange Rate']) || 1,
      category: row.Category,
      accountName,
      accountType: accountMap.get(accountName) ?? row['Account Type'],
      dateRaw: row.Date,
      statement: row.Statement,
      tripName: row['Trip Name'] ?? '',
      // Map from categories if available, else fallback to CSV data
      transactionType: mappedCat ? mappedCat.transactionType : row['Transaction Type'],
      categoryGroup: mappedCat ? mappedCat.categoryGroup : row['Category Group'],
      affectCashFlow: mappedCat ? mappedCat.affectCashFlow : (row['Affect Cash Flow'].toLowerCase() === 'true'),
    };
  });
}

/**
 * Imports an uploaded CSV, replacing the transactions table. This is the only
 * remaining whole-table write, and it is what the Settings importer means.
 */
export async function parseTransactions(file: File): Promise<number> {
  const transactions = await new Promise<Transaction[]>((resolve, reject) => {
    Papa.parse<TransactionCSV>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          resolve(await mapTransactionRows(results.data));
        } catch (err) {
          reject(err);
        }
      },
      error: (err: unknown) => reject(err),
    });
  });

  return replaceTransactionsApi(transactions);
}
