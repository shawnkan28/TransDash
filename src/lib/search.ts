function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesSearchPattern(text: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const pattern = new RegExp(`.*${escapeRegex(trimmed)}.*`, 'i');
  return pattern.test(text);
}

/**
 * Substring match of a search box entry against a transaction amount, tried
 * both as displayed (2dp) and as stored, so "45" finds 45.00 and 45.90.
 * Currency symbols and thousands separators in the query are ignored.
 */
export function matchesAmountSearch(
  query: string,
  displayedAmount: number,
  storedValue: number
): boolean {
  const trimmed = query.trim().toLowerCase().replace(/[$¥,\s]/g, '');
  if (!trimmed) return false;

  return (
    displayedAmount.toFixed(2).includes(trimmed) ||
    String(displayedAmount).includes(trimmed) ||
    String(storedValue).includes(trimmed)
  );
}
