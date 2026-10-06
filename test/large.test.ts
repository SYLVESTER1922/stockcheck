import { describe, expect, it } from 'vitest';
import { isLarge, LOOK_AGAIN, RECOUNT_LIST } from '../src/domain/large';
import { varianceValue } from '../src/domain/money';

// Spec §4.6 worked examples. Quantities in thousandths, money in cents.
describe('isLarge', () => {
  it.each([
    [20, 18, 50, false],
    [20, 15, 50, true],
    [40, 0, 5, true],
    [3, 2, 2500, true],
    [0, 6, 100, true],
    [1, 0, 120, false],
    [-3, 5, 100, true],
  ])('Expected %i, Count %i, cost %i¢ → large: %s', (expected, count, cost, large) => {
    const variance = (count - expected) * 1000;
    expect(isLarge({ variance, value: varianceValue(variance, cost), expected: expected * 1000 }, LOOK_AGAIN)).toBe(large);
  });

  it('is inclusive at each threshold', () => {
    expect(isLarge({ variance: -1000, value: -500, expected: 100_000 }, LOOK_AGAIN)).toBe(true); // exactly $5
    expect(isLarge({ variance: -2000, value: -100, expected: 10_000 }, LOOK_AGAIN)).toBe(true); // 2 units = 20%
    expect(isLarge({ variance: -1999, value: -100, expected: 1_000 }, LOOK_AGAIN)).toBe(false); // just under 2 units
  });

  it('uses the same values for the Recount List in v1', () => {
    expect(RECOUNT_LIST).toEqual(LOOK_AGAIN);
  });
});
