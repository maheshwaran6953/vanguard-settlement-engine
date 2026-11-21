/**
 * Formats an amount in integer paise (e.g. 1000000) into formatted INR rupees (₹10,000.00).
 * Never performs floating point arithmetic on string representations except dividing by 100
 * strictly at the display boundary.
 */
export function formatPaiseToInr(paise: string | number | bigint | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') {
    return '₹0.00';
  }

  const numericValue = typeof paise === 'number' ? paise : Number(paise);
  if (isNaN(numericValue)) {
    return '₹0.00';
  }

  const rupees = numericValue / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
