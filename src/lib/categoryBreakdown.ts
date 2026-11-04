import type { Transaction } from './types';
import { transactionValueInSGD } from './currency';

export interface CategoryBreakdownSlice {
  label: string;
  value: number;
  groups: string[];
}

export function getCategoryBreakdown(
  transactions: Transaction[],
  year: string | null
): CategoryBreakdownSlice[] {
  const expenses = transactions.filter(
    (t) =>
      t.transactionType === 'Expense' &&
      t.affectCashFlow &&
      t.categoryGroup &&
      (year === null || `${t.date.getFullYear()}` === year)
  );

  const groups = new Map<string, number>();
  expenses.forEach((t) => {
    groups.set(t.categoryGroup, (groups.get(t.categoryGroup) || 0) + transactionValueInSGD(t));
  });

  const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);

  const slices: CategoryBreakdownSlice[] = top.map(([label, value]) => ({
    label,
    value,
    groups: [label],
  }));

  if (rest.length > 0) {
    slices.push({
      label: 'Others',
      value: rest.reduce((sum, [, value]) => sum + value, 0),
      groups: rest.map(([label]) => label),
    });
  }

  return slices;
}
