import type { Transaction } from './types';
import { transactionValueInSGD } from './currency';

export function isCurrentCalendarYear(targetYear: string) {
  return Number(targetYear) === new Date().getFullYear();
}

export function predictFutureValue(
  ytdAverage: number,
  previousYearValue: number,
  hasPreviousYear: boolean
) {
  if (!hasPreviousYear) return ytdAverage;
  if (ytdAverage === 0) return previousYearValue;
  return (ytdAverage + previousYearValue) / 2;
}

export function scheduledTravelShare(
  transactions: Transaction[],
  targetYear: string,
  spreadTravel: boolean
) {
  if (!spreadTravel) return 0;

  const now = new Date();
  const isCurrentYear = isCurrentCalendarYear(targetYear);
  const lastBookedMonth = isCurrentYear ? now.getMonth() : 11;

  let share = 0;
  transactions
    .filter(
      (t) =>
        t.affectCashFlow &&
        t.transactionType === 'Expense' &&
        t.categoryGroup === 'Travel' &&
        `${t.date.getFullYear()}` === targetYear &&
        t.date.getMonth() <= lastBookedMonth
    )
    .forEach((t) => {
      share += transactionValueInSGD(t) / 12;
    });

  return share;
}

export function predictFutureExpense(
  ytdAverage: number,
  previousYearValue: number,
  hasPreviousYear: boolean,
  targetYear: string,
  spreadTravel: boolean,
  transactions: Transaction[]
) {
  const baseline = predictFutureValue(ytdAverage, previousYearValue, hasPreviousYear);
  return baseline + scheduledTravelShare(transactions, targetYear, spreadTravel);
}

export function computeMonthlyCashFlow(
  transactions: Transaction[],
  targetYear: string,
  spreadTravel: boolean
) {
  const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  const now = new Date();
  const isCurrentYear = isCurrentCalendarYear(targetYear);
  const lastActualMonth = isCurrentYear ? now.getMonth() : null;
  const spreadThroughMonth = lastActualMonth ?? 11;

  transactions
    .filter((t) => {
      if (!t.affectCashFlow || `${t.date.getFullYear()}` !== targetYear) return false;
      if (lastActualMonth !== null && t.date.getMonth() > lastActualMonth) return false;
      return true;
    })
    .forEach((t) => {
      const sgdValue = transactionValueInSGD(t);

      if (t.transactionType === 'Income') {
        monthly[t.date.getMonth()].income += sgdValue;
      }

      if (t.transactionType === 'Expense') {
        if (spreadTravel && t.categoryGroup === 'Travel') {
          const share = sgdValue / 12;
          for (let m = 0; m <= spreadThroughMonth; m++) monthly[m].expense += share;
        } else {
          monthly[t.date.getMonth()].expense += sgdValue;
        }
      }
    });

  return {
    income: monthly.map((m) => m.income),
    expense: monthly.map((m) => m.expense),
  };
}

export function computeMonthlySalary(transactions: Transaction[], targetYear: string) {
  const monthly = Array(12).fill(0);
  const now = new Date();
  const isCurrentYear = isCurrentCalendarYear(targetYear);
  const lastActualMonth = isCurrentYear ? now.getMonth() : null;

  transactions
    .filter((t) => {
      if (!t.affectCashFlow || t.transactionType !== 'Income' || t.category !== 'Salary') {
        return false;
      }
      if (`${t.date.getFullYear()}` !== targetYear) return false;
      if (lastActualMonth !== null && t.date.getMonth() > lastActualMonth) return false;
      return true;
    })
    .forEach((t) => {
      monthly[t.date.getMonth()] += transactionValueInSGD(t);
    });

  return monthly;
}

export function computeMonthlySpendingHabits(
  transactions: Transaction[],
  targetYear: string,
  spreadTravel: boolean
) {
  const monthly = Array(12).fill(0);
  const now = new Date();
  const isCurrentYear = isCurrentCalendarYear(targetYear);
  const lastActualMonth = isCurrentYear ? now.getMonth() : null;
  const spreadThroughMonth = lastActualMonth ?? 11;

  transactions
    .filter((t) => {
      if (!t.affectCashFlow || t.transactionType !== 'Expense' || t.categoryGroup === 'Bills') {
        return false;
      }
      if (`${t.date.getFullYear()}` !== targetYear) return false;
      if (lastActualMonth !== null && t.date.getMonth() > lastActualMonth) return false;
      return true;
    })
    .forEach((t) => {
      const sgdValue = transactionValueInSGD(t);

      if (spreadTravel && t.categoryGroup === 'Travel') {
        const share = sgdValue / 12;
        for (let m = 0; m <= spreadThroughMonth; m++) monthly[m] += share;
      } else {
        monthly[t.date.getMonth()] += sgdValue;
      }
    });

  return monthly;
}

