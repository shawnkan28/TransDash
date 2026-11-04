import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Account,
  Statement,
  Budget,
  MonthlyBudget,
  MonthlyBudgetPlan,
  YearlyBudget,
  QuickAddPreset,
  ScheduledTransaction,
} from './types';

export class FinanceDatabase extends Dexie {
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  statements!: Table<Statement, string>;
  budgets!: Table<Budget, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  monthlyBudgetPlan!: Table<MonthlyBudgetPlan, string>;
  yearlyBudgets!: Table<YearlyBudget, string>;
  quickAddPresets!: Table<QuickAddPreset, string>;
  scheduledTransactions!: Table<ScheduledTransaction, string>;

  constructor() {
    super('FinanceDatabase');
    this.version(1).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
    });
    this.version(2).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
    });
    this.version(3).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
    });
    this.version(4).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
    });
    this.version(5).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
      monthlyBudgets: 'id',
    });
    this.version(6).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
      monthlyBudgets: 'id',
      monthlyBudgetPlan: 'id',
    });
    this.version(7).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
      monthlyBudgets: 'id',
      monthlyBudgetPlan: 'id',
      yearlyBudgets: 'id',
    });
    this.version(8).stores({
      transactions: 'id, date, categoryGroup, accountName, affectCashFlow',
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
      monthlyBudgets: 'id',
      monthlyBudgetPlan: 'id',
      yearlyBudgets: 'id',
      quickAddPresets: 'id',
    });
    // v10 drops the transactions table. Transactions live in SQLite on the
    // server; Dexie is now only a scratch cache for the Settings editor.
    this.version(10).stores({
      transactions: null,
      categories: 'label',
      accounts: 'name',
      statements: 'value',
      budgets: 'id',
      monthlyBudgets: 'id',
      monthlyBudgetPlan: 'id',
      yearlyBudgets: 'id',
      quickAddPresets: 'id',
      scheduledTransactions: 'id',
    });
  }
}

export const db = new FinanceDatabase();
