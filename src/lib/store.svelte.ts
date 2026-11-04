import { db } from './db';
import type {
  Transaction,
  Category,
  Account,
  Statement,
  Budget,
  MonthlyBudget,
  QuickAddPreset,
  ScheduledTransaction,
  YearlyBudget,
} from './types';
import { defaultCategories } from './defaultCategories';
import { defaultMonthlyBudgets, defaultMonthlyBudgetPlan } from './defaultMonthlyBudgets';
import { defaultQuickAddPresets } from './defaultQuickAddPresets';
import { sortQuickAddPresets } from './quickAddPresets';
import {
  scheduledDueDate,
  sortScheduledTransactions,
} from './scheduledTransactions';
import { isMobileViewport } from './viewport.svelte';
import {
  normalizeCategoryMonthlyBudgets,
  normalizeMonthlyBudgets,
  normalizeYearlyBudgets,
  computeYearlyBudgetPool,
} from './monthlyBudget';
import {
  normalizeStatement,
  compareStatements,
  isUnassignedStatement,
} from './statement';
import {
  createTransactionApi,
  deleteTransactionApi,
  fetchTransactions,
  updateTransactionApi,
  updateTransactionsApi,
} from './api';
import { seedAccountsFromTransactions, resolveAccountType } from './accounts';
import { generateTransactionId } from './transactionId';
import {
  applyAppSettingsToDb,
  loadAppSettings,
  persistAppSettingsFromDb,
} from './appSettings';

class FinanceStore {
  transactions = $state<Transaction[]>([]);
  categories = $state<Category[]>([]);
  accounts = $state<Account[]>([]);
  statements = $state<Statement[]>([]);
  budgets = $state<Budget[]>([]);
  monthlyBudgets = $state<MonthlyBudget[]>([]);
  yearlyBudgets = $state<YearlyBudget[]>([]);
  quickAddPresets = $state<QuickAddPreset[]>([]);
  scheduledTransactions = $state<ScheduledTransaction[]>([]);
  monthlySalary = $state<number>(0);
  loading = $state<boolean>(true);

  async loadData() {
    this.loading = true;

    const fileSettings = await loadAppSettings();
    let settingsLoadedFromFile = false;
    if (fileSettings) {
      await applyAppSettingsToDb(fileSettings);
      settingsLoadedFromFile = true;
    } else {
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkPut(defaultCategories);
      }

      const monthlyBudgetCount = await db.monthlyBudgets.count();
      if (monthlyBudgetCount === 0) {
        await db.monthlyBudgets.bulkPut(defaultMonthlyBudgets);
      }

      const plan = await db.monthlyBudgetPlan.get('default');
      if (!plan) {
        await db.monthlyBudgetPlan.put(defaultMonthlyBudgetPlan);
      }
    }

    // Everything except transactions first: these tables are small regardless
    // of transaction count, and the mobile fast path below needs categories/
    // monthlyBudgets already in place before it can render anything useful.
    const plan = await db.monthlyBudgetPlan.get('default');
    this.monthlySalary = (plan ?? defaultMonthlyBudgetPlan).monthlySalary;

    const storedMonthlyBudgets = await db.monthlyBudgets.toArray();
    const normalizedMonthlyBudgets = normalizeMonthlyBudgets(
      storedMonthlyBudgets,
      this.monthlySalary
    );
    const monthlyBudgetsChanged = normalizedMonthlyBudgets.some((budget) => {
      const stored = storedMonthlyBudgets.find((item) => item.id === budget.id);
      return (
        budget.salaryPercent !== stored?.salaryPercent ||
        budget.amount !== stored?.amount
      );
    });
    if (monthlyBudgetsChanged) {
      await db.monthlyBudgets.bulkPut(normalizedMonthlyBudgets);
    }
    this.monthlyBudgets = normalizedMonthlyBudgets;

    const yearlyPool = computeYearlyBudgetPool(this.monthlySalary, normalizedMonthlyBudgets);
    const storedYearlyBudgets = await db.yearlyBudgets.toArray();
    const normalizedYearlyBudgets = normalizeYearlyBudgets(storedYearlyBudgets, yearlyPool);
    const yearlyBudgetsChanged = normalizedYearlyBudgets.some((budget) => {
      const stored = storedYearlyBudgets.find((item) => item.id === budget.id);
      return (
        budget.poolPercent !== stored?.poolPercent || budget.amount !== stored?.amount
      );
    });
    if (yearlyBudgetsChanged) {
      await db.yearlyBudgets.bulkPut(normalizedYearlyBudgets);
    }
    this.yearlyBudgets = normalizedYearlyBudgets;

