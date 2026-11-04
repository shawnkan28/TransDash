import type { MonthlyBudget } from './types';

export const defaultMonthlyBudgetPlan = {
  id: 'default' as const,
  monthlySalary: 0,
};

export const defaultMonthlyBudgets: MonthlyBudget[] = [
  {
    id: 'needs',
    name: 'Needs',
    amount: 0,
    salaryPercent: 50,
    order: 0,
  },
  {
    id: 'wants',
    name: 'Wants',
    amount: 0,
    salaryPercent: 30,
    order: 1,
  },
  {
    id: 'savings',
    name: 'Savings',
    amount: 0,
    salaryPercent: 20,
    isSavings: true,
    order: 2,
  },
];
