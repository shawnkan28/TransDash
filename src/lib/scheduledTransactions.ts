import type { ScheduledTransaction, Transaction } from './types';

// crypto.randomUUID() needs a secure context and is undefined over
// http://<lan-hostname>, so build ids from getRandomValues() instead.
function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateScheduledTransactionId(): string {
  return `scheduled-${randomHex(16)}`;
}

export function sortScheduledTransactions(
  items: ScheduledTransaction[]
): ScheduledTransaction[] {
  return [...items].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.dayOfMonth - b.dayOfMonth
  );
}

/**
 * The date this schedule falls due in a given month, clamped to the last day
 * so a "31st" schedule still lands on Feb 28/29 rather than spilling into March.
 */
export function scheduledDueDate(
  scheduled: Pick<ScheduledTransaction, 'dayOfMonth'>,
  year: number,
  month: number
): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const requested = Math.round(scheduled.dayOfMonth);
  const day = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), lastDay);
  return new Date(year, month, day);
}

function identityKey(note: string, category: string): string {
  return `${note.trim().toLowerCase()}||${category.trim().toLowerCase()}`;
}

/**
 * A transaction carries no "posted by schedule X" marker, so identity has to
 * come from the row itself: same note, same category, same month. That also
 * means paying a bill by hand counts as posted, which is what you want — the
 * point is not to be asked twice for one bill.
 */
export function findPostedTransaction(
  scheduled: ScheduledTransaction,
  transactions: Transaction[],
  year: number,
  month: number
): Transaction | undefined {
  const key = identityKey(scheduled.note, scheduled.category);
  return transactions.find((transaction) => {
    if (Number.isNaN(transaction.date.getTime())) return false;
    if (transaction.date.getFullYear() !== year) return false;
    if (transaction.date.getMonth() !== month) return false;
    return identityKey(transaction.note, transaction.category) === key;
  });
}

export interface ScheduledStatus {
  scheduled: ScheduledTransaction;
  /** When it falls due in the reference month. */
  dueDate: Date;
  /** The transaction that already covers it this month, if any. */
  posted: Transaction | undefined;
  /** Due date reached and nothing posted yet — this is what gets proposed. */
  due: boolean;
}

export function scheduledStatuses(
  scheduledTransactions: ScheduledTransaction[],
  transactions: Transaction[],
  reference: Date = new Date()
): ScheduledStatus[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const today = new Date(year, month, reference.getDate());

  return sortScheduledTransactions(scheduledTransactions)
    .filter((scheduled) => !scheduled.disabled)
    .map((scheduled) => {
      const dueDate = scheduledDueDate(scheduled, year, month);
      const posted = findPostedTransaction(scheduled, transactions, year, month);
      return { scheduled, dueDate, posted, due: !posted && dueDate <= today };
    });
}
