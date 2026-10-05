import { describe, expect, it } from 'vitest';
import { varianceValue } from '../src/domain/money';

// Spec §4.7: Variance (thousandths) × cost (cents), rounded to cents half away from zero.
describe('varianceValue', () => {
  it.each([
    ['3 × $1.10 = $3.30, not 3.3000000000000003', 3_000, 110, 330],
    ['2.5 × $1.07 = 2.675 → $2.68, not 2.67', 2_500, 107, 268],
    ['−2.5 × $1.07 = −2.675 → −$2.68 (half away from zero)', -2_500, 107, -268],
    ['0.001 × $4.99 = 0.00499 → $0.00', 1, 499, 0],
    ['−2 × $1.50 = −$3.00', -2_000, 150, -300],
    ['zero Variance', 0, 150, 0],
    ['no cost', -5_000, 0, 0],
  ])('%s', (_label, variance, cost, cents) => {
    expect(varianceValue(variance, cost)).toBe(cents);
  });
});
