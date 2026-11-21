/**
 * Converts a rupee amount (string or number) into integer paise (cents).
 * Rejects any amount with more than 2 decimal places (never silently rounds).
 * Eliminates floating point drift by using string splitting and BigInt arithmetic.
 */
export function rupeesToPaise(input: string | number): number {
  if (input === null || input === undefined || input === '') {
    throw new Error('Amount is required');
  }

  const str = typeof input === 'number' ? input.toString() : input.trim();
  if (!str) {
    throw new Error('Amount is required');
  }

  // Regex check for positive decimal / integer number
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error('Invalid amount: must be a positive number');
  }

  const [wholeStr, fractionStr] = str.split('.');

  if (fractionStr && fractionStr.length > 2) {
    throw new Error('Invalid decimal precision: maximum 2 decimal places allowed');
  }

  const whole = BigInt(wholeStr);
  const fraction = fractionStr ? BigInt(fractionStr.padEnd(2, '0')) : 0n;

  const totalPaise = whole * 100n + fraction;

  if (totalPaise <= 0n) {
    throw new Error('Amount must be greater than zero');
  }

  if (totalPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount exceeds maximum allowed limit');
  }

  return Number(totalPaise);
}