    const storedCategories = await db.categories.toArray();
    const normalizedCategories = normalizeCategoryMonthlyBudgets(
      storedCategories,
      normalizedMonthlyBudgets,
      normalizedYearlyBudgets
    );
    const categoriesChanged = normalizedCategories.some((category) => {
      const stored = storedCategories.find((item) => item.label === category.label);
      return (stored?.monthlyBudgetId ?? undefined) !== category.monthlyBudgetId;
    });
    if (categoriesChanged) {
      await db.categories.bulkPut(normalizedCategories);
    }
    this.categories = normalizedCategories;
    this.budgets = await db.budgets.toArray();

    const quickAddPresetCount = await db.quickAddPresets.count();
    if (quickAddPresetCount === 0) {
      await db.quickAddPresets.bulkPut(defaultQuickAddPresets);
    }
    this.quickAddPresets = sortQuickAddPresets(await db.quickAddPresets.toArray());
    this.scheduledTransactions = sortScheduledTransactions(
      await db.scheduledTransactions.toArray()
    );

    // Transactions come from SQLite, already filtered and sorted. Mobile asks
    // only for the recent window it can actually display; the server does the
    // narrowing, so the phone never receives years of history it will not draw.
    try {
      if (isMobileViewport()) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 35);
        cutoff.setHours(0, 0, 0, 0);
        this.transactions = await fetchTransactions({ from: cutoff });
        this.loading = false;

