import { describe, it, expect } from 'vitest';
import { rupeesToPaise } from '../utils/money';

describe('rupeesToPaise', () => {
  it('converts standard whole rupees to paise', () => {
    expect(rupeesToPaise('500')).toBe(50000);
    expect(rupeesToPaise(500)).toBe(50000);
    expect(rupeesToPaise('1')).toBe(100);
  });

  it('converts decimals without floating point error', () => {
    expect(rupeesToPaise('10000.50')).toBe(1000050);
    expect(rupeesToPaise('10000.5')).toBe(1000050);
    expect(rupeesToPaise(10000.5)).toBe(1000050);
    expect(rupeesToPaise('0.01')).toBe(1);
    expect(rupeesToPaise('999999.99')).toBe(99999999);
  });

  it('rejects input with more than two decimal places without rounding silently', () => {
    expect(() => rupeesToPaise('10000.505')).toThrow(
      'Invalid decimal precision: maximum 2 decimal places allowed'
    );
    expect(() => rupeesToPaise('12.3456')).toThrow(
      'Invalid decimal precision: maximum 2 decimal places allowed'
    );
    expect(() => rupeesToPaise('0.001')).toThrow(
      'Invalid decimal precision: maximum 2 decimal places allowed'
    );
  });

  it('rejects empty, negative, or non-numeric inputs', () => {
    expect(() => rupeesToPaise('')).toThrow('Amount is required');
    expect(() => rupeesToPaise('   ')).toThrow('Amount is required');
    expect(() => rupeesToPaise('-50')).toThrow('Invalid amount: must be a positive number');
    expect(() => rupeesToPaise('abc')).toThrow('Invalid amount: must be a positive number');
    expect(() => rupeesToPaise('0')).toThrow('Amount must be greater than zero');
    expect(() => rupeesToPaise('0.00')).toThrow('Amount must be greater than zero');
  });
});
