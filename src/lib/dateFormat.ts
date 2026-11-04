const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * The app's display format for a full date: 05/Sep/2026.
 *
 * Built by hand rather than through Intl, which has no locale that reliably
 * yields a slash-separated abbreviated month. Display only — stored dates keep
 * their own ISO format.
 */
export function formatDayMonthYear(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}/${MONTH_ABBREVIATIONS[date.getMonth()]}/${date.getFullYear()}`;
}
