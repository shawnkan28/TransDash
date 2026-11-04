import { db } from './db';
import type {
  Account,
  Budget,
  Category,
  MonthlyBudget,
  QuickAddPreset,
  ScheduledTransaction,
  Statement,
  YearlyBudget,
} from './types';

export const APP_SETTINGS_VERSION = 1 as const;

export interface AppSettingsFile {
  version: typeof APP_SETTINGS_VERSION;
  monthlySalary: number;
  monthlyBudgets: MonthlyBudget[];
  yearlyBudgets: YearlyBudget[];
  categories: Category[];
  accounts: Account[];
  statements: Statement[];
  budgets: Budget[];
  quickAddPresets: QuickAddPreset[];
  scheduledTransactions: ScheduledTransaction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAppSettings(data: unknown): AppSettingsFile | null {
  if (!isRecord(data) || data.version !== APP_SETTINGS_VERSION) return null;

  const {
    monthlySalary,
    monthlyBudgets,
    yearlyBudgets,
    categories,
    accounts,
    statements,
    budgets,
    // Added after the initial settings format; older payloads won't have them.
    quickAddPresets,
    scheduledTransactions,
  } = data;

  if (
    typeof monthlySalary !== 'number' ||
    !Array.isArray(monthlyBudgets) ||
    !Array.isArray(yearlyBudgets) ||
    !Array.isArray(categories) ||
    !Array.isArray(accounts) ||
    !Array.isArray(statements) ||
    !Array.isArray(budgets)
  ) {
    return null;
  }

  return {
    version: APP_SETTINGS_VERSION,
    monthlySalary,
    monthlyBudgets: monthlyBudgets as MonthlyBudget[],
    yearlyBudgets: yearlyBudgets as YearlyBudget[],
    categories: categories as Category[],
    accounts: accounts as Account[],
    statements: statements as Statement[],
    quickAddPresets: Array.isArray(quickAddPresets) ? (quickAddPresets as QuickAddPreset[]) : [],
    scheduledTransactions: Array.isArray(scheduledTransactions)
      ? (scheduledTransactions as ScheduledTransaction[])
      : [],
    budgets: budgets as Budget[],
  };
}

export async function loadAppSettings(): Promise<AppSettingsFile | null> {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) return null;
    return parseAppSettings(await response.json());
  } catch {
    return null;
  }
}

export async function saveAppSettings(settings: AppSettingsFile): Promise<void> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error('Failed to save settings');
  }
}

export async function collectAppSettingsFromDb(): Promise<AppSettingsFile> {
  const plan = await db.monthlyBudgetPlan.get('default');

  return {
    version: APP_SETTINGS_VERSION,
    monthlySalary: plan?.monthlySalary ?? 0,
    monthlyBudgets: await db.monthlyBudgets.toArray(),
    yearlyBudgets: await db.yearlyBudgets.toArray(),
    categories: await db.categories.toArray(),
    accounts: await db.accounts.toArray(),
    statements: await db.statements.toArray(),
    budgets: await db.budgets.toArray(),
    quickAddPresets: await db.quickAddPresets.toArray(),
    scheduledTransactions: await db.scheduledTransactions.toArray(),
  };
}

export async function applyAppSettingsToDb(settings: AppSettingsFile): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.categories,
      db.accounts,
      db.statements,
      db.monthlyBudgets,
      db.monthlyBudgetPlan,
      db.yearlyBudgets,
      db.budgets,
      db.quickAddPresets,
      db.scheduledTransactions,
    ],
    async () => {
      await db.categories.clear();
      if (settings.categories.length > 0) {
        await db.categories.bulkPut(settings.categories);
      }

      await db.accounts.clear();
      if (settings.accounts.length > 0) {
        await db.accounts.bulkPut(settings.accounts);
      }

      await db.statements.clear();
      if (settings.statements.length > 0) {
        await db.statements.bulkPut(settings.statements);
      }

      await db.monthlyBudgets.clear();
      if (settings.monthlyBudgets.length > 0) {
        await db.monthlyBudgets.bulkPut(settings.monthlyBudgets);
      }

      await db.monthlyBudgetPlan.put({
        id: 'default',
        monthlySalary: settings.monthlySalary,
      });

      await db.yearlyBudgets.clear();
      if (settings.yearlyBudgets.length > 0) {
        await db.yearlyBudgets.bulkPut(settings.yearlyBudgets);
      }

      await db.budgets.clear();
      if (settings.budgets.length > 0) {
        await db.budgets.bulkPut(settings.budgets);
      }

      // Cleared unconditionally, like every other table above. The server is
      // the source of truth now, so an empty list means "there are none" —
      // skipping the clear on empty used to make deleting the last quick-add
      // button or schedule silently undo itself on the next load.
      await db.quickAddPresets.clear();
      if (settings.quickAddPresets.length > 0) {
        await db.quickAddPresets.bulkPut(settings.quickAddPresets);
      }

      await db.scheduledTransactions.clear();
      if (settings.scheduledTransactions.length > 0) {
        await db.scheduledTransactions.bulkPut(settings.scheduledTransactions);
      }
    }
  );
}

export async function persistAppSettingsFromDb(): Promise<void> {
  const settings = await collectAppSettingsFromDb();
  await saveAppSettings(settings);
}
