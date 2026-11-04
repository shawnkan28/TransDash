import type { Category, MonthlyBudget, Transaction, YearlyBudget } from './types';
import { transactionValueInSGD } from './currency';

import { TRAVEL_GROUP } from './budgetGroups';

/** Kept under its original name for the components that already import it. */
export { TRAVEL_GROUP as MONTHLY_BUDGET_TRAVEL_GROUP } from './budgetGroups';

// crypto.randomUUID() requires a secure context (HTTPS or localhost) and is
// undefined over plain http://<lan-hostname>, so generate the random part
// with crypto.getRandomValues() instead, which works everywhere.
function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Category label -> budget id, for the budget accumulators. Was built inline
 * and identically in the monthly tab, the yearly tab and the mobile summary.
 */
export function categoryBudgetIdMap(categories: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  categories.forEach((category) => {
    if (category.monthlyBudgetId) {
      map.set(category.label, category.monthlyBudgetId);
    }
  });
  return map;
}

export function generateMonthlyBudgetId(): string {
  return `budget-${randomHex(16)}`;
}

export function generateYearlyBudgetId(): string {
  return `yearly-budget-${randomHex(16)}`;
}

export function computeYearlySalary(monthlySalary: number): number {
  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) return 0;
  return Math.round(monthlySalary * 12 * 100) / 100;
}

export function computeMonthlyBudgetsAnnualTotal(monthlyBudgets: MonthlyBudget[]): number {
  const monthlyTotal = monthlyBudgets.reduce((sum, budget) => sum + (budget.amount || 0), 0);
  return Math.round(monthlyTotal * 12 * 100) / 100;
}

export function computeYearlyBudgetPool(
  monthlySalary: number,
  monthlyBudgets: MonthlyBudget[]
): number {
  return Math.round(
    (computeYearlySalary(monthlySalary) - computeMonthlyBudgetsAnnualTotal(monthlyBudgets)) * 100
  ) / 100;
}

export function computeYearlyBudgetAmountFromPool(
  yearlyPool: number,
  poolPercent: number
): number {
  if (!Number.isFinite(yearlyPool) || !Number.isFinite(poolPercent)) return 0;
  if (yearlyPool <= 0 || poolPercent <= 0) return 0;
  return Math.round(((yearlyPool * poolPercent) / 100) * 100) / 100;
}

export function normalizeYearlyBudgets(
  budgets: YearlyBudget[],
  yearlyPool: number
): YearlyBudget[] {
  return budgets.map((budget) => {
    let poolPercent = budget.poolPercent;
    if (poolPercent == null) {
      poolPercent =
        yearlyPool > 0 && budget.amount > 0
          ? Math.round((budget.amount / yearlyPool) * 10000) / 100
          : 0;
    }
    return {
      ...budget,
      poolPercent,
      amount: computeYearlyBudgetAmountFromPool(yearlyPool, poolPercent),
    };
  });
}

export function computeBudgetAmountFromSalary(
  monthlySalary: number,
  salaryPercent: number
): number {
  if (!Number.isFinite(monthlySalary) || !Number.isFinite(salaryPercent)) return 0;
  if (monthlySalary <= 0 || salaryPercent <= 0) return 0;
  return Math.round(((monthlySalary * salaryPercent) / 100) * 100) / 100;
}

