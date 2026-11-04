export const ACCOUNT_TYPES = [
  'Credit Card',
  'Savings',
  'Checking',
  'Cash',
  'Investment',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
