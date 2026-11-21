import { describe, it, expect } from 'vitest';
import { formatPaiseToInr } from '../utils/currency';

describe('Currency Formatter (Paise to INR)', () => {
  it('formats positive integer paise amounts to INR with commas and 2 decimals', () => {
    // 10,000 INR = 1,000,000 paise
    const result1 = formatPaiseToInr(1000000);
    expect(result1).toContain('10,000.00');

    // 6,000 INR = 600,000 paise
    const result2 = formatPaiseToInr(600000);
    expect(result2).toContain('6,000.00');

    // Small amount: 50 paise = 0.50 INR
    const result3 = formatPaiseToInr(50);
    expect(result3).toContain('0.50');
  });

  it('formats string amounts from PostgreSQL BIGINT correctly', () => {
    const stringPaise = '1000000';
    const formatted = formatPaiseToInr(stringPaise);
    expect(formatted).toContain('10,000.00');

    const bigString = '50000000'; // 500,000 INR
    expect(formatPaiseToInr(bigString)).toContain('5,00,000.00');
  });

  it('safely handles zero, null, undefined and invalid amounts', () => {
    expect(formatPaiseToInr(0)).toContain('0.00');
    expect(formatPaiseToInr('0')).toContain('0.00');
    expect(formatPaiseToInr(null)).toContain('0.00');
    expect(formatPaiseToInr(undefined)).toContain('0.00');
    expect(formatPaiseToInr('invalid_num')).toContain('0.00');
  });
});