export function projectYearEndIncome(
  monthlyIncome: number[],
  targetYear: string,
  previousYearIncome: number[]
) {
  const now = new Date();
  const currentMonth = now.getMonth();

  if (!isCurrentCalendarYear(targetYear) || currentMonth >= 11) return null;

  const monthsElapsed = currentMonth + 1;
  const avgIncome =
    monthlyIncome.slice(0, monthsElapsed).reduce((sum, value) => sum + value, 0) / monthsElapsed;
  const hasPreviousYearIncome = previousYearIncome.some((value) => value > 0);

  let total = 0;
  for (let i = 0; i < 12; i++) {
    if (i <= currentMonth) {
      total += monthlyIncome[i];
    } else {
      total += predictFutureValue(avgIncome, previousYearIncome[i], hasPreviousYearIncome);
    }
  }

  return total;
}

export function projectYearEndSpendingHabits(
  monthlySpending: number[],
  targetYear: string,
  previousYearSpending: number[],
  spreadTravel: boolean,
  transactions: Transaction[]
) {
  const now = new Date();
  const currentMonth = now.getMonth();

  if (!isCurrentCalendarYear(targetYear) || currentMonth >= 11) return null;

  const monthsElapsed = currentMonth + 1;
  const avgSpending =
    monthlySpending.slice(0, monthsElapsed).reduce((sum, value) => sum + value, 0) / monthsElapsed;
  const hasPreviousYearSpending = previousYearSpending.some((value) => value > 0);

  let total = 0;
  for (let i = 0; i < 12; i++) {
    if (i <= currentMonth) {
      total += monthlySpending[i];
    } else {
      total += predictFutureExpense(
        avgSpending,
        previousYearSpending[i],
        hasPreviousYearSpending,
        targetYear,
        spreadTravel,
        transactions
      );
    }
  }

  return total;
}

export function buildCashFlowForecast(
  transactions: Transaction[],
  targetYear: string,
  spreadTravel: boolean
) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const isCurrentYear = isCurrentCalendarYear(targetYear);
  const hasFutureMonths = currentMonth < 11;
  const nullSeries = Array<number | null>(12).fill(null);

  if (!isCurrentYear || !hasFutureMonths) {
    const totals = computeMonthlyCashFlow(transactions, targetYear, spreadTravel);
    return {
      showForecast: false,
      currentMonth,
      incomeActual: totals.income,
      expenseActual: totals.expense,
      incomeForecast: nullSeries,
      expenseForecast: nullSeries,
    };
  }

  const actualTotals = computeMonthlyCashFlow(transactions, targetYear, spreadTravel);
  const { income, expense } = actualTotals;

  const monthsElapsed = currentMonth + 1;
  const avgIncome =
    income.slice(0, monthsElapsed).reduce((sum, value) => sum + value, 0) / monthsElapsed;
  const avgExpense =
    expense.slice(0, monthsElapsed).reduce((sum, value) => sum + value, 0) / monthsElapsed;

  const previousYear = `${Number(targetYear) - 1}`;
  const previousYearTotals = computeMonthlyCashFlow(transactions, previousYear, spreadTravel);
  const hasPreviousYearIncome = previousYearTotals.income.some((value) => value > 0);
  const hasPreviousYearExpense = previousYearTotals.expense.some((value) => value > 0);

  const incomeActual = income.map((value, index) => (index > currentMonth ? null : value));
  const expenseActual = expense.map((value, index) => (index > currentMonth ? null : value));

  const incomeForecast = nullSeries.map((_, index) => {
    if (index < currentMonth) return null;
    if (index === currentMonth) return income[currentMonth];
    return predictFutureValue(avgIncome, previousYearTotals.income[index], hasPreviousYearIncome);
  });

  const expenseForecast = nullSeries.map((_, index) => {
    if (index < currentMonth) return null;
    if (index === currentMonth) return expense[currentMonth];
    return predictFutureExpense(
      avgExpense,
      previousYearTotals.expense[index],
      hasPreviousYearExpense,
      targetYear,
      spreadTravel,
      transactions
    );
  });

  return {
    showForecast: true,
    currentMonth,
    incomeActual,
    expenseActual,
    incomeForecast,
    expenseForecast,
  };
}

export function predictCurrentYearSpendingHabitsRatio(
  transactions: Transaction[],
  spreadTravel: boolean
) {
  const currentYear = `${new Date().getFullYear()}`;
  const previousYear = `${Number(currentYear) - 1}`;

  const salaryMonthly = computeMonthlySalary(transactions, currentYear);
  const spendingMonthly = computeMonthlySpendingHabits(transactions, currentYear, spreadTravel);
  const previousSalaryMonthly = computeMonthlySalary(transactions, previousYear);
  const previousSpendingMonthly = computeMonthlySpendingHabits(
    transactions,
    previousYear,
    spreadTravel
  );

  const projectedSalary = projectYearEndIncome(salaryMonthly, currentYear, previousSalaryMonthly);
  const projectedSpending = projectYearEndSpendingHabits(
    spendingMonthly,
    currentYear,
    previousSpendingMonthly,
    spreadTravel,
    transactions
  );

  if (projectedSalary === null || projectedSpending === null) return null;

  if (projectedSalary <= 0) return projectedSpending > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (projectedSpending / projectedSalary) * 100));
}