        // The rest arrives in the background so editing an older entry, and
        // any total computed across all history, still has the full set.
        void fetchTransactions()
          .then((all) => {
            this.transactions = all;
          })
          .catch((err) => console.warn('Could not load full history:', err));
      } else {
        this.transactions = await fetchTransactions();
      }
    } catch (err) {
      console.warn('Could not load transactions:', err);
      this.transactions = [];
    }

    await seedAccountsFromTransactions(this.transactions);
    this.accounts = await db.accounts.orderBy('name').toArray();
    await this.seedStatementsFromTransactions();
    const statements = await db.statements.toArray();
    this.statements = statements.sort((a, b) => compareStatements(a.value, b.value));

    if (!settingsLoadedFromFile) {
      try {
        await persistAppSettingsFromDb();
      } catch (err) {
        console.warn('Could not write initial settings:', err);
      }
    }

    this.loading = false;
  }

  private async seedStatementsFromTransactions() {
    const count = await db.statements.count();
    if (count > 0) return;

    const values = new Set<string>();

    this.transactions.forEach((transaction) => {
      if (isUnassignedStatement(transaction.statement)) return;
      const normalized = normalizeStatement(transaction.statement);
      values.add(normalized ?? transaction.statement.trim());
    });

    if (values.size > 0) {
      await db.statements.bulkPut([...values].map((value) => ({ value })));
    }
  }

  async updateTransactionStatement(id: string, statement: string) {
    await this.updateTransactionStatements({ [id]: statement });
  }

  async updateTransactionStatements(updates: Record<string, string>) {
    const entries = Object.entries(updates);
    if (entries.length === 0) return;

    const normalizedUpdates: Record<string, string> = {};

    for (const [id, statement] of entries) {
      const normalized = normalizeStatement(statement);
      if (!normalized) {
        throw new Error('Use Mmm-YY format, e.g. Apr-26');
      }
      normalizedUpdates[id] = normalized;
    }

    await updateTransactionsApi(
      Object.fromEntries(
        Object.entries(normalizedUpdates).map(([id, statement]) => [id, { statement }])
      )
    );

    this.transactions = this.transactions.map((transaction) => {
      const statement = normalizedUpdates[transaction.id];
      return statement ? { ...transaction, statement } : transaction;
    });
  }

  async updateTransactionTripNames(updates: Record<string, string>) {
    const entries = Object.entries(updates);
    if (entries.length === 0) return;

    const normalizedUpdates: Record<string, string> = {};
    for (const [id, tripName] of entries) {
      normalizedUpdates[id] = tripName.trim();
    }

    await updateTransactionsApi(
      Object.fromEntries(
        Object.entries(normalizedUpdates).map(([id, tripName]) => [id, { tripName }])
      )
    );

    this.transactions = this.transactions.map((transaction) =>
      transaction.id in normalizedUpdates
        ? { ...transaction, tripName: normalizedUpdates[transaction.id] }
        : transaction
    );
  }

  async updateTransaction(
    id: string,
    updates: Partial<
      Pick<
        Transaction,
        | 'note'
        | 'date'
        | 'dateRaw'
        | 'value'
        | 'currencyCode'
        | 'exchangeRate'
        | 'category'
        | 'accountName'
        | 'statement'
        | 'tripName'
      >
    >
  ) {
    const existing = this.transactions.find((transaction) => transaction.id === id);
    if (!existing) {
      throw new Error('Transaction not found');
    }

    const categoryLabel = updates.category ?? existing.category;
    const mappedCategory = this.categories.find((category) => category.label === categoryLabel);
    const nextAccountName = updates.accountName ?? existing.accountName;

    let statement = updates.statement ?? existing.statement;
    if (updates.statement !== undefined) {
      if (updates.statement.trim()) {
        const normalized = normalizeStatement(updates.statement);
        if (!normalized) {
          throw new Error('Use Mmm-YY format, e.g. Apr-26');
        }
        statement = normalized;
      } else {
        statement = '';
      }
    }

    const updated: Transaction = {
      ...existing,
      ...updates,
      statement,
      accountName: nextAccountName,
      accountType: resolveAccountType(nextAccountName, this.accounts, this.transactions),
      transactionType: mappedCategory?.transactionType ?? existing.transactionType,
      categoryGroup: mappedCategory?.categoryGroup ?? existing.categoryGroup,
      affectCashFlow: mappedCategory?.affectCashFlow ?? existing.affectCashFlow,
      tripName: updates.tripName !== undefined ? updates.tripName.trim() : existing.tripName,
    };

    const saved = await updateTransactionApi(id, updated);
    this.transactions = this.transactions.map((transaction) =>
      transaction.id === id ? saved : transaction
    );
  }

  async createTransaction(
    input: Pick<
      Transaction,
      | 'note'
      | 'date'
      | 'dateRaw'
      | 'value'
      | 'currencyCode'
      | 'exchangeRate'
      | 'category'
      | 'accountName'
      | 'statement'
      | 'tripName'
    >
  ): Promise<Transaction> {
    const existingIds = new Set(this.transactions.map((transaction) => transaction.id));
    const id = generateTransactionId(existingIds);

    const mappedCategory = this.categories.find((category) => category.label === input.category);
    if (!mappedCategory) {
      throw new Error('Category not found');
    }

    let statement = '';
    if (input.statement.trim()) {
      const normalized = normalizeStatement(input.statement);
      if (!normalized) {
        throw new Error('Use Mmm-YY format, e.g. Apr-26');
      }
      statement = normalized;
    }

    const accountName = input.accountName.trim();
    const transaction: Transaction = {
      id,
      note: input.note.trim(),
      date: input.date,
      dateRaw: input.dateRaw,
      value: input.value,
      currencyCode: input.currencyCode.trim(),
      exchangeRate: input.exchangeRate,
      category: input.category.trim(),
      accountName,
      accountType: resolveAccountType(accountName, this.accounts, this.transactions),
      statement,
      tripName: input.tripName.trim(),
      transactionType: mappedCategory.transactionType,
      categoryGroup: mappedCategory.categoryGroup,
      affectCashFlow: mappedCategory.affectCashFlow,
    };

    const saved = await createTransactionApi(transaction);
    this.transactions = [saved, ...this.transactions].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );

    return saved;
  }

  async deleteTransaction(id: string) {
    const existing = this.transactions.find((transaction) => transaction.id === id);
    if (!existing) {
      throw new Error('Transaction not found');
    }

    await deleteTransactionApi(id);
    this.transactions = this.transactions.filter((transaction) => transaction.id !== id);
  }

  /**
   * Turns a configured schedule into a real transaction for the given month.
   * Nothing posts on its own — this only runs when the due list is confirmed.
   */
  async postScheduledTransaction(
    scheduled: ScheduledTransaction,
    reference: Date = new Date()
  ): Promise<Transaction> {
    const date = scheduledDueDate(scheduled, reference.getFullYear(), reference.getMonth());

    return this.createTransaction({
      note: scheduled.note,
      date,
      dateRaw: undefined,
      value: scheduled.value,
      currencyCode: scheduled.currencyCode || 'SGD',
      exchangeRate: scheduled.exchangeRate > 0 ? scheduled.exchangeRate : 1,
      category: scheduled.category,
      accountName: scheduled.accountName,
      // Left blank like every other new entry — assigned after balancing
      // against the monthly bill.
      statement: '',
      tripName: '',
    });
  }

  async persistAppSettings() {
    await persistAppSettingsFromDb();
  }
}

export const financeStore = new FinanceStore();
