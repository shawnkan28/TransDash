export interface TransactionCSV {
  'Transaction ID': string;
  Note: string;
  Date: string;
  Value: string;
  'Currency Code': string;
  Category: string;
  'Exchange Rate': string;
  Statement: string;
  'Transaction Type': string;
  'Account Name': string;
  'Account Type': string;
  'Category Group': string;
  'Affect Cash Flow': string;
  'Trip Name': string;
}

export interface CategoryCSV {
  Label: string;
  'Transaction Type': string;
  'Category Group': string;
  'Affect Cash Flow': string;
  Notes: string;
}

export interface Transaction {
  id: string; // from Transaction ID
  date: Date;
  note: string;
  value: number;
  currencyCode: string;
  exchangeRate: number;
  category: string;
  accountName: string;
  accountType?: string;
  dateRaw?: string;
  statement: string;
  tripName: string;
  
  // Computed/Mapped fields
  transactionType: 'Expense' | 'Income' | string;
  categoryGroup: string;
  affectCashFlow: boolean;
}

export interface Category {
  label: string; // Primary Key
  transactionType: 'Expense' | 'Income' | string;
  categoryGroup: string;
  affectCashFlow: boolean;
  /** Budget id (monthly or yearly) for this category label (Settings → Category Rules). */
  monthlyBudgetId?: string;
}

export interface Account {
  name: string; // Primary Key
  accountType: string;
  /** Disabled accounts stay on existing transactions but drop out of "select an account" dropdowns. */
  disabled?: boolean;
}

export interface Statement {
  value: string; // Primary Key, e.g. Apr-26
}

export interface Budget {
  id: string; // Primary Key, `${group}-${year}`, e.g. Travel-2026
  group: string; // category group, e.g. Travel
  year: number;
  amount: number;
}

export interface MonthlyBudget {
  /** Stable identifier; never changes when the display name is edited. */
  id: string;
  /** Display label shown in Category Rules and Monthly Budget views. */
  name: string;
  /** Derived monthly limit from salary × salaryPercent. */
  amount: number;
  /** Share of monthly salary allocated to this budget (0–100). */
  salaryPercent: number;
  /** Marks this bucket as savings rather than a spending budget. */
  isSavings?: boolean;
  /**
   * Leftover in this budget absorbs other budgets' overspend before savings
   * does (see applyOverspendSpillover). Ignored on savings budgets.
   */
  coversOverspend?: boolean;
  /** Lower values sort first in Monthly Budget lists. */
  order?: number;
}

export interface MonthlyBudgetPlan {
  id: 'default';
  monthlySalary: number;
}

export interface YearlyBudget {
  /** Stable identifier; never changes when the display name is edited. */
  id: string;
  name: string;
  /** Derived yearly limit from available pool × poolPercent. */
  amount: number;
  /** Share of the yearly pool (after monthly × 12) allocated to this budget (0–100). */
  poolPercent: number;
}

/** A mobile quick-add shortcut button that pre-fills the Add Transaction sheet. */
export interface QuickAddPreset {
  /** Stable identifier; never changes when the label is edited. */
  id: string;
  /** Button label shown on mobile. */
  label: string;
  /** Default note filled into the Add Transaction sheet. */
  note: string;
  /** Default category filled into the Add Transaction sheet. */
  category: string;
  /** Default amount filled into the Add Transaction sheet; unset leaves it blank. */
  amount?: number;
  /** Default account filled into the Add Transaction sheet; unset uses the usual default. */
  accountName?: string;
  /** Lower values sort first. */
  order?: number;
}

/** A recurring monthly bill/transfer that is proposed for posting once its day arrives. */
export interface ScheduledTransaction {
  /** Stable identifier; never changes when the label is edited. */
  id: string;
  /** Name shown in Settings and in the mobile "Due this month" card. */
  label: string;
  /** Note written onto the created transaction. Also half of the already-posted key. */
  note: string;
  /** Day of the month it falls due (1-31, clamped to the month's last day). */
  dayOfMonth: number;
  /** Amount, as a positive magnitude — direction comes from the category, as everywhere else. */
  value: number;
  currencyCode: string;
  exchangeRate: number;
  category: string;
  accountName: string;
  /** Paused schedules stay configured but stop being proposed. */
  disabled?: boolean;
  /** Lower values sort first. */
  order?: number;
}