export function normalizeMonthlyBudgets(
  budgets: MonthlyBudget[],
  monthlySalary: number
): MonthlyBudget[] {
  return budgets
    .map((budget) => {
      let salaryPercent = budget.salaryPercent;
      if (salaryPercent == null) {
        salaryPercent =
          monthlySalary > 0 && budget.amount > 0
            ? Math.round((budget.amount / monthlySalary) * 10000) / 100
            : 0;
      }
      return {
        ...budget,
        salaryPercent,
        amount: computeBudgetAmountFromSalary(monthlySalary, salaryPercent),
      };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** One-time backfill for categories saved before per-label monthly budgets. */
const LEGACY_GROUP_TO_BUDGET: Record<string, string> = {
  Bills: 'needs',
  General: 'needs',
  Personal: 'needs',
  Shopping: 'wants',
  Games: 'wants',
  Hobby: 'wants',
};

export function inferMonthlyBudgetIdFromGroup(categoryGroup: string): string {
  return LEGACY_GROUP_TO_BUDGET[categoryGroup] ?? '';
}

export type BudgetOptionKind = 'monthly' | 'yearly';

export interface BudgetOption {
  id: string;
  name: string;
  kind: BudgetOptionKind;
}

/** Map a stored ref to a budget id (handles legacy name-based values). */
export function resolveBudgetIdRef(
  ref: string,
  monthlyBudgets: MonthlyBudget[],
  yearlyBudgets: YearlyBudget[] = []
): string {
  if (!ref) return '';
  if (monthlyBudgets.some((budget) => budget.id === ref)) return ref;
  if (yearlyBudgets.some((budget) => budget.id === ref)) return ref;

  const monthlyByName = monthlyBudgets.find(
    (budget) => budget.name.toLowerCase() === ref.toLowerCase()
  );
  if (monthlyByName) return monthlyByName.id;

  const yearlyByName = yearlyBudgets.find(
    (budget) => budget.name.toLowerCase() === ref.toLowerCase()
  );
  if (yearlyByName) return yearlyByName.id;

  return ref;
}

export function buildBudgetOptions(
  monthlyBudgets: MonthlyBudget[],
  yearlyBudgets: YearlyBudget[] = []
): { monthly: BudgetOption[]; yearly: BudgetOption[]; all: BudgetOption[] } {
  const monthly = [...monthlyBudgets]
    .map((budget) => ({ id: budget.id, name: budget.name, kind: 'monthly' as const }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const yearly = [...yearlyBudgets]
    .map((budget) => ({ id: budget.id, name: budget.name, kind: 'yearly' as const }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { monthly, yearly, all: [...monthly, ...yearly] };
}

export function budgetNameById(
  id: string,
  monthlyBudgets: MonthlyBudget[],
  yearlyBudgets: YearlyBudget[] = []
): string {
  return (
    monthlyBudgets.find((budget) => budget.id === id)?.name ??
    yearlyBudgets.find((budget) => budget.id === id)?.name ??
    id
  );
}

export function normalizeCategoryMonthlyBudgets(
  categories: Category[],
  monthlyBudgets: MonthlyBudget[] = [],
  yearlyBudgets: YearlyBudget[] = []
): Category[] {
  return categories.map((category) => {
    if (category.monthlyBudgetId != null && category.monthlyBudgetId !== '') {
      return {
        ...category,
        monthlyBudgetId: resolveBudgetIdRef(
          category.monthlyBudgetId,
          monthlyBudgets,
          yearlyBudgets
        ),
      };
    }

    if (category.monthlyBudgetId === '') {
      return category;
    }

    return {
      ...category,
      monthlyBudgetId: inferMonthlyBudgetIdFromGroup(category.categoryGroup),
    };
  });
}

export function categoriesByMonthlyBudgetId(
  categories: Category[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  categories.forEach((category) => {
    if (!category.monthlyBudgetId) return;
    const list = map.get(category.monthlyBudgetId) ?? [];
    list.push(category.label);
    map.set(category.monthlyBudgetId, list);
  });
  return map;
}

/** Net cash-flow impact for a budget: expenses add, income subtracts. */
export function monthlyBudgetNetDelta(
  transaction: Transaction,
  categoryBudgetMap: Map<string, string>,
  options: {
    budgetId?: string;
    year?: number;
    month?: number;
    excludeTravel?: boolean;
  } = {}
): number {
  const { budgetId, year, month, excludeTravel = true } = options;

  if (!transaction.affectCashFlow) return 0;
  if (excludeTravel && transaction.categoryGroup === TRAVEL_GROUP) return 0;
  if (Number.isNaN(transaction.date.getTime())) return 0;
  if (year !== undefined && transaction.date.getFullYear() !== year) return 0;
  if (month !== undefined && transaction.date.getMonth() !== month) return 0;

  const mappedBudgetId = categoryBudgetMap.get(transaction.category);
  if (!mappedBudgetId) return 0;
  if (budgetId !== undefined && mappedBudgetId !== budgetId) return 0;

  const amount = transactionValueInSGD(transaction);
  if (transaction.transactionType === 'Expense') return amount;
  if (transaction.transactionType === 'Income') return -amount;
  return 0;
}

export function accumulateMonthlyBudgetNet(
  totals: Map<string, number>,
  transactions: Transaction[],
  categoryBudgetMap: Map<string, string>,
  filter: { year?: number; month?: number; excludeTravel?: boolean } = {}
): void {
  transactions.forEach((transaction) => {
    const budgetId = categoryBudgetMap.get(transaction.category);
    if (!budgetId || !totals.has(budgetId)) return;

    const delta = monthlyBudgetNetDelta(transaction, categoryBudgetMap, {
      ...filter,
      budgetId,
    });
    if (delta !== 0) {
      totals.set(budgetId, (totals.get(budgetId) ?? 0) + delta);
    }
  });
}

export type BudgetBarStatus = 'healthy' | 'warning' | 'critical';

export interface BudgetBarState {
  /** Bar width, 0-100. */
  percent: number;
  status: BudgetBarStatus;
}

/**
 * Spending budgets fill their bar up as they are spent. Savings budgets do the
 * opposite: the bar starts full and drains as the pool is consumed (including
 * overspend drawn from other budgets), turning amber once a quarter of it is
 * gone and red once half of it is.
 */
export function monthlyBudgetBarState(
  budget: { amount: number; isSavings?: boolean },
  spent: number
): BudgetBarState {
  const limit = budget.amount;
  if (limit <= 0) return { percent: 0, status: 'healthy' };

  if (budget.isSavings) {
    const remaining = Math.max(0, Math.min(100, Math.round(((limit - spent) / limit) * 100)));
    const status: BudgetBarStatus =
      remaining <= 50 ? 'critical' : remaining <= 75 ? 'warning' : 'healthy';
    return { percent: remaining, status };
  }

  const percent = Math.min(100, Math.round((Math.max(spent, 0) / limit) * 100));
  return { percent, status: spent > limit ? 'critical' : 'healthy' };
}

/**
 * Overspending on a budget has to come from somewhere instead of just
 * vanishing. Takes each budget's own net spend and returns an adjusted map:
 *
 * 1. The total overage across all non-savings budgets is drawn first from the
 *    leftover of budgets marked `coversOverspend`, split by how much each has
 *    left so they all reach zero together.
 * 2. Only what they cannot cover is drawn from the savings budget(s), split by
 *    their share of total savings allocation.
 *
 * A budget that ran over keeps its own figure; the overage shows up as extra
 * spend on whichever budgets absorbed it.
 */
export function applyOverspendSpillover(
  monthlyBudgets: MonthlyBudget[],
  ownNetByBudgetId: Map<string, number>
): Map<string, number> {
  const result = new Map(ownNetByBudgetId);
  const ownSpent = (budget: MonthlyBudget) => ownNetByBudgetId.get(budget.id) ?? 0;
  const spendingBudgets = monthlyBudgets.filter((budget) => !budget.isSavings);

  const totalOverage = spendingBudgets.reduce(
    (sum, budget) => sum + Math.max(0, ownSpent(budget) - budget.amount),
    0
  );
  if (totalOverage <= 0) return result;

  const covering = spendingBudgets
    .filter((budget) => budget.coversOverspend)
    .map((budget) => ({ budget, room: Math.max(0, budget.amount - ownSpent(budget)) }))
    .filter(({ room }) => room > 0);
  const totalRoom = covering.reduce((sum, { room }) => sum + room, 0);
  const covered = Math.min(totalOverage, totalRoom);

  covering.forEach(({ budget, room }) => {
    // Exhausted budgets land exactly on their limit, so float error can't
    // show a "-$0.00 left".
    const absorbed = covered === totalRoom ? room : covered * (room / totalRoom);
    result.set(budget.id, covered === totalRoom ? budget.amount : ownSpent(budget) + absorbed);
  });

  const toSavings = totalOverage - covered;
  const savingsBudgets = monthlyBudgets.filter((budget) => budget.isSavings);
  if (toSavings <= 0 || savingsBudgets.length === 0) return result;

  const totalSavingsLimit = savingsBudgets.reduce(
    (sum, budget) => sum + Math.max(0, budget.amount),
    0
  );

  savingsBudgets.forEach((budget) => {
    const share =
      totalSavingsLimit > 0
        ? Math.max(0, budget.amount) / totalSavingsLimit
        : 1 / savingsBudgets.length;
    result.set(budget.id, ownSpent(budget) + toSavings * share);
  });

  return result;
}

export function buildBudgetCategorySeries(
  transactions: Transaction[],
  categoryBudgetMap: Map<string, string>,
  budgetId: string,
  year: number,
  month?: number
): { labels: string[]; expenses: number[]; income: number[] } {
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (!transaction.affectCashFlow) return;
    if (Number.isNaN(transaction.date.getTime())) return;
    if (transaction.date.getFullYear() !== year) return;
    if (month !== undefined && transaction.date.getMonth() !== month) return;
    if (transaction.transactionType !== 'Expense' && transaction.transactionType !== 'Income') {
      return;
    }

    const mappedBudgetId = categoryBudgetMap.get(transaction.category);
    if (mappedBudgetId !== budgetId) return;

    const amount = Math.round(transactionValueInSGD(transaction) * 100) / 100;
    if (transaction.transactionType === 'Expense') {
      expenseByCategory.set(
        transaction.category,
        (expenseByCategory.get(transaction.category) ?? 0) + amount
      );
    } else {
      incomeByCategory.set(
        transaction.category,
        (incomeByCategory.get(transaction.category) ?? 0) + amount
      );
    }
  });

  const categories = new Set([...expenseByCategory.keys(), ...incomeByCategory.keys()]);
  const labels = Array.from(categories).sort((a, b) => {
    const totalA = (expenseByCategory.get(a) ?? 0) + (incomeByCategory.get(a) ?? 0);
    const totalB = (expenseByCategory.get(b) ?? 0) + (incomeByCategory.get(b) ?? 0);
    return totalB - totalA || a.localeCompare(b);
  });

  return {
    labels,
    expenses: labels.map((category) => expenseByCategory.get(category) ?? 0),
    income: labels.map((category) => incomeByCategory.get(category) ?? 0),
  };
}
