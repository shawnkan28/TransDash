/**
 * Category-group and budget-row constants shared across the Budget tabs.
 * These were duplicated as local consts inside Budget.svelte, and 'Travel'
 * existed a second time in monthlyBudget.ts.
 */

/** Category group whose spend is tracked against the travel budget. */
export const TRAVEL_GROUP = 'Travel';

/** Category group backing the daily spending budget. */
export const DAILY_GROUP = 'Daily';

/** The daily budget is a single global row, not per-year; 0 is its sentinel year. */
export const DAILY_BUDGET_YEAR = 0;

/** Bucket for travel spend with no trip name set. */
export const UNASSIGNED_TRIP = 'Unassigned';
